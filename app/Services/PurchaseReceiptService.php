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
    public function warehouseQueue(int $perPage = 15)
    {
        return PurchaseOrder::with([
            'supplier',
            'purchaseRequest.requester',
            'purchaseRequest.department',
            'purchaseRequest.targetDepartment',
            'purchaseRequest.assignedReviewer.department',
            'purchaseRequest.siteEngineer',
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
        $purchaseOrder->loadMissing(['purchaseRequest.targetDepartment', 'purchaseRequest.department', 'purchaseRequest.assignedReviewer.department', 'items']);

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

        $orderItems = $purchaseOrder->items->keyBy('id');
        if (count($items) !== $orderItems->count()) {
            throw ValidationException::withMessages(['items' => ['يجب تسجيل الكمية المستلمة لكل بند في أمر الشراء.']]);
        }

        return DB::transaction(function () use ($warehouseKeeper, $purchaseOrder, $items, $receivedAt, $notes, $siteEngineerId, $orderItems, $photoData): PurchaseReceipt {
            $receipt = PurchaseReceipt::create([
                'purchase_order_id' => $purchaseOrder->id,
                'purchase_request_id' => $purchaseOrder->purchase_request_id,
                'warehouse_keeper_user_id' => $warehouseKeeper->id,
                'site_engineer_user_id' => $siteEngineerId,
                'receipt_number' => 'GRN-' . now()->format('YmdHis') . '-' . $purchaseOrder->id,
                'status' => 'APPROVED',
                'received_at' => $receivedAt ?: now()->toDateString(),
                'warehouse_submitted_at' => now(),
                'site_engineer_approved_at' => now(),
                'warehouse_notes' => $notes,
                'site_engineer_notes' => $notes,
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

                $receipt->items()->create([
                    'purchase_order_item_id' => $orderItem->id,
                    'ordered_quantity' => $orderItem->quantity,
                    'received_quantity' => $receivedQuantity,
                    'notes' => $item['notes'] ?? null,
                ]);
            }

            $purchaseOrder->update([
                'delivery_status' => 'DELIVERED',
                'actual_delivery_date' => $receivedAt ?: now()->toDateString(),
            ]);

            ApprovalHistory::create([
                'target_type' => PurchaseReceipt::class,
                'target_id' => $receipt->id,
                'actor_user_id' => $warehouseKeeper->id,
                'action' => 'SITE_RECEIPT_APPROVED',
                'from_state' => 'PENDING_RECEIPT',
                'to_state' => 'APPROVED',
                'comments' => $notes ?: 'سجل أمين المخزن / المستلم الكميات الفعلية المستلمة واعتمد إذن الاستلام نهائياً ونقله للحسابات.',
            ]);

            $notificationService = app(NotificationService::class);
            $accountants = $notificationService->resolveUsersWithPermission('purchase_order.view_accounting');

            $purchaseOrder->loadMissing('purchaseRequest.department');
            $deptCode = $purchaseOrder->purchaseRequest?->department?->code;
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

            $targetAccountants = $deptAccountants->isNotEmpty() ? $deptAccountants : $accountants;

            $notificationService->queueAccountingWithPurchaseOrderAndReceipt(
                $targetAccountants,
                $purchaseOrder,
                $receipt
            );

            // Notify Financial Director for informational awareness only
            if ($deptAccountants->isNotEmpty()) {
                $financialDirectors = $accountants->reject(function ($u) {
                    return $u->hasRole('site_accountant') || $u->hasRole('licenses_accountant') || $u->hasRole('buffet_accountant');
                });
                foreach ($financialDirectors as $director) {
                    $notificationService->queueNotification(
                        $director,
                        'purchase_order_and_receipt_approved_info',
                        'إشعار للعلم: إذن استلام معتمد جاهز للفوترة',
                        "تم اعتماد إذن الاستلام {$receipt->receipt_number} لأمر الشراء {$purchaseOrder->po_number}، وهو بانتظار تسجيل الفاتورة من قِبل محاسب القسم المختص (للعلم فقط).",
                        $purchaseOrder
                    );
                }
            }

            // Notify site engineer for informational awareness if different from keeper
            $siteEngineer = User::find($siteEngineerId);
            if ($siteEngineer && (int) $siteEngineer->id !== (int) $warehouseKeeper->id) {
                $notificationService->queueNotification(
                    $siteEngineer,
                    'purchase_receipt_approved_site_engineer',
                    'تم تسجيل واعتماد استلام بالموقع',
                    "تم تسجيل واعتماد إذن الاستلام {$receipt->receipt_number} لأمر الشراء {$purchaseOrder->po_number} بعد انتهاء الصبة ونقله للحسابات.",
                    $receipt
                );
            }

            $notificationService->markEntityNotificationsAsRead($purchaseOrder, $warehouseKeeper);

            return $receipt->fresh(['purchaseOrder.supplier', 'purchaseOrder.items.item', 'purchaseRequest', 'warehouseKeeper', 'siteEngineer', 'items.purchaseOrderItem']);
        });
    }

    public function updateBySiteEngineer(User $siteEngineer, PurchaseReceipt $receipt, array $items, ?string $notes = null): PurchaseReceipt
    {
        $receipt->loadMissing(['items', 'purchaseOrder.items']);
        if ((int) $receipt->site_engineer_user_id !== (int) $siteEngineer->id) {
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
                $receiptItem->update([
                    'received_quantity' => $receivedQuantity,
                    'notes' => $input['notes'] ?? $receiptItem->notes,
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
        if ($receipt->site_engineer_user_id !== $siteEngineer->id) {
            throw new \RuntimeException('هذا الإذن غير مخصص لمهندس الموقع الحالي.');
        }
        if ($receipt->status !== 'PENDING_SITE_ENGINEER') {
            throw new \RuntimeException('إذن الاستلام ليس بانتظار اعتماد مهندس الموقع.');
        }

        return DB::transaction(function () use ($siteEngineer, $receipt, $notes): PurchaseReceipt {
            $receipt->update([
                'status' => 'APPROVED',
                'site_engineer_approved_at' => now(),
                'site_engineer_notes' => $notes,
            ]);
            $receipt->purchaseOrder->update([
                'delivery_status' => 'DELIVERED',
                'actual_delivery_date' => $receipt->received_at ?: now()->toDateString(),
            ]);

            app(NotificationService::class)->markEntityNotificationsAsRead($receipt);
            app(NotificationService::class)->markEntityNotificationsAsRead($receipt->purchaseOrder);

            ApprovalHistory::create([
                'target_type' => PurchaseReceipt::class,
                'target_id' => $receipt->id,
                'actor_user_id' => $siteEngineer->id,
                'action' => 'SITE_ENGINEER_RECEIPT_APPROVED',
                'from_state' => 'PENDING_SITE_ENGINEER',
                'to_state' => 'APPROVED',
                'comments' => $notes ?? 'اعتمد مهندس الموقع الكميات المستلمة.',
            ]);

            $notificationService = app(NotificationService::class);
            $accountants = $notificationService->resolveUsersWithPermission('purchase_order.view_accounting');

            $receipt->purchaseOrder->loadMissing('purchaseRequest.department');
            $deptCode = $receipt->purchaseOrder->purchaseRequest?->department?->code;
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

            if ($receipt->warehouse_keeper_user_id) {
                $notificationService->queueNotification(
                    $receipt->warehouse_keeper_user_id,
                    'purchase_receipt_approved_site_engineer',
                    'تم اعتماد إذن الاستلام من مهندس الموقع',
                    "اعتمد مهندس الموقع إذن الاستلام {$receipt->receipt_number} لأمر الشراء {$receipt->purchaseOrder->po_number}.",
                    $receipt
                );
            }

            return $receipt->fresh(['purchaseOrder.supplier', 'purchaseOrder.items.item', 'purchaseRequest', 'warehouseKeeper', 'siteEngineer', 'items.purchaseOrderItem']);
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
            $receipt = PurchaseReceipt::create([
                'purchase_order_id' => $purchaseOrder->id,
                'purchase_request_id' => $pr->id,
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

        return DB::transaction(function () use ($purchaseOrder, $siteEngineerId): PurchaseReceipt {
            $receipt = PurchaseReceipt::create([
                'purchase_order_id' => $purchaseOrder->id,
                'purchase_request_id' => $purchaseOrder->purchase_request_id,
                'warehouse_keeper_user_id' => null,
                'site_engineer_user_id' => $siteEngineerId,
                'receipt_number' => 'GRN-SITE-' . now()->format('YmdHis') . '-' . $purchaseOrder->id,
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

