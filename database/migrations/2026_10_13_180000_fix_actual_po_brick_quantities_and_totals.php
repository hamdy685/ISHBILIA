<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Correct any PO items and PO totals where brick quantities were entered in single pieces (e.g. 9360)
     * instead of thousand bricks (9.36 ألف طوبة), specifically fixing PO-65, PO-67 and inflated totals.
     */
    public function up(): void
    {
        // 1. Explicitly fix PO-65 and PO-67 if inflated
        $targetPos = DB::table('purchase_orders')
            ->whereIn('po_number', ['PO-65', 'PO-67'])
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
                if ($qty >= 500 && $price >= 1000) {
                    $qty = round($qty / 1000, 3); // 9360 -> 9.36
                }

                $lineTotal = round($qty * $price, 2);
                $recalculatedTotal += $lineTotal;

                DB::table('purchase_order_items')
                    ->where('id', $item->id)
                    ->update([
                        'quantity' => $qty,
                        'actual_quantity' => $qty,
                        'line_total' => $lineTotal,
                        'actual_line_total' => $lineTotal,
                    ]);
            }

            if ($recalculatedTotal > 0) {
                DB::table('purchase_orders')
                    ->where('id', $po->id)
                    ->update([
                        'subtotal' => $recalculatedTotal,
                        'grand_total' => $recalculatedTotal,
                    ]);
            }
        }

        // 2. Generic check for any other purchase_order_items where unit is thousand bricks and quantity >= 500 and price >= 1000
        $inflatedItems = DB::table('purchase_order_items')
            ->where(function ($q) {
                $q->where('uom', 'THOUSAND_BRICKS')
                    ->orWhere('uom', 'LIKE', '%طوبة%')
                    ->orWhere('uom', 'LIKE', '%طوب%');
            })
            ->where('quantity', '>=', 500)
            ->where('unit_price', '>=', 1000)
            ->get();

        $affectedPoIds = [];

        foreach ($inflatedItems as $item) {
            $qty = round(((float) $item->quantity) / 1000, 3);
            $lineTotal = round($qty * ((float) $item->unit_price), 2);

            DB::table('purchase_order_items')
                ->where('id', $item->id)
                ->update([
                    'quantity' => $qty,
                    'actual_quantity' => $qty,
                    'line_total' => $lineTotal,
                    'actual_line_total' => $lineTotal,
                ]);

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
                        'subtotal' => $sum,
                        'grand_total' => $sum,
                    ]);
            }
        }
    }

    public function down(): void
    {
        // Non-destructive data migration
    }
};
