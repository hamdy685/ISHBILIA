<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ApprovalHistory;
use App\Models\Department;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\PurchaseReceipt;
use App\Models\PurchaseReceiptItem;
use App\Models\PurchaseRequest;
use App\Models\Supplier;
use App\Models\SystemEvent;
use App\Services\SystemEventService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class AdminMasterOrdersController extends Controller
{
    /**
     * Resolve the normalized procurement cycle stage for an order (or standalone request).
     */
    public static function resolveCycleStage(?PurchaseOrder $po, ?PurchaseRequest $pr): array
    {
        // 1. Rejected or Cancelled
        if ($po && in_array($po->status, ['REJECTED', 'CANCELLED', 'VOIDED'], true)) {
            return [
                'stage' => 'CANCELLED_OR_REJECTED',
                'label' => 'ملغي / مرفوض',
                'color' => 'rose',
                'description' => 'تم رفض أو إلغاء أمر الشراء',
                'responsible' => 'مدير النظام / إدارة المشتريات',
            ];
        }

        if (!$po && $pr && in_array($pr->status, ['REJECTED', 'CANCELLED'], true)) {
            return [
                'stage' => 'CANCELLED_OR_REJECTED',
                'label' => 'طلب ملغي / مرفوض',
                'color' => 'rose',
                'description' => 'تم رفض أو إلغاء طلب الشراء',
                'responsible' => 'مقدم الطلب / المدير التنفيذي',
            ];
        }

        // 2. Invoiced / Settled in Accounting
        $hasInvoice = $po && $po->supplierInvoices()->whereNotIn('status', ['VOIDED', 'CANCELLED'])->exists();
        $isAccountingApproved = $po && in_array($po->status, ['APPROVED_BY_ACCOUNTING', 'FINAL_APPROVED'], true);
        if ($hasInvoice || $isAccountingApproved) {
            return [
                'stage' => 'INVOICED',
                'label' => 'مسقط ومسجل بالحسابات',
                'color' => 'emerald',
                'description' => 'الفاتورة مسجلة ومطابقة ومحسوبة بالحسابات',
                'responsible' => 'الإدارة المالية والحسابات',
            ];
        }

        // 3. Actual PO Issued & Finalized
        $isActualPo = $po && ($po->finalized_at !== null || $po->isActualPo());
        if ($isActualPo) {
            return [
                'stage' => 'ACTUAL_PO_ISSUED',
                'label' => 'أمر شراء فعلي معتمد',
                'color' => 'cyan',
                'description' => 'تم اعتماد أمر الشراء الفعلي بعد الاستلام - جاهز للتسجيل المالي',
                'responsible' => 'الإدارة المالية والحسابات',
            ];
        }

        // 4. Pending Actual PO (Site Receipt is APPROVED, awaiting Actual PO from procurement)
        $hasApprovedReceipt = $po && $po->purchaseReceipts()->where('status', 'APPROVED')->exists();
        if ($hasApprovedReceipt || ($po && $po->status === 'PENDING_ACTUAL_PO')) {
            return [
                'stage' => 'PENDING_ACTUAL_PO',
                'label' => 'بالموقع - بانتظار الأمر الفعلي',
                'color' => 'amber',
                'description' => 'تم فحص واستلام المواد بالموقع - بانتظار إصدار وتثبيت أمر الشراء الفعلي',
                'responsible' => 'مدير المشتريات',
            ];
        }

        // 5. GRN Pending (Material arrived, receipt pending warehouse or site engineer approval)
        $hasPendingReceipt = $po && $po->purchaseReceipts()->whereIn('status', ['PENDING', 'SUBMITTED_BY_WAREHOUSE'])->exists();
        if ($hasPendingReceipt) {
            return [
                'stage' => 'GRN_PENDING',
                'label' => 'بانتظار فحص واعتماد الاستلام',
                'color' => 'purple',
                'description' => 'التوريدات بالموقع/المستودع - بانتظار اعتماد الاستلام من مهندس الموقع',
                'responsible' => 'مهندس الموقع / أمين المستودع',
            ];
        }

        // 6. Preliminary PO Issued (Waiting for delivery / warehouse receipt)
        if ($po && in_array($po->status, ['ISSUED', 'PENDING_ACCOUNTING_REVIEW', 'PO_DRAFT'], true)) {
            return [
                'stage' => 'PO_ISSUED',
                'label' => 'أمر شراء صادر - قيد التوريد',
                'color' => 'blue',
                'description' => 'أمر الشراء صادر للمورد وقيد تجهيز ونقل التوريدات إلى الموقع',
                'responsible' => 'المورد / أمين المستودع',
            ];
        }

        // 7. Standalone PR: Approved, awaiting PO creation
        if ($pr && in_array($pr->status, ['PENDING_PROCUREMENT_APPROVAL', 'APPROVED_BY_PROCUREMENT', 'APPROVED_BY_ACCOUNTING'], true)) {
            return [
                'stage' => 'PENDING_PO',
                'label' => 'طلب معتمد - بانتظار أمر الشراء',
                'color' => 'indigo',
                'description' => 'تم اعتماد الطلب - بانتظار قيام المشتريات بإصدار أمر الشراء والتعاقد',
                'responsible' => 'مدير المشتريات',
            ];
        }

        // 8. Standalone PR: Under Review / GM Approval
        return [
            'stage' => 'UNDER_REVIEW',
            'label' => 'طلب قيد المراجعة والاعتماد',
            'color' => 'sky',
            'description' => 'الطلب في مرحلة التدقيق والموافقات الإدارية المبدئية',
            'responsible' => 'المراجع / المدير التنفيذي',
        ];
    }

    /**
     * GET /api/v1/admin/all-orders-master
     * Master endpoint returning all orders and standalone requests across the entire procurement lifecycle.
     */
    public function index(Request $request): JsonResponse
    {
        $search = trim((string) $request->query('search', ''));
        $stageFilter = (string) $request->query('stage', 'all');
        $departmentId = $request->query('department_id');
        $supplierId = $request->query('supplier_id');
        $dateFrom = $request->query('date_from');
        $dateTo = $request->query('date_to');

        // 1. Fetch Purchase Orders with relations
        $poQuery = PurchaseOrder::query()
            ->with([
                'purchaseRequest.department',
                'purchaseRequest.requester',
                'purchaseRequest.landParcel',
                'supplier',
                'items',
                'purchaseReceipts.items',
                'supplierInvoices',
                'createdBy',
            ]);

        if ($departmentId) {
            $poQuery->whereHas('purchaseRequest', fn ($q) => $q->where('department_id', $departmentId));
        }

        if ($supplierId) {
            $poQuery->where('supplier_id', $supplierId);
        }

        if ($dateFrom) {
            $poQuery->whereDate('created_at', '>=', $dateFrom);
        }
        if ($dateTo) {
            $poQuery->whereDate('created_at', '<=', $dateTo);
        }

        if ($search !== '') {
            $poQuery->where(function ($q) use ($search) {
                $q->where('po_number', 'like', "%{$search}%")
                    ->orWhere('manual_po_number', 'like', "%{$search}%")
                    ->orWhereHas('supplier', fn ($sq) => $sq->where('company_name', 'like', "%{$search}%")->orWhere('name', 'like', "%{$search}%"))
                    ->orWhereHas('purchaseRequest', function ($pq) use ($search) {
                        $pq->where('request_number', 'like', "%{$search}%")
                            ->orWhere('notes', 'like', "%{$search}%")
                            ->orWhereHas('requester', fn ($rq) => $rq->where('name', 'like', "%{$search}%"));
                    })
                    ->orWhereHas('items', fn ($iq) => $iq->where('item_description', 'like', "%{$search}%")->orWhere('item_reference', 'like', "%{$search}%"));
            });
        }

        $allPos = $poQuery->orderByDesc('id')->get();

        // 2. Fetch Standalone Purchase Requests (without active POs) if viewing all or PR-related stages
        $standalonePrs = collect();
        if (in_array($stageFilter, ['all', 'pending_po', 'under_review', 'cancelled_or_rejected'], true)) {
            $prQuery = PurchaseRequest::query()
                ->whereDoesntHave('purchaseOrders', function ($q) {
                    $q->whereNotIn('status', ['REJECTED', 'CANCELLED']);
                })
                ->with(['department', 'requester', 'landParcel', 'items']);

            if ($departmentId) {
                $prQuery->where('department_id', $departmentId);
            }
            if ($dateFrom) {
                $prQuery->whereDate('created_at', '>=', $dateFrom);
            }
            if ($dateTo) {
                $prQuery->whereDate('created_at', '<=', $dateTo);
            }
            if ($search !== '') {
                $prQuery->where(function ($q) use ($search) {
                    $q->where('request_number', 'like', "%{$search}%")
                        ->orWhere('notes', 'like', "%{$search}%")
                        ->orWhereHas('requester', fn ($rq) => $rq->where('name', 'like', "%{$search}%"))
                        ->orWhereHas('items', fn ($iq) => $iq->where('item_description', 'like', "%{$search}%")->orWhere('item_reference', 'like', "%{$search}%"));
                });
            }
            $standalonePrs = $prQuery->orderByDesc('id')->get();
        }

        // 3. Map orders and requests into unified Master Order representations
        $masterList = collect();

        foreach ($allPos as $po) {
            $pr = $po->purchaseRequest;
            $stageInfo = self::resolveCycleStage($po, $pr);

            // Latest receipt
            $latestReceipt = $po->purchaseReceipts->sortByDesc('id')->first();
            // Primary invoice
            $primaryInvoice = $po->supplierInvoices->first();

            $parcelRef = $po->items->pluck('item_reference')->filter()->first()
                ?: ($pr?->landParcel?->parcel_reference ?: '—');
            $region = $po->items->pluck('region')->filter()->first()
                ?: ($pr?->landParcel?->region ?: ($pr?->department?->name ?? '—'));

            $isActual = $po->finalized_at !== null || $po->isActualPo();

            $masterList->push([
                'unique_key' => "PO-{$po->id}",
                'order_id' => $po->id,
                'request_id' => $pr?->id,
                'po_number' => $po->po_number,
                'manual_po_number' => $po->manual_po_number,
                'pr_number' => $pr?->request_number ?? $po->manual_pr_number ?? '—',
                'department' => [
                    'id' => $pr?->department?->id,
                    'name' => $pr?->department?->name ?? 'غير محدد',
                    'code' => $pr?->department?->code ?? '—',
                ],
                'requester' => [
                    'id' => $pr?->requester?->id,
                    'name' => $pr?->requester?->name ?? ($po->createdBy?->name ?? '—'),
                ],
                'supplier' => [
                    'id' => $po->supplier?->id,
                    'name' => $po->supplier?->company_name ?? $po->supplier?->name ?? 'غير محدد',
                    'code' => $po->supplier?->code ?? '—',
                ],
                'project_site' => [
                    'parcel_reference' => $parcelRef,
                    'region' => $region,
                ],
                'po_status' => $po->status,
                'pr_status' => $pr?->status ?? '—',
                'cycle_stage' => $stageInfo['stage'],
                'cycle_stage_label' => $stageInfo['label'],
                'cycle_stage_color' => $stageInfo['color'],
                'cycle_stage_desc' => $stageInfo['description'],
                'responsible_party' => $stageInfo['responsible'],
                'is_actual_po' => $isActual,
                'finalized_at' => $po->finalized_at?->toIso8601String(),
                'grand_total' => (float) $po->grand_total,
                'subtotal' => (float) $po->subtotal,
                'items_count' => $po->items->count(),
                'items' => $po->items->map(function (PurchaseOrderItem $item) use ($latestReceipt) {
                    $matchingReceiptItem = $latestReceipt?->items->firstWhere('purchase_order_item_id', $item->id);
                    return [
                        'id' => $item->id,
                        'item_description' => $item->item_description,
                        'item_reference' => $item->item_reference,
                        'region' => $item->region,
                        'quantity' => (float) $item->quantity,
                        'uom' => $item->uom,
                        'unit_price' => (float) $item->unit_price,
                        'line_total' => (float) ($item->line_total > 0 ? $item->line_total : round((float)$item->quantity * (float)$item->unit_price, 2)),
                        'received_quantity' => $matchingReceiptItem ? (float) $matchingReceiptItem->received_quantity : null,
                        'specifications' => $item->specifications,
                    ];
                })->values(),
                'receipt' => $latestReceipt ? [
                    'id' => $latestReceipt->id,
                    'receipt_number' => $latestReceipt->receipt_number,
                    'status' => $latestReceipt->status,
                    'received_at' => $latestReceipt->received_at?->toDateString(),
                    'photo_url' => $latestReceipt->photo_url,
                ] : null,
                'invoice' => $primaryInvoice ? [
                    'id' => $primaryInvoice->id,
                    'invoice_number' => $primaryInvoice->invoice_number,
                    'status' => $primaryInvoice->status,
                    'matching_status' => $primaryInvoice->matching_status,
                    'amount' => (float) $primaryInvoice->amount,
                ] : null,
                'delivery_date' => $po->delivery_date?->toDateString(),
                'actual_delivery_date' => $po->actual_delivery_date?->toDateString(),
                'notes' => $po->notes,
                'financial_notes' => $po->financial_notes,
                'created_at' => $po->created_at?->toIso8601String(),
                'updated_at' => $po->updated_at?->toIso8601String(),
            ]);
        }

        foreach ($standalonePrs as $pr) {
            $stageInfo = self::resolveCycleStage(null, $pr);

            $parcelRef = $pr->landParcel?->parcel_reference
                ?: ($pr->items->pluck('item_reference')->filter()->first() ?: '—');
            $region = $pr->landParcel?->region
                ?: ($pr->items->pluck('region')->filter()->first() ?: ($pr->department?->name ?? '—'));

            $masterList->push([
                'unique_key' => "PR-{$pr->id}",
                'order_id' => null,
                'request_id' => $pr->id,
                'po_number' => '— (قيد الاعتماد)',
                'manual_po_number' => null,
                'pr_number' => $pr->request_number,
                'department' => [
                    'id' => $pr->department?->id,
                    'name' => $pr->department?->name ?? 'غير محدد',
                    'code' => $pr->department?->code ?? '—',
                ],
                'requester' => [
                    'id' => $pr->requester?->id,
                    'name' => $pr->requester?->name ?? '—',
                ],
                'supplier' => [
                    'id' => null,
                    'name' => 'لم يُحدد بعد',
                    'code' => '—',
                ],
                'project_site' => [
                    'parcel_reference' => $parcelRef,
                    'region' => $region,
                ],
                'po_status' => null,
                'pr_status' => $pr->status,
                'cycle_stage' => $stageInfo['stage'],
                'cycle_stage_label' => $stageInfo['label'],
                'cycle_stage_color' => $stageInfo['color'],
                'cycle_stage_desc' => $stageInfo['description'],
                'responsible_party' => $stageInfo['responsible'],
                'is_actual_po' => false,
                'finalized_at' => null,
                'grand_total' => (float) $pr->total_estimated_cost,
                'subtotal' => (float) $pr->total_estimated_cost,
                'items_count' => $pr->items->count(),
                'items' => $pr->items->map(fn ($item) => [
                    'id' => $item->id,
                    'item_description' => $item->item_description,
                    'item_reference' => $item->item_reference,
                    'region' => $item->region,
                    'quantity' => (float) $item->quantity,
                    'uom' => $item->uom,
                    'unit_price' => (float) $item->estimated_unit_price,
                    'line_total' => (float) ($item->estimated_line_total > 0 ? $item->estimated_line_total : round((float)$item->quantity * (float)$item->estimated_unit_price, 2)),
                    'received_quantity' => null,
                    'specifications' => $item->specifications,
                ])->values(),
                'receipt' => null,
                'invoice' => null,
                'delivery_date' => null,
                'actual_delivery_date' => null,
                'notes' => $pr->notes,
                'financial_notes' => null,
                'created_at' => $pr->created_at?->toIso8601String(),
                'updated_at' => $pr->updated_at?->toIso8601String(),
            ]);
        }

        // 4. Calculate Stage Statistics on the FULL collection
        $stats = [
            'total_count' => $masterList->count(),
            'invoiced_count' => $masterList->where('cycle_stage', 'INVOICED')->count(),
            'actual_po_count' => $masterList->where('cycle_stage', 'ACTUAL_PO_ISSUED')->count(),
            'pending_actual_po_count' => $masterList->where('cycle_stage', 'PENDING_ACTUAL_PO')->count(),
            'grn_pending_count' => $masterList->where('cycle_stage', 'GRN_PENDING')->count(),
            'po_issued_count' => $masterList->where('cycle_stage', 'PO_ISSUED')->count(),
            'pending_po_count' => $masterList->where('cycle_stage', 'PENDING_PO')->count(),
            'under_review_count' => $masterList->where('cycle_stage', 'UNDER_REVIEW')->count(),
            'rejected_count' => $masterList->where('cycle_stage', 'CANCELLED_OR_REJECTED')->count(),
            'total_financial_value' => round((float) $masterList->whereNotIn('cycle_stage', ['CANCELLED_OR_REJECTED'])->sum('grand_total'), 2),
        ];

        // 5. Filter by Stage if requested
        if ($stageFilter !== 'all' && $stageFilter !== '') {
            $normalizedFilter = strtoupper(str_replace('-', '_', $stageFilter));
            $masterList = $masterList->filter(fn ($row) => $row['cycle_stage'] === $normalizedFilter)->values();
        }

        // Sort: newest created first
        $sortedList = $masterList->sortByDesc('created_at')->values();

        // 6. Pagination
        $perPageParam = $request->query('per_page', 50);
        $isAll = $perPageParam === 'ALL' || $perPageParam === 'all' || (is_numeric($perPageParam) && (int) $perPageParam <= 0);
        $perPage = $isAll ? max(1, $sortedList->count()) : (int) $perPageParam;
        $page = max(1, (int) $request->query('page', 1));
        $totalRows = $sortedList->count();
        $lastPage = $isAll ? 1 : max(1, (int) ceil($totalRows / $perPage));
        $sliced = $isAll ? $sortedList : $sortedList->slice(($page - 1) * $perPage, $perPage)->values();

        // Lookups for filters
        $departments = Department::orderBy('name')->get(['id', 'name', 'code']);
        $suppliers = Supplier::where('is_active', true)->orderBy('company_name')->get(['id', 'company_name', 'name', 'code']);

        return response()->json([
            'success' => true,
            'data' => $sliced,
            'meta' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $totalRows,
                'last_page' => $lastPage,
                'from' => $totalRows > 0 ? (($page - 1) * $perPage + 1) : 0,
                'to' => min($page * $perPage, $totalRows),
            ],
            'stats' => $stats,
            'lookups' => [
                'departments' => $departments,
                'suppliers' => $suppliers,
            ],
        ]);
    }

    /**
     * GET /api/v1/admin/orders/{id}/details
     * Detailed inspect payload for an order, including receipts, items, linked PR, and audit logs.
     */
    public function showOrder(int $id): JsonResponse
    {
        $po = PurchaseOrder::with([
            'purchaseRequest.department',
            'purchaseRequest.requester',
            'purchaseRequest.landParcel',
            'supplier',
            'items.item',
            'purchaseReceipts.items',
            'supplierInvoices',
            'approvalHistory.actor',
            'createdBy',
        ])->findOrFail($id);

        $pr = $po->purchaseRequest;
        $stageInfo = self::resolveCycleStage($po, $pr);

        // Fetch audit events related to this PO or its PR
        $auditLogs = SystemEvent::query()
            ->where(function ($q) use ($po, $pr) {
                $q->where(function ($sub) use ($po) {
                    $sub->where('entity_type', PurchaseOrder::class)
                        ->where('entity_id', $po->id);
                });
                if ($pr) {
                    $q->orWhere(function ($sub) use ($pr) {
                        $sub->where('entity_type', PurchaseRequest::class)
                            ->where('entity_id', $pr->id);
                    });
                }
            })
            ->with('actor:id,name,email')
            ->orderByDesc('occurred_at')
            ->limit(30)
            ->get();

        $availableSuppliers = Supplier::where('is_active', true)->orderBy('company_name')->get(['id', 'company_name', 'name', 'code']);

        return response()->json([
            'success' => true,
            'data' => [
                'order' => $po,
                'request' => $pr,
                'cycle_stage' => $stageInfo,
                'audit_logs' => $auditLogs,
                'available_suppliers' => $availableSuppliers,
                'allowed_statuses' => [
                    ['value' => 'PO_DRAFT', 'label' => 'مسودة أمر شراء'],
                    ['value' => 'PENDING_ACCOUNTING_REVIEW', 'label' => 'بانتظار تدقيق الحسابات'],
                    ['value' => 'ISSUED', 'label' => 'صادر ومعتمد للتوريد (ISSUED)'],
                    ['value' => 'PENDING_ACTUAL_PO', 'label' => 'تم الاستلام - بانتظار الأمر الفعلي (PENDING_ACTUAL_PO)'],
                    ['value' => 'APPROVED_BY_ACCOUNTING', 'label' => 'معتمد بالحسابات (APPROVED_BY_ACCOUNTING)'],
                    ['value' => 'FINAL_APPROVED', 'label' => 'معتمد نهائياً (FINAL_APPROVED)'],
                    ['value' => 'REJECTED', 'label' => 'مرفوض'],
                    ['value' => 'CANCELLED', 'label' => 'ملغي'],
                ],
            ],
        ]);
    }

    /**
     * PUT /api/v1/admin/orders/{id}/force-update
     * Sovereign override (RBAC Bypass) allowing the Super Admin to update ANY field,
     * status, items, prices, or quantities at ANY stage with full audit trail.
     */
    public function forceUpdateOrder(Request $request, int $id): JsonResponse
    {
        $admin = Auth::user();

        $validated = $request->validate([
            'status' => 'nullable|string',
            'supplier_id' => 'nullable|exists:suppliers,id',
            'delivery_date' => 'nullable|date',
            'actual_delivery_date' => 'nullable|date',
            'delivery_notes' => 'nullable|string',
            'notes' => 'nullable|string',
            'financial_notes' => 'nullable|string',
            'rejection_reason' => 'nullable|string',
            'is_actual_po' => 'nullable|boolean',
            'finalized_at' => 'nullable|date',
            'admin_reason' => 'required|string|min:3|max:500',
            'sync_receipt' => 'nullable|boolean',
            'sync_pr' => 'nullable|boolean',
            'items' => 'nullable|array',
            'items.*.id' => 'nullable|integer',
            'items.*.item_description' => 'required_with:items|string|max:255',
            'items.*.item_reference' => 'nullable|string|max:100',
            'items.*.region' => 'nullable|string|max:100',
            'items.*.quantity' => 'required_with:items|numeric|gt:0',
            'items.*.uom' => 'required_with:items|string|max:50',
            'items.*.unit_price' => 'required_with:items|numeric|min:0',
            'items.*.specifications' => 'nullable|string',
            'items.*.delete' => 'nullable|boolean',
        ]);

        $po = PurchaseOrder::with(['items', 'purchaseReceipts.items', 'purchaseRequest'])->findOrFail($id);

        $oldSnapshot = [
            'status' => $po->status,
            'supplier_id' => $po->supplier_id,
            'subtotal' => (float) $po->subtotal,
            'grand_total' => (float) $po->grand_total,
            'delivery_date' => $po->delivery_date?->toDateString(),
            'actual_delivery_date' => $po->actual_delivery_date?->toDateString(),
            'finalized_at' => $po->finalized_at?->toIso8601String(),
            'items' => $po->items->map(fn ($it) => [
                'id' => $it->id,
                'description' => $it->item_description,
                'reference' => $it->item_reference,
                'qty' => (float) $it->quantity,
                'uom' => $it->uom,
                'unit_price' => (float) $it->unit_price,
                'line_total' => (float) $it->line_total,
            ])->toArray(),
        ];

        $adminReason = trim($validated['admin_reason']);
        $syncReceipt = $request->boolean('sync_receipt', true);
        $syncPr = $request->boolean('sync_pr', true);

        DB::transaction(function () use ($po, $validated, $adminReason, $admin, $syncReceipt, $syncPr, $oldSnapshot) {
            $fromStatus = $po->status;

            // 1. Update direct PO attributes
            if (!empty($validated['status'])) {
                $po->status = $validated['status'];
            }

            if (array_key_exists('supplier_id', $validated)) {
                $po->supplier_id = $validated['supplier_id'];
            }
            if (array_key_exists('delivery_date', $validated)) {
                $po->delivery_date = $validated['delivery_date'] ? Carbon::parse($validated['delivery_date']) : null;
            }
            if (array_key_exists('actual_delivery_date', $validated)) {
                $po->actual_delivery_date = $validated['actual_delivery_date'] ? Carbon::parse($validated['actual_delivery_date']) : null;
            }
            if (array_key_exists('delivery_notes', $validated)) {
                $po->delivery_notes = $validated['delivery_notes'];
            }
            if (array_key_exists('notes', $validated)) {
                $po->notes = $validated['notes'];
            }
            if (array_key_exists('financial_notes', $validated)) {
                $po->financial_notes = $validated['financial_notes'];
            }
            if (array_key_exists('rejection_reason', $validated)) {
                $po->rejection_reason = $validated['rejection_reason'];
            }

            // Handle Actual PO flag / finalization timestamp
            if (array_key_exists('is_actual_po', $validated)) {
                if ($validated['is_actual_po']) {
                    if (!$po->finalized_at) {
                        $po->finalized_at = now();
                        $po->finalized_by_user_id = $admin->id;
                    }
                } else {
                    $po->finalized_at = null;
                    $po->finalized_by_user_id = null;
                }
            } elseif (!empty($validated['finalized_at'])) {
                $po->finalized_at = Carbon::parse($validated['finalized_at']);
                $po->finalized_by_user_id = $admin->id;
            }

            // 2. Process Items Override
            $updatedPoItems = collect();
            if (!empty($validated['items']) && is_array($validated['items'])) {
                foreach ($validated['items'] as $itemData) {
                    $itemId = $itemData['id'] ?? null;
                    $isDelete = !empty($itemData['delete']);

                    if ($itemId) {
                        $existingItem = PurchaseOrderItem::where('purchase_order_id', $po->id)->find($itemId);
                        if ($existingItem) {
                            if ($isDelete) {
                                // Delete receipt items referencing this
                                DB::table('purchase_receipt_items')->where('purchase_order_item_id', $existingItem->id)->delete();
                                $existingItem->delete();
                                continue;
                            }

                            $qty = (float) $itemData['quantity'];
                            $price = (float) $itemData['unit_price'];
                            $lineTotal = round($qty * $price, 2);

                            $existingItem->update([
                                'item_description' => $itemData['item_description'],
                                'item_reference' => $itemData['item_reference'] ?? $existingItem->item_reference,
                                'region' => $itemData['region'] ?? $existingItem->region,
                                'quantity' => $qty,
                                'uom' => $itemData['uom'],
                                'unit_price' => $price,
                                'line_total' => $lineTotal,
                                'specifications' => $itemData['specifications'] ?? $existingItem->specifications,
                            ]);
                            $updatedPoItems->push($existingItem->fresh());
                        }
                    } else {
                        // Create brand new item
                        $qty = (float) $itemData['quantity'];
                        $price = (float) $itemData['unit_price'];
                        $lineTotal = round($qty * $price, 2);

                        $newItem = PurchaseOrderItem::create([
                            'purchase_order_id' => $po->id,
                            'item_description' => $itemData['item_description'],
                            'item_reference' => $itemData['item_reference'] ?? null,
                            'region' => $itemData['region'] ?? null,
                            'quantity' => $qty,
                            'uom' => $itemData['uom'],
                            'unit_price' => $price,
                            'line_total' => $lineTotal,
                            'specifications' => $itemData['specifications'] ?? null,
                        ]);
                        $updatedPoItems->push($newItem);
                    }
                }
            } else {
                $updatedPoItems = $po->items;
            }

            // Recalculate totals
            $freshItems = PurchaseOrderItem::where('purchase_order_id', $po->id)->get();
            $subtotal = round($freshItems->sum('line_total'), 2);
            $grandTotal = $subtotal;

            $po->subtotal = $subtotal;
            $po->grand_total = $grandTotal;
            if (Schema::hasColumn('purchase_orders', 'total_amount')) {
                $po->total_amount = $grandTotal;
            }
            $po->save();

            // 3. Receipt synchronization (if requested and receipts exist)
            if ($syncReceipt) {
                foreach ($po->purchaseReceipts as $receipt) {
                    foreach ($freshItems as $pItem) {
                        $rcptItem = PurchaseReceiptItem::where('purchase_receipt_id', $receipt->id)
                            ->where('purchase_order_item_id', $pItem->id)
                            ->first();

                        if ($rcptItem) {
                            $rcptItem->update([
                                'ordered_quantity' => $pItem->quantity,
                                'received_quantity' => $pItem->quantity,
                            ]);
                        } else {
                            PurchaseReceiptItem::create([
                                'purchase_receipt_id' => $receipt->id,
                                'purchase_order_item_id' => $pItem->id,
                                'ordered_quantity' => $pItem->quantity,
                                'received_quantity' => $pItem->quantity,
                                'uom' => $pItem->uom,
                            ]);
                        }
                    }
                }
            }

            // 4. PR Synchronization (if requested and linked)
            if ($syncPr && $po->purchase_request_id) {
                DB::table('purchase_requests')
                    ->where('id', $po->purchase_request_id)
                    ->update([
                        'total_estimated_cost' => $grandTotal,
                        'updated_at' => now(),
                    ]);
            }

            // 5. System Audit Trail Logging
            $newSnapshot = [
                'status' => $po->status,
                'supplier_id' => $po->supplier_id,
                'subtotal' => (float) $po->subtotal,
                'grand_total' => (float) $po->grand_total,
                'delivery_date' => $po->delivery_date?->toDateString(),
                'actual_delivery_date' => $po->actual_delivery_date?->toDateString(),
                'finalized_at' => $po->finalized_at?->toIso8601String(),
                'items' => $freshItems->map(fn ($it) => [
                    'id' => $it->id,
                    'description' => $it->item_description,
                    'reference' => $it->item_reference,
                    'qty' => (float) $it->quantity,
                    'uom' => $it->uom,
                    'unit_price' => (float) $it->unit_price,
                    'line_total' => (float) $it->line_total,
                ])->toArray(),
            ];

            // Record in SystemEvent
            app(SystemEventService::class)->record([
                'actor_user_id' => $admin->id,
                'event_type' => 'admin.force_override',
                'action' => 'ADMIN_FORCE_UPDATE',
                'entity_type' => PurchaseOrder::class,
                'entity_id' => $po->id,
                'entity_label' => "أمر شراء {$po->po_number} (تعديل سيادي من مدير النظام)",
                'from_state' => $fromStatus,
                'to_state' => $po->status,
                'description' => "قام مدير النظام ({$admin->name}) بتعديل سيادي شامل على أمر الشراء رقم {$po->po_number}. سبب التدخل: {$adminReason}",
                'old_values' => $oldSnapshot,
                'new_values' => $newSnapshot,
                'metadata' => [
                    'admin_id' => $admin->id,
                    'admin_name' => $admin->name,
                    'reason' => $adminReason,
                    'ip' => request()->ip(),
                    'sync_receipt' => $syncReceipt,
                    'sync_pr' => $syncPr,
                ],
            ]);

            // Record in ApprovalHistory
            ApprovalHistory::create([
                'target_type' => PurchaseOrder::class,
                'target_id' => $po->id,
                'actor_user_id' => $admin->id,
                'action' => 'ADMIN_FORCE_OVERRIDE',
                'from_state' => $fromStatus,
                'to_state' => $po->status,
                'comments' => "تعديل سيادي من مدير النظام: {$adminReason}",
            ]);
        });

        $refreshedPo = PurchaseOrder::with(['items', 'purchaseReceipts.items', 'supplierInvoices', 'supplier'])->find($id);

        return response()->json([
            'success' => true,
            'message' => "تم تنفيذ التعديل السيادي بنجاح وتحديث أمر الشراء رقم {$refreshedPo->po_number} وإعادة حساب كافة الإجماليات.",
            'data' => $refreshedPo,
        ]);
    }
}
