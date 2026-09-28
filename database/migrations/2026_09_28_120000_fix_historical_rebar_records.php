<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Fix PR #6 Item 11: حديد 4 لنيه (133 bars -> 1.383 TON)
        $prItem11 = DB::table('purchase_request_items')->where('id', 11)->first();
        if ($prItem11 && ($prItem11->uom === 'BAR' || (float)$prItem11->quantity > 10)) {
            DB::table('purchase_request_items')->where('id', 11)->update([
                'quantity' => 1.383,
                'uom' => 'TON',
                'specifications' => '133 سيخ 4 لينية',
                'estimated_unit_price' => 41000.00,
                'estimated_line_total' => 56711.20,
            ]);
        }

        // 2. Fix PR #8 Item 18: حديد 4 لنيه (40 bars -> 0.416 TON)
        $prItem18 = DB::table('purchase_request_items')->where('id', 18)->first();
        if ($prItem18 && ($prItem18->uom === 'BAR' || (float)$prItem18->quantity > 10)) {
            DB::table('purchase_request_items')->where('id', 18)->update([
                'quantity' => 0.416,
                'uom' => 'TON',
                'specifications' => '40 سيخ 4 لينية',
                'estimated_unit_price' => 41000.00,
                'estimated_line_total' => 17056.00,
            ]);
        }

        // 3. Fix PR #8 Item 19: حديد 5 لنيه (35 bars -> 0.665 TON)
        $prItem19 = DB::table('purchase_request_items')->where('id', 19)->first();
        if ($prItem19 && ($prItem19->uom === 'BAR' || (float)$prItem19->quantity > 10)) {
            DB::table('purchase_request_items')->where('id', 19)->update([
                'quantity' => 0.665,
                'uom' => 'TON',
                'specifications' => '35 سيخ 5 لينية',
                'estimated_unit_price' => 42000.00,
                'estimated_line_total' => 27930.00,
            ]);
        }

        // 4. Fix PR #11 Item 28: حديد ١٠ مم (40 bars -> 0.296 TON)
        $prItem28 = DB::table('purchase_request_items')->where('id', 28)->first();
        if ($prItem28 && ($prItem28->uom === 'BAR' || (float)$prItem28->quantity > 10)) {
            DB::table('purchase_request_items')->where('id', 28)->update([
                'quantity' => 0.296,
                'uom' => 'TON',
                'specifications' => '40 سيخ 3 لينية (10 مم)',
            ]);
        }

        // 5. Fix PO #6 Item 9: حديد 4 لنيه (133 bars -> 1.383 TON)
        $poItem9 = DB::table('purchase_order_items')->where('id', 9)->first();
        if ($poItem9 && ($poItem9->uom === 'BAR' || (float)$poItem9->quantity > 10)) {
            DB::table('purchase_order_items')->where('id', 9)->update([
                'quantity' => 1.383,
                'uom' => 'TON',
                'specifications' => '133 سيخ 4 لينية',
                'unit_price' => 41000.00,
                'line_total' => 56711.20,
            ]);
        }

        // 6. Fix PO #7 Item 11: حديد 4 لنيه (40 bars -> 0.416 TON)
        $poItem11 = DB::table('purchase_order_items')->where('id', 11)->first();
        if ($poItem11 && ($poItem11->uom === 'BAR' || (float)$poItem11->quantity > 10)) {
            DB::table('purchase_order_items')->where('id', 11)->update([
                'quantity' => 0.416,
                'uom' => 'TON',
                'specifications' => '40 سيخ 4 لينية',
                'unit_price' => 41000.00,
                'line_total' => 17056.00,
            ]);
        }

        // 7. Fix PO #7 Item 12: حديد 5 لنيه (35 bars -> 0.665 TON)
        $poItem12 = DB::table('purchase_order_items')->where('id', 12)->first();
        if ($poItem12 && ($poItem12->uom === 'BAR' || (float)$poItem12->quantity > 10)) {
            DB::table('purchase_order_items')->where('id', 12)->update([
                'quantity' => 0.665,
                'uom' => 'TON',
                'specifications' => '35 سيخ 5 لينية',
                'unit_price' => 42000.00,
                'line_total' => 27930.00,
            ]);
        }

        // Recalculate PR totals
        foreach ([6, 8, 11] as $prId) {
            $total = DB::table('purchase_request_items')
                ->where('purchase_request_id', $prId)
                ->sum('estimated_line_total');
            DB::table('purchase_requests')->where('id', $prId)->update([
                'total_estimated_cost' => $total,
            ]);
        }

        // Recalculate PO totals
        foreach ([6, 7] as $poId) {
            $subtotal = DB::table('purchase_order_items')
                ->where('purchase_order_id', $poId)
                ->sum('line_total');
            $po = DB::table('purchase_orders')->where('id', $poId)->first();
            if ($po) {
                $discount = (float)($po->discount_amount ?? 0);
                $tax = (float)($po->tax_amount ?? 0);
                $grandTotal = max(0, $subtotal - $discount + $tax);
                
                $updateData = [
                    'subtotal' => $subtotal,
                    'grand_total' => $grandTotal,
                ];
                if (Schema::hasColumn('purchase_orders', 'total_amount')) {
                    $updateData['total_amount'] = $grandTotal;
                }
                DB::table('purchase_orders')->where('id', $poId)->update($updateData);
            }
        }
    }

    public function down(): void
    {
        // One-time data correction; rollback not needed.
    }
};
