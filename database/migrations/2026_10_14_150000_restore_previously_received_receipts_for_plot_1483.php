<?php

use App\Models\ApprovalHistory;
use App\Models\PurchaseOrder;
use App\Models\PurchaseReceipt;
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
            // Unwanted receipts in pending tasks that were already received:
            // REC-47 (84), REC-35 (66), REC-34 (65), REC-33 (64), REC-32 (63)
            $completedReceiptIds = [84, 66, 65, 64, 63];

            Log::info('Restoring previously received receipts to APPROVED: ' . implode(',', $completedReceiptIds));

            $receipts = PurchaseReceipt::withoutGlobalScope(\App\Scopes\DataIsolationScope::class)
                ->whereIn('id', $completedReceiptIds)
                ->get();

            $actorId = DB::table('users')->where('is_active', true)->first()?->id ?? 18;

            foreach ($receipts as $receipt) {
                $oldStatus = $receipt->status;

                $receipt->update([
                    'status' => 'APPROVED',
                    'site_engineer_approved_at' => now(),
                    'receiver_approved_at' => now(),
                    'site_engineer_notes' => 'تم الاستلام والمعاينة الهندسية مسبقاً بالموقع',
                ]);

                ApprovalHistory::create([
                    'target_type' => PurchaseReceipt::class,
                    'target_id' => $receipt->id,
                    'actor_user_id' => $actorId,
                    'action' => 'RECEIPT_APPROVED',
                    'from_state' => $oldStatus,
                    'to_state' => 'APPROVED',
                    'comments' => "تأكيد اكتمال استلام إذن {$receipt->receipt_number} بالموقع مسبقاً وإخراجه من قائمة المهام المعلقة للمهندس حاتم.",
                ]);
            }

            // Also update associated Purchase Orders (PO-73, PO-78, PO-79, PO-80, PO-81) to DELIVERED
            $poIds = [73, 78, 79, 80, 81];
            PurchaseOrder::withoutGlobalScope(\App\Scopes\DataIsolationScope::class)
                ->whereIn('id', $poIds)
                ->update([
                    'delivery_status' => 'DELIVERED',
                ]);

            // Ensure the 6 target receipts remain strictly in PENDING_SITE_ENGINEER for Hatem (User ID 18)
            $targetReceiptIds = [54, 55, 56, 57, 58, 59];
            $updateData = [
                'status' => 'PENDING_SITE_ENGINEER',
                'site_engineer_user_id' => 18,
                'receiver_user_id' => 18,
                'actual_receiver_user_id' => 18,
                'site_engineer_approved_at' => null,
                'receiver_approved_at' => null,
                'accountant_recorded_at' => null,
            ];
            if (\Illuminate\Support\Facades\Schema::hasColumn('purchase_receipts', 'is_accountant_recorded')) {
                $updateData['is_accountant_recorded'] = false;
            }
            PurchaseReceipt::withoutGlobalScope(\App\Scopes\DataIsolationScope::class)
                ->whereIn('id', $targetReceiptIds)
                ->update($updateData);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // No-op
    }
};
