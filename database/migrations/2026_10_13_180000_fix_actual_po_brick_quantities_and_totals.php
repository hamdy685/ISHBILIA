<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Correct any PO items, receipts and PO totals where brick quantities were entered in single pieces (e.g. 9360)
     * instead of thousand bricks (9.36 ألف طوبة), specifically fixing PO-65, PO-67 and inflated totals.
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

                // If quantity was entered as single bricks (e.g. 9360) while price is per thousand (e.g. 2800)
                if ($qty >= 100 && $price >= 500) {
                    $qty = round($qty / 1000, 3); // 9360 -> 9.36
                }

                $lineTotal = round($qty * $price, 2);
                $recalculatedTotal += $lineTotal;

                DB::table('purchase_order_items')
                    ->where('id', $item->id)
                    ->update([
                        'quantity'   => $qty,
                        'line_total' => $lineTotal,
                    ]);

                // Also update any matching purchase_receipt_items
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

        // 2. Generic check for any other purchase_order_items where unit is thousand bricks and quantity >= 100 and price >= 500
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
            // Ignore cache error in migration
        }
    }

    public function down(): void
    {
        // Non-destructive data repair migration
    }
};
