<?php

use App\Models\AuditLog;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\PurchaseReceipt;
use App\Models\WeighingGroup;
use App\Models\WeighingGroupItem;
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

            // ──────────────────────────────────────────────────────────────────
            // 0. Revert accidental touch on PO-96/PO-97 and PO-102/PO-103
            // ──────────────────────────────────────────────────────────────────
            $accidentalWgIds = [7, 8];
            WeighingGroupItem::whereIn('weighing_group_id', $accidentalWgIds)->delete();
            WeighingGroup::whereIn('id', $accidentalWgIds)->delete();

            // Restore PO-97 (id 100) and PO-103 (id 106) if they were marked VOIDED by mistake
            $po97 = PurchaseOrder::withoutGlobalScope(\App\Scopes\DataIsolationScope::class)->where('po_number', 'PO-97')->first();
            if ($po97 && $po97->status === 'VOIDED') {
                $po97->update([
                    'status' => 'ISSUED',
                    'delivery_status' => 'PENDING',
                ]);
            }

            $po103 = PurchaseOrder::withoutGlobalScope(\App\Scopes\DataIsolationScope::class)->where('po_number', 'PO-103')->first();
            if ($po103 && $po103->status === 'VOIDED') {
                $po103->update([
                    'status' => 'ISSUED',
                    'delivery_status' => 'PENDING',
                ]);
            }

            // ──────────────────────────────────────────────────────────────────
            // 1. Group 1: PO-99 (ID 102) & PO-100 (ID 103) - Supplier: عبود
            // ──────────────────────────────────────────────────────────────────
            $po99 = PurchaseOrder::withoutGlobalScope(\App\Scopes\DataIsolationScope::class)
                ->where('po_number', 'PO-99')
                ->first();

            $po100 = PurchaseOrder::withoutGlobalScope(\App\Scopes\DataIsolationScope::class)
                ->where('po_number', 'PO-100')
                ->first();

            if ($po99 && $po100 && $po99->id !== $po100->id) {
                Log::info("Merging PO-100 (ID: {$po100->id}) into PO-99 (ID: {$po99->id})");

                // Move items from PO-100 to PO-99
                PurchaseOrderItem::where('purchase_order_id', $po100->id)->update([
                    'purchase_order_id' => $po99->id,
                ]);

                // Void PO-100
                $po100->update([
                    'status' => 'VOIDED',
                    'delivery_status' => 'COMPLETED',
                    'notes' => trim(($po100->notes ?? '') . ' | تم دمج بنود أمر الشراء بالكامل في أمر الشراء PO-99 كوزنة حديد مجمعة (4.40 طن).'),
                ]);

                // Delete any draft/pending receipts on PO-100
                PurchaseReceipt::withoutGlobalScope(\App\Scopes\DataIsolationScope::class)
                    ->where('purchase_order_id', $po100->id)
                    ->whereIn('status', ['DRAFT', 'PENDING_SITE_ENGINEER'])
                    ->delete();

                // Recalculate PO-99 totals
                $po99->refresh();
                $po99Items = $po99->items;
                $newSubtotal99 = (float) $po99Items->sum('line_total');

                $po99->update([
                    'subtotal'     => $newSubtotal99,
                    'total_amount' => $newSubtotal99,
                    'grand_total'  => $newSubtotal99,
                ]);

                // Create Weighing Group for PO-99 (ID 102)
                $existingWg99 = WeighingGroup::where('purchase_order_id', $po99->id)
                    ->where('status', '!=', 'CANCELLED')
                    ->first();

                if (! $existingWg99) {
                    $totalWeight99 = 0.0;
                    $itemsData99 = [];
                    $unitPrice99 = 41500.0;

                    foreach ($po99Items as $it) {
                        $w = $service->calculateWeightInTons($it);
                        $totalWeight99 += $w;
                        if ((float) $it->unit_price > 0) {
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

                    $wg99 = WeighingGroup::create([
                        'group_number'         => $service->generateUniqueGroupNumber(),
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

            // ──────────────────────────────────────────────────────────────────
            // 2. Group 2: PO-105 (ID 108) & PO-106 (ID 109) - Supplier: حسان
            // ──────────────────────────────────────────────────────────────────
            $po105 = PurchaseOrder::withoutGlobalScope(\App\Scopes\DataIsolationScope::class)
                ->where('po_number', 'PO-105')
                ->first();

            $po106 = PurchaseOrder::withoutGlobalScope(\App\Scopes\DataIsolationScope::class)
                ->where('po_number', 'PO-106')
                ->first();

            if ($po105 && $po106 && $po105->id !== $po106->id) {
                Log::info("Merging PO-106 (ID: {$po106->id}) into PO-105 (ID: {$po105->id})");

                // Move items from PO-106 to PO-105
                PurchaseOrderItem::where('purchase_order_id', $po106->id)->update([
                    'purchase_order_id' => $po105->id,
                ]);

                // Void PO-106
                $po106->update([
                    'status' => 'VOIDED',
                    'delivery_status' => 'COMPLETED',
                    'notes' => trim(($po106->notes ?? '') . ' | تم دمج بنود أمر الشراء بالكامل في أمر الشراء PO-105 كوزنة حديد مجمعة (1.45 طن).'),
                ]);

                // Delete any draft/pending receipts on PO-106
                PurchaseReceipt::withoutGlobalScope(\App\Scopes\DataIsolationScope::class)
                    ->where('purchase_order_id', $po106->id)
                    ->whereIn('status', ['DRAFT', 'PENDING_SITE_ENGINEER'])
                    ->delete();

                // Recalculate PO-105 totals
                $po105->refresh();
                $po105Items = $po105->items;
                $newSubtotal105 = (float) $po105Items->sum('line_total');

                $po105->update([
                    'subtotal'     => $newSubtotal105,
                    'total_amount' => $newSubtotal105,
                    'grand_total'  => $newSubtotal105,
                ]);

                // Create Weighing Group for PO-105 (ID 108)
                $existingWg105 = WeighingGroup::where('purchase_order_id', $po105->id)
                    ->where('status', '!=', 'CANCELLED')
                    ->first();

                if (! $existingWg105) {
                    $totalWeight105 = 0.0;
                    $itemsData105 = [];
                    $unitPrice105 = 41500.0;

                    foreach ($po105Items as $it) {
                        $w = $service->calculateWeightInTons($it);
                        $totalWeight105 += $w;
                        if ((float) $it->unit_price > 0) {
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

                    $wg105 = WeighingGroup::create([
                        'group_number'         => $service->generateUniqueGroupNumber(),
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
