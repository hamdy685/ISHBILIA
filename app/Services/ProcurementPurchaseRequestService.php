<?php

namespace App\Services;

use App\Models\ApprovalHistory;
use App\Models\AuditLog;
use App\Models\PurchaseRequest;
use App\Models\User;
use App\Models\Supplier;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Facades\DB;

class ProcurementPurchaseRequestService
{
    /**
     * Get PRs pending procurement manager approval.
     */
    public function getPendingProcurementApprovalRequests(int $perPage = 15)
    {
        return PurchaseRequest::with([
            'requester.roles',
            'requester.department',
            'department',
            'targetDepartment.manager',
            'targetDepartment.siteEngineer',
            'assignedReviewer',
            'siteEngineer',
            'directSupplier',
            'items.item',
            'items.supplier',
            'approvalHistory.actor',
            'supplements',
        ])->withCount(['purchaseOrders as issued_purchase_orders_count' => function ($query) {
            $query->whereNotIn('status', ['REJECTED']);
        }])
        ->where('status', 'PENDING_PROCUREMENT_APPROVAL')
        ->where(function ($route): void {
            $route->whereNull('procurement_route')->orWhere('procurement_route', '!=', 'DIRECT');
        })
        ->orderBy('updated_at', 'desc')
        ->paginate($perPage);
    }

    /**
     * Get PRs waiting for the procurement manager to enter three supplier quotes.
     */
    public function getPendingQuoteRequests(int $perPage = 15, ?User $actor = null)
    {
        $query = PurchaseRequest::with([
            'requester.roles',
            'requester.department',
            'department',
            'targetDepartment.manager',
            'targetDepartment.siteEngineer',
            'assignedReviewer',
            'siteEngineer',
            'items.item',
            'items.supplier',
            'quotes.supplier',
            'quotes.recommendations.user',
            'supplements',
        ]);

        if ($actor?->hasRole('procurement_manager')) {
            $query->where('status', 'PENDING_QUOTE_RECOMMENDATIONS')
                ->whereDoesntHave('quotes');
        } elseif ($actor?->hasRole('reviewer')) {
            // Sequential workflow: Department reviewers must only see requests where ACCOUNTING recommendation has already been submitted,
            // and DEPARTMENT recommendation is not yet submitted.
            $query->where('status', 'PENDING_QUOTE_RECOMMENDATIONS')
                ->whereHas('quotes')
                ->whereHas('quotes.recommendations', function ($recommendationQuery): void {
                    $recommendationQuery->where('role_type', 'ACCOUNTING');
                })
                ->whereDoesntHave('quotes.recommendations', function ($recommendationQuery): void {
                    $recommendationQuery->where('role_type', 'DEPARTMENT');
                })
                ->whereDoesntHave('requester.roles', function ($roleQuery): void {
                    $roleQuery->where('slug', 'general_manager');
                })
                ->where(function ($scopeQuery) use ($actor): void {
                    $scopeQuery->where('reviewer_user_id', $actor->id)
                        ->orWhereHas('targetDepartment', function ($departmentQuery) use ($actor): void {
                            $departmentQuery->where('manager_user_id', $actor->id);
                        });
                });
        } elseif ($actor?->hasRole('accountant')) {
            // Financial Director must only see requests where ACCOUNTING recommendation is not yet submitted.
            $query->where('status', 'PENDING_QUOTE_RECOMMENDATIONS')
                ->whereHas('quotes')
                ->whereDoesntHave('quotes.recommendations', function ($recommendationQuery): void {
                    $recommendationQuery->where('role_type', 'ACCOUNTING');
                });
        } elseif ($actor?->hasRole('general_manager')) {
            $query->where('status', 'PENDING_EXECUTIVE_QUOTE_DECISION')
                ->whereHas('quotes');
        } elseif ($actor?->hasRole('admin')) {
            $query->whereIn('status', ['PENDING_QUOTE_RECOMMENDATIONS', 'PENDING_EXECUTIVE_QUOTE_DECISION'])
                ->whereHas('quotes');
        } else {
            $query->whereRaw('1 = 0');
        }

        return $query->orderBy('updated_at', 'desc')->paginate($perPage);
    }

    /**
     * Get purchase requests ready for PO creation: quote decisions approved by procurement or direct requests approved by accounting.
     */
    public function getApprovedByProcurementRequests(int $perPage = 15)
    {
        return PurchaseRequest::with([
            'requester.roles',
            'requester.department',
            'department',
            'targetDepartment.manager',
            'targetDepartment.siteEngineer',
            'assignedReviewer',
            'siteEngineer',
            'directSupplier',
            'items.item',
            'items.supplier',
            'selectedQuote.supplier',
            'quotes.supplier',
            'approvalHistory.actor',
            'supplements',
        ])
            ->withCount(['purchaseOrders as issued_purchase_orders_count' => function ($query) {
                $query->whereNotIn('status', ['REJECTED']);
            }])
            ->whereDoesntHave('purchaseOrders', function ($query): void {
                $query->whereNotIn('status', ['REJECTED']);
            })
            ->where(function ($query): void {
                $query->where(function ($quotePath): void {
                    $quotePath
                        ->where('status', 'APPROVED_BY_PROCUREMENT')
                        ->where(function ($route): void {
                            $route->whereNull('procurement_route')->orWhere('procurement_route', '!=', 'DIRECT');
                        });
                })->orWhere(function ($directPath): void {
                    $directPath
                        ->where('status', 'APPROVED_BY_ACCOUNTING')
                        ->where('procurement_route', 'DIRECT');
                });
            })
            ->orderBy('updated_at', 'desc')
            ->paginate($perPage);
    }

    /**
     * Procurement Manager starts the supplier quote process (PENDING_PROCUREMENT_APPROVAL → PENDING_QUOTE_RECOMMENDATIONS).
     */
    public function approvePurchaseRequest(User $procurementManager, PurchaseRequest $request, ?string $comment = null): PurchaseRequest
    {
        if ($request->status !== 'PENDING_PROCUREMENT_APPROVAL') {
            throw new \RuntimeException('Only purchase requests pending procurement approval can be approved by the procurement manager.');
        }

        if ($request->procurement_route === 'DIRECT') {
            throw new \RuntimeException('هذا طلب شراء مباشر؛ يجب إرساله إلى الحسابات أولًا، ولا يمكن إنشاء أمر الشراء قبل اعتماد الحسابات.');
        }

        if ($request->items()->count() === 0) {
            throw new \RuntimeException('Cannot approve a purchase request with no line items.');
        }

        return DB::transaction(function () use ($procurementManager, $request, $comment) {
            $pr = PurchaseRequest::where('id', $request->id)->lockForUpdate()->first();
            if (! $pr || $pr->status !== 'PENDING_PROCUREMENT_APPROVAL') {
                throw new \RuntimeException('تم اتخاذ قرار بشأن طلب الشراء أو لم يعد بانتظار اعتماد المشتريات.');
            }

            $pr->update([
                'status' => 'PENDING_QUOTE_RECOMMENDATIONS',
                'procurement_route' => 'QUOTES',
            ]);

            app(NotificationService::class)->markEntityNotificationsAsRead($pr);

            ApprovalHistory::create([
                'target_type' => PurchaseRequest::class,
                'target_id' => $pr->id,
                'actor_user_id' => $procurementManager->id,
                'action' => 'THREE_QUOTES_REQUIRED',
                'from_state' => 'PENDING_PROCUREMENT_APPROVAL',
                'to_state' => 'PENDING_QUOTE_RECOMMENDATIONS',
                'comments' => $comment ?? 'بدأ مدير المشتريات تجهيز عروض أسعار من موردين مختلفين.',
            ]);

            app(SystemEventService::class)->recordAction(
                $pr,
                'THREE_QUOTES_REQUIRED',
                'بدأ مدير المشتريات تجهيز عروض أسعار من موردين مختلفين للطلب.',
                ['event_type' => 'purchase_request.quotes_required', 'from_state' => 'PENDING_PROCUREMENT_APPROVAL', 'to_state' => 'PENDING_QUOTE_RECOMMENDATIONS', 'actor_user_id' => $procurementManager->id, 'metadata' => ['comment' => $comment]]
            );

            AuditLog::create([
                'user_id' => $procurementManager->id,
                'entity_type' => PurchaseRequest::class,
                'entity_id' => $pr->id,
                'action' => 'THREE_QUOTES_REQUIRED',
                'field_name' => 'status',
                'old_value' => 'PENDING_PROCUREMENT_APPROVAL',
                'new_value' => 'PENDING_QUOTE_RECOMMENDATIONS',
            ]);

            return $pr->fresh(['requester.roles', 'department', 'items.item', 'items.supplier', 'approvalHistory']);
        });
    }

    /**
     * Send a purchase request directly to accounting when procurement decides that quotes are not required.
     */
    public function sendToAccountingWithoutQuotes(User $procurementManager, PurchaseRequest $request, array $financialData = [], ?string $comment = null): PurchaseRequest
    {
        if ($request->status !== 'PENDING_PROCUREMENT_APPROVAL') {
            throw new \RuntimeException('يمكن إرسال الطلب إلى الحسابات فقط من مرحلة اعتماد المشتريات.');
        }

        $submittedItems = $financialData['items'] ?? [];
        $hasNotes = array_key_exists('notes', $financialData);
        $notes = $hasNotes ? (trim((string) ($financialData['notes'] ?? '')) ?: null) : null;
        // Legacy fallback: accept a top-level supplier_id for backward compatibility
        $globalSupplierId = (int) ($financialData['supplier_id'] ?? 0);
        if (! is_array($submittedItems) || count($submittedItems) === 0) {
            throw ValidationException::withMessages(['items' => ['يجب إدخال البيانات المالية لبند واحد على الأقل قبل الإرسال.']]);
        }

        return DB::transaction(function () use ($procurementManager, $request, $globalSupplierId, $submittedItems, $hasNotes, $notes, $comment): PurchaseRequest {
            $pr = PurchaseRequest::with('items')->where('id', $request->id)->lockForUpdate()->firstOrFail();
            if ($pr->status !== 'PENDING_PROCUREMENT_APPROVAL') {
                throw new \RuntimeException('تم اتخاذ قرار بشأن طلب الشراء أو لم يعد بانتظار اعتماد المشتريات.');
            }

            $requestItemsById = $pr->items->keyBy('id');
            $submittedById = collect($submittedItems)->keyBy(fn (array $item): int => (int) ($item['pr_item_id'] ?? 0));
            if ($submittedById->count() !== $requestItemsById->count() || $submittedById->keys()->diff($requestItemsById->keys())->isNotEmpty()) {
                throw ValidationException::withMessages(['items' => ['يجب إدخال البيانات المالية لجميع بنود الطلب دون حذف أو إضافة بند.']]);
            }

            // Validate and resolve per-item suppliers
            $supplierIds = collect();
            $grandTotal = 0.0;
            foreach ($requestItemsById as $prItemId => $prItem) {
                $input = $submittedById->get($prItemId);
                $quantity = (float) ($input['quantity'] ?? 0);
                $unitPrice = (float) ($input['unit_price'] ?? -1);
                $itemSupplierId = (int) ($input['supplier_id'] ?? $globalSupplierId);

                if ($itemSupplierId <= 0) {
                    throw ValidationException::withMessages(["items.{$prItemId}.supplier_id" => ['يجب اختيار المورد لكل بند.']]);
                }
                if ($quantity <= 0 || $unitPrice < 0) {
                    throw ValidationException::withMessages([
                        "items.{$prItemId}.quantity" => ['الكمية يجب أن تكون أكبر من صفر.'],
                        "items.{$prItemId}.unit_price" => ['سعر الوحدة يجب أن يكون صفرًا أو أكبر.'],
                    ]);
                }

                $supplierIds->push($itemSupplierId);
                $lineTotal = round($quantity * $unitPrice, 2);
                $prItem->update([
                    'supplier_id' => $itemSupplierId,
                    'quantity' => $quantity,
                    'estimated_unit_price' => $unitPrice,
                    'estimated_line_total' => $lineTotal,
                ]);
                $grandTotal += $lineTotal;
            }

            // Validate all referenced suppliers exist and are active
            $uniqueSupplierIds = $supplierIds->unique()->values()->all();
            $activeCount = Supplier::whereIn('id', $uniqueSupplierIds)->where('is_active', true)->count();
            if ($activeCount !== count($uniqueSupplierIds)) {
                throw ValidationException::withMessages(['supplier_id' => ['أحد الموردين المختارين غير موجود أو غير نشط.']]);
            }

            // Use the first item's supplier as the PR-level direct_supplier_id for backward compatibility
            $primarySupplierId = $uniqueSupplierIds[0] ?? null;

            $oldNotes = (string) ($pr->notes ?? '');
            if ($hasNotes && $oldNotes !== (string) ($notes ?? '')) {
                AuditLog::create([
                    'user_id' => $procurementManager->id,
                    'entity_type' => PurchaseRequest::class,
                    'entity_id' => $pr->id,
                    'action' => 'DIRECT_FINANCIAL_DATA_UPDATED',
                    'field_name' => 'notes',
                    'old_value' => $oldNotes,
                    'new_value' => (string) ($notes ?? ''),
                ]);
            }

            $pr->update([
                'status' => 'PENDING_EXECUTIVE_APPROVAL',
                'procurement_route' => 'DIRECT',
                'direct_supplier_id' => $primarySupplierId,
                'total_estimated_cost' => round($grandTotal, 2),
                ...($hasNotes ? ['notes' => $notes] : []),
            ]);

            app(NotificationService::class)->markEntityNotificationsAsRead($pr);

            ApprovalHistory::create([
                'target_type' => PurchaseRequest::class,
                'target_id' => $pr->id,
                'actor_user_id' => $procurementManager->id,
                'action' => 'DIRECT_EXECUTIVE_REVIEW_REQUIRED',
                'from_state' => 'PENDING_PROCUREMENT_APPROVAL',
                'to_state' => 'PENDING_EXECUTIVE_APPROVAL',
                'comments' => $comment ?? 'أدخل مدير المشتريات البيانات المالية واختار المورد ثم أرسل الطلب إلى المدير التنفيذي المهندس محمد للاعتماد.',
            ]);

            AuditLog::create([
                'user_id' => $procurementManager->id,
                'entity_type' => PurchaseRequest::class,
                'entity_id' => $pr->id,
                'action' => 'DIRECT_EXECUTIVE_REVIEW_REQUIRED',
                'field_name' => 'status',
                'old_value' => 'PENDING_PROCUREMENT_APPROVAL',
                'new_value' => 'PENDING_EXECUTIVE_APPROVAL',
            ]);

            app(SystemEventService::class)->recordAction(
                $pr,
                'DIRECT_EXECUTIVE_REVIEW_REQUIRED',
                'أدخل مدير المشتريات البيانات المالية واختار المورد وأرسل طلب الشراء المباشر إلى المدير التنفيذي المهندس محمد للاعتماد.',
                [
                    'event_type' => 'purchase_request.direct_executive_review_required',
                    'from_state' => 'PENDING_PROCUREMENT_APPROVAL',
                    'to_state' => 'PENDING_EXECUTIVE_APPROVAL',
                    'actor_user_id' => $procurementManager->id,
                    'metadata' => ['comment' => $comment, 'requires_quotes' => false, 'supplier_ids' => $uniqueSupplierIds, 'total_estimated_cost' => round($grandTotal, 2)],
                ]
            );

            $notificationService = app(NotificationService::class);
            $notificationService->queueUsers(
                $notificationService->resolveUsersWithPermission('purchase_request.approve_gm'),
                'purchase_request_pending_executive_approval',
                'طلب شراء مباشر بانتظار اعتماد المدير التنفيذي',
                "أرسل مدير المشتريات الطلب المباشر {$pr->request_number} بعد تحديد المورد والأسعار إلى المدير التنفيذي المهندس محمد للاعتماد.",
                $pr
            );

            return $pr->fresh(['requester.roles', 'department', 'targetDepartment', 'directSupplier', 'assignedReviewer', 'siteEngineer', 'items.item', 'items.supplier', 'approvalHistory']);
        });
    }

    /**
     * Create a direct purchase request that must pass accounting approval before PO creation.
     */
    public function createDirectPurchaseRequest(User $procurementManager, array $data): PurchaseRequest
    {
        return DB::transaction(function () use ($procurementManager, $data): PurchaseRequest {
            $year = date('Y');
            $prefix = "PR-DIRECT-{$year}-";
            $maxNumber = PurchaseRequest::withTrashed()
                ->where('request_number', 'like', $prefix . '%')
                ->selectRaw("MAX(CAST(SUBSTRING(request_number, ?) AS UNSIGNED)) as max_seq", [strlen($prefix) + 1])
                ->value('max_seq');
            $nextSeq = ($maxNumber ?? 0) + 1;

            // Retry to avoid duplicates
            $prNumber = sprintf('PR-DIRECT-%s-%05d', $year, $nextSeq);
            while (PurchaseRequest::withTrashed()->where('request_number', $prNumber)->exists()) {
                $nextSeq++;
                $prNumber = sprintf('PR-DIRECT-%s-%05d', $year, $nextSeq);
            }
            $total = 0.0;

            foreach ($data['items'] as $item) {
                $total += (float) $item['quantity'] * (float) $item['unit_price'];
            }

            $pr = PurchaseRequest::create([
                'request_number' => $prNumber,
                'user_id' => $procurementManager->id,
                'department_id' => $data['department_id'],
                'site_engineer_user_id' => $data['site_engineer_user_id'],
                'direct_supplier_id' => $data['supplier_id'],
                'procurement_route' => 'DIRECT',
                'status' => 'PENDING_EXECUTIVE_APPROVAL',
                'priority' => $data['priority'] ?? 'NORMAL',
                'date_needed' => $data['delivery_date'] ?? null,
                'total_estimated_cost' => round($total, 2),
                'notes' => $data['notes'] ?? null,
            ]);

            foreach ($data['items'] as $item) {
                $quantity = (float) $item['quantity'];
                $unitPrice = (float) $item['unit_price'];
                $pr->items()->create([
                    'item_id' => $item['item_id'] ?? null,
                    'supplier_id' => $item['supplier_id'] ?? $data['supplier_id'] ?? null,
                    'item_description' => $item['item_description'],
                    'item_reference' => $item['item_reference'],
                    'region' => $item['region'],
                    'quantity' => $quantity,
                    'uom' => $item['uom'] ?? 'PCS',
                    'estimated_unit_price' => $unitPrice,
                    'estimated_line_total' => round($quantity * $unitPrice, 2),
                    'specifications' => $item['specifications'] ?? null,
                ]);
            }

            ApprovalHistory::create([
                'target_type' => PurchaseRequest::class,
                'target_id' => $pr->id,
                'actor_user_id' => $procurementManager->id,
                'action' => 'DIRECT_PURCHASE_REQUEST_CREATED',
                'from_state' => 'DRAFT',
                'to_state' => 'PENDING_EXECUTIVE_APPROVAL',
                'comments' => 'أنشأ مدير المشتريات طلب شراء مباشرًا وأرسله إلى المدير التنفيذي المهندس محمد للاعتماد.',
            ]);

            AuditLog::create([
                'user_id' => $procurementManager->id,
                'entity_type' => PurchaseRequest::class,
                'entity_id' => $pr->id,
                'action' => 'DIRECT_PURCHASE_REQUEST_CREATED',
                'field_name' => 'status',
                'old_value' => 'DRAFT',
                'new_value' => 'PENDING_EXECUTIVE_APPROVAL',
            ]);

            app(SystemEventService::class)->recordAction(
                $pr,
                'DIRECT_PURCHASE_REQUEST_CREATED',
                'أنشأ مدير المشتريات طلب شراء مباشرًا وأرسله إلى المدير التنفيذي المهندس محمد للاعتماد.',
                [
                    'event_type' => 'purchase_request.direct_created',
                    'from_state' => 'DRAFT',
                    'to_state' => 'PENDING_EXECUTIVE_APPROVAL',
                    'actor_user_id' => $procurementManager->id,
                    'metadata' => ['supplier_id' => $data['supplier_id'], 'total' => round($total, 2)],
                ]
            );

            $notificationService = app(NotificationService::class);
            $notificationService->queueUsers(
                $notificationService->resolveUsersWithPermission('purchase_request.approve_gm'),
                'purchase_request_pending_executive_approval',
                'طلب شراء مباشر بانتظار اعتماد المدير التنفيذي',
                "أنشأ مدير المشتريات الطلب المباشر {$pr->request_number} وهو بانتظار اعتماد المدير التنفيذي المهندس محمد.",
                $pr
            );

            return $pr->fresh([
                'requester.roles',
                'department',
                'directSupplier',
                'siteEngineer',
                'items.item',
                'items.supplier',
                'approvalHistory.actor',
            ]);
        });
    }

    /**
     * Procurement Manager rejects PR (PENDING_PROCUREMENT_APPROVAL → REJECTED).
     */
    public function rejectPurchaseRequest(User $procurementManager, PurchaseRequest $request, string $comment): PurchaseRequest
    {
        if ($request->status !== 'PENDING_PROCUREMENT_APPROVAL') {
            throw new \RuntimeException('Only purchase requests pending procurement approval can be rejected by the procurement manager.');
        }

        return DB::transaction(function () use ($procurementManager, $request, $comment) {
            $pr = PurchaseRequest::where('id', $request->id)->lockForUpdate()->first();
            if (! $pr || $pr->status !== 'PENDING_PROCUREMENT_APPROVAL') {
                throw new \RuntimeException('تم اتخاذ قرار بشأن طلب الشراء أو لم يعد بانتظار اعتماد المشتريات.');
            }

            $pr->update([
                'status' => 'REJECTED',
                'rejection_reason' => $comment,
            ]);

            app(NotificationService::class)->markEntityNotificationsAsRead($pr);

            ApprovalHistory::create([
                'target_type' => PurchaseRequest::class,
                'target_id' => $pr->id,
                'actor_user_id' => $procurementManager->id,
                'action' => 'REJECTED_BY_PROCUREMENT',
                'from_state' => 'PENDING_PROCUREMENT_APPROVAL',
                'to_state' => 'REJECTED',
                'comments' => $comment,
            ]);

            app(SystemEventService::class)->recordAction(
                $pr,
                'REJECTED_BY_PROCUREMENT',
                'رفض مدير المشتريات طلب الشراء.',
                ['event_type' => 'purchase_request.rejected_by_procurement', 'from_state' => 'PENDING_PROCUREMENT_APPROVAL', 'to_state' => 'REJECTED', 'actor_user_id' => $procurementManager->id, 'metadata' => ['comment' => $comment]]
            );

            AuditLog::create([
                'user_id' => $procurementManager->id,
                'entity_type' => PurchaseRequest::class,
                'entity_id' => $pr->id,
                'action' => 'PROCUREMENT_REJECTED',
                'field_name' => 'status',
                'old_value' => 'PENDING_PROCUREMENT_APPROVAL',
                'new_value' => 'REJECTED',
            ]);

            // Notify the PR requester
            $notificationService = app(NotificationService::class);
            $rejMsg = "طلب الشراء {$pr->request_number} رُفض من قِبَل مدير المشتريات.";
            if (! empty($comment)) {
                $rejMsg .= " السبب: {$comment}";
            }
            $notificationService->queueNotification(
                $pr->user_id,
                'purchase_request_rejected_procurement',
                'طلب الشراء مرفوض من المشتريات',
                $rejMsg,
                $pr
            );

            return $pr->fresh(['requester.roles', 'department', 'items.item', 'items.supplier', 'approvalHistory']);
        });
    }
}

