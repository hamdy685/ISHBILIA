<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use App\Models\PurchaseRequest;
use App\Models\User;
use App\Models\ApprovalHistory;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        try {
            // 1. Identify all supplement requests that were mistakenly placed in PENDING_EXECUTIVE_APPROVAL
            $stuckPrs = PurchaseRequest::where('status', 'PENDING_EXECUTIVE_APPROVAL')
                ->where(function ($query) {
                    $query->where('request_type', 'COMPLEMENTARY')
                        ->orWhere('notes', 'like', '%كمالة%')
                        ->orWhere('notes', 'like', '%تكملة%')
                        ->orWhereIn('request_number', ['PR-14', 'PR-15'])
                        ->orWhereHas('items', function ($iq) {
                            $iq->where('is_supplementary', true)
                               ->orWhereNotNull('supplement_id')
                               ->orWhere('item_description', 'like', '%كمالة%')
                               ->orWhere('item_description', 'like', '%تكملة%')
                               ->orWhere('notes', 'like', '%كمالة%');
                        })
                        ->orWhereHas('supplements');
                })
                ->get();

            $procurementManagers = User::whereHas('roles', fn ($q) => $q->where('slug', 'procurement_manager'))
                ->where('is_active', true)
                ->get();

            foreach ($stuckPrs as $pr) {
                $pr->update([
                    'status' => 'PENDING_PROCUREMENT_APPROVAL',
                ]);

                ApprovalHistory::create([
                    'target_type' => PurchaseRequest::class,
                    'target_id' => $pr->id,
                    'actor_user_id' => $pr->reviewer_user_id ?: ($pr->user_id ?: 1),
                    'action' => 'APPROVED_BY_REVIEWER_FAST_TRACK',
                    'from_state' => 'PENDING_EXECUTIVE_APPROVAL',
                    'to_state' => 'PENDING_PROCUREMENT_APPROVAL',
                    'comments' => 'تصحيح المسار السريع: نقل طلب الكمالة المستقل مباشرة إلى إدارة المشتريات (تخطي المسار التنفيذي والمالي).',
                ]);

                // Mark old executive notifications as read
                DB::table('notifications')
                    ->where('notifiable_type', PurchaseRequest::class)
                    ->where('notifiable_id', $pr->id)
                    ->whereIn('type', ['purchase_request_pending_executive', 'purchase_request_pending_executive_approval'])
                    ->whereNull('read_at')
                    ->update(['read_at' => now(), 'updated_at' => now()]);

                // Notify Procurement Managers
                try {
                    $notifService = app(\App\Services\NotificationService::class);
                    $notifService->queueUsers(
                        $procurementManagers,
                        'purchase_request_pending_procurement',
                        'طلب كمالة معتمد جاهز للمشتريات',
                        "طلب الكمالة المستقل {$pr->request_number} معتمد وجاهز لدى إدارة المشتريات لإصدار أمر الشراء مباشرة دون تنفيذي أو مالية.",
                        $pr
                    );
                } catch (\Throwable $ne) {
                    Log::warning('Supplement migration notification error: ' . $ne->getMessage());
                }
            }
        } catch (\Throwable $e) {
            Log::error('Supplement routing migration error: ' . $e->getMessage());
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // No reversal needed for data correction
    }
};
