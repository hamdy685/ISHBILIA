<?php

use Illuminate\Database\Migrations\Migration;
use App\Models\PurchaseRequest;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Ensure all requests in PENDING_PROCUREMENT_APPROVAL have procurement_route set to UNDECIDED
     * so they are immediately visible and actionable in the Procurement Manager's queue.
     * Specifically handles PR-30, PR-41, and id=41.
     */
    public function up(): void
    {
        // 1. Specifically reset Record 41 and PR-30 / PR-41
        PurchaseRequest::whereIn('request_number', ['PR-30', 'PR-41'])
            ->orWhereIn('id', [30, 41])
            ->where('status', 'PENDING_PROCUREMENT_APPROVAL')
            ->update([
                'procurement_route' => 'UNDECIDED',
                'rejection_reason' => null,
            ]);

        // 2. Also ensure any other request that is PENDING_PROCUREMENT_APPROVAL but still marked DIRECT is reset to UNDECIDED
        PurchaseRequest::where('status', 'PENDING_PROCUREMENT_APPROVAL')
            ->where('procurement_route', 'DIRECT')
            ->update([
                'procurement_route' => 'UNDECIDED',
            ]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // No-op
    }
};
