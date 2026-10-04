<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Procurement\AddPurchaseOrderItemRequest;
use App\Http\Requests\Procurement\CreatePurchaseOrderRequest;
use App\Http\Requests\Procurement\UpdatePurchaseOrderHeaderRequest;
use App\Http\Requests\Procurement\UpdatePurchaseOrderItemRequest;
use App\Http\Requests\Procurement\StoreDirectPurchaseOrderRequest;
use App\Http\Requests\Procurement\UpdateDeliveryStatusRequest;
use App\Http\Resources\PurchaseOrderResource;
use App\Http\Resources\PurchaseRequestResource;
use App\Http\Resources\SupplierResource;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\PurchaseRequest;
use App\Services\ProcurementPurchaseRequestService;
use App\Services\PurchaseOrderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class ProcurementPurchaseOrderController extends Controller
{
    public function __construct(
        protected PurchaseOrderService $poService,
        protected ProcurementPurchaseRequestService $procurementPrService,
    ) {}

    // ─────────────────────────────────────────────
    // PURCHASE REQUEST — PROCUREMENT APPROVAL QUEUE
    // ─────────────────────────────────────────────

    /**
     * List PRs pending procurement manager approval (PENDING_PROCUREMENT_APPROVAL).
     */
    public function indexApprovedPrs(Request $request): AnonymousResourceCollection
    {
        $perPage = min((int) $request->query('per_page', 15), 100);
        $prs = $this->procurementPrService->getPendingProcurementApprovalRequests($perPage);
        return PurchaseRequestResource::collection($prs);
    }

    /**
     * List PRs waiting for three supplier quotes.
     */
    public function indexPendingQuoteRequests(Request $request): AnonymousResourceCollection
    {
        $perPage = min((int) $request->query('per_page', 15), 100);
        return PurchaseRequestResource::collection($this->procurementPrService->getPendingQuoteRequests($perPage, $request->user()));
    }

    /**
     * List PRs already approved by procurement (APPROVED_BY_PROCUREMENT) — ready for PO creation.
     */
    public function indexProcurementApprovedPrs(Request $request): AnonymousResourceCollection
    {
        $perPage = min((int) $request->query('per_page', 15), 100);
        $prs = $this->procurementPrService->getApprovedByProcurementRequests($perPage);
        return PurchaseRequestResource::collection($prs);
    }

    /**
     * View a purchase request (pending or approved by procurement).
     */
    public function showApprovedPr(Request $request, string|int $id): JsonResponse|PurchaseRequestResource
    {
        $pr = PurchaseRequest::with(['requester', 'department', 'assignedReviewer', 'siteEngineer', 'directSupplier', 'items.item', 'approvalHistory.actor', 'quotes.supplier', 'quotes.recommendations.user', 'selectedQuote.supplier'])
            ->findOrFail((int) $id);

        if (! in_array($pr->status, ['PENDING_PROCUREMENT_APPROVAL', 'PENDING_QUOTE_RECOMMENDATIONS', 'PENDING_EXECUTIVE_QUOTE_DECISION', 'APPROVED_BY_PROCUREMENT', 'APPROVED_BY_ACCOUNTING'])) {
            return response()->json(['message' => 'Purchase request is not in a procurement queue status.'], 409);
        }

        return new PurchaseRequestResource($pr);
    }

    /**
     * Procurement Manager chooses the next route: three quotes or direct accounting approval.
     */
    public function approvePurchaseRequest(Request $request, string|int $id): JsonResponse
    {
        $financialData = $request->input('financial_data');
        if (is_array($financialData)) {
            if (empty($financialData['supplier_id']) && !empty($financialData['one_time_supplier_name'])) {
                $sup = \App\Models\Supplier::firstOrCreate(
                    ['company_name' => trim($financialData['one_time_supplier_name'])],
                    ['contact_name' => 'مورد لعملية واحدة', 'is_active' => true, 'opening_balance' => 0]
                );
                $financialData['supplier_id'] = $sup->id;
            }
            $globalSupplierId = $financialData['supplier_id'] ?? null;
            $items = $financialData['items'] ?? null;
            if (is_array($items)) {
                $firstItemSupplier = null;
                foreach ($items as $idx => $item) {
                    if (empty($item['supplier_id']) && !empty($item['one_time_supplier_name'])) {
                        $sup = \App\Models\Supplier::firstOrCreate(
                            ['company_name' => trim($item['one_time_supplier_name'])],
                            ['contact_name' => 'مورد لعملية واحدة', 'is_active' => true, 'opening_balance' => 0]
                        );
                        $items[$idx]['supplier_id'] = $sup->id;
                    }
                    if (!empty($items[$idx]['supplier_id'])) {
                        $firstItemSupplier ??= $items[$idx]['supplier_id'];
                    } elseif ($globalSupplierId) {
                        $items[$idx]['supplier_id'] = $globalSupplierId;
                        $firstItemSupplier ??= $globalSupplierId;
                    }
                }
                if (!$globalSupplierId && $firstItemSupplier) {
                    $financialData['supplier_id'] = $firstItemSupplier;
                }
                $financialData['items'] = $items;
                $request->merge(['financial_data' => $financialData]);
            }
        }

        $validated = $request->validate([
            'use_quotes' => ['nullable', 'boolean'],
            'comment' => ['nullable', 'string', 'max:2000'],
            'financial_data' => ['nullable', 'array'],
            'financial_data.supplier_id' => ['nullable', 'integer', 'exists:suppliers,id'],
            'financial_data.items' => ['required_if:use_quotes,false', 'array', 'min:1'],
            'financial_data.items.*' => ['array'],
            'financial_data.items.*.pr_item_id' => ['required_if:use_quotes,false', 'integer', 'exists:purchase_request_items,id'],
            'financial_data.items.*.supplier_id' => ['required_if:use_quotes,false', 'integer', 'exists:suppliers,id'],
            'financial_data.items.*.quantity' => ['required_if:use_quotes,false', 'numeric', 'gt:0'],
            'financial_data.items.*.unit_price' => ['required_if:use_quotes,false', 'numeric', 'gte:0'],
            'financial_data.items.*.uom' => ['nullable', 'string', 'max:20'],
            'financial_data.notes' => ['nullable', 'string', 'max:5000'],
        ]);
        $pr = PurchaseRequest::with(['requester', 'department', 'items'])->findOrFail((int) $id);
        $useQuotes = array_key_exists('use_quotes', $validated) ? (bool) $validated['use_quotes'] : true;

        try {
            $approved = $useQuotes
                ? $this->procurementPrService->approvePurchaseRequest(
                    $request->user(),
                    $pr,
                    $validated['comment'] ?? null,
                )
                : $this->procurementPrService->sendToAccountingWithoutQuotes(
                    $request->user(),
                    $pr,
                    $validated['financial_data'] ?? [],
                    $validated['comment'] ?? null,
                );
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 409);
        }

        return response()->json([
            'message' => $useQuotes
                ? 'تم اعتماد الطلب وبدء مسار عروض الأسعار الثلاثة.'
                : 'تم إرسال الطلب إلى الحسابات للموافقة المالية بدون عروض أسعار.',
            'data' => new PurchaseRequestResource($approved),
        ], 200);
    }

    /**
     * Reject a PR at procurement level (PENDING_PROCUREMENT_APPROVAL → REJECTED).
     */
    public function rejectPurchaseRequest(Request $request, string|int $id): JsonResponse
    {
        $validated = $request->validate([
            'comment' => ['required', 'string', 'min:3', 'max:1000'],
        ]);

        $pr = PurchaseRequest::with(['requester', 'department', 'items'])->findOrFail((int) $id);

        try {
            $rejected = $this->procurementPrService->rejectPurchaseRequest(
                $request->user(),
                $pr,
                $validated['comment']
            );
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 409);
        }

        return response()->json([
            'message' => 'تم رفض طلب الشراء من قِبَل مدير المشتريات.',
            'data' => new PurchaseRequestResource($rejected),
        ], 200);
    }

    // ─────────────────────────────────────────────
    // SUPPLIERS
    // ─────────────────────────────────────────────

    /**
     * List active suppliers for procurement selection.
     */
    public function indexSuppliers(Request $request): AnonymousResourceCollection
    {
        $suppliers = $this->poService->getActiveSuppliers();
        return SupplierResource::collection($suppliers);
    }

    // ─────────────────────────────────────────────
    // PURCHASE ORDERS
    // ─────────────────────────────────────────────

    /**
     * List all purchase orders.
     */
    public function indexPos(Request $request): AnonymousResourceCollection
    {
        $perPage = min(max((int) $request->query('per_page', 15), 1), 100);
        $search = trim((string) $request->query('search', ''));
        $status = trim((string) $request->query('status', ''));
        $supplierId = (int) $request->query('supplier_id', 0);
        $departmentId = (int) $request->query('department_id', 0);
        $dateFrom = $request->query('date_from');
        $dateTo = $request->query('date_to');

        $posQuery = PurchaseOrder::with([
                'purchaseRequest.requester',
                'purchaseRequest.department',
                'purchaseRequest.assignedReviewer',
                'purchaseRequest.approvalHistory.actor',
                'supplier',
                'createdBy',
                'items.item',
                'items.supplier',
            ])
            ->when($status !== '', fn ($query) => $query->where('status', $status))
            ->when($supplierId > 0, fn ($query) => $query->where('supplier_id', $supplierId))
            ->when($departmentId > 0, fn ($query) => $query->whereHas('purchaseRequest', fn ($requestQuery) => $requestQuery->where('department_id', $departmentId)))
            ->when($dateFrom, fn ($query) => $query->whereDate('updated_at', '>=', $dateFrom))
            ->when($dateTo, fn ($query) => $query->whereDate('updated_at', '<=', $dateTo))
            ->when($search !== '', function ($query) use ($search): void {
                $term = '%' . mb_substr($search, 0, 100) . '%';
                $query->where(function ($searchQuery) use ($term): void {
                    $searchQuery
                        ->where('po_number', 'like', $term)
                        ->orWhereHas('supplier', fn ($supplierQuery) => $supplierQuery->where('company_name', 'like', $term))
                        ->orWhereHas('purchaseRequest', function ($requestQuery) use ($term): void {
                            $requestQuery
                                ->where('request_number', 'like', $term)
                                ->orWhereHas('requester', fn ($userQuery) => $userQuery->where('name', 'like', $term))
                                ->orWhereHas('department', fn ($departmentQuery) => $departmentQuery->where('name', 'like', $term));
                        });
                });
            })
            ->orderBy('updated_at', 'desc');

        return PurchaseOrderResource::collection($posQuery->paginate($perPage)->withQueryString());
    }

    /**
     * View purchase order details.
     */
    public function showPo(Request $request, string|int $id): PurchaseOrderResource
    {
        $po = PurchaseOrder::with([
            'purchaseRequest.requester',
            'purchaseRequest.department',
            'purchaseRequest.assignedReviewer',
            'purchaseRequest.approvalHistory.actor',
            'supplier',
            'createdBy',
            'items.item',
            'items.supplier',
            'receipts.items.purchaseOrderItem.supplier',
            'receipts.warehouseKeeper',
            'receipts.siteEngineer',
            'receipts.receiver',
        ])->findOrFail((int) $id);
        return new PurchaseOrderResource($po);
    }

    /**
     * Get combined Purchase Request + Actual Purchase Order + Site Receipt (GRN) document.
     */
    public function combinedDocument(Request $request, string|int $id): JsonResponse
    {
        $po = PurchaseOrder::with([
            'purchaseRequest.requester',
            'purchaseRequest.department',
            'purchaseRequest.assignedReviewer',
            'purchaseRequest.approvalHistory.actor',
            'purchaseRequest.items.item',
            'supplier',
            'createdBy',
            'finalizedBy',
            'items.item',
            'items.supplier',
            'receipts.items.purchaseOrderItem',
            'receipts.warehouseKeeper',
            'receipts.siteEngineer',
            'receipts.receiver',
        ])->findOrFail((int) $id);

        $poResource = new PurchaseOrderResource($po);
        $prResource = new PurchaseRequestResource($po->purchaseRequest);
        $receipts = $poResource['receipts'] ?? [];
        $latestReceipt = !empty($receipts) ? $receipts[0] : null;

        return response()->json([
            'data' => [
                'purchase_order' => $poResource,
                'purchase_request' => $prResource,
                'receipt' => $latestReceipt,
                'receipts' => $receipts,
            ],
        ]);
    }


    /**
     * Create a new draft Purchase Order from a procurement-approved Purchase Request.
     */
    public function storePo(CreatePurchaseOrderRequest $request): JsonResponse
    {
        $prId = (int) $request->validated('purchase_request_id');
        $supplierId = (int) $request->validated('supplier_id');

        if (!$supplierId && $request->filled('one_time_supplier_name')) {
            $supplier = \App\Models\Supplier::firstOrCreate(
                ['company_name' => trim($request->input('one_time_supplier_name'))],
                ['contact_name' => 'مورد لعملية واحدة', 'is_active' => true, 'opening_balance' => 0]
            );
            $supplierId = $supplier->id;
        }

        try {
            $po = $this->poService->createPoFromPr(
                $request->user(),
                $prId,
                $supplierId,
                $request->validated()
            );

            // إصدار أمر الشراء وإرساله للحسابات فور اكتمال بياناته التجارية.
            $po = $this->poService->submitToAccounting($request->user(), $po);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 409);
        }

        return (new PurchaseOrderResource($po))
            ->response()
            ->setStatusCode(201);
    }


    /**
     * Update draft Purchase Order header details.
     */
    public function updateHeader(UpdatePurchaseOrderHeaderRequest $request, string|int $id): JsonResponse|PurchaseOrderResource
    {
        $po = PurchaseOrder::where('id', (int) $id)->firstOrFail();

        if (! in_array($po->status, ['PO_DRAFT', 'RETURNED_TO_PROCUREMENT', 'PENDING_ACTUAL_PO', 'ISSUED', 'PENDING_ACCOUNTING_REVIEW', 'APPROVED_BY_ACCOUNTING'], true)) {
            return response()->json(['message' => 'لا يمكن تعديل أمر الشراء في هذه الحالة.'], 409);
        }

        try {
            $updatedPo = $this->poService->updateHeader($request->user(), $po, $request->validated());
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 409);
        }

        return new PurchaseOrderResource($updatedPo);
    }

    /**
     * Update commercial details for a PO line item.
     */
    public function updateItem(UpdatePurchaseOrderItemRequest $request, string|int $id, string|int $itemId): JsonResponse|PurchaseOrderResource
    {
        $po = PurchaseOrder::findOrFail((int) $id);
        $item = PurchaseOrderItem::findOrFail((int) $itemId);

        if (! in_array($po->status, ['PO_DRAFT', 'RETURNED_TO_PROCUREMENT', 'PENDING_ACTUAL_PO', 'ISSUED', 'PENDING_ACCOUNTING_REVIEW', 'APPROVED_BY_ACCOUNTING'], true)) {
            return response()->json(['message' => 'لا يمكن تعديل أمر الشراء في هذه الحالة.'], 409);
        }

        if ($item->purchase_order_id !== $po->id) {
            return response()->json(['message' => 'Item does not belong to this purchase order.'], 422);
        }

        $updatedPo = $this->poService->updateItem($request->user(), $po, $item, $request->validated());
        return new PurchaseOrderResource($updatedPo);
    }

    /**
     * Add a new line item to a draft PO.
     */
    public function addItem(AddPurchaseOrderItemRequest $request, string|int $id): JsonResponse|PurchaseOrderResource
    {
        $po = PurchaseOrder::findOrFail((int) $id);

        if (! in_array($po->status, ['PO_DRAFT', 'RETURNED_TO_PROCUREMENT', 'PENDING_ACTUAL_PO', 'ISSUED', 'PENDING_ACCOUNTING_REVIEW', 'APPROVED_BY_ACCOUNTING'], true)) {
            return response()->json(['message' => 'لا يمكن تعديل أمر الشراء في هذه الحالة.'], 409);
        }

        $updatedPo = $this->poService->addItem($request->user(), $po, $request->validated());
        return new PurchaseOrderResource($updatedPo);
    }

    /**
     * Remove a line item from a draft PO.
     */
    public function deleteItem(Request $request, string|int $id, string|int $itemId): JsonResponse|PurchaseOrderResource
    {
        $po = PurchaseOrder::findOrFail((int) $id);
        $item = PurchaseOrderItem::findOrFail((int) $itemId);

        if (! in_array($po->status, ['PO_DRAFT', 'RETURNED_TO_PROCUREMENT', 'PENDING_ACTUAL_PO', 'ISSUED', 'PENDING_ACCOUNTING_REVIEW', 'APPROVED_BY_ACCOUNTING'], true)) {
            return response()->json(['message' => 'لا يمكن تعديل أمر الشراء في هذه الحالة.'], 409);
        }

        if ($item->purchase_order_id !== $po->id) {
            return response()->json(['message' => 'Item does not belong to this purchase order.'], 422);
        }

        $updatedPo = $this->poService->deleteItem($request->user(), $po, $item);
        return new PurchaseOrderResource($updatedPo);
    }

    /**
     * Submit draft Purchase Order to Accounting for financial audit.
     */
    public function submitPoToAccounting(Request $request, string|int $id): JsonResponse
    {
        $po = PurchaseOrder::with(['purchaseRequest.requester', 'purchaseRequest.department', 'items', 'supplier', 'createdBy'])->findOrFail((int) $id);

        if (in_array($po->status, ['ISSUED', 'PENDING_ACCOUNTING_REVIEW', 'APPROVED_BY_ACCOUNTING', 'FINAL_APPROVED'], true)) {
            return response()->json([
                'message' => 'تم تقديم أمر الشراء للحسابات بنجاح.',
                'data' => new PurchaseOrderResource($po),
            ], 200);
        }

        if ($po->status !== 'PO_DRAFT' && $po->status !== 'RETURNED_TO_PROCUREMENT') {
            return response()->json(['message' => 'Only draft or returned purchase orders can be submitted.'], 409);
        }

        $submittedPo = $this->poService->submitToAccounting($request->user(), $po);

        return response()->json([
            'message' => 'Purchase order submitted to accounting successfully.',
            'data' => new PurchaseOrderResource($submittedPo),
        ], 200);
    }

    /**
     * Create a direct purchase request. It must be approved by accounting and
     * the executive manager before procurement can create its purchase order.
     */
    public function storeDirectPo(StoreDirectPurchaseOrderRequest $request): JsonResponse
    {
        $validated = $request->validated();

        $engineerIsAssigned = \App\Models\User::query()
            ->whereKey($validated['site_engineer_user_id'])
            ->where('is_active', true)
            ->exists();

        if (! $engineerIsAssigned) {
            return response()->json(['message' => 'يجب اختيار مستلم نشط من مستخدمي النظام.'], 422);
        }

        if (empty($validated['supplier_id']) && !empty($validated['one_time_supplier_name'])) {
            $supplier = \App\Models\Supplier::firstOrCreate(
                ['company_name' => trim($validated['one_time_supplier_name'])],
                ['contact_name' => 'مورد لعملية واحدة', 'is_active' => true, 'opening_balance' => 0]
            );
            $validated['supplier_id'] = $supplier->id;
        }

        if (!empty($validated['items']) && is_array($validated['items'])) {
            foreach ($validated['items'] as $idx => $item) {
                if (empty($item['supplier_id']) && !empty($item['one_time_supplier_name'])) {
                    $sup = \App\Models\Supplier::firstOrCreate(
                        ['company_name' => trim($item['one_time_supplier_name'])],
                        ['contact_name' => 'مورد لعملية واحدة', 'is_active' => true, 'opening_balance' => 0]
                    );
                    $validated['items'][$idx]['supplier_id'] = $sup->id;
                } elseif (empty($item['supplier_id']) && !empty($validated['supplier_id'])) {
                    $validated['items'][$idx]['supplier_id'] = $validated['supplier_id'];
                }
            }
        }

        try {
            $pr = $this->procurementPrService->createDirectPurchaseRequest(
                $request->user(),
                $validated,
            );
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 409);
        }

        return response()->json([
            'message' => 'تم إنشاء طلب الشراء المباشر وإرساله إلى المدير التنفيذي للاعتماد.',
            'data' => new PurchaseRequestResource($pr),
        ], 201);
    }

    /**
     * Update delivery tracking details for a PO.
     */
    public function updateDeliveryStatus(UpdateDeliveryStatusRequest $request, string|int $id): JsonResponse
    {
        $validated = $request->validated();

        $po = PurchaseOrder::findOrFail((int) $id);
        $oldStatus = $po->delivery_status;

        $po->update([
            'delivery_status' => $validated['delivery_status'],
            'actual_delivery_date' => array_key_exists('actual_delivery_date', $validated) ? $validated['actual_delivery_date'] : $po->actual_delivery_date,
            'delivery_notes' => array_key_exists('delivery_notes', $validated) ? $validated['delivery_notes'] : $po->delivery_notes,
        ]);

        \App\Models\AuditLog::create([
            'user_id' => $request->user()->id,
            'entity_type' => PurchaseOrder::class,
            'entity_id' => $po->id,
            'action' => 'DELIVERY_STATUS_UPDATED',
            'field_name' => 'delivery_status',
            'old_value' => $oldStatus,
            'new_value' => $validated['delivery_status'],
        ]);

        return response()->json([
            'message' => 'Delivery status updated successfully.',
            'data' => new PurchaseOrderResource($po->fresh(['purchaseRequest.requester', 'purchaseRequest.department', 'supplier', 'createdBy', 'items.prItem'])),
        ]);
    }
    /**
     * List Purchase Orders pending the Actual PO issuance after GRN approval.
     * These are POs in PENDING_ACTUAL_PO status waiting for procurement to finalise.
     */
    public function indexPendingActualPos(Request $request): AnonymousResourceCollection
    {
        $perPage = min(max((int) $request->query('per_page', 15), 1), 100);
        $search  = trim((string) $request->query('search', ''));

        $query = PurchaseOrder::with([
            'purchaseRequest.requester',
            'purchaseRequest.department',
            'purchaseRequest.assignedReviewer',
            'supplier',
            'createdBy',
            'items.item',
            'receipts.items.purchaseOrderItem',
            'receipts.warehouseKeeper',
            'receipts.siteEngineer',
        ])
        ->where('status', 'PENDING_ACTUAL_PO')
        ->when($search !== '', function ($q) use ($search) {
            $term = '%' . mb_substr($search, 0, 100) . '%';
            $q->where(function ($sq) use ($term) {
                $sq->where('po_number', 'like', $term)
                   ->orWhereHas('supplier', fn ($s) => $s->where('company_name', 'like', $term))
                   ->orWhereHas('purchaseRequest', function ($prQ) use ($term) {
                       $prQ->where('request_number', 'like', $term)
                           ->orWhereHas('requester', fn ($u) => $u->where('name', 'like', $term))
                           ->orWhereHas('department', fn ($d) => $d->where('name', 'like', $term));
                   });
            });
        })
        ->orderBy('updated_at', 'desc');

        return PurchaseOrderResource::collection($query->paginate($perPage)->withQueryString());
    }

    /**
     * Finalise the Actual Purchase Order after GRN approval.
     * Procurement provides the definitive item list (full sync: update/delete/add).
     * After finalisation the PO moves to ISSUED and accounting is notified.
     */
    public function finalizeActualPo(Request $request, string|int $id): JsonResponse
    {
        $validated = $request->validate([
            'items'        => ['required', 'array', 'min:1'],
            'items.*.id'   => ['nullable', 'integer'],
            'items.*.item_id' => ['nullable', 'integer', 'exists:items,id'],
            'items.*.pr_item_id' => ['nullable', 'integer', 'exists:purchase_request_items,id'],
            'items.*.item_description' => ['required', 'string', 'max:500'],
            'items.*.item_reference'   => ['required', 'string', 'max:100'],
            'items.*.region'           => ['required', 'string', 'max:150'],
            'items.*.quantity'         => ['required', 'numeric', 'gt:0'],
            'items.*.uom'              => ['nullable', 'string', 'max:20'],
            'items.*.unit_price'       => ['required', 'numeric', 'gte:0'],
            'items.*.specifications'   => ['nullable', 'string'],
            'items.*.supplier_id'      => ['nullable', 'integer', 'exists:suppliers,id'],
            'notes'                    => ['nullable', 'string', 'max:3000'],
        ]);

        $po = PurchaseOrder::with([
            'purchaseRequest.requester',
            'purchaseRequest.department',
            'supplier',
            'createdBy',
            'items',
            'receipts',
        ])->findOrFail((int) $id);

        if ($po->status !== 'PENDING_ACTUAL_PO') {
            return response()->json([
                'message' => 'لا يمكن إصدار أمر الشراء الفعلي لأمر شراء ليس في مرحلة بانتظار الإصدار الفعلي.',
            ], 409);
        }

        try {
            $finalizedPo = $this->poService->finalizeActualPo(
                $request->user(),
                $po,
                $validated['items'],
                $validated['notes'] ?? null
            );
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 409);
        }

        return response()->json([
            'message' => 'تم إصدار أمر الشراء الفعلي بنجاح وإرساله للحسابات.',
            'data'    => new PurchaseOrderResource($finalizedPo),
        ]);
    }
}
