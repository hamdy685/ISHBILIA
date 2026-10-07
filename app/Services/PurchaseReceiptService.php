<?php

namespace App\Services;

use App\Models\ApprovalHistory;
use App\Models\PurchaseOrder;
use App\Models\PurchaseReceipt;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PurchaseReceiptService
{
    /**
     * Generate unique sequential receipt number with year and prefix (e.g. GRN-2026-00001).
     */
    public function generateUniqueReceiptNumber(string $prefix = 'GRN-'): string
    {
        $year = date('Y');
        $fullPrefix = "{$prefix}{$year}-";

        $latestReceipt = DB::table('purchase_receipts')
            ->where('receipt_number', 'like', "{$fullPrefix}%")
            ->orderBy('id', 'desc')
            ->lockForUpdate()
            ->first();

        $nextNumber = 1;
        if ($latestReceipt) {
            $parts = explode('-', $latestReceipt->receipt_number);
            $lastSeq = end($parts);
            $nextNumber = intval($lastSeq) + 1;
        }

        $prefixLen = strlen($fullPrefix);
        try {
            $rawMax = DB::table('purchase_receipts')
                ->where('receipt_number', 'like', "{$fullPrefix}%")
                ->selectRaw("MAX(CAST(SUBSTRING(receipt_number, " . ($prefixLen + 1) . ") AS UNSIGNED)) as max_seq")
                ->value('max_seq');

            if ($rawMax && intval($rawMax) >= $nextNumber) {
                $nextNumber = intval($rawMax) + 1;
            }
        } catch (\Throwable $e) {
            try {
                $rawMaxSqlite = DB::table('purchase_receipts')
                    ->where('receipt_number', 'like', "{$fullPrefix}%")
                    ->selectRaw("MAX(CAST(substr(receipt_number, " . ($prefixLen + 1) . ") AS INTEGER)) as max_seq")
                    ->value('max_seq');
                if ($rawMaxSqlite && intval($rawMaxSqlite) >= $nextNumber) {
                    $nextNumber = intval($rawMaxSqlite) + 1;
                }
            } catch (\Throwable) {}
        }

        while (DB::table('purchase_receipts')->where('receipt_number', sprintf("%s%05d", $fullPrefix, $nextNumber))->exists()) {
            $nextNumber++;
        }

        return sprintf("%s%05d", $fullPrefix, $nextNumber);
    }
    public function warehouseQueue(int $perPage = 15)
    {
        return PurchaseOrder::with([
            'supplier',
            'purchaseRequest.requester',
            'purchaseRequest.department',
            'purchaseRequest.targetDepartment',
            'purchaseRequest.assignedReviewer.department',
            'purchaseRequest.siteEngineer',
            'purchaseRequest.supplements',
            'items.item',
            'items.prItem',
        ])
            ->where('status', 'ISSUED')
            ->whereDoesntHave('receipts', fn ($query) => $query->whereIn('status', ['PENDING_SITE_ENGINEER', 'APPROVED']))
            ->whereHas('purchaseRequest', function ($prQuery) {
                $prQuery->where('requires_warehouse_receipt', true)
                    ->where('request_type', '!=', 'OFFICE_SUPPLIES');
            })
            ->orderByDesc('updated_at')
            ->paginate($perPage);
    }

    public function receiptArchive(User $user, int $perPage = 25)
    {
        $query = PurchaseReceipt::with([
            'supplier',
            'purchaseOrder.supplier',
            'purchaseOrder.purchaseRequest.department',
            'purchaseOrder.purchaseRequest.requester',
            'purchaseOrder.purchaseRequest.siteEngineer',
            'purchaseOrder.items.item',
            'purchaseOrder.items.prItem',
            'purchaseRequest.department',
            'purchaseRequest.requester',
            'purchaseRequest.siteEngineer',
            'warehouseKeeper',
            'siteEngineer',
            'items.purchaseOrderItem.item',
            'items.purchaseOrderItem.prItem',
        ])->orderByDesc('created_at');

        if (! $user->hasAnyRole(['admin', 'general_manager', 'accountant', 'procurement_manager'])) {
            if ($user->hasRole('warehouse_keeper')) {
                $query->where('warehouse_keeper_user_id', $user->id);
            } else {
                $query->where('site_engineer_user_id', $user->id);
            }
        }

        return $query->paginate($perPage);
    }

    public function createByWarehouse(
        User $warehouseKeeper,
        PurchaseOrder $purchaseOrder,
        array $items,
        ?string $receivedAt = null,
        ?string $notes = null,
        ?array $photoData = null
    ): PurchaseReceipt {
        $purchaseOrder->loadMissing([
            'purchaseRequest.targetDepartment',
            'purchaseRequest.department',
            'purchaseRequest.assignedReviewer.department',
            'items.prItem',
        ]);

        if (! $purchaseOrder->requiresWarehouseReceipt()) {
            throw new \RuntimeException('لا يمكن لأمين المخزن استلام هذا الطلب؛ حيث تم تحديده من قبل المراجع كتوريد مباشر لا يتطلب المرور على المخزن.');
        }

        if ($purchaseOrder->purchaseRequest?->isOfficeRequest()) {
            throw new \RuntimeException('هذا الطلب يخص مستلزمات مكتبية ويتم تأكيد استلامه مباشرة من قبل مقدم الطلب.');
        }

        $siteEngineerId = $purchaseOrder->purchaseRequest?->site_engineer_user_id;

        if (! $siteEngineerId) {
            $fallbackEngineerId = $purchaseOrder->purchaseRequest?->targetDepartment?->site_engineer_user_id
                ?? $purchaseOrder->purchaseRequest?->department?->site_engineer_user_id
                ?? User::whereHas('roles', fn ($q) => $q->where('slug', 'site_engineer'))->where('is_active', true)->value('id');

            if ($fallbackEngineerId) {
                $siteEngineerId = $fallbackEngineerId;
                if ($purchaseOrder->purchaseRequest) {
                    $purchaseOrder->purchaseRequest->update(['site_engineer_user_id' => $fallbackEngineerId]);
                }
            }
        }

        if (! $siteEngineerId) {
            throw new \RuntimeException('لا يوجد مهندس موقع محدد لهذا الطلب.');
        }
        if (! in_array($purchaseOrder->status, ['ISSUED', 'PENDING_ACCOUNTING_REVIEW', 'APPROVED_BY_ACCOUNTING', 'FINAL_APPROVED'], true)) {
            throw new \RuntimeException('لا يمكن تسجيل الاستلام في حالة أمر الشراء الحالية.');
        }
        if (PurchaseReceipt::where('purchase_order_id', $purchaseOrder->id)->whereIn('status', ['PENDING_SITE_ENGINEER', 'APPROVED'])->exists()) {
            throw new \RuntimeException('تم إنشاء إذن استلام لهذا الأمر بالفعل.');
        }

        if ($purchaseOrder->purchase_request_id && \App\Models\PurchaseRequestSupplement::where('purchase_request_id', $purchaseOrder->purchase_request_id)->whereIn('status', ['PENDING_PROCUREMENT_APPROVAL', 'SUBMITTED', 'REVIEWER_APPROVED'])->exists()) {
            throw new \RuntimeException('لا يمكن إتمام الاستلام حالياً؛ يوجد طلب كمالة قيد التسعير وإصدار أمر الشراء لدى إدارة المشتريات (م. أحمد). يرجى الانتظار حتى يتم تحميل البنود على أمر الشراء.');
        }

        if (empty($items)) {
            throw ValidationException::withMessages(['items' => ['يجب تسجيل صنف واحد على الأقل في إذن الاستلام.']]);
        }

        $orderItems = $purchaseOrder->items->keyBy('id');

        return DB::transaction(function () use ($warehouseKeeper, $purchaseOrder, $items, $receivedAt, $notes, $siteEngineerId, $orderItems, $photoData): PurchaseReceipt {
            $supplierId = $purchaseOrder->supplier_id ?: \App\Models\Supplier::getOrCreateInternalWarehouseSupplier()->id;
            if (! $purchaseOrder->supplier_id) {
                $purchaseOrder->update(['supplier_id' => $supplierId]);
            }

            $receipt = PurchaseReceipt::create([
                'purchase_order_id' => $purchaseOrder->id,
                'purchase_request_id' => $purchaseOrder->purchase_request_id,
                'supplier_id' => $supplierId,
                'warehouse_keeper_user_id' => $warehouseKeeper->id,
                'site_engineer_user_id' => $siteEngineerId,
                'receipt_number' => $this->generateUniqueReceiptNumber('GRN-'),
                'status' => 'PENDING_SITE_ENGINEER',
                'received_at' => $receivedAt ?: now()->toDateString(),
                'warehouse_submitted_at' => now(),
                'warehouse_notes' => $notes,
                'photo_path' => $photoData['path'] ?? null,
                'photo_name' => $photoData['name'] ?? null,
                'photo_size' => $photoData['size'] ?? null,
                'photo_mime_type' => $photoData['mime_type'] ?? null,
            ]);

            foreach ($items as $item) {
                $orderItemId = (int) ($item['purchase_order_item_id'] ?? 0);
                $orderItem = $orderItems->get($orderItemId);
                if (! $orderItem) {
                    throw ValidationException::withMessages(['items' => ['يوجد بند غير مرتبط بأمر الشراء.']]);
                }
                $receivedQuantity = (float) ($item['received_quantity'] ?? -1);
                if ($receivedQuantity < 0) {
                    throw ValidationException::withMessages(['items' => ['الكمية المستلمة لا يمكن أن تكون سالبة.']]);
                }

                $prItem = $orderItem->prItem;
                $finalReceivedQuantity = $receivedQuantity;
                $noteText = $item['notes'] ?? null;

                // Handle case where requester requested in PR UOM (e.g. BAR) and PO was issued in another UOM (e.g. TON)
                if ($prItem && $prItem->uom && $orderItem->uom && strtoupper((string)$prItem->uom) !== strtoupper((string)$orderItem->uom)) {
                    $prQty = (float) $prItem->quantity;
                    $poQty = (float) $orderItem->quantity;
                    if ($prQty > 0 && $poQty > 0) {
                        $ratio = $poQty / $prQty;
                        // If entered quantity is in the scale of PR items (e.g. entered 40 bars for a 0.416 ton PO item)
                        if ($receivedQuantity > ($poQty * 2) && $ratio < 0.2) {
                            $finalReceivedQuantity = round($receivedQuantity * $ratio, 3);
                            $notePrefix = "[المستلم بالموقع: {$receivedQuantity} {$prItem->uom}]";
                            $noteText = $noteText ? "{$notePrefix} - {$noteText}" : $notePrefix;
                        }
                    }
                }

                $receipt->items()->create([
                    'purchase_order_item_id' => $orderItem->id,
                    'ordered_quantity' => $orderItem->quantity,
                    'received_quantity' => $finalReceivedQuantity,
                    'notes' => $noteText,
                ]);
            }

            $purchaseOrder->update(['delivery_status' => 'IN_RECEIPT']);

            ApprovalHistory::create([
                'target_type' => PurchaseReceipt::class,
                'target_id' => $receipt->id,
                'actor_user_id' => $warehouseKeeper->id,
                'action' => 'WAREHOUSE_RECEIPT_SUBMITTED',
                'from_state' => 'PENDING_WAREHOUSE',
                'to_state' => 'PENDING_SITE_ENGINEER',
                'comments' => $notes ?: 'سجل أمين المخزن الكميات المستلمة وأرسل إذن الاستلام للمستلم/مهندس الموقع للفحص والاعتماد.',
            ]);

            $notificationService = app(NotificationService::class);

            // Notify the assigned site engineer / receiver to review and approve the receipt
            $siteEngineer = User::find($siteEngineerId);
            if ($siteEngineer) {
                $notificationService->queueNotification(
                    $siteEngineer,
                    'purchase_receipt_pending_site_engineer',
                    'إذن استلام بانتظار اعتمادك',
                    "إذن الاستلام {$receipt->receipt_number} لأمر الشراء {$purchaseOrder->po_number} بانتظار فحصك واعتمادك.",
                    $receipt
                );
            }

            $notificationService->markEntityNotificationsAsRead($purchaseOrder, $warehouseKeeper);

            return $receipt->fresh(['purchaseOrder.supplier', 'purchaseOrder.items.item', 'purchaseRequest', 'warehouseKeeper', 'siteEngineer', 'items.purchaseOrderItem']);
        });
    }

    public function updateBySiteEngineer(User $siteEngineer, PurchaseReceipt $receipt, array $items, ?string $notes = null): PurchaseReceipt
    {
        $receipt->loadMissing(['items.purchaseOrderItem.prItem', 'purchaseOrder.items.prItem']);
        if (! $siteEngineer->hasRole('admin') && (int) $receipt->site_engineer_user_id !== (int) $siteEngineer->id) {
            throw new \RuntimeException('هذا الإذن غير مخصص لمهندس الموقع الحالي.');
        }
        if ($receipt->status !== 'PENDING_SITE_ENGINEER') {
            throw new \RuntimeException('لا يمكن تعديل إذن الاستلام بعد اعتماده أو إرساله للحسابات.');
        }

        return DB::transaction(function () use ($siteEngineer, $receipt, $items, $notes): PurchaseReceipt {
            $receiptItems = $receipt->items->keyBy('id');
            foreach ($items as $input) {
                $receiptItem = $receiptItems->get((int) ($input['id'] ?? 0));
                if (! $receiptItem) {
                    throw ValidationException::withMessages(['items' => ['يوجد بند غير مرتبط بإذن الاستلام.']]);
                }
                $receivedQuantity = (float) ($input['received_quantity'] ?? -1);
                if ($receivedQuantity < 0) {
                    throw ValidationException::withMessages(['items' => ['الكمية المستلمة لا يمكن أن تكون سالبة.']]);
                }

                $orderItem = $receiptItem->purchaseOrderItem;
                $prItem = $orderItem?->prItem;
                $finalReceivedQuantity = $receivedQuantity;
                $noteText = $input['notes'] ?? $receiptItem->notes;

                if ($prItem && $prItem->uom && $orderItem && $orderItem->uom && strtoupper((string)$prItem->uom) !== strtoupper((string)$orderItem->uom)) {
                    $prQty = (float) $prItem->quantity;
                    $poQty = (float) $orderItem->quantity;
                    if ($prQty > 0 && $poQty > 0) {
                        $ratio = $poQty / $prQty;
                        if ($receivedQuantity > ($poQty * 2) && $ratio < 0.2) {
                            $finalReceivedQuantity = round($receivedQuantity * $ratio, 3);
                            $notePrefix = "[المعتمد بالموقع: {$receivedQuantity} {$prItem->uom}]";
                            $noteText = $noteText ? "{$notePrefix} - {$noteText}" : $notePrefix;
                        }
                    }
                }

                $receiptItem->update([
                    'received_quantity' => $finalReceivedQuantity,
                    'notes' => $noteText,
                ]);
            }
            if ($notes !== null) {
                $receipt->update(['site_engineer_notes' => $notes]);
            }

            ApprovalHistory::create([
                'target_type' => PurchaseReceipt::class,
                'target_id' => $receipt->id,
                'actor_user_id' => $siteEngineer->id,
                'action' => 'SITE_ENGINEER_RECEIPT_UPDATED',
                'from_state' => 'PENDING_SITE_ENGINEER',
                'to_state' => 'PENDING_SITE_ENGINEER',
                'comments' => 'عدّل مهندس الموقع كميات إذن الاستلام قبل إرساله للحسابات.',
            ]);

            return $receipt->fresh(['purchaseOrder.supplier', 'purchaseOrder.items.item', 'purchaseRequest', 'warehouseKeeper', 'siteEngineer', 'items.purchaseOrderItem']);
        });
    }

    public function approveBySiteEngineer(User $siteEngineer, PurchaseReceipt $receipt, ?string $notes = null): PurchaseReceipt
    {
        $receipt->loadMissing(['purchaseOrder', 'items']);
        if ($receipt->status === 'APPROVED') {
            return $receipt;
        }
        if (! $siteEngineer->hasRole('admin') && (int) $receipt->site_engineer_user_id !== (int) $siteEngineer->id) {
            throw new \RuntimeException('هذا الإذن غير مخصص لمهندس الموقع الحالي.');
        }
        if ($receipt->status !== 'PENDING_SITE_ENGINEER') {
            throw new \RuntimeException('إذن الاستلام ليس بانتظار اعتماد مهندس الموقع.');
        }

        if ($receipt->purchaseOrder?->purchase_request_id && \App\Models\PurchaseRequestSupplement::where('purchase_request_id', $receipt->purchaseOrder->purchase_request_id)->whereIn('status', ['PENDING_PROCUREMENT_APPROVAL', 'SUBMITTED', 'REVIEWER_APPROVED'])->exists()) {
            throw new \RuntimeException('لا يمكن إتمام الاستلام حالياً؛ يوجد طلب كمالة قيد التسعير وإصدار أمر الشراء لدى إدارة المشتريات (م. أحمد). يرجى الانتظار حتى يتم تحميل البنود على أمر الشراء.');
        }

        return DB::transaction(function () use ($siteEngineer, $receipt, $notes): PurchaseReceipt {
            $receipt->loadMissing(['purchaseOrder.supplier', 'supplier']);
            $isInternalWarehouse = $receipt->isInternalWarehouse();

            $receipt->update([
                'status' => 'APPROVED',
                'site_engineer_approved_at' => now(),
                'site_engineer_notes' => $notes,
            ]);

            // Regardless of whether it is an internal warehouse order or an external supplier,
            // once the Site Engineer approves the GRN, the order moves to PENDING_ACTUAL_PO waiting for Actual PO!
            $receipt->purchaseOrder->update([
                'delivery_status' => 'DELIVERED',
                'actual_delivery_date' => $receipt->received_at ?: now()->toDateString(),
                'status' => 'PENDING_ACTUAL_PO',
            ]);

            app(NotificationService::class)->markEntityNotificationsAsRead($receipt);
            app(NotificationService::class)->markEntityNotificationsAsRead($receipt->purchaseOrder);

            ApprovalHistory::create([
                'target_type' => PurchaseReceipt::class,
                'target_id' => $receipt->id,
                'actor_user_id' => $siteEngineer->id,
                'action' => $isInternalWarehouse ? 'INTERNAL_STOCK_RECEIPT_APPROVED' : 'SITE_ENGINEER_RECEIPT_APPROVED',
                'from_state' => 'PENDING_SITE_ENGINEER',
                'to_state' => 'APPROVED',
                'comments' => $isInternalWarehouse
                    ? ($notes ? "{$notes} — استلام وتفريغ من المخزن الداخلي، بانتظار إصدار أمر الشراء الفعلي." : 'اعتمد مهندس الموقع استلام المواد المنصرفة من المخزن الداخلي، وبانتظار مراجعة وإصدار أمر الشراء الفعلي من إدارة المشتريات.')
                    : ($notes ?? 'اعتمد مهندس الموقع الكميات المستلمة وأُعيد الملف لإدارة المشتريات لإصدار أمر الشراء الفعلي.'),
            ]);

            $notificationService = app(NotificationService::class);

            // Notify Procurement Managers to issue the Actual PO (for external vendors and internal warehouse alike)
            $procurementUsers = $notificationService->resolveUsersWithPermission('purchase_order.create');

            if ($procurementUsers->isNotEmpty()) {
                $notificationService->queueUsers(
                    $procurementUsers,
                    'grn_approved_pending_actual_po',
                    'إذن استلام معتمد — بانتظار إصدار أمر الشراء الفعلي',
                    $isInternalWarehouse
                        ? "اعتمد مهندس الموقع إذن استلام المخزن {$receipt->receipt_number} لأمر الشراء {$receipt->purchaseOrder->po_number}. يرجى مراجعة الكميات وإصدار أمر الشراء الفعلي."
                        : "اعتمد مهندس الموقع إذن الاستلام {$receipt->receipt_number} لأمر الشراء {$receipt->purchaseOrder->po_number}. يرجى مراجعة الكميات وإصدار أمر الشراء الفعلي.",
                    $receipt->purchaseOrder
                );
            }

            if ($receipt->warehouse_keeper_user_id) {
                $notificationService->queueNotification(
                    $receipt->warehouse_keeper_user_id,
                    'purchase_receipt_approved_site_engineer',
                    $isInternalWarehouse ? 'تم اعتماد إذن الصرف والاستلام من مهندس الموقع (بانتظار أمر الشراء الفعلي)' : 'تم اعتماد إذن الاستلام من مهندس الموقع',
                    "اعتمد مهندس الموقع إذن الاستلام {$receipt->receipt_number} لأمر الشراء {$receipt->purchaseOrder->po_number}.",
                    $receipt
                );
            }

            // Accounting notifications:
            // CRITICAL BUSINESS RULE:
            // For internal warehouse orders, NO data or notifications may be sent to accounting before Actual PO issuance.
            // For external vendors, existing receipt notification is maintained for awareness.
            if (! $isInternalWarehouse) {
                $receipt->purchaseOrder->loadMissing('purchaseRequest.department');
                $deptCode = $receipt->purchaseOrder->purchaseRequest?->department?->code;
                $deptAccountants = app(\App\Services\SupplierInvoiceService::class)->getAccountantsForDepartment($deptCode);
                $targetAccountants = $deptAccountants->isNotEmpty()
                    ? $deptAccountants
                    : User::whereHas('roles', fn ($q) => $q->whereIn('slug', ['general_accountant', 'site_accountant', 'accountant']))
                        ->where('is_active', true)
                        ->get();

                if ($targetAccountants->isEmpty()) {
                    $targetAccountants = $notificationService->resolveUsersWithPermission('purchase_order.view_accounting');
                }

                if ($targetAccountants->isNotEmpty()) {
                    $notificationService->queueAccountingWithPurchaseOrderAndReceipt(
                        $targetAccountants,
                        $receipt->purchaseOrder,
                        $receipt
                    );
                }
            }

            return $receipt->fresh(['supplier', 'purchaseOrder.supplier', 'purchaseOrder.items.item', 'purchaseRequest', 'warehouseKeeper', 'siteEngineer', 'items.purchaseOrderItem']);
        });
    }

    public function confirmByRequester(User $requester, PurchaseOrder $purchaseOrder, array $items = [], ?string $notes = null): PurchaseReceipt
    {
        $purchaseOrder->loadMissing(['purchaseRequest', 'items']);
        $pr = $purchaseOrder->purchaseRequest;

        if (!$pr) {
            throw new \RuntimeException('لا يوجد طلب شراء مرتبط بأمر الشراء هذا.');
        }

        if ($pr->request_type !== 'OFFICE_SUPPLIES') {
            throw new \RuntimeException('هذا الأمر يخص مشروعاً ويتطلب استلام أمين المخزن واعتماد مهندس الموقع.');
        }

        $isRequester = (int) $pr->user_id === (int) $requester->id;
        $isPrivileged = $requester->hasAnyRole(['admin', 'general_manager', 'procurement_manager']);
        if (!$isRequester && !$isPrivileged) {
            throw new \RuntimeException('فقط مقدم الطلب أو إدارة المشتريات/الإدارة العامة يمكنهم تأكيد استلام هذا الطلب المكتبي.');
        }

        if (! in_array($purchaseOrder->status, ['ISSUED', 'PENDING_ACCOUNTING_REVIEW', 'APPROVED_BY_ACCOUNTING', 'FINAL_APPROVED'], true)) {
            throw new \RuntimeException('لا يمكن تأكيد الاستلام في حالة أمر الشراء الحالية.');
        }

        if (PurchaseReceipt::where('purchase_order_id', $purchaseOrder->id)->where('status', 'APPROVED')->exists()) {
            throw new \RuntimeException('تم تأكيد استلام هذا الطلب المكتبي بالفعل.');
        }

        $orderItems = $purchaseOrder->items->keyBy('id');
        $itemsMap = collect($items)->keyBy('purchase_order_item_id');

        return DB::transaction(function () use ($requester, $purchaseOrder, $pr, $orderItems, $itemsMap, $notes): PurchaseReceipt {
            $supplierId = $purchaseOrder->supplier_id ?: \App\Models\Supplier::getOrCreateInternalWarehouseSupplier()->id;
            $receipt = PurchaseReceipt::create([
                'purchase_order_id' => $purchaseOrder->id,
                'purchase_request_id' => $pr->id,
                'supplier_id' => $supplierId,
                'warehouse_keeper_user_id' => null,
                'site_engineer_user_id' => null,
                'receiver_user_id' => $requester->id,
                'receipt_number' => 'OFFICE-RCV-' . now()->format('YmdHis') . '-' . $purchaseOrder->id,
                'receipt_type' => 'REQUESTER_OFFICE',
                'status' => 'APPROVED',
                'received_at' => now()->toDateString(),
                'receiver_approved_at' => now(),
                'receiver_notes' => $notes,
            ]);

            foreach ($orderItems as $orderItem) {
                $itemPayload = $itemsMap->get($orderItem->id);
                $receivedQuantity = $itemPayload && isset($itemPayload['received_quantity'])
                    ? (float) $itemPayload['received_quantity']
                    : (float) $orderItem->quantity;

                if ($receivedQuantity < 0) {
                    $receivedQuantity = (float) $orderItem->quantity;
                }

                $receipt->items()->create([
                    'purchase_order_item_id' => $orderItem->id,
                    'ordered_quantity' => $orderItem->quantity,
                    'received_quantity' => $receivedQuantity,
                    'notes' => $itemPayload['notes'] ?? 'تم الاستلام بواسطة مقدم الطلب',
                ]);
            }

            $purchaseOrder->update([
                'delivery_status' => 'DELIVERED',
                'actual_delivery_date' => now()->toDateString(),
            ]);

            ApprovalHistory::create([
                'target_type' => PurchaseReceipt::class,
                'target_id' => $receipt->id,
                'actor_user_id' => $requester->id,
                'action' => 'OFFICE_RECEIPT_CONFIRMED',
                'from_state' => 'ISSUED',
                'to_state' => 'APPROVED',
                'comments' => $notes ?: 'أكد مقدم الطلب استلام المستلزمات المكتبية بالكامل.',
            ]);

            $notificationService = app(NotificationService::class);
            $accountants = $notificationService->resolveUsersWithPermission('purchase_order.view_accounting');

            $receipt->purchaseOrder->loadMissing('purchaseRequest.department');
            $deptCode = $receipt->purchaseOrder->purchaseRequest?->department?->code;
            $deptAccountants = app(\App\Services\SupplierInvoiceService::class)->getAccountantsForDepartment($deptCode);
            $targetAccountants = $deptAccountants->isNotEmpty() ? $deptAccountants : $accountants;

            $notificationService->queueAccountingWithPurchaseOrderAndReceipt(
                $targetAccountants,
                $receipt->purchaseOrder,
                $receipt
            );

            // Notify Financial Director for informational awareness only (no invoice registration action)
            if ($deptAccountants->isNotEmpty()) {
                $financialDirectors = $accountants->reject(function ($u) {
                    return $u->hasRole('site_accountant') || $u->hasRole('licenses_accountant') || $u->hasRole('buffet_accountant');
                });
                foreach ($financialDirectors as $director) {
                    $notificationService->queueNotification(
                        $director,
                        'purchase_order_and_receipt_approved_info',
                        'إشعار للعلم: إذن استلام معتمد جاهز للفوترة',
                        "تم اعتماد إذن الاستلام {$receipt->receipt_number} لأمر الشراء {$receipt->purchaseOrder->po_number}، وهو بانتظار تسجيل الفاتورة من قِبل محاسب القسم المختص (للعلم فقط).",
                        $receipt->purchaseOrder
                    );
                }
            }

            return $receipt->fresh(['purchaseOrder.supplier', 'purchaseOrder.items.item', 'purchaseRequest', 'receiver', 'items.purchaseOrderItem']);
        });
    }

    /**
     * Automatically create a direct site receipt for Buildings department orders,
     * routing the receipt straight to the site engineer and bypassing the warehouse.
     */
    public function createDirectSiteReceiptForBuildings(PurchaseOrder $purchaseOrder): PurchaseReceipt
    {
        $purchaseOrder->loadMissing([
            'purchaseRequest.targetDepartment',
            'purchaseRequest.department',
            'purchaseRequest.assignedReviewer.department',
            'purchaseRequest.siteEngineer',
            'items',
        ]);

        $existingReceipt = PurchaseReceipt::where('purchase_order_id', $purchaseOrder->id)
            ->whereIn('status', ['PENDING_SITE_ENGINEER', 'APPROVED'])
            ->first();

        if ($existingReceipt) {
            return $existingReceipt;
        }

        $siteEngineerId = $purchaseOrder->purchaseRequest?->site_engineer_user_id;

        if (! $siteEngineerId) {
            $fallbackEngineerId = $purchaseOrder->purchaseRequest?->targetDepartment?->site_engineer_user_id
                ?? $purchaseOrder->purchaseRequest?->department?->site_engineer_user_id
                ?? User::whereHas('roles', fn ($q) => $q->where('slug', 'site_engineer'))->where('is_active', true)->value('id');

            if ($fallbackEngineerId) {
                $siteEngineerId = $fallbackEngineerId;
                if ($purchaseOrder->purchaseRequest) {
                    $purchaseOrder->purchaseRequest->update(['site_engineer_user_id' => $fallbackEngineerId]);
                }
            }
        }

        if (! $siteEngineerId) {
            throw new \RuntimeException('لا يمكن إنشاء إذن استلام مباشر لقسم المباني دون تحديد مهندس الموقع.');
        }

        if ($purchaseOrder->purchase_request_id && \App\Models\PurchaseRequestSupplement::where('purchase_request_id', $purchaseOrder->purchase_request_id)->whereIn('status', ['PENDING_PROCUREMENT_APPROVAL', 'SUBMITTED', 'REVIEWER_APPROVED'])->exists()) {
            throw new \RuntimeException('لا يمكن إتمام الاستلام حالياً؛ يوجد طلب كمالة قيد التسعير وإصدار أمر الشراء لدى إدارة المشتريات (م. أحمد). يرجى الانتظار حتى يتم تحميل البنود على أمر الشراء.');
        }

        return DB::transaction(function () use ($purchaseOrder, $siteEngineerId): PurchaseReceipt {
            $supplierId = $purchaseOrder->supplier_id ?: \App\Models\Supplier::getOrCreateInternalWarehouseSupplier()->id;
            $receipt = PurchaseReceipt::create([
                'purchase_order_id' => $purchaseOrder->id,
                'purchase_request_id' => $purchaseOrder->purchase_request_id,
                'supplier_id' => $supplierId,
                'warehouse_keeper_user_id' => null,
                'site_engineer_user_id' => $siteEngineerId,
                'receipt_number' => $this->generateUniqueReceiptNumber('GRN-SITE-'),
                'receipt_type' => 'SITE_DIRECT',
                'status' => 'PENDING_SITE_ENGINEER',
                'received_at' => now()->toDateString(),
                'warehouse_submitted_at' => now(),
                'warehouse_notes' => 'توريد مباشر لموقع المباني — استلام فوري بالموقع من المورد بدون المرور على المخزن.',
            ]);

            foreach ($purchaseOrder->items as $orderItem) {
                $receipt->items()->create([
                    'purchase_order_item_id' => $orderItem->id,
                    'ordered_quantity' => $orderItem->quantity,
                    'received_quantity' => $orderItem->quantity,
                    'notes' => 'توريد مباشر لموقع المباني',
                ]);
            }

            $purchaseOrder->update(['delivery_status' => 'IN_RECEIPT']);

            ApprovalHistory::create([
                'target_type' => PurchaseReceipt::class,
                'target_id' => $receipt->id,
                'actor_user_id' => $purchaseOrder->created_by_user_id ?? $siteEngineerId,
                'action' => 'SITE_DIRECT_RECEIPT_CREATED',
                'from_state' => 'ISSUED',
                'to_state' => 'PENDING_SITE_ENGINEER',
                'comments' => 'تم إنشاء إذن استلام مباشر لموقع المباني وتوجيهه إلى مهندس الموقع للاستلام والفحص.',
            ]);

            $siteEngineer = User::find($siteEngineerId);
            if ($siteEngineer) {
                app(NotificationService::class)->queueNotification(
                    $siteEngineer,
                    'purchase_receipt_pending_site_engineer',
                    'توريد مباشر لموقع المباني بانتظار استلامك',
                    "أمر الشراء {$purchaseOrder->po_number} تم توجيهه إليك مباشرة لاستلام مواد المباني بالموقع واعتماد إذن الاستلام {$receipt->receipt_number}.",
                    $receipt
                );
            }

            return $receipt->fresh(['purchaseOrder.supplier', 'purchaseOrder.items.item', 'purchaseRequest', 'warehouseKeeper', 'siteEngineer', 'items.purchaseOrderItem']);
        });
    }

    /**
     * Sync and generate any missing direct site receipts for Buildings orders assigned to this engineer.
     */
    public function syncPendingBuildingsReceiptsForEngineer(User $siteEngineer): void
    {
        $pendingPos = PurchaseOrder::with([
            'purchaseRequest.department',
            'purchaseRequest.targetDepartment',
            'purchaseRequest.assignedReviewer.department',
            'items',
        ])
            ->where('status', 'ISSUED')
            ->whereDoesntHave('receipts', fn ($query) => $query->whereIn('status', ['PENDING_SITE_ENGINEER', 'APPROVED']))
            ->whereHas('purchaseRequest', function ($query) use ($siteEngineer) {
                $query->where('site_engineer_user_id', $siteEngineer->id);
            })
            ->get();

        foreach ($pendingPos as $po) {
            if (! $po->requiresWarehouseReceipt()) {
                $this->createDirectSiteReceiptForBuildings($po);
            }
        }
    }
}

