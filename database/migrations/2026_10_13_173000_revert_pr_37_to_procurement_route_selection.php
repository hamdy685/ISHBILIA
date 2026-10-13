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
     * Revert PR-37 from PENDING_QUOTE_RECOMMENDATIONS back to PENDING_PROCUREMENT_APPROVAL (UNDECIDED route)
     * so it returns to the route selection & direct pricing section in Procurement Manager dashboard.
     */
    public function up(): void
    {
        $pr = PurchaseRequest::where('request_number', 'PR-37')
            ->orWhere('id', 37)
            ->first();

        if (! $pr) {
            return;
        }

        $fromStatus = $pr->status;

        // Delete any unconfirmed quotes
        $pr->quotes()->delete();

        // Reset to PENDING_PROCUREMENT_APPROVAL and UNDECIDED route
        $pr->status = 'PENDING_PROCUREMENT_APPROVAL';
        $pr->procurement_route = 'UNDECIDED';
        $pr->rejection_reason = null;
        $pr->save();

        $user = User::whereHas('roles', fn ($q) => $q->where('slug', 'procurement_manager'))->first()
            ?? User::first();

        ApprovalHistory::create([
            'target_type'   => PurchaseRequest::class,
            'target_id'     => $pr->id,
            'actor_user_id' => $user?->id,
            'action'        => 'ROUTE_RESET_TO_PENDING',
            'from_state'    => $fromStatus,
            'to_state'      => 'PENDING_PROCUREMENT_APPROVAL',
            'comments'      => 'تم التراجع عن مسار عروض الأسعار وإعادة الطلب إلى قسم اختيار المسار وتحديد الأسعار المباشرة.',
        ]);

        SystemEvent::create([
            'entity_type' => PurchaseRequest::class,
            'entity_id'   => $pr->id,
            'actor_id'    => $user?->id,
            'event_type'  => 'purchase_request.route_reset',
            'action'      => 'ROUTE_RESET_TO_PENDING',
            'from_state'  => $fromStatus,
            'to_state'    => 'PENDING_PROCUREMENT_APPROVAL',
            'description' => 'تم التراجع عن مسار عروض الأسعار للطلب وإعادته لقسم اختيار المسار وتحديد الأسعار.',
            'occurred_at' => now(),
        ]);
    }

    public function down(): void
    {
        // No-op
    }
};
