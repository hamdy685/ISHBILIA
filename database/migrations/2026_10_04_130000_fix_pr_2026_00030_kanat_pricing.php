<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Correct PR-2026-00030 or any PR with suspicious rebar/kanat pricing in KG
        $prs = DB::table('purchase_requests')
            ->where('request_number', 'PR-2026-00030')
            ->orWhereExists(function ($query) {
                $query->select(DB::raw(1))
                    ->from('purchase_request_items')
                    ->whereColumn('purchase_request_items.purchase_request_id', 'purchase_requests.id')
                    ->where(function ($dq) {
                        $dq->where('item_description', 'like', '%كانات%')
                           ->orWhere('item_description', 'like', '%حديد%');
                    })
                    ->where('estimated_unit_price', '>', 500)
                    ->where(function ($uq) {
                        $uq->whereIn(DB::raw('UPPER(uom)'), ['KG', 'KILOGRAM', 'كجم'])
                           ->orWhere('uom', 'like', '%كيلو%');
                    });
            })
            ->get();

        foreach ($prs as $pr) {
            $items = DB::table('purchase_request_items')
                ->where('purchase_request_id', $pr->id)
                ->get();

            $newPrTotal = 0.0;
            foreach ($items as $item) {
                $isKanatInKg = (str_contains($item->item_description, 'كانات') || str_contains($item->item_description, 'حديد'))
                    && (float)$item->estimated_unit_price > 500
                    && (in_array(strtoupper((string)($item->uom ?? '')), ['KG', 'KILOGRAM', 'كجم']) || str_contains((string)($item->uom ?? ''), 'كيلو'));

                if ($isKanatInKg) {
                    $oldQty = (float)$item->quantity;
                    $tonQty = round($oldQty / 1000, 3);
                    $tonPrice = (float)$item->estimated_unit_price;
                    $lineTotal = round($tonQty * $tonPrice, 2);

                    DB::table('purchase_request_items')->where('id', $item->id)->update([
                        'quantity' => $tonQty,
                        'uom' => 'TON',
                        'specifications' => trim(($item->specifications ? $item->specifications . ' • ' : '') . "الكمية الأصلية: {$oldQty} كجم"),
                        'estimated_unit_price' => $tonPrice,
                        'estimated_line_total' => $lineTotal,
                    ]);

                    $newPrTotal += $lineTotal;
                } else {
                    $newPrTotal += (float)$item->estimated_line_total;
                }
            }

            DB::table('purchase_requests')->where('id', $pr->id)->update([
                'total_estimated_cost' => round($newPrTotal, 2),
            ]);
        }
    }

    public function down(): void
    {
        // Data fix only
    }
};
