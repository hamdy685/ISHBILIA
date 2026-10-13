<?php

use App\Models\ApprovalHistory;
use App\Models\PurchaseOrder;
use App\Models\PurchaseReceipt;
use App\Models\PurchaseReceiptItem;
use App\Models\WeighingGroup;
use App\Models\WeighingGroupItem;
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
        // 1. Identify admin or procurement manager user
        $userId = DB::table('users')->first()?->id ?? 1;

        // Find engineer Youssef user id
        $youssefId = DB::table('users')
            ->where('name', 'like', '%يوسف%')
            ->orWhere('email', 'like', '%youssef%')
            ->value('id');

        // Determine next sequence for weighing group
        $nextWgSeq = 1;
        $existingMaxWg = DB::table('weighing_groups')->pluck('group_number');
        foreach ($existingMaxWg as $gn) {
            if (preg_match('/WG-(\d+)/i', (string) $gn, $m)) {
                $num = (int) $m[1];
                if ($num >= $nextWgSeq) {
                    $nextWgSeq = $num + 1;
                }
            }
        }

        /*
         |--------------------------------------------------------------------------
         | 2. Handle PO-58 (PR-51 / PR-21) - Remove from Youssef & Group Weight
         |--------------------------------------------------------------------------
         */
        $po58 = PurchaseOrder::withoutGlobalScope(\App\Scopes\DataIsolationScope::class)
            ->with(['items', 'purchaseRequest'])
            ->where(function ($q) {
                $q->where('po_number', 'PO-58')
                  ->orWhere('po_number', 'like', '%PO-58%')
                  ->orWhereHas('purchaseRequest', function ($prQ) {
                      $prQ->whereIn('request_number', ['PR-51', 'PR-21'])
                          ->orWhere('id', 51);
                  });
            })
            ->first();

        if ($po58) {
            // Delete all pending / site engineer / warehouse receipts for PO-58 so Youssef has 0 receipts
            $receipts58 = PurchaseReceipt::withoutGlobalScope(\App\Scopes\DataIsolationScope::class)
                ->where('purchase_order_id', $po58->id)
                ->whereIn('status', ['PENDING_SITE_ENGINEER', 'PENDING_WAREHOUSE', 'REJECTED'])
                ->get();

            foreach ($receipts58 as $rec) {
                PurchaseReceiptItem::where('purchase_receipt_id', $rec->id)->delete();
                ApprovalHistory::where('target_type', PurchaseReceipt::class)->where('target_id', $rec->id)->delete();
                $rec->delete();
            }

            // Reset PO delivery status to PENDING
            $po58->update(['delivery_status' => 'PENDING']);

            // Remove previous weighing groups for PO-58
            $oldWgs58 = WeighingGroup::where('purchase_order_id', $po58->id)->get();
            foreach ($oldWgs58 as $owg) {
                WeighingGroupItem::where('weighing_group_id', $owg->id)->delete();
                $owg->delete();
            }

            // Create fresh Steel Weighing Group for PO-58
            $steelItems58 = $po58->items;
            $totalOrdered58 = (float) $steelItems58->sum('quantity');

            $wg58 = WeighingGroup::create([
                'group_number'         => "WG-{$nextWgSeq}",
                'purchase_order_id'    => $po58->id,
                'supplier_id'          => $po58->supplier_id,
                'group_type'           => 'STEEL_WEIGHT',
                'status'               => 'PENDING_RECEIPT',
                'total_ordered_weight' => round($totalOrdered58 > 0 ? $totalOrdered58 : 5.06, 3),
                'uom'                  => 'TON',
                'notes'                => 'تجميع وزنة حديد سقف الثاني علوي - قطعة 1165 منطقة 22',
                'created_by_user_id'   => $userId,
            ]);
            $nextWgSeq++;

            foreach ($steelItems58 as $item) {
                $wg58->items()->create([
                    'purchase_order_item_id' => $item->id,
                    'item_description'       => $item->item_description,
                    'size_or_diameter'       => $this->extractDiameter($item->item_description),
                    'ordered_weight'         => (float) $item->quantity,
                    'received_weight'        => null,
                    'uom'                    => 'TON',
                    'unit_price'             => (float) $item->unit_price,
                    'line_total'             => (float) $item->line_total,
                    'region'                 => $item->region ?? '22',
                    'land_plot_number'       => $item->item_reference ?? '1165',
                    'purpose'                => $item->specifications ?? 'سقف الثاني علوي',
                ]);
            }
        }

        /*
         |--------------------------------------------------------------------------
         | 3. Handle PO-70 (PR-40) - Remove from Youssef & Group Weight
         |--------------------------------------------------------------------------
         */
        $po70 = PurchaseOrder::withoutGlobalScope(\App\Scopes\DataIsolationScope::class)
            ->with(['items', 'purchaseRequest'])
            ->where(function ($q) {
                $q->where('po_number', 'PO-70')
                  ->orWhere('po_number', 'like', '%PO-70%')
                  ->orWhereHas('purchaseRequest', function ($prQ) {
                      $prQ->where('request_number', 'PR-40')
                          ->orWhere('id', 40);
                  });
            })
            ->first();

        if ($po70) {
            // Delete any pending / site engineer / warehouse receipts for PO-70 so Youssef has 0 receipts
            $receipts70 = PurchaseReceipt::withoutGlobalScope(\App\Scopes\DataIsolationScope::class)
                ->where('purchase_order_id', $po70->id)
                ->whereIn('status', ['PENDING_SITE_ENGINEER', 'PENDING_WAREHOUSE', 'REJECTED'])
                ->get();

            foreach ($receipts70 as $rec) {
                PurchaseReceiptItem::where('purchase_receipt_id', $rec->id)->delete();
                ApprovalHistory::where('target_type', PurchaseReceipt::class)->where('target_id', $rec->id)->delete();
                $rec->delete();
            }

            // Reset PO delivery status to PENDING
            $po70->update(['delivery_status' => 'PENDING']);

            // Remove previous weighing groups for PO-70
            $oldWgs70 = WeighingGroup::where('purchase_order_id', $po70->id)->get();
            foreach ($oldWgs70 as $owg) {
                WeighingGroupItem::where('weighing_group_id', $owg->id)->delete();
                $owg->delete();
            }

            // Create fresh Steel Weighing Group for PO-70
            $steelItems70 = $po70->items;
            $totalOrdered70 = (float) $steelItems70->sum('quantity');

            $wg70 = WeighingGroup::create([
                'group_number'         => "WG-{$nextWgSeq}",
                'purchase_order_id'    => $po70->id,
                'supplier_id'          => $po70->supplier_id,
                'group_type'           => 'STEEL_WEIGHT',
                'status'               => 'PENDING_RECEIPT',
                'total_ordered_weight' => round($totalOrdered70 > 0 ? $totalOrdered70 : 4.86, 3),
                'uom'                  => 'TON',
                'notes'                => 'تجميع وزنة حديد سقف الثاني علوي - قطعة 1483 منطقة 29',
                'created_by_user_id'   => $userId,
            ]);
            $nextWgSeq++;

            foreach ($steelItems70 as $item) {
                $wg70->items()->create([
                    'purchase_order_item_id' => $item->id,
                    'item_description'       => $item->item_description,
                    'size_or_diameter'       => $this->extractDiameter($item->item_description),
                    'ordered_weight'         => (float) $item->quantity,
                    'received_weight'        => null,
                    'uom'                    => 'TON',
                    'unit_price'             => (float) $item->unit_price,
                    'line_total'             => (float) $item->line_total,
                    'region'                 => $item->region ?? '29',
                    'land_plot_number'       => $item->item_reference ?? '1483',
                    'purpose'                => $item->specifications ?? 'سقف الثاني علوي',
                ]);
            }
        }

        // 4. Extra sweep: If Youssef has any remaining pending receipts for steel orders, remove them
        if ($youssefId) {
            $youssefSteelReceipts = PurchaseReceipt::withoutGlobalScope(\App\Scopes\DataIsolationScope::class)
                ->where('site_engineer_user_id', $youssefId)
                ->where('status', 'PENDING_SITE_ENGINEER')
                ->whereHas('purchaseOrder', function ($poQ) {
                    $poQ->whereIn('po_number', ['PO-58', 'PO-70'])
                        ->orWhereIn('id', [58, 70]);
                })
                ->get();

            foreach ($youssefSteelReceipts as $yr) {
                PurchaseReceiptItem::where('purchase_receipt_id', $yr->id)->delete();
                ApprovalHistory::where('target_type', PurchaseReceipt::class)->where('target_id', $yr->id)->delete();
                $yr->delete();
            }
        }
    }

    /**
     * Extract diameter name.
     */
    private function extractDiameter(?string $desc): string
    {
        $desc = (string) $desc;
        if (preg_match('/(\d+(?:\.\d+)?)\s*(?:مم|ملل|لنية|لينية|mm)/iu', $desc, $m)) {
            return trim($m[0]);
        }
        if (str_contains($desc, '3 لنيه') || str_contains($desc, '3 لينية')) return '3 لينية';
        if (str_contains($desc, '4 لنيه') || str_contains($desc, '4 لينية')) return '4 لينية';
        if (str_contains($desc, '5 لنيه') || str_contains($desc, '5 لينية')) return '5 لينية';
        if (str_contains($desc, '8 مم') || str_contains($desc, '8مم')) return '8 مم';
        return $desc;
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Safe reversible no-op
    }
};
