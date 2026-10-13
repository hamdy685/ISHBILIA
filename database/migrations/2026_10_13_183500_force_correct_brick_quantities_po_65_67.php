<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Force correct brick quantities and recalculate PO totals for PO-65, PO-67 and any inflated brick items.
     */
    public function up(): void
    {
        if (! Schema::hasTable('purchase_orders') || ! Schema::hasTable('purchase_order_items')) {
            return;
        }

        // 1. Explicitly fix PO-65 and PO-67
        $targetPos = DB::table('purchase_orders')
            ->whereIn('po_number', ['PO-65', 'PO-67', 'PO-2026-00065', 'PO-2026-00067', 'PO-2026-65', 'PO-2026-67'])
            ->orWhere('po_number', 'LIKE', '%-65')
            ->orWhere('po_number', 'LIKE', '%-67')
            ->orWhereIn('id', [65, 67])
            ->get();

        foreach ($targetPos as $po) {
            $items = DB::table('purchase_order_items')
                ->where('purchase_order_id', $po->id)
                ->get();

            $recalculatedTotal = 0;

            foreach ($items as $item) {
                $qty = (float) $item->quantity;
                $price = (float) $item->unit_price;

                if ($qty >= 100 && $price >= 500) {
                    $qty = round($qty / 1000, 3); // e.g. 9360 -> 9.36
                }

                $lineTotal = round($qty * $price, 2);
                $recalculatedTotal += $lineTotal;

                DB::table('purchase_order_items')
                    ->where('id', $item->id)
                    ->update([
                        'quantity'   => $qty,
                        'line_total' => $lineTotal,
                    ]);

                if (Schema::hasTable('purchase_receipt_items')) {
                    DB::table('purchase_receipt_items')
                        ->where('purchase_order_item_id', $item->id)
                        ->where('received_quantity', '>=', 100)
                        ->update([
                            'received_quantity' => $qty,
                        ]);
                }
            }

            if ($recalculatedTotal > 0) {
                DB::table('purchase_orders')
                    ->where('id', $po->id)
                    ->update([
                        'subtotal'    => $recalculatedTotal,
                        'grand_total' => $recalculatedTotal,
                    ]);
            }
        }

        // 2. Generic scan for any other thousand-brick items
        $inflatedItems = DB::table('purchase_order_items')
            ->where(function ($q) {
                $q->where('uom', 'THOUSAND_BRICKS')
                    ->orWhere('uom', 'LIKE', '%طوبة%')
                    ->orWhere('uom', 'LIKE', '%طوب%')
                    ->orWhere('uom', 'LIKE', '%ألف%')
                    ->orWhere('uom', 'LIKE', '%الف%')
                    ->orWhere('item_description', 'LIKE', '%طوب%');
            })
            ->where('quantity', '>=', 100)
            ->where('unit_price', '>=', 500)
            ->get();

        $affectedPoIds = [];

        foreach ($inflatedItems as $item) {
            $qty = round(((float) $item->quantity) / 1000, 3);
            $lineTotal = round($qty * ((float) $item->unit_price), 2);

            DB::table('purchase_order_items')
                ->where('id', $item->id)
                ->update([
                    'quantity'   => $qty,
                    'line_total' => $lineTotal,
                ]);

            if (Schema::hasTable('purchase_receipt_items')) {
                DB::table('purchase_receipt_items')
                    ->where('purchase_order_item_id', $item->id)
                    ->where('received_quantity', '>=', 100)
                    ->update([
                        'received_quantity' => $qty,
                    ]);
            }

            $affectedPoIds[$item->purchase_order_id] = true;
        }

        foreach (array_keys($affectedPoIds) as $poId) {
            $sum = (float) DB::table('purchase_order_items')
                ->where('purchase_order_id', $poId)
                ->sum('line_total');

            if ($sum > 0) {
                DB::table('purchase_orders')
                    ->where('id', $poId)
                    ->update([
                        'subtotal'    => $sum,
                        'grand_total' => $sum,
                    ]);
            }
        }

        try {
            Cache::flush();
        } catch (\Throwable) {
        }
    }

    public function down(): void
    {
    }
};
