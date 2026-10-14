<?php

use App\Models\ApprovalHistory;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\PurchaseReceipt;
use App\Models\PurchaseReceiptItem;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestItem;
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
            // Target duplicate purchase orders (PO-75, PO-76, PO-77, PO-78)
            $poNumbers = ['PO-75', 'PO-76', 'PO-77', 'PO-78'];
            $poIds = [78, 79, 80, 81];

            // Associated receipts (REC-32, REC-33, REC-34, REC-35)
            $receiptNumbers = ['REC-32', 'REC-33', 'REC-34', 'REC-35'];
            $receiptIds = [63, 64, 65, 66];

            // Associated purchase request (PR-36, ID 47)
            $prId = 47;

            Log::info("Purging duplicate POs: " . implode(',', $poNumbers) . " and receipts: " . implode(',', $receiptNumbers));

            // 1. Delete notifications referencing these receipts or POs
            DB::table('notifications')
                ->where(function ($q) use ($poIds, $receiptIds, $poNumbers, $receiptNumbers) {
                    $q->whereIn('purchase_order_id', $poIds)
                      ->orWhereIn('purchase_receipt_id', $receiptIds);

                    foreach ($poNumbers as $poNum) {
                        $q->orWhere('data', 'like', "%{$poNum}%");
                    }
                    foreach ($receiptNumbers as $recNum) {
                        $q->orWhere('data', 'like', "%{$recNum}%");
                    }
                })
                ->delete();

            // 2. Delete approval history entries
            DB::table('approval_history')
                ->where(function ($q) use ($poIds, $receiptIds, $prId) {
                    $q->where(function ($sq) use ($receiptIds) {
                        $sq->where('target_type', PurchaseReceipt::class)
                           ->whereIn('target_id', $receiptIds);
                    })->orWhere(function ($sq) use ($poIds) {
                        $sq->where('target_type', PurchaseOrder::class)
                           ->whereIn('target_id', $poIds);
                    })->orWhere(function ($sq) use ($prId) {
                        $sq->where('target_type', PurchaseRequest::class)
                           ->where('target_id', $prId);
                    });
                })
                ->delete();

            // 3. Delete receipt items and receipts
            DB::table('purchase_receipt_items')
                ->whereIn('purchase_receipt_id', $receiptIds)
                ->delete();

            DB::table('purchase_receipts')
                ->whereIn('id', $receiptIds)
                ->delete();

            // 4. Delete PO items and POs
            DB::table('purchase_order_items')
                ->whereIn('purchase_order_id', $poIds)
                ->delete();

            DB::table('purchase_orders')
                ->whereIn('id', $poIds)
                ->delete();

            // 5. Delete PR items and PR 47
            DB::table('purchase_request_items')
                ->where('purchase_request_id', $prId)
                ->delete();

            DB::table('purchase_requests')
                ->where('id', $prId)
                ->delete();

            Log::info("Successfully purged duplicate purchase orders 75-78, receipts 32-35, and PR 47.");
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // One-way cleanup migration of duplicate test/mistaken data
    }
};
