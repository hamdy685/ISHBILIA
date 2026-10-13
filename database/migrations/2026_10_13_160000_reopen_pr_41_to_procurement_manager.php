<?php

use Illuminate\Database\Migrations\Migration;
use App\Models\PurchaseRequest;
use App\Models\ApprovalHistory;
use App\Models\SystemEvent;
use App\Models\User;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Reopen PR-41 (which was rejected by procurement manager by mistake)
     * and return it back to PENDING_PROCUREMENT_APPROVAL so Ahmed Badawy can process it.
     */
    public function up(): void
    {
        $pr = PurchaseRequest::where('request_number', 'PR-41')
            ->orWhere('id', 41)
            ->first();

        if (! $pr) {
            return;
        }

        $fromStatus = $pr->status;

        // Reset status back to PENDING_PROCUREMENT_APPROVAL
        $pr->status = 'PENDING_PROCUREMENT_APPROVAL';
        $pr->rejection_reason = null;
        $pr->save();

        $admin = User::whereHas('roles', fn ($q) => $q->where('slug', 'admin'))->first()
            ?? User::first();

        ApprovalHistory::create([
            'target_type'   => PurchaseRequest::class,
            'target_id'     => $pr->id,
            'actor_user_id' => $admin?->id,
            'action'        => 'ADMIN_REOPENED',
            'from_state'    => $fromStatus,
            'to_state'      => 'PENDING_PROCUREMENT_APPROVAL',
            'comments'      => 'تم إلغاء الرفض الخاطئ وإعادة الطلب مباشرة لمراجعة مدير المشتريات (أ. أحمد بدوي) لاستكمال الإجراءات.',
        ]);

        SystemEvent::create([
            'entity_type' => PurchaseRequest::class,
            'entity_id'   => $pr->id,
            'actor_id'    => $admin?->id,
            'event_type'  => 'purchase_request.restored_to_procurement',
            'action'      => 'ADMIN_REOPENED',
            'from_state'  => $fromStatus,
            'to_state'    => 'PENDING_PROCUREMENT_APPROVAL',
            'description' => 'تم إلغاء الرفض الخاطئ وإعادة الطلب لمرحلة موافقة مدير المشتريات (أ. أحمد بدوي).',
            'occurred_at' => now(),
        ]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Safe no-op to maintain audit trail
    }
};
