<?php

use App\Models\ApprovalHistory;
use App\Models\PurchaseOrder;
use App\Models\PurchaseReceipt;
use App\Models\PurchaseRequest;
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
            // 1. Identify official Hatem user (User ID 18)
            $hatem = DB::table('users')->where('id', 18)->first();
            if (! $hatem || (! str_contains($hatem->email, 'hatem') && ! str_contains($hatem->name, 'حاتم'))) {
                $hatem = DB::table('users')->where('email', 'like', '%hatem%')->first();
            }

            $hatemId = $hatem?->id ?? 18;
            $actorId = DB::table('users')->where('is_active', true)->first()?->id ?? 1;

            Log::info("Reassigning receipts for plots 1518 and 1483 to Hatem (User ID: {$hatemId})");

            // 2. Identify the target receipts for PR-24 (plot 1518) and PR-22 (plot 1483)
            $targetReceiptIds = [54, 55, 56, 57, 58, 59];

            // Also find by relations to ensure 100% coverage
            $extraReceiptIds = PurchaseReceipt::withoutGlobalScope(\App\Scopes\DataIsolationScope::class)
                ->whereHas('purchaseRequest', function ($prQ) {
                    $prQ->whereIn('request_number', ['PR-22', 'PR-24'])
                        ->orWhereIn('parcel_reference', ['1518', '1483']);
                })
                ->orWhereHas('purchaseOrder', function ($poQ) {
                    $poQ->whereIn('po_number', ['PO-64', 'PO-65', 'PO-66', 'PO-67', 'PO-68', 'PO-69']);
                })
                ->pluck('id')
                ->all();

            $allReceiptIds = array_unique(array_merge($targetReceiptIds, $extraReceiptIds));

            $receipts = PurchaseReceipt::withoutGlobalScope(\App\Scopes\DataIsolationScope::class)
                ->whereIn('id', $allReceiptIds)
                ->get();

            foreach ($receipts as $receipt) {
                $oldStatus = $receipt->status;
                $oldOwnerId = $receipt->site_engineer_user_id ?: $receipt->receiver_user_id;

                // Reset and rollback receipt to PENDING_SITE_ENGINEER
                $receipt->update([
                    'status' => 'PENDING_SITE_ENGINEER',
                    'site_engineer_user_id' => $hatemId,
                    'receiver_user_id' => $hatemId,
                    'actual_receiver_user_id' => $hatemId,
                    'site_engineer_approved_at' => null,
                    'receiver_approved_at' => null,
                    'accountant_recorded_at' => null,
                    'accountant_recorded_by_user_id' => null,
                    'accountant_recording_notes' => null,
                    'site_engineer_notes' => null,
                ]);

                // Record audit log
                ApprovalHistory::create([
                    'target_type' => PurchaseReceipt::class,
                    'target_id' => $receipt->id,
                    'actor_user_id' => $actorId,
                    'action' => 'RECEIPT_REASSIGNED_TO_SITE_ENGINEER',
                    'from_state' => $oldStatus,
                    'to_state' => 'PENDING_SITE_ENGINEER',
                    'comments' => "إلغاء التسجيل المحاسبي وفك قفل أمر الشراء الفعلي وإعادة توجيه إذن الاستلام {$receipt->receipt_number} إلى م. حاتم لإدخال الكميات المستلمة فعلياً لكل بند.",
                ]);
            }

            // 3. Reset associated Purchase Orders (PO-64 through PO-69)
            $poIds = [67, 68, 69, 70, 71, 72];
            $extraPoIds = PurchaseOrder::withoutGlobalScope(\App\Scopes\DataIsolationScope::class)
                ->whereIn('po_number', ['PO-64', 'PO-65', 'PO-66', 'PO-67', 'PO-68', 'PO-69'])
                ->pluck('id')
                ->all();

            $allPoIds = array_unique(array_merge($poIds, $extraPoIds));

            PurchaseOrder::withoutGlobalScope(\App\Scopes\DataIsolationScope::class)
                ->whereIn('id', $allPoIds)
                ->update([
                    'delivery_status' => 'PENDING',
                    'finalized_at' => null,
                    'finalized_by_user_id' => null,
                    'finalization_notes' => null,
                ]);

            // 4. Ensure site_engineer_user_id is set to Hatem on PR-22 and PR-24
            PurchaseRequest::withoutGlobalScope(\App\Scopes\DataIsolationScope::class)
                ->whereIn('request_number', ['PR-22', 'PR-24'])
                ->orWhereIn('id', [33, 35])
                ->update([
                    'site_engineer_user_id' => $hatemId,
                ]);

            // 5. Send notification to Hatem for pending receipts
            foreach ($receipts as $receipt) {
                try {
                    \App\Models\Notification::create([
                        'user_id' => $hatemId,
                        'type' => 'receipt_pending_site_engineer',
                        'data' => [
                            'receipt_id' => $receipt->id,
                            'receipt_number' => $receipt->receipt_number,
                            'title' => "إذن استلام بانتظار فحصك الهندسي وتأكيد الكميات: {$receipt->receipt_number}",
                            'message' => "يوجد إذن استلام يحتاج إدخال الكمية المستلمة فعلياً للبند الميداني.",
                            'action_url' => "/site-engineer?receipt_id={$receipt->id}",
                        ],
                    ]);
                } catch (\Throwable) {
                    // Ignore duplicate notification constraint
                }
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // No-op rollback to maintain data integrity
    }
};
