<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\ShipmentGroup;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class SharedShipmentGroupService
{
    /**
     * Authorize user to manage shipment groups.
     */
    protected function authorizeManager(User $user): void
    {
        $allowed = $user->hasRole('procurement_manager')
            || $user->hasRole('admin')
            || $user->hasRole('general_manager');

        if (! $allowed) {
            throw ValidationException::withMessages([
                'auth' => ['غير مصرح لك بإدارة مجموعات الشحنات المشتركة.'],
            ]);
        }
    }

    /**
     * Generate sequential unique shipment group number (SHP-1, SHP-2, ...).
     */
    public function generateUniqueGroupNumber(): string
    {
        $prefix = 'SHP-';

        $existing = DB::table('shipment_groups')
            ->where('group_number', 'LIKE', "{$prefix}%")
            ->pluck('group_number');

        $maxNumber = 0;
        foreach ($existing as $gn) {
            $numPart = substr($gn, strlen($prefix));
            if (is_numeric($numPart)) {
                $num = (int) $numPart;
                if ($num > $maxNumber) {
                    $maxNumber = $num;
                }
            }
        }

        $nextNumber = $maxNumber + 1;
        while (DB::table('shipment_groups')->where('group_number', "{$prefix}{$nextNumber}")->exists()) {
            $nextNumber++;
        }

        return "{$prefix}{$nextNumber}";
    }

    /**
     * Get eligible items for shared shipment group in a Purchase Order.
     */
    public function getEligibleShipmentItems(PurchaseOrder $order, User $user): array
    {
        $order->loadMissing(['items.weighingGroupItem.weighingGroup', 'items.shipmentGroup', 'supplier']);

        $eligible = [];

        foreach ($order->items as $item) {
            // Must not be in an active steel weighing group
            if ($item->weighingGroupItem && ($item->weighingGroupItem->weighingGroup?->status ?? '') !== 'CANCELLED') {
                continue;
            }

            // Must not be already in an active shared shipment group
            if ($item->shipment_group_id && ($item->shipmentGroup?->status ?? '') !== 'CANCELLED') {
                continue;
            }

            $eligible[] = [
                'id'               => $item->id,
                'item_description' => $item->item_description,
                'quantity'         => (float) $item->quantity,
                'uom'              => $item->uom,
                'unit_price'       => (float) $item->unit_price,
                'line_total'       => (float) $item->line_total,
                'region'           => $item->region,
                'land_plot_number' => $item->item_reference,
                'supplier_id'      => $item->supplier_id ?: $order->supplier_id,
            ];
        }

        return $eligible;
    }

    /**
     * Create a new shared shipment group from selected line items.
     */
    public function createShipmentGroup(
        User $user,
        int $poId,
        array $itemIds,
        ?string $groupName = null,
        ?string $notes = null,
        ?string $vehiclePlateNumber = null
    ): ShipmentGroup {
        $this->authorizeManager($user);

        if (empty($itemIds)) {
            throw ValidationException::withMessages([
                'items' => ['يجب اختيار بند واحد على الأقل لإنشاء مجموعة الشحنة المشتركة.'],
            ]);
        }

        return DB::transaction(function () use ($user, $poId, $itemIds, $groupName, $notes, $vehiclePlateNumber) {
            $po = PurchaseOrder::with(['items', 'supplier'])->findOrFail($poId);

            // 1. PO Status check
            $disallowedStatuses = ['REJECTED', 'CANCELLED', 'VOIDED'];
            if (in_array($po->status, $disallowedStatuses, true)) {
                throw ValidationException::withMessages([
                    'purchase_order' => ['حالة أمر الشراء الحالية لا تسمح بإنشاء شحنة مشتركة.'],
                ]);
            }

            $selectedItems = $po->items->whereIn('id', $itemIds);
            if ($selectedItems->count() !== count($itemIds)) {
                throw ValidationException::withMessages([
                    'items' => ['بعض البنود المحددة غير تابعة لأمر الشراء هذا.'],
                ]);
            }

            // 2. Cross-feature conflict validation: MUST NOT be in an active steel weighing group
            $activeSteelItems = DB::table('weighing_group_items')
                ->join('weighing_groups', 'weighing_group_items.weighing_group_id', '=', 'weighing_groups.id')
                ->whereIn('weighing_group_items.purchase_order_item_id', $itemIds)
                ->where('weighing_groups.status', '!=', 'CANCELLED')
                ->pluck('weighing_group_items.purchase_order_item_id')
                ->all();

            if (! empty($activeSteelItems)) {
                $conflictItem = $selectedItems->firstWhere('id', $activeSteelItems[0]);
                throw ValidationException::withMessages([
                    'items' => ["البند [{$conflictItem?->item_description}] مدمج بالفعل في وزنة حديد مسبقة نشطة. لا يمكن الجمع بين وزنة الحديد وشحنة المواد المشتركة لنفس البند."],
                ]);
            }

            // 3. No prior active shipment group for these items
            $alreadyShippedItems = PurchaseOrderItem::whereIn('id', $itemIds)
                ->whereNotNull('shipment_group_id')
                ->whereHas('shipmentGroup', function ($q) {
                    $q->where('status', '!=', 'CANCELLED');
                })
                ->pluck('id')
                ->all();

            if (! empty($alreadyShippedItems)) {
                $conflictItem = $selectedItems->firstWhere('id', $alreadyShippedItems[0]);
                throw ValidationException::withMessages([
                    'items' => ["البند [{$conflictItem?->item_description}] مدمج بالفعل في شحنة مشتركة نشطة."],
                ]);
            }

            // 4. Validate supplier alignment: items must belong to same supplier
            $supplierIds = $selectedItems->map(fn ($it) => $it->supplier_id ?: $po->supplier_id)->filter()->unique();
            if ($supplierIds->count() > 1) {
                throw ValidationException::withMessages([
                    'supplier' => ['لا يمكن تجميع البنود في شحنة واحدة لأن المورد مختلف. يجب أن تتبع جميع البنود نفس المورد.'],
                ]);
            }

            $targetSupplierId = $supplierIds->first() ?: $po->supplier_id;
            if (! $targetSupplierId) {
                throw ValidationException::withMessages([
                    'supplier' => ['لم يتم تحديد مورد لأمر الشراء أو بنوده.'],
                ]);
            }

            $groupNumber = $this->generateUniqueGroupNumber();
            $resolvedName = trim((string) $groupName) ?: "شحنة مشتركة {$groupNumber}";

            // 5. Create ShipmentGroup
            $shipmentGroup = ShipmentGroup::create([
                'group_number'         => $groupNumber,
                'purchase_order_id'    => $po->id,
                'supplier_id'          => $targetSupplierId,
                'group_name'           => $resolvedName,
                'status'               => 'PENDING_DELIVERY',
                'vehicle_plate_number' => $vehiclePlateNumber ? trim($vehiclePlateNumber) : null,
                'notes'                => $notes ? trim($notes) : null,
                'created_by_user_id'   => $user->id,
            ]);

            // 6. Link items
            PurchaseOrderItem::whereIn('id', $itemIds)->update([
                'shipment_group_id' => $shipmentGroup->id,
            ]);

            // 7. Record in AuditLog
            AuditLog::create([
                'user_id'     => $user->id,
                'entity_type' => ShipmentGroup::class,
                'entity_id'   => $shipmentGroup->id,
                'action'      => 'SHARED_SHIPMENT_GROUP_CREATED',
                'field_name'  => 'status',
                'old_value'   => null,
                'new_value'   => json_encode([
                    'group_number' => $shipmentGroup->group_number,
                    'group_name'   => $shipmentGroup->group_name,
                    'po_id'        => $po->id,
                    'items_count'  => count($itemIds),
                ], JSON_UNESCAPED_UNICODE),
            ]);

            return $shipmentGroup->load(['items', 'supplier', 'createdBy']);
        });
    }

    /**
     * Safely un-group a shipment group, detaching all member items.
     */
    public function ungroupShipmentGroup(User $user, int $shipmentGroupId, ?string $reason = null): ShipmentGroup
    {
        $this->authorizeManager($user);

        return DB::transaction(function () use ($user, $shipmentGroupId, $reason) {
            $group = ShipmentGroup::with('items.receiptItems.receipt')->findOrFail($shipmentGroupId);

            if ($group->status === 'CANCELLED') {
                return $group;
            }

            // Check if any member item has already been received
            foreach ($group->items as $item) {
                if ((float) ($item->received_quantity ?? 0) > 0) {
                    throw ValidationException::withMessages([
                        'shipment_group' => ["لا يمكن فك دمج هذه الشحنة لأن البند [{$item->item_description}] تم استلام كميات منه بالفعل بالموقع."],
                    ]);
                }
            }

            // Detach items
            PurchaseOrderItem::where('shipment_group_id', $group->id)->update([
                'shipment_group_id' => null,
            ]);

            $group->update([
                'status' => 'CANCELLED',
                'notes'  => trim(($group->notes ? $group->notes . ' | ' : '') . 'تم فك الدمج: ' . ($reason ?: 'بطلب من مدير المشتريات')),
            ]);

            AuditLog::create([
                'user_id'     => $user->id,
                'entity_type' => ShipmentGroup::class,
                'entity_id'   => $group->id,
                'action'      => 'SHARED_SHIPMENT_GROUP_UNGROUPED',
                'field_name'  => 'status',
                'old_value'   => 'ACTIVE',
                'new_value'   => 'CANCELLED',
            ]);

            return $group->refresh();
        });
    }

    /**
     * Recalculate and update shipment status based on member items received quantities.
     */
    public function updateShipmentStatus(int|ShipmentGroup $shipmentGroupId): string
    {
        $group = $shipmentGroupId instanceof ShipmentGroup
            ? $shipmentGroupId
            : ShipmentGroup::find($shipmentGroupId);

        if (! $group || $group->status === 'CANCELLED') {
            return $group?->status ?? 'CANCELLED';
        }

        $newStatus = $group->resolveDynamicStatus();
        if ($newStatus !== $group->status) {
            $group->update(['status' => $newStatus]);
        }

        return $newStatus;
    }
}
