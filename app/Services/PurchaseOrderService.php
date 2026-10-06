<?php

namespace App\Services;

use App\Models\ApprovalHistory;
use App\Models\AuditLog;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\PurchaseRequest;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class PurchaseOrderService
{
    /**
     * Generate sequential unique Purchase Order number (PO-YYYY-XXXXX).
     * Extracts the highest registered number for the given year,
     * and increments by 1 (MAX + 1) to eliminate duplicate collisions.
     */
    public function generatePoNumber(): string
    {
        $year = date('Y');
        $prefix = "PO-{$year}-";
        $prefixLen = strlen($prefix);

        // 1. Database-level aggregation
        $dbMax = null;
        try {
            $record = PurchaseOrder::withTrashed()
                ->where('po_number', 'like', $prefix . '%')
                ->selectRaw("MAX(CAST(SUBSTRING(po_number, " . ($prefixLen + 1) . ") AS UNSIGNED)) as max_seq")
                ->first();

            if ($record && isset($record->max_seq) && is_numeric($record->max_seq)) {
                $dbMax = (int) $record->max_seq;
            }
        } catch (\Throwable $e) {
            Log::warning('PurchaseOrderService: SQL MAX calculation error: ' . $e->getMessage());
        }

        // 2. Scan recent records
        $scannedMax = 0;
        try {
            $sampleNumbers = PurchaseOrder::withTrashed()
                ->where('po_number', 'like', $prefix . '%')
                ->orderByDesc('id')
                ->limit(100)
                ->pluck('po_number');

            foreach ($sampleNumbers as $nr) {
                if (preg_match('/^PO-' . $year . '-(\d+)/i', $nr, $matches)) {
                    $val = (int) $matches[1];
                    if ($val > $scannedMax) {
                        $scannedMax = $val;
                    }
                }
            }

            $alphaNumbers = PurchaseOrder::withTrashed()
                ->where('po_number', 'like', $prefix . '%')
                ->orderByDesc('po_number')
                ->limit(20)
                ->pluck('po_number');

            foreach ($alphaNumbers as $nr) {
                if (preg_match('/^PO-' . $year . '-(\d+)/i', $nr, $matches)) {
                    $val = (int) $matches[1];
                    if ($val > $scannedMax) {
                        $scannedMax = $val;
                    }
                }
            }
        } catch (\Throwable $e) {
            // Ignore
        }

        $highestSeq = max((int) $dbMax, $scannedMax);
        $nextSeq = $highestSeq + 1;

        while (PurchaseOrder::withTrashed()->where('po_number', sprintf('PO-%s-%05d', $year, $nextSeq))->exists()) {
            $nextSeq++;
        }

        return sprintf('PO-%s-%05d', $year, $nextSeq);
    }

    /**
     * Recalculate PO grand total: grand_total = SUM(quantity × unit_price).
     *
     */
    public function recalculateTotals(PurchaseOrder $po): void
    {
        $items = $po->items;

        $grandTotal = 0.00;
        foreach ($items as $item) {
            $grandTotal += round((float) $item->quantity * (float) $item->unit_price, 2);
        }
        $grandTotal = round($grandTotal, 2);

        $po->update([
            'subtotal'        => $grandTotal,  // subtotal = grand_total (no deductions)
            'grand_total'     => $grandTotal,
        ]);
    }

    /**
     * List approved PRs eligible for PO creation.
     */
    public function getApprovedPurchaseRequests(): Collection
    {
        return PurchaseRequest::with(['requester', 'department', 'assignedReviewer', 'approvalHistory.actor', 'items.item', 'items.supplier'])
            ->where('status', 'APPROVED_BY_PROCUREMENT')
            ->orderBy('updated_at', 'desc')
            ->limit(500)
            ->get();
    }

    /**
     * List active suppliers for procurement.
     */
    public function getActiveSuppliers(): Collection
    {
        return Supplier::where('is_active', true)
            ->orderBy('company_name', 'asc')
            ->limit(500)
            ->get();
    }

    /**
     * Create a new draft Purchase Order from an approved Purchase Request.
     */
    public function createPoFromPr(User $user, int $prId, int $supplierId, array $options = []): PurchaseOrder
    {
        $pr = PurchaseRequest::with(['items', 'selectedQuote.supplier'])->findOrFail($prId);

        $isDirectPath = $pr->procurement_route === 'DIRECT';
        $canCreateFromDirectAccountingApproval = $isDirectPath && in_array($pr->status, ['APPROVED_BY_ACCOUNTING', 'APPROVED_BY_PROCUREMENT', 'APPROVED_BY_EXECUTIVE', 'PENDING_PROCUREMENT_APPROVAL'], true);
        $canCreateFromQuoteDecision = ! $isDirectPath && in_array($pr->status, ['APPROVED_BY_PROCUREMENT', 'APPROVED_BY_ACCOUNTING', 'APPROVED_BY_EXECUTIVE', 'PENDING_PROCUREMENT_APPROVAL'], true);

        if (! $canCreateFromDirectAccountingApproval && ! $canCreateFromQuoteDecision) {
            throw new \RuntimeException('لا يمكن إنشاء أمر الشراء قبل اعتماد الحسابات للطلب المباشر أو اكتمال قرار عروض الأسعار.');
        }

        $selectedQuote = $pr->selectedQuote;
        if ($selectedQuote && (int) $selectedQuote->supplier_id !== (int) $supplierId) {
            throw new \RuntimeException('لا يمكن تغيير مورد العرض الذي اختاره المدير التنفيذي.');
        }

        if ($selectedQuote) {
            $supplierId = (int) $selectedQuote->supplier_id;
        } elseif ($isDirectPath && empty($supplierId)) {
            $firstItemSupplier = $pr->items->firstWhere('supplier_id', '!=', null)?->supplier_id;
            $supplierId = (int) ($firstItemSupplier ?? $pr->direct_supplier_id ?? 0);
        }

        $supplier = $supplierId ? Supplier::find($supplierId) : null;
        if ($supplier && ! $supplier->is_active) {
            throw ValidationException::withMessages([
                'supplier_id' => ['The selected supplier is inactive.'],
            ]);
        }

        return DB::transaction(function () use ($user, $pr, $supplier, $options, $selectedQuote, $isDirectPath) {
            $sourceState = $pr->status;
            // Lock PR row to prevent race condition during concurrent PO creation
            $lockedPr = PurchaseRequest::where('id', $pr->id)->lockForUpdate()->first();

            $allowedStatuses = ['APPROVED_BY_ACCOUNTING', 'APPROVED_BY_PROCUREMENT', 'APPROVED_BY_EXECUTIVE', 'PENDING_PROCUREMENT_APPROVAL'];
            if (! in_array($lockedPr->status, $allowedStatuses, true)) {
                throw new \RuntimeException('تغيرت حالة طلب الشراء أثناء الإنشاء. أعد تحميل الطلب وحاول مرة أخرى.');
            }

            // Check if unified PO already exists for this PR
            $existingPoQuery = PurchaseOrder::where('purchase_request_id', $pr->id)
                ->whereNotIn('status', ['REJECTED']);

            $existingPo = $existingPoQuery->first();

            $manualPoNumber = !empty($options['manual_po_number']) ? trim((string) $options['manual_po_number']) : null;
            $manualPrNumber = !empty($options['manual_pr_number']) ? trim((string) $options['manual_pr_number']) : null;

            if ($manualPrNumber) {
                $pr->update(['manual_request_number' => $manualPrNumber]);
            }

            if ($existingPo) {
                if (in_array($existingPo->status, ['PO_DRAFT', 'RETURNED_TO_PROCUREMENT'], true)) {
                    $existingPo->update([
                        'manual_po_number' => $manualPoNumber ?? $existingPo->manual_po_number,
                        'manual_pr_number' => $manualPrNumber ?? $existingPo->manual_pr_number,
                        'supplier_id' => $supplier?->id ?? $existingPo->supplier_id,
                        'payment_terms' => $options['payment_terms'] ?? $existingPo->payment_terms,
                        'delivery_terms' => $options['delivery_terms'] ?? $existingPo->delivery_terms,
                        'delivery_date' => !empty($options['delivery_date']) ? $options['delivery_date'] : ($existingPo->delivery_date ?? now()->toDateString()),
                        'budget_code' => $options['budget_code'] ?? $existingPo->budget_code,
                        'notes' => $options['notes'] ?? $existingPo->notes,
                    ]);
                    return $existingPo;
                }
                if ($existingPo->status === 'PENDING_ACCOUNTING_REVIEW') {
                    return $existingPo;
                }
                throw new \RuntimeException('يوجد أمر شراء مصدر بالفعل لهذا الطلب (' . $existingPo->po_number . ').');
            }

            $poNumber = $this->generatePoNumber();

            $po = PurchaseOrder::create([
                'po_number' => $poNumber,
                'manual_po_number' => $manualPoNumber,
                'purchase_request_id' => $pr->id,
                'manual_pr_number' => $manualPrNumber,
                'selected_quote_id' => $selectedQuote?->id,
                'supplier_id' => $supplier?->id,
                'created_by_user_id' => $user->id,
                'status' => 'PO_DRAFT',
                'payment_terms' => $options['payment_terms'] ?? null,
                'delivery_terms' => $options['delivery_terms'] ?? null,
                'delivery_date' => !empty($options['delivery_date']) ? $options['delivery_date'] : now()->toDateString(),
                'budget_code' => $options['budget_code'] ?? null,
                'notes' => $options['notes'] ?? null,
            ]);

            // Copy or map PR items to PO items
            $itemsInput = $options['items'] ?? null;

            if (! empty($itemsInput)) {
                foreach ($itemsInput as $inputIndex => $input) {
                    $prItemId = $input['pr_item_id'] ?? null;
                    $prItem = $prItemId ? $pr->items->firstWhere('id', $prItemId) : null;
                    [$itemReference, $region] = $this->requireReferenceFields(
                        $prItem?->item_reference,
                        $prItem?->region,
                        "items.{$inputIndex}"
                    );

                    $qty       = isset($input['quantity'])   ? (float) $input['quantity']   : ($prItem ? (float) $prItem->quantity : 1.0);
                    $uom       = $input['uom'] ?? $prItem?->uom ?? 'PCS';
                    $specs     = $input['specifications'] ?? $prItem?->specifications;

                    [$qty, $uom, $specs] = $this->normalizePoItemUnitAndQuantity($qty, $uom, $specs);

                    // Procurement sets the commercial unit price. PR estimated price is ignored.
                    $unitPrice = $selectedQuote
                        ? (float) $selectedQuote->unit_price
                        : (isset($input['unit_price']) ? (float) $input['unit_price'] : 0.0);
                    $lineTotal = round($qty * $unitPrice, 2);
                    $itemSupplierId = $input['supplier_id'] ?? $prItem?->supplier_id ?? $supplier?->id;

                    $poItem = $po->items()->create([
                        'pr_item_id'      => $prItem?->id,
                        'item_id'         => $input['item_id'] ?? $prItem?->item_id,
                        'item_description'=> $input['item_description'] ?? $prItem?->item_description ?? '',
                        'item_reference'  => $itemReference,
                        'region'          => $region,
                        'quantity'        => $qty,
                        'uom'             => $uom,
                        'unit_price'      => $unitPrice,
                        'line_total'      => $lineTotal,
                        'specifications'  => $specs,
                        'supplier_id'     => $itemSupplierId,
                    ]);

                    if ($prItem && (float) $prItem->quantity !== $qty && $uom !== 'TON') {
                        AuditLog::create([
                            'user_id'     => $user->id,
                            'entity_type' => PurchaseOrderItem::class,
                            'entity_id'   => $poItem->id,
                            'action'      => 'QUANTITY_CHANGED',
                            'field_name'  => 'quantity',
                            'old_value'   => (string) $prItem->quantity,
                            'new_value'   => (string) $qty,
                        ]);
                    }
                }
            } else {
                // When no items array supplied: copy PR items.
                // Keep all items together in the unified purchase order.
                $prItems = $pr->items;
                foreach ($prItems as $prItem) {
                    [$itemReference, $region] = $this->requireReferenceFields(
                        $prItem->item_reference,
                        $prItem->region,
                        "pr_item.{$prItem->id}"
                    );
                    $qty = (float) $prItem->quantity;
                    $uom = $prItem->uom;
                    $specs = $prItem->specifications;
                    [$qty, $uom, $specs] = $this->normalizePoItemUnitAndQuantity($qty, $uom, $specs);

                    $unitPrice = $isDirectPath
                        ? (float) ($prItem->estimated_unit_price ?? 0.00)
                        : (float) ($selectedQuote?->unit_price ?? 0.00);

                    $po->items()->create([
                        'pr_item_id'      => $prItem->id,
                        'item_id'         => $prItem->item_id,
                        'item_description'=> $prItem->item_description,
                        'item_reference'  => $itemReference,
                        'region'          => $region,
                        'quantity'        => $qty,
                        'uom'             => $uom,
                        'unit_price'      => $unitPrice,
                        'line_total'      => round($qty * $unitPrice, 2),
                        'specifications'  => $specs,
                        'supplier_id'     => $prItem->supplier_id ?? $supplier?->id,
                    ]);
                }
            }

            $this->recalculateTotals($po);



            app(\App\Services\NotificationService::class)->markEntityNotificationsAsRead($pr);

            ApprovalHistory::create([
                'target_type' => PurchaseOrder::class,
                'target_id' => $po->id,
                'actor_user_id' => $user->id,
                'action' => 'PO_CREATED',
                'from_state' => $sourceState,
                'to_state' => 'PO_DRAFT',
                'comments' => 'Purchase order created by procurement manager.',
            ]);

            app(SystemEventService::class)->recordAction(
                $po,
                'PO_CREATED',
                'أنشأ مدير المشتريات أمر شراء من طلب معتمد.',
                ['event_type' => 'purchase_order.created', 'from_state' => $sourceState, 'to_state' => 'PO_DRAFT', 'actor_user_id' => $user->id, 'metadata' => ['supplier_id' => $supplier?->id, 'selected_quote_id' => $selectedQuote?->id]]
            );


            AuditLog::create([
                'user_id' => $user->id,
                'entity_type' => PurchaseOrder::class,
                'entity_id' => $po->id,
                'action' => 'CREATED',
                'field_name' => 'po_number',
                'old_value' => null,
                'new_value' => $po->po_number,
            ]);

            return $po->fresh(['purchaseRequest.requester', 'purchaseRequest.department', 'purchaseRequest.assignedReviewer', 'purchaseRequest.approvalHistory.actor', 'selectedQuote', 'supplier', 'createdBy', 'items.item']);
        });
    }

    /**
     * Update draft Purchase Order header details.
     */
    public function updateHeader(User $user, PurchaseOrder $po, array $data): PurchaseOrder
    {
        if (! in_array($po->status, ['PO_DRAFT', 'RETURNED_TO_PROCUREMENT', 'PENDING_ACTUAL_PO', 'ISSUED', 'PENDING_ACCOUNTING_REVIEW', 'APPROVED_BY_ACCOUNTING'], true)) {
            throw new \RuntimeException('لا يمكن تعديل أمر شراء بهذه الحالة.');
        }

        return DB::transaction(function () use ($user, $po, $data) {
            $lockedPo = PurchaseOrder::where('id', $po->id)->lockForUpdate()->first();

            $allowedFields = ['supplier_id', 'payment_terms', 'delivery_terms', 'delivery_date', 'budget_code', 'financial_notes', 'notes', 'finalization_notes'];
            $updateFields = [];

            foreach ($allowedFields as $field) {
                if (array_key_exists($field, $data)) {
                    $oldVal = (string) ($lockedPo->{$field} ?? '');
                    $newVal = (string) ($data[$field] ?? '');

                    if ($oldVal !== $newVal) {
                        $updateFields[$field] = $data[$field];

                        AuditLog::create([
                            'user_id' => $user->id,
                            'entity_type' => PurchaseOrder::class,
                            'entity_id' => $lockedPo->id,
                            'action' => 'PO_HEADER_UPDATED',
                            'field_name' => $field,
                            'old_value' => $oldVal,
                            'new_value' => $newVal,
                        ]);
                    }
                }
            }

            if (! empty($updateFields)) {
                $lockedPo->update($updateFields);
            }

            if (! empty($data['items']) && is_array($data['items'])) {
                $this->syncPoItems($user, $lockedPo, $data['items']);
            }

            return $lockedPo->fresh(['purchaseRequest.requester', 'purchaseRequest.department', 'purchaseRequest.assignedReviewer', 'purchaseRequest.approvalHistory.actor', 'selectedQuote', 'supplier', 'createdBy', 'items.item']);
        });
    }

    /**
     * Update commercial line item details on a PO.
     */
    public function updateItem(User $user, PurchaseOrder $po, PurchaseOrderItem $item, array $data): PurchaseOrder
    {
        if (! in_array($po->status, ['PO_DRAFT', 'RETURNED_TO_PROCUREMENT', 'PENDING_ACTUAL_PO', 'ISSUED', 'PENDING_ACCOUNTING_REVIEW', 'APPROVED_BY_ACCOUNTING'], true)) {
            throw new \RuntimeException('لا يمكن تعديل أمر شراء بهذه الحالة.');
        }

        if ($item->purchase_order_id !== $po->id) {
            throw new \InvalidArgumentException('Item does not belong to this purchase order.');
        }

        return DB::transaction(function () use ($user, $po, $item, $data) {
            $lockedPo = PurchaseOrder::where('id', $po->id)->lockForUpdate()->first();
            $lockedItem = PurchaseOrderItem::where('id', $item->id)->lockForUpdate()->first();

            $newQty       = array_key_exists('quantity',   $data) ? (float) $data['quantity']   : (float) $lockedItem->quantity;
            $newUnitPrice = array_key_exists('unit_price', $data) ? (float) $data['unit_price'] : (float) $lockedItem->unit_price;
            $newLineTotal = round($newQty * $newUnitPrice, 2);
            [$itemReference, $region] = $this->requireReferenceFields(
                array_key_exists('item_reference', $data) ? $data['item_reference'] : $lockedItem->item_reference,
                array_key_exists('region', $data) ? $data['region'] : $lockedItem->region,
                'item'
            );

            $updatePayload = [
                'item_id'         => $data['item_id'] ?? $lockedItem->item_id,
                'item_description'=> $data['item_description'] ?? $lockedItem->item_description,
                'item_reference'  => $itemReference,
                'region'          => $region,
                'quantity'        => $newQty,
                'uom'             => $data['uom'] ?? $lockedItem->uom,
                'unit_price'      => $newUnitPrice,
                'line_total'      => $newLineTotal,
                'specifications'  => array_key_exists('specifications', $data) ? $data['specifications'] : $lockedItem->specifications,
            ];

            foreach ($updatePayload as $field => $newVal) {
                $oldVal = (string) ($lockedItem->{$field} ?? '');
                $strNewVal = (string) ($newVal ?? '');

                if ($oldVal !== $strNewVal) {
                    AuditLog::create([
                        'user_id' => $user->id,
                        'entity_type' => PurchaseOrderItem::class,
                        'entity_id' => $lockedItem->id,
                        'action' => 'PO_ITEM_UPDATED',
                        'field_name' => $field,
                        'old_value' => $oldVal,
                        'new_value' => $strNewVal,
                    ]);
                }
            }

            $lockedItem->update($updatePayload);

            $this->recalculateTotals($lockedPo);

            return $lockedPo->fresh(['purchaseRequest.requester', 'purchaseRequest.department', 'purchaseRequest.assignedReviewer', 'purchaseRequest.approvalHistory.actor', 'selectedQuote', 'supplier', 'createdBy', 'items.item']);
        });
    }

    /**
     * Add line item to a PO.
     */
    public function addItem(User $user, PurchaseOrder $po, array $data): PurchaseOrder
    {
        if (! in_array($po->status, ['PO_DRAFT', 'RETURNED_TO_PROCUREMENT', 'PENDING_ACTUAL_PO', 'ISSUED', 'PENDING_ACCOUNTING_REVIEW', 'APPROVED_BY_ACCOUNTING'], true)) {
            throw new \RuntimeException('لا يمكن تعديل أمر شراء بهذه الحالة.');
        }

        return DB::transaction(function () use ($user, $po, $data) {
            $lockedPo = PurchaseOrder::where('id', $po->id)->lockForUpdate()->first();

            $qty       = (float) $data['quantity'];
            $unitPrice = (float) $data['unit_price'];
            $lineTotal = round($qty * $unitPrice, 2);
            [$itemReference, $region] = $this->requireReferenceFields(
                $data['item_reference'] ?? null,
                $data['region'] ?? null,
                'item'
            );

            $newItem = $lockedPo->items()->create([
                'item_id'         => $data['item_id'] ?? null,
                'item_description'=> $data['item_description'],
                'item_reference'  => $itemReference,
                'region'          => $region,
                'quantity'        => $qty,
                'uom'             => $data['uom'] ?? 'PCS',
                'unit_price'      => $unitPrice,
                'line_total'      => $lineTotal,
                'specifications'  => $data['specifications'] ?? null,
            ]);

            AuditLog::create([
                'user_id' => $user->id,
                'entity_type' => PurchaseOrderItem::class,
                'entity_id' => $newItem->id,
                'action' => 'PO_ITEM_ADDED',
                'field_name' => 'item_description',
                'old_value' => null,
                'new_value' => $newItem->item_description,
            ]);

            $this->recalculateTotals($lockedPo);

            return $lockedPo->fresh(['purchaseRequest.requester', 'purchaseRequest.department', 'purchaseRequest.assignedReviewer', 'purchaseRequest.approvalHistory.actor', 'selectedQuote', 'supplier', 'createdBy', 'items.item']);
        });
    }

    /**
     * Delete line item from a PO.
     */
    public function deleteItem(User $user, PurchaseOrder $po, PurchaseOrderItem $item): PurchaseOrder
    {
        if (! in_array($po->status, ['PO_DRAFT', 'RETURNED_TO_PROCUREMENT', 'PENDING_ACTUAL_PO', 'ISSUED', 'PENDING_ACCOUNTING_REVIEW', 'APPROVED_BY_ACCOUNTING'], true)) {
            throw new \RuntimeException('لا يمكن تعديل أمر شراء بهذه الحالة.');
        }

        if ($item->purchase_order_id !== $po->id) {
            throw new \InvalidArgumentException('Item does not belong to this purchase order.');
        }

        return DB::transaction(function () use ($user, $po, $item) {
            $lockedPo = PurchaseOrder::where('id', $po->id)->lockForUpdate()->first();

            AuditLog::create([
                'user_id' => $user->id,
                'entity_type' => PurchaseOrderItem::class,
                'entity_id' => $item->id,
                'action' => 'PO_ITEM_REMOVED',
                'field_name' => 'item_description',
                'old_value' => $item->item_description,
                'new_value' => null,
            ]);

            $item->delete();

            $this->recalculateTotals($lockedPo);

            return $lockedPo->fresh(['purchaseRequest.requester', 'purchaseRequest.department', 'purchaseRequest.assignedReviewer', 'purchaseRequest.approvalHistory.actor', 'selectedQuote', 'supplier', 'createdBy', 'items.item']);
        });
    }

    /**
     * Synchronize line items of a Purchase Order with an incoming items array.
     * Deletes removed items, updates existing items, creates new items, and recalculates totals.
     */
    public function syncPoItems(User $user, PurchaseOrder $lockedPo, array $items): float
    {
        $existingItems = $lockedPo->items()->get()->keyBy('id');
        $incomingIds   = collect($items)->pluck('id')->filter()->map(fn ($v) => (int) $v);

        // Delete items that were removed
        foreach ($existingItems as $existingId => $existingItem) {
            if (! $incomingIds->contains($existingId)) {
                AuditLog::create([
                    'user_id'     => $user->id,
                    'entity_type' => PurchaseOrderItem::class,
                    'entity_id'   => $existingItem->id,
                    'action'      => 'PO_ITEM_REMOVED',
                    'field_name'  => 'item_description',
                    'old_value'   => $existingItem->item_description,
                    'new_value'   => null,
                ]);
                $existingItem->delete();
            }
        }

        $grandTotal = 0.0;

        foreach ($items as $input) {
            $qty       = max(0.001, (float) ($input['quantity'] ?? 0));
            $unitPrice = max(0.0,  (float) ($input['unit_price'] ?? 0));
            $lineTotal = round($qty * $unitPrice, 2);
            $grandTotal += $lineTotal;

            $existingItemId = !empty($input['id']) ? (int) $input['id'] : null;
            $existingItem   = ($existingItemId && $existingItems->has($existingItemId)) ? $existingItems->get($existingItemId) : null;

            $rawRef = !empty($input['item_reference']) ? $input['item_reference'] : ($existingItem?->item_reference ?? 'عام');
            $rawReg = !empty($input['region']) ? $input['region'] : ($existingItem?->region ?? 'عام');

            [$itemReference, $region] = $this->requireReferenceFields(
                $rawRef,
                $rawReg,
                'item'
            );

            if ($existingItem) {
                // Update existing item
                $existingItem->update([
                    'item_description' => $input['item_description'] ?? $existingItem->item_description,
                    'item_reference'   => $itemReference,
                    'region'           => $region,
                    'quantity'         => $qty,
                    'uom'              => $input['uom'] ?? $existingItem->uom,
                    'unit_price'       => $unitPrice,
                    'line_total'       => $lineTotal,
                    'specifications'   => array_key_exists('specifications', $input) ? $input['specifications'] : $existingItem->specifications,
                ]);

                AuditLog::create([
                    'user_id'     => $user->id,
                    'entity_type' => PurchaseOrderItem::class,
                    'entity_id'   => $existingItem->id,
                    'action'      => 'PO_ITEM_UPDATED',
                    'field_name'  => 'line_total',
                    'old_value'   => (string) $existingItem->getOriginal('line_total'),
                    'new_value'   => (string) $lineTotal,
                ]);
            } else {
                // Create new item added by procurement
                $newItem = $lockedPo->items()->create([
                    'item_id'          => $input['item_id'] ?? null,
                    'pr_item_id'       => $input['pr_item_id'] ?? null,
                    'item_description' => $input['item_description'] ?? 'بند جديد',
                    'item_reference'   => $itemReference,
                    'region'           => $region,
                    'quantity'         => $qty,
                    'uom'              => $input['uom'] ?? 'PCS',
                    'unit_price'       => $unitPrice,
                    'line_total'       => $lineTotal,
                    'specifications'   => $input['specifications'] ?? null,
                    'supplier_id'      => $input['supplier_id'] ?? $lockedPo->supplier_id ?? null,
                ]);

                AuditLog::create([
                    'user_id'     => $user->id,
                    'entity_type' => PurchaseOrderItem::class,
                    'entity_id'   => $newItem->id,
                    'action'      => 'PO_ITEM_ADDED',
                    'field_name'  => 'item_description',
                    'old_value'   => null,
                    'new_value'   => $newItem->item_description,
                ]);
            }
        }

        $this->recalculateTotals($lockedPo);

        return round($grandTotal, 2);
    }

    /**
     * Finalise the Actual Purchase Order after GRN approval.
     *
     * Procurement provides the definitive set of line items (reflecting what was
     * actually delivered / accepted). All existing items are replaced via a full
     * sync: items omitted from $items are deleted, existing items are updated,
     * and new items (no 'id') are inserted.
     *
     * After finalisation the PO transitions:
     *   PENDING_ACTUAL_PO → ISSUED   (then accounting sees it via ISSUED status)
     *
     * The GRN received_quantity values are passed through from the UI as a display
     * hint only (stored in notes if they differ) — they do NOT overwrite anything.
     */
    public function finalizeActualPo(
        User $user,
        PurchaseOrder $po,
        array $items,
        ?string $notes = null
    ): PurchaseOrder {
        if ($po->status !== 'PENDING_ACTUAL_PO') {
            throw new \RuntimeException('لا يمكن إصدار أمر الشراء الفعلي إلا بعد اعتماد إذن الاستلام وانتقال الملف لمرحلة بانتظار الإصدار الفعلي.');
        }

        if (empty($items)) {
            throw ValidationException::withMessages([
                'items' => ['يجب توفير بند واحد على الأقل في أمر الشراء الفعلي.'],
            ]);
        }

        return DB::transaction(function () use ($user, $po, $items, $notes) {
            $lockedPo = PurchaseOrder::where('id', $po->id)->lockForUpdate()->firstOrFail();

            if ($lockedPo->status !== 'PENDING_ACTUAL_PO') {
                throw new \RuntimeException('تغيرت حالة أمر الشراء أثناء المعالجة. أعد المحاولة.');
            }

            // ── Full items sync ──────────────────────────────────────────────────
            $grandTotal = $this->syncPoItems($user, $lockedPo, $items);

            // Update PO totals and transition to ISSUED so accounting can see it
            $lockedPo->update([
                'status'               => 'ISSUED',
                'subtotal'             => round($grandTotal, 2),
                'grand_total'          => round($grandTotal, 2),
                'finalized_by_user_id' => $user->id,
                'finalized_at'         => now(),
                'finalization_notes'   => $notes,
            ]);

            // Synchronize approved receipt items so that receipt matches the finalized Actual PO definitively
            $approvedReceipts = $lockedPo->receipts()->where('status', 'APPROVED')->get();
            if ($approvedReceipts->isNotEmpty()) {
                $poItems = $lockedPo->items()->get();
                $poItemIds = $poItems->pluck('id')->all();

                foreach ($approvedReceipts as $receipt) {
                    $receipt->items()->whereNotIn('purchase_order_item_id', $poItemIds)->delete();

                    foreach ($poItems as $poItem) {
                        $receiptItem = $receipt->items()->where('purchase_order_item_id', $poItem->id)->first();
                        if ($receiptItem) {
                            $receiptItem->update([
                                'ordered_quantity' => $poItem->quantity,
                                'received_quantity' => $poItem->quantity,
                            ]);
                        } else {
                            $receipt->items()->create([
                                'purchase_order_item_id' => $poItem->id,
                                'ordered_quantity' => $poItem->quantity,
                                'received_quantity' => $poItem->quantity,
                                'notes' => 'تم اعتماده في أمر الشراء الفعلي',
                            ]);
                        }
                    }
                }
            }

            ApprovalHistory::create([
                'target_type' => PurchaseOrder::class,
                'target_id'   => $lockedPo->id,
                'actor_user_id' => $user->id,
                'action'      => 'ACTUAL_PO_FINALIZED',
                'from_state'  => 'PENDING_ACTUAL_PO',
                'to_state'    => 'ISSUED',
                'comments'    => $notes ?? 'أصدر مدير المشتريات أمر الشراء الفعلي بعد اعتماد إذن الاستلام وأرسله للحسابات.',
            ]);

            if ($lockedPo->purchaseRequest) {
                $pr = $lockedPo->purchaseRequest;
                $prFromState = $pr->status;
                $pr->update(['status' => 'ISSUED']);

                ApprovalHistory::create([
                    'target_type' => PurchaseRequest::class,
                    'target_id'   => $pr->id,
                    'actor_user_id' => $user->id,
                    'action'      => 'ACTUAL_PO_ISSUED',
                    'from_state'  => $prFromState,
                    'to_state'    => 'ISSUED',
                    'comments'    => 'تم إصدار وتثبيت أمر الشراء الفعلي رقم ' . $lockedPo->po_number,
                ]);
            }

            AuditLog::create([
                'user_id'     => $user->id,
                'entity_type' => PurchaseOrder::class,
                'entity_id'   => $lockedPo->id,
                'action'      => 'ACTUAL_PO_FINALIZED',
                'field_name'  => 'status',
                'old_value'   => 'PENDING_ACTUAL_PO',
                'new_value'   => 'ISSUED',
            ]);

            // Notify accountants about the finalised PO
            $notificationService = app(NotificationService::class);
            $accountants = $notificationService->resolveUsersWithPermission('purchase_order.view_accounting');

            $lockedPo->loadMissing('purchaseRequest.department');
            $deptCode = $lockedPo->purchaseRequest?->department?->code;
            $deptAccountants = collect();
            if ($deptCode) {
                foreach (SupplierInvoiceService::ACCOUNTANT_DEPARTMENT_MAPPINGS as $roleSlug => $deptCodes) {
                    if (in_array($deptCode, $deptCodes, true)) {
                        $deptAccountants = User::whereHas('roles', fn ($q) => $q->where('slug', $roleSlug))
                            ->where('is_active', true)
                            ->get();
                        break;
                    }
                }
            }

            $targetAccountants = $deptAccountants->isNotEmpty() ? $deptAccountants : $accountants;

            if ($targetAccountants->isNotEmpty()) {
                $receipt = $lockedPo->receipts()->where('status', 'APPROVED')->latest()->first();
                if ($receipt) {
                    $notificationService->queueAccountingWithPurchaseOrderAndReceipt(
                        $targetAccountants,
                        $lockedPo,
                        $receipt
                    );
                } else {
                    $notificationService->queueUsers(
                        $targetAccountants,
                        'purchase_order_actual_issued_accounting',
                        'أمر شراء فعلي جاهز للمراجعة المحاسبية',
                        "تم إصدار أمر الشراء الفعلي {$lockedPo->po_number} بعد اعتماد إذن الاستلام وهو جاهز للمراجعة المحاسبية.",
                        $lockedPo
                    );
                }
            }

            app(NotificationService::class)->markEntityNotificationsAsRead($lockedPo, $user);

            return $lockedPo->fresh([
                'purchaseRequest.requester',
                'purchaseRequest.department',
                'purchaseRequest.assignedReviewer',
                'purchaseRequest.approvalHistory.actor',
                'supplier',
                'createdBy',
                'finalizedBy',
                'items.item',
                'items.supplier',
                'receipts.items.purchaseOrderItem',
                'receipts.warehouseKeeper',
                'receipts.siteEngineer',
                'receipts.receiver',
            ]);
        });
    }

    /**
     * Submit draft Purchase Order to Accounting for financial audit (PO_DRAFT -> PENDING_ACCOUNTING_REVIEW).
     */
    public function submitToAccounting(User $user, PurchaseOrder $po): PurchaseOrder
    {
        if ($po->status !== 'PO_DRAFT' && $po->status !== 'RETURNED_TO_PROCUREMENT') {
            throw new \RuntimeException('Only draft or returned purchase orders can be submitted.');
        }

        if ($po->items()->count() === 0) {
            throw ValidationException::withMessages([
                'items' => ['Cannot submit a purchase order with no line items.'],
            ]);
        }

        if (! $po->supplier || ! $po->supplier->is_active) {
            throw ValidationException::withMessages([
                'supplier_id' => ['Purchase order supplier is inactive or missing.'],
            ]);
        }

        return DB::transaction(function () use ($user, $po) {
            $lockedPo = PurchaseOrder::where('id', $po->id)->lockForUpdate()->firstOrFail();

            if ($lockedPo->status === 'ISSUED') {
                return $lockedPo->fresh(['purchaseRequest.requester', 'purchaseRequest.department', 'purchaseRequest.assignedReviewer', 'purchaseRequest.approvalHistory.actor', 'selectedQuote', 'supplier', 'createdBy', 'items.item']);
            }

            $fromState = $lockedPo->status;

            $this->recalculateTotals($lockedPo);

            $lockedPo->update([
                'status' => 'ISSUED',
            ]);

            ApprovalHistory::create([
                'target_type' => PurchaseOrder::class,
                'target_id' => $lockedPo->id,
                'actor_user_id' => $user->id,
                'action' => 'PO_ISSUED',
                'from_state' => $fromState,
                'to_state' => 'ISSUED',
                'comments' => 'Purchase order issued by procurement manager.',
            ]);

            if ($lockedPo->purchaseRequest) {
                $pr = $lockedPo->purchaseRequest;
                $prFromState = $pr->status;
                $pr->update(['status' => 'ISSUED']);

                ApprovalHistory::create([
                    'target_type' => PurchaseRequest::class,
                    'target_id'   => $pr->id,
                    'actor_user_id' => $user->id,
                    'action'      => 'PO_ISSUED',
                    'from_state'  => $prFromState,
                    'to_state'    => 'ISSUED',
                    'comments'    => 'تم إصدار أمر الشراء رقم ' . $lockedPo->po_number . ' للمورد.',
                ]);
            }

            app(SystemEventService::class)->recordAction(
                $lockedPo,
                'PO_ISSUED',
                'أصدر مدير المشتريات أمر الشراء وأرسله للاطلاع المالي والإداري.',
                ['event_type' => 'purchase_order.issued', 'from_state' => $fromState, 'to_state' => 'ISSUED', 'actor_user_id' => $user->id]
            );

            AuditLog::create([
                'user_id' => $user->id,
                'entity_type' => PurchaseOrder::class,
                'entity_id' => $lockedPo->id,
                'action' => 'PO_ISSUED',
                'field_name' => 'status',
                'old_value' => $fromState,
                'new_value' => 'ISSUED',
            ]);

            // Notify Accountants (Read-only access notification)
            $notificationService = app(\App\Services\NotificationService::class);
            $accountants = $notificationService->resolveUsersWithPermission('purchase_order.view_accounting');

            // Auto-resolve pending notifications on this PO and PR for the issuing procurement manager
            $notificationService->markEntityNotificationsAsRead($lockedPo, $user);
            if ($lockedPo->purchaseRequest) {
                $notificationService->markEntityNotificationsAsRead($lockedPo->purchaseRequest, $user);
            }

            $lockedPo->loadMissing('purchaseRequest.department');
            $deptCode = $lockedPo->purchaseRequest?->department?->code;
            $deptAccountants = collect();
            if ($deptCode) {
                foreach (\App\Services\SupplierInvoiceService::ACCOUNTANT_DEPARTMENT_MAPPINGS as $roleSlug => $deptCodes) {
                    if (in_array($deptCode, $deptCodes, true)) {
                        $deptAccountants = User::whereHas('roles', fn ($q) => $q->where('slug', $roleSlug))
                            ->where('is_active', true)
                            ->get();
                        break;
                    }
                }
            }

            // Exclude Financial Director (role 'accountant') - notify only scoped department accountant for awareness
            $targetAccountants = $deptAccountants->isNotEmpty()
                ? $deptAccountants
                : $accountants->reject(fn ($u) => $u->hasRole('accountant'));

            if ($targetAccountants->isNotEmpty()) {
                $notificationService->queueUsers(
                    $targetAccountants,
                    'purchase_order_issued_accounting',
                    'تم إصدار أمر شراء جديد',
                    "تم إصدار أمر الشراء {$lockedPo->po_number} للاطلاع المالي وتجهيز الفواتير.",
                    $lockedPo
                );
            }

            // Notify requester if the request was created by the General Manager or user
            if ($lockedPo->purchaseRequest && $lockedPo->purchaseRequest->user_id) {
                $notificationService->queueNotification(
                    $lockedPo->purchaseRequest->user_id,
                    'purchase_order_issued_requester',
                    'تم إصدار أمر الشراء لطلبك',
                    "تم إصدار أمر الشراء {$lockedPo->po_number} لطلب الشراء {$lockedPo->purchaseRequest->request_number}.",
                    $lockedPo
                );
            }

            // Notify Warehouse Keepers when a purchase order is issued and delivered to warehouse
            if ($lockedPo->requiresWarehouseReceipt()) {
                $warehouseKeepers = User::whereHas('roles', fn ($q) => $q->where('slug', 'warehouse_keeper'))
                    ->where('is_active', true)
                    ->get();
                if ($warehouseKeepers->isEmpty()) {
                    $warehouseKeepers = User::where('email', 'salam@gmail.com')->where('is_active', true)->get();
                }

                $notificationService->queueUsers(
                    $warehouseKeepers,
                    'purchase_order_ready_for_warehouse',
                    'أمر شراء بانتظار استلام المواد بالمخزن',
                    "تم إصدار أمر الشراء {$lockedPo->po_number} بانتظار استلام الأصناف وفحصها وإصدار إذن الاستلام.",
                    $lockedPo
                );
            } else {
                // If this purchase order bypasses the warehouse, route directly to site engineer
                if (! $lockedPo->purchaseRequest?->isOfficeRequest()) {
                    app(PurchaseReceiptService::class)->createDirectSiteReceiptForBuildings($lockedPo);
                }
            }

            return $lockedPo->fresh(['purchaseRequest.requester', 'purchaseRequest.department', 'purchaseRequest.assignedReviewer', 'purchaseRequest.approvalHistory.actor', 'selectedQuote', 'supplier', 'createdBy', 'items.item']);
        });
    }

    /**
     * Convert rebar parcel or bar units to tons for commercial Purchase Order pricing.
     */
    protected function normalizePoItemUnitAndQuantity(float $quantity, string $uom, ?string $specifications): array
    {
        $uomUpper = strtoupper(trim($uom));
        $cleanSpec = trim((string) ($specifications ?? ''));

        // Check if PARCEL (طرد حديد = 1.940 طن)
        if ($uomUpper === 'PARCEL' || mb_strpos($uomUpper, 'طرد') !== false || mb_strpos(mb_strtolower($uom), 'طرد') !== false) {
            $tons = round($quantity * 1.940, 3);
            $note = "(ما يعادل {$quantity} طرد حديد - زنة الطرد 1.940 طن)";
            if ($cleanSpec !== '' && mb_strpos($cleanSpec, 'ما يعادل') === false) {
                $cleanSpec .= ' - ' . $note;
            } elseif ($cleanSpec === '') {
                $cleanSpec = $note;
            }
            return [$tons, 'TON', $cleanSpec];
        }

        // Check rebar bars
        $barWeights = [
            'BAR_2_5LINIA' => 0.0047,
            'BAR_3LINIA'   => 0.0074,
            'BAR_4LINIA'   => 0.0104,
            'BAR_5LINIA'   => 0.0190,
        ];

        foreach ($barWeights as $code => $weight) {
            if ($uomUpper === $code) {
                $tons = round($quantity * $weight, 3);
                $note = "(ما يعادل {$quantity} سيخ حديد - زنة السيخ " . ($weight * 1000) . " كجم)";
                if ($cleanSpec !== '' && mb_strpos($cleanSpec, 'ما يعادل') === false) {
                    $cleanSpec .= ' - ' . $note;
                } elseif ($cleanSpec === '') {
                    $cleanSpec = $note;
                }
                return [$tons, 'TON', $cleanSpec];
            }
        }

        return [$quantity, $uom, $cleanSpec ?: null];
    }

    /**
     * Validate and normalize fields that are mandatory for financial traceability.
     */
    private function requireReferenceFields($itemReference, $region, string $key): array
    {
        $itemReference = trim((string) ($itemReference ?? ''));
        $region = trim((string) ($region ?? ''));
        $errors = [];

        if ($itemReference === '') {
            $errors["{$key}.item_reference"] = ['رقم قطعة الأرض مطلوب ولا يمكن أن يكون فارغًا.'];
        }
        if ($region === '') {
            $errors["{$key}.region"] = ['المنطقة مطلوبة ولا يمكن أن تكون فارغة.'];
        }

        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }

        return [$itemReference, $region];
    }
}
