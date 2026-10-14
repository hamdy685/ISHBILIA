<?php

use App\Models\AuditLog;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\PurchaseReceipt;
use App\Models\WeighingGroup;
use App\Services\SteelWeighingGroupService;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        DB::transaction(function () {
            $service = app(SteelWeighingGroupService::class);

            $findOrder = function (string $numPattern, int $numericId) {
                return PurchaseOrder::withoutGlobalScope(\App\Scopes\DataIsolationScope::class)
                    ->where('id', $numericId)
                    ->orWhere('po_number', $numPattern)
                    ->orWhere('po_number', 'like', "%{$numPattern}")
                    ->orWhere('po_number', 'like', "%-" . str_pad((string) $numericId, 4, '0', STR_PAD_LEFT))
                    ->first();
            };

            // ══════════════════════════════════════════════════════════════════
            // المجموعة الأولى: PO-99 و PO-100 (المورد: عبود | طلب PR-63 | سقف الأرضي 349)
            // ══════════════════════════════════════════════════════════════════
            $po99 = $findOrder('PO-99', 99);
            $po100 = $findOrder('PO-100', 100);

            if ($po99 && $po100 && $po99->id !== $po100->id) {
                Log::info("Merging PO-100 into PO-99 as a single consolidated steel weighing group");

                // 1. Move items from PO-100 to PO-99
                PurchaseOrderItem::where('purchase_order_id', $po100->id)->update([
                    'purchase_order_id' => $po99->id,
                ]);

                // 2. Void PO-100 so it completely disappears from warehouse receipt queue
                $po100->update([
                    'status' => 'VOIDED',
                    'delivery_status' => 'COMPLETED',
                    'notes' => trim(($po100->notes ?? '') . ' | تم دمج بنود أمر الشراء بالكامل في أمر الشراء PO-99 كوزنة حديد مجمعة واحدة بناءً على طلب الإدارة.'),
                ]);

                // Remove any pending draft receipts for PO-100
                PurchaseReceipt::withoutGlobalScope(\App\Scopes\DataIsolationScope::class)
                    ->where('purchase_order_id', $po100->id)
                    ->whereIn('status', ['DRAFT', 'PENDING_SITE_ENGINEER'])
                    ->delete();

                // 3. Refresh PO-99 items and recalculate totals
                $po99->refresh();
                $po99Items = $po99->items;
                $newSubtotal = (float) $po99Items->sum('line_total');

                $po99->update([
                    'subtotal' => $newSubtotal,
                    'total_amount' => $newSubtotal,
                    'grand_total' => $newSubtotal,
                ]);

                // 4. Create active WeighingGroup on PO-99 if not already exists
                $existingWg99 = WeighingGroup::where('purchase_order_id', $po99->id)
                    ->where('status', '!=', 'CANCELLED')
                    ->first();

                if (! $existingWg99) {
                    $totalWeight99 = 0.0;
                    $itemsData99 = [];
                    $unitPrice99 = 0.0;

                    foreach ($po99Items as $it) {
                        $w = $service->calculateWeightInTons($it);
                        $totalWeight99 += $w;
                        if ($unitPrice99 <= 0 && (float) $it->unit_price > 0) {
                            $unitPrice99 = (float) $it->unit_price;
                        }

                        $itemsData99[] = [
                            'purchase_order_item_id' => $it->id,
                            'item_description'       => $it->item_description,
                            'size_or_diameter'       => $service->extractSizeOrDiameter($it),
                            'ordered_weight'         => $w,
                            'received_weight'        => null,
                            'uom'                    => 'TON',
                            'unit_price'             => (float) $it->unit_price,
                            'line_total'             => (float) $it->line_total,
                            'region'                 => $it->region,
                            'land_plot_number'       => $it->item_reference,
                            'purpose'                => $it->specifications,
                        ];
                    }

                    $groupNum99 = $service->generateUniqueGroupNumber();

                    $wg99 = WeighingGroup::create([
                        'group_number'         => $groupNum99,
                        'purchase_order_id'    => $po99->id,
                        'supplier_id'          => $po99->supplier_id,
                        'group_type'           => 'STEEL_WEIGHT',
                        'status'               => 'PENDING_RECEIPT',
                        'total_ordered_weight' => round($totalWeight99, 3),
                        'uom'                  => 'TON',
                        'unit_price'           => $unitPrice99,
                        'total_amount'         => round($totalWeight99 * $unitPrice99, 2),
                        'notes'                => 'وزنة حديد مجمعة (سقف الأرضي 349 - المورد عبود)',
                        'created_by_user_id'   => $po99->created_by_user_id ?: 1,
                    ]);

                    foreach ($itemsData99 as $d) {
                        $wg99->items()->create($d);
                    }

                    AuditLog::create([
                        'user_id'     => $po99->created_by_user_id ?: 1,
                        'entity_type' => WeighingGroup::class,
                        'entity_id'   => $wg99->id,
                        'action'      => 'STEEL_WEIGHT_GROUP_AUTO_MERGED',
                        'field_name'  => 'status',
                        'old_value'   => null,
                        'new_value'   => "دمج PO-100 في PO-99 بوزنة إجمالية {$totalWeight99} طن",
                    ]);
                }
            }

            // ══════════════════════════════════════════════════════════════════
            // المجموعة الثانية: PO-105 و PO-106 (المورد: حسان | طلب PR-57 | سقف الأول علوي 818)
            // ══════════════════════════════════════════════════════════════════
            $po105 = $findOrder('PO-105', 105);
            $po106 = $findOrder('PO-106', 106);

            if ($po105 && $po106 && $po105->id !== $po106->id) {
                Log::info("Merging PO-106 into PO-105 as a single consolidated steel weighing group");

                // 1. Move items from PO-106 to PO-105
                PurchaseOrderItem::where('purchase_order_id', $po106->id)->update([
                    'purchase_order_id' => $po105->id,
                ]);

                // 2. Void PO-106 so it completely disappears from warehouse receipt queue
                $po106->update([
                    'status' => 'VOIDED',
                    'delivery_status' => 'COMPLETED',
                    'notes' => trim(($po106->notes ?? '') . ' | تم دمج بنود أمر الشراء بالكامل في أمر الشراء PO-105 كوزنة حديد مجمعة واحدة بناءً على طلب الإدارة.'),
                ]);

                // Remove any pending draft receipts for PO-106
                PurchaseReceipt::withoutGlobalScope(\App\Scopes\DataIsolationScope::class)
                    ->where('purchase_order_id', $po106->id)
                    ->whereIn('status', ['DRAFT', 'PENDING_SITE_ENGINEER'])
                    ->delete();

                // 3. Refresh PO-105 items and recalculate totals
                $po105->refresh();
                $po105Items = $po105->items;
                $newSubtotal105 = (float) $po105Items->sum('line_total');

                $po105->update([
                    'subtotal' => $newSubtotal105,
                    'total_amount' => $newSubtotal105,
                    'grand_total' => $newSubtotal105,
                ]);

                // 4. Create active WeighingGroup on PO-105 if not already exists
                $existingWg105 = WeighingGroup::where('purchase_order_id', $po105->id)
                    ->where('status', '!=', 'CANCELLED')
                    ->first();

                if (! $existingWg105) {
                    $totalWeight105 = 0.0;
                    $itemsData105 = [];
                    $unitPrice105 = 0.0;

                    foreach ($po105Items as $it) {
                        $w = $service->calculateWeightInTons($it);
                        $totalWeight105 += $w;
                        if ($unitPrice105 <= 0 && (float) $it->unit_price > 0) {
                            $unitPrice105 = (float) $it->unit_price;
                        }

                        $itemsData105[] = [
                            'purchase_order_item_id' => $it->id,
                            'item_description'       => $it->item_description,
                            'size_or_diameter'       => $service->extractSizeOrDiameter($it),
                            'ordered_weight'         => $w,
                            'received_weight'        => null,
                            'uom'                    => 'TON',
                            'unit_price'             => (float) $it->unit_price,
                            'line_total'             => (float) $it->line_total,
                            'region'                 => $it->region,
                            'land_plot_number'       => $it->item_reference,
                            'purpose'                => $it->specifications,
                        ];
                    }

                    $groupNum105 = $service->generateUniqueGroupNumber();

                    $wg105 = WeighingGroup::create([
                        'group_number'         => $groupNum105,
                        'purchase_order_id'    => $po105->id,
                        'supplier_id'          => $po105->supplier_id,
                        'group_type'           => 'STEEL_WEIGHT',
                        'status'               => 'PENDING_RECEIPT',
                        'total_ordered_weight' => round($totalWeight105, 3),
                        'uom'                  => 'TON',
                        'unit_price'           => $unitPrice105,
                        'total_amount'         => round($totalWeight105 * $unitPrice105, 2),
                        'notes'                => 'وزنة حديد مجمعة (سقف الأول علوي 818 - المورد حسان)',
                        'created_by_user_id'   => $po105->created_by_user_id ?: 1,
                    ]);

                    foreach ($itemsData105 as $d) {
                        $wg105->items()->create($d);
                    }

                    AuditLog::create([
                        'user_id'     => $po105->created_by_user_id ?: 1,
                        'entity_type' => WeighingGroup::class,
                        'entity_id'   => $wg105->id,
                        'action'      => 'STEEL_WEIGHT_GROUP_AUTO_MERGED',
                        'field_name'  => 'status',
                        'old_value'   => null,
                        'new_value'   => "دمج PO-106 في PO-105 بوزنة إجمالية {$totalWeight105} طن",
                    ]);
                }
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Safe no-op on production
    }
};
