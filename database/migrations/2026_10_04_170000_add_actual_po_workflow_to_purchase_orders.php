<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Add PENDING_ACTUAL_PO status support and tracking fields for the
 * "Actual PO" workflow where procurement finalises the order after GRN approval.
 *
 * New flow:
 *   PO_DRAFT → ISSUED (preliminary) → GRN approved → PENDING_ACTUAL_PO
 *   → Procurement edits & finalises → SENT_TO_ACCOUNTING (accounting sees final PO)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('purchase_orders', function (Blueprint $table) {
            // Tracks who finalised the actual PO and when
            $table->unsignedBigInteger('finalized_by_user_id')->nullable()->after('reviewed_by_accounting_user_id');
            $table->timestamp('finalized_at')->nullable()->after('finalized_by_user_id');

            // Notes added by procurement when finalising the actual PO
            $table->text('finalization_notes')->nullable()->after('finalized_at');

            $table->foreign('finalized_by_user_id')
                ->references('id')
                ->on('users')
                ->nullOnDelete();
        });

        // Update any existing POs stuck in ISSUED state that already have an approved
        // receipt to the new PENDING_ACTUAL_PO status — handled via seeder / artisan command
        // NOT done here to avoid touching production data unexpectedly.
    }

    public function down(): void
    {
        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->dropForeign(['finalized_by_user_id']);
            $table->dropColumn(['finalized_by_user_id', 'finalized_at', 'finalization_notes']);
        });
    }
};
