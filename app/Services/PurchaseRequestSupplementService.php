<?php

namespace App\Services;

use App\Models\ApprovalHistory;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\PurchaseReceipt;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestItem;
use App\Models\PurchaseRequestSupplement;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PurchaseRequestSupplementService
{
    public function __construct(
        protected PurchaseOrderService $poService,
        protected NotificationService $notificationService,
    ) {}

    /**
     * Get paginated requests eligible for a supplement ('طلب كمالة').
     * Conditions:
     * 1. Requisition is active/approved/issued.
     * 2. Requisition has NOT been fully received / has NO approved receipt by warehouse or site engineer.
     * 3. Scoped by user role/department.
     */
    public function getEligibleRequests(User $user, int $perPage = 15): LengthAwarePaginator
    {
        $query = PurchaseRequest::with([
            'requester',
            'department',
            'targetDepartment',
            'assignedReviewer',
            'directSupplier',
            'selectedQuote.supplier',
            'purchaseOrders.supplier',
            'supplements.items',
            'items.item',
        ])
            ->where(function ($q) {
                $q->whereIn('status', ['APPROVED_BY_REVIEWER', 'APPROVED_BY_GM', 'PO_ISSUED', 'ACCOUNTING_APPROVED'])
                    ->orWhereHas('purchaseOrders');
            })
            // Exclude requests that already have an approved receipt
            ->whereDoesntHave('purchaseOrders.receipts', function ($q) {
                $q->where('status', 'APPROVED');
            });

        // Department and role scoping
        if ($user->hasRole('admin') || $user->hasRole('procurement_manager') || $user->hasRole('general_manager')) {
            // Can view all eligible requests across company
        } elseif ($user->hasRole('reviewer')) {
            $userDeptId = $user->department_id;
            $query->where(function ($q) use ($user, $userDeptId) {
                $q->where('department_id', $userDeptId)
                    ->orWhere('target_department_id', $userDeptId)
                    ->orWhere('reviewer_user_id', $user->id)
                    ->orWhere('user_id', $user->id);
            });
        } else {
            // Employee sees own requests
            $query->where('user_id', $user->id);
        }

        return $query->orderByDesc('updated_at')->paginate($perPage);
    }

    /**
     * Create supplementary items on the same PurchaseRequest.
     */
    public function createSupplement(
        PurchaseRequest $pr,
        User $creator,
        array $itemsData,
        ?string $notes = null
    ): PurchaseRequestSupplement {
        $pr->loadMissing(['department', 'assignedReviewer', 'purchaseOrders.receipts']);

        // 1. Authorization check
        $isRequester = (int) $pr->user_id === (int) $creator->id;
        $isReviewer = (int) $pr->reviewer_user_id === (int) $creator->id
            || (int) $pr->department_id === (int) $creator->department_id
            || (int) $pr->target_department_id === (int) $creator->department_id;
        $isManager = $creator->hasAnyRole(['admin', 'procurement_manager']);

        if (! $isRequester && ! $isReviewer && ! $isManager) {
            throw new ValidationException(validator([], []), [
                'authorization' => ['غير مصرح لك بإنشاء طلب كمالة لهذا الطلب.'],
            ]);
        }

        // 2. Eligibility check
        if (! $pr->canAcceptSupplement()) {
            throw ValidationException::withMessages([
                'eligibility' => ['لا يمكن إنشاء طلب كمالة لهذا الطلب؛ حيث تم تأكيد استلام المواد بإذن استلام معتمد بالفعل.'],
            ]);
        }

        if (empty($itemsData)) {
            throw ValidationException::withMessages([
                'items' => ['يجب إدخال بند واحد على الأقل في طلب الكمالة.'],
            ]);
        }

        return DB::transaction(function () use ($pr, $creator, $itemsData, $notes, $isReviewer) {
            $nextBatch = ($pr->supplements()->max('batch_number') ?? 0) + 1;

            // Auto-advance to REVIEWER_APPROVED if creator is a reviewer
            $autoApprove = $isReviewer && $creator->hasRole('reviewer');
            $status = $autoApprove ? 'REVIEWER_APPROVED' : 'SUBMITTED';

            $supplement = PurchaseRequestSupplement::create([
                'purchase_request_id' => $pr->id,
                'batch_number' => $nextBatch,
                'requested_by_user_id' => $creator->id,
                'reviewer_user_id' => $autoApprove ? $creator->id : null,
                'reviewed_at' => $autoApprove ? now() : null,
                'status' => $status,
                'notes' => $notes,
            ]);

            $supplementTotal = 0.0;

            foreach ($itemsData as $row) {
                $qty = (float) ($row['quantity'] ?? 1);
                $unitPrice = isset($row['estimated_unit_price']) ? (float) $row['estimated_unit_price'] : 0.0;
                $lineTotal = round($qty * $unitPrice, 2);
                $supplementTotal += $lineTotal;

                PurchaseRequestItem::create([
                    'purchase_request_id' => $pr->id,
                    'is_supplementary' => true,
                    'supplement_id' => $supplement->id,
                    'supplement_batch' => $nextBatch,
                    'item_id' => $row['item_id'] ?? null,
                    'supplier_id' => $row['supplier_id'] ?? null,
                    'item_description' => $row['item_description'] ?? 'بند كمالة',
                    'item_reference' => $row['item_reference'] ?? $pr->parcel_reference,
                    'region' => $row['region'] ?? $pr->region,
                    'quantity' => $qty,
                    'uom' => $row['uom'] ?? 'PCS',
                    'estimated_unit_price' => $unitPrice,
                    'estimated_line_total' => $lineTotal,
                    'specifications' => $row['specifications'] ?? null,
                    'notes' => $row['notes'] ?? null,
                ]);
            }

            // Update PR estimated total
            $pr->increment('total_estimated_cost', $supplementTotal);

            // Record Approval History
            ApprovalHistory::create([
                'target_type' => PurchaseRequest::class,
                'target_id' => $pr->id,
                'actor_user_id' => $creator->id,
                'action' => 'SUBMIT_SUPPLEMENT',
                'from_state' => $pr->status,
                'to_state' => $pr->status,
                'comments' => "تم إنشاء طلب كمالة (دفعة {$nextBatch})" . ($notes ? ": {$notes}" : ''),
            ]);

            // Notify
            if (! $autoApprove) {
                $reviewerUsers = $this->notificationService->resolveUsersWithPermission(
                    'review_purchase_requests',
                    $pr->target_department_id ?? $pr->department_id
                );
                $this->notificationService->queueUsers(
                    $reviewerUsers,
                    'pr_supplement_submitted',
                    "طلب كمالة جديد على الطلب {$pr->request_number}",
                    "قام {$creator->name} بإضافة بنود كمالة (دفعة {$nextBatch}) على طلب الشراء {$pr->request_number} بانتظار مراجعتك.",
                    $pr
                );
            } else {
                $procurementUsers = $this->notificationService->resolveUsersWithPermission('manage_procurement');
                $this->notificationService->queueUsers(
                    $procurementUsers,
                    'pr_supplement_reviewer_approved',
                    "طلب كمالة معتمد على الطلب {$pr->request_number}",
                    "تم اعتماد بنود الكمالة (دفعة {$nextBatch}) للطلب {$pr->request_number} وهي بانتظار توجيه المشتريات والتسعير.",
                    $pr
                );
            }

            return $supplement->load(['items.item', 'requester', 'reviewer']);
        });
    }

    /**
     * Reviewer approves supplementary items.
     */
    public function approveByReviewer(
        PurchaseRequestSupplement $supplement,
        User $reviewer,
        ?string $notes = null
    ): PurchaseRequestSupplement {
        $pr = $supplement->purchaseRequest;

        if ($supplement->status !== 'SUBMITTED') {
            throw ValidationException::withMessages([
                'status' => ['طلب الكمالة ليس بانتظار مراجعة القسم.'],
            ]);
        }

        return DB::transaction(function () use ($supplement, $pr, $reviewer, $notes) {
            $supplement->update([
                'status' => 'REVIEWER_APPROVED',
                'reviewer_user_id' => $reviewer->id,
                'reviewed_at' => now(),
                'notes' => $notes ? trim(($supplement->notes ? $supplement->notes . "\n" : '') . "ملاحظات المراجع: {$notes}") : $supplement->notes,
            ]);

            ApprovalHistory::create([
                'target_type' => PurchaseRequest::class,
                'target_id' => $pr->id,
                'actor_user_id' => $reviewer->id,
                'action' => 'APPROVE_SUPPLEMENT',
                'from_state' => $pr->status,
                'to_state' => $pr->status,
                'comments' => "تم اعتماد طلب الكمالة (دفعة {$supplement->batch_number}) من قِبل مراجع القسم.",
            ]);

            // Notify Procurement
            $procurementUsers = $this->notificationService->resolveUsersWithPermission('manage_procurement');
            $this->notificationService->queueUsers(
                $procurementUsers,
                'pr_supplement_reviewer_approved',
                "طلب كمالة معتمد على الطلب {$pr->request_number}",
                "اعتمد المراجع {$reviewer->name} بنود الكمالة (دفعة {$supplement->batch_number}) للطلب {$pr->request_number}. يرجى تحديد المورد والتسعير.",
                $pr
            );

            return $supplement->load(['items.item', 'requester', 'reviewer']);
        });
    }

    /**
     * Procurement Manager processes the supplement:
     * Can assign the SAME supplier or a DIFFERENT supplier.
     * Either adds items to the existing PO (if same supplier and requested) or creates a supplementary PO.
     */
    public function processByProcurement(
        PurchaseRequestSupplement $supplement,
        User $procurementUser,
        int $supplierId,
        array $itemsPricing,
        ?string $notes = null,
        bool $mergeToExistingPo = true
    ): PurchaseRequestSupplement {
        $pr = $supplement->purchaseRequest;

        if ($supplement->status !== 'REVIEWER_APPROVED') {
            throw ValidationException::withMessages([
                'status' => ['طلب الكمالة يجب أن يكون معتمداً من المراجع أولاً قبل معالجة المشتريات.'],
            ]);
        }

        $supplier = Supplier::findOrFail($supplierId);
        if (! $supplier->is_active) {
            throw ValidationException::withMessages([
                'supplier_id' => ['المورد المحدد غير نشط.'],
            ]);
        }

        return DB::transaction(function () use ($supplement, $pr, $procurementUser, $supplier, $itemsPricing, $notes, $mergeToExistingPo) {
            // Find existing PO for this supplier on this PR if merging is possible
            $existingPo = null;
            if ($mergeToExistingPo) {
                $existingPo = PurchaseOrder::where('purchase_request_id', $pr->id)
                    ->where('supplier_id', $supplier->id)
                    ->whereIn('status', ['PO_DRAFT', 'ISSUED'])
                    ->first();
            }

            $targetPo = null;

            if ($existingPo) {
                $targetPo = $existingPo;
            } else {
                // Create a new PO (for different supplier, or separate supplement PO)
                $poNumber = $this->poService->generatePoNumber();
                $targetPo = PurchaseOrder::create([
                    'po_number' => $poNumber,
                    'purchase_request_id' => $pr->id,
                    'supplier_id' => $supplier->id,
                    'created_by_user_id' => $procurementUser->id,
                    'status' => 'ISSUED',
                    'subtotal' => 0,
                    'grand_total' => 0,
                    'payment_terms' => 'بحسب شروط التوريد',
                    'notes' => "أمر شراء تكميلي (كمالة دفعة {$supplement->batch_number}) على الطلب {$pr->request_number}",
                ]);
            }

            // Map pricing array by pr_item_id
            $pricingMap = collect($itemsPricing)->keyBy('pr_item_id');

            $supplementItems = $supplement->items;
            foreach ($supplementItems as $item) {
                $unitPrice = 0.0;
                if ($pricingMap->has($item->id)) {
                    $unitPrice = (float) $pricingMap->get($item->id)['unit_price'];
                } elseif ((float) $item->estimated_unit_price > 0) {
                    $unitPrice = (float) $item->estimated_unit_price;
                }

                $qty = (float) $item->quantity;
                $lineTotal = round($qty * $unitPrice, 2);

                // Update PR item
                $item->update([
                    'supplier_id' => $supplier->id,
                    'estimated_unit_price' => $unitPrice,
                    'estimated_line_total' => $lineTotal,
                ]);

                // Add to PO items
                PurchaseOrderItem::create([
                    'purchase_order_id' => $targetPo->id,
                    'pr_item_id' => $item->id,
                    'item_id' => $item->item_id,
                    'item_description' => $item->item_description,
                    'item_reference' => $item->item_reference,
                    'region' => $item->region,
                    'quantity' => $qty,
                    'uom' => $item->uom,
                    'unit_price' => $unitPrice,
                    'line_total' => $lineTotal,
                    'is_supplementary' => true,
                    'supplement_batch' => $supplement->batch_number,
                    'specifications' => $item->specifications,
                ]);
            }

            // Recalculate PO grand totals
            $this->poService->recalculateTotals($targetPo);

            // Update supplement record
            $supplement->update([
                'status' => 'PROCUREMENT_PROCESSED',
                'procurement_user_id' => $procurementUser->id,
                'procurement_processed_at' => now(),
                'purchase_order_id' => $targetPo->id,
                'supplier_id' => $supplier->id,
                'notes' => $notes ? trim(($supplement->notes ? $supplement->notes . "\n" : '') . "ملاحظات المشتريات: {$notes}") : $supplement->notes,
            ]);

            ApprovalHistory::create([
                'target_type' => PurchaseRequest::class,
                'target_id' => $pr->id,
                'actor_user_id' => $procurementUser->id,
                'action' => 'PROCESS_SUPPLEMENT_PO',
                'from_state' => $pr->status,
                'to_state' => $pr->status,
                'comments' => "تم اعتماد بنود الكمالة وربطها بأمر الشراء {$targetPo->po_number} مع المورد {$supplier->company_name}.",
            ]);

            // Notifications:
            // 1. Notify warehouse keeper & site engineer
            $warehouseUsers = $this->notificationService->resolveUsersWithPermission('create_purchase_receipts');
            $siteUsers = $this->notificationService->resolveUsersWithPermission('approve_purchase_receipts');
            $recipients = $warehouseUsers->merge($siteUsers)->unique('id');

            $this->notificationService->queueUsers(
                $recipients,
                'pr_supplement_ready_for_receipt',
                "إضافة بنود كمالة على أمر الشراء {$targetPo->po_number}",
                "تمت إضافة بنود تكميلية (كمالة دفعة {$supplement->batch_number}) على أمر الشراء {$targetPo->po_number} مع المورد {$supplier->company_name}. ستظهر بعلامة كمالة عند الاستلام.",
                $targetPo
            );

            // 2. Notify accounting
            $accountingUsers = $this->notificationService->resolveUsersWithPermission('manage_accounting');
            $this->notificationService->queueUsers(
                $accountingUsers,
                'pr_supplement_accounting_updated',
                "تحديث مالي: بنود كمالة على أمر الشراء {$targetPo->po_number}",
                "تم اعتماد بنود كمالة بمبلغ إجمالي محدث لأمر الشراء {$targetPo->po_number} تابع للطلب {$pr->request_number}.",
                $targetPo
            );

            return $supplement->load(['items.item', 'requester', 'reviewer', 'procurementManager', 'supplier', 'purchaseOrder']);
        });
    }
}
