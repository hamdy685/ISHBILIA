<?php

use App\Models\ApprovalHistory;
use App\Models\PurchaseReceipt;
use App\Models\PurchaseRequest;
use App\Models\User;
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
            // 1. Identify official Site Engineer Youssef
            $youssef = DB::table('users')->where('email', 'youssef@gmail.com')->first();
            if (! $youssef) {
                $youssef = DB::table('users')->where('name', 'like', '%يوسف%')->first();
            }

            if (! $youssef) {
                Log::warning('Site engineer Youssef not found, skipping migration 2026_10_14_170000');
                return;
            }

            $youssefId = $youssef->id;
            $actorId = DB::table('users')->where('is_active', true)->first()?->id ?? 1;

            Log::info("Assigning buildings field receipts (REC-SITE-10, 12, 14, 15) to Site Engineer Youssef (User ID: {$youssefId})");

            $targetReceiptIds = [54, 56, 58, 59];

            $receipts = PurchaseReceipt::withoutGlobalScope(\App\Scopes\DataIsolationScope::class)
                ->whereIn('id', $targetReceiptIds)
                ->get();

            foreach ($receipts as $receipt) {
                $receipt->update([
                    'site_engineer_user_id' => $youssefId,
                    'receiver_user_id' => $youssefId,
                    'actual_receiver_user_id' => $youssefId,
                ]);

                if ($receipt->purchase_order_id) {
                    $po = DB::table('purchase_orders')->where('id', $receipt->purchase_order_id)->first();
                    if ($po && $po->purchase_request_id) {
                        DB::table('purchase_requests')->where('id', $po->purchase_request_id)->update([
                            'site_engineer_user_id' => $youssefId,
                        ]);
                    }
                }

                ApprovalHistory::create([
                    'target_type' => PurchaseReceipt::class,
                    'target_id' => $receipt->id,
                    'actor_user_id' => $actorId,
                    'action' => 'ASSIGNED_TO_SITE_ENGINEER',
                    'from_state' => $receipt->status,
                    'to_state' => $receipt->status,
                    'comments' => "تم إسناد إذن الاستلام الميداني رسمياً إلى مهندس الموقع المستلم (م. يوسف - ID: {$youssefId}) للفحص والاعتماد، مع عزله عن قائمة مهام مراجع القسم.",
                ]);
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
    }
};
