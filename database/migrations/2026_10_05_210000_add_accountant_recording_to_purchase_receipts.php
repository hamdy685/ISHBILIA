<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('purchase_receipts')) {
            Schema::table('purchase_receipts', function (Blueprint $table) {
                if (! Schema::hasColumn('purchase_receipts', 'accountant_recorded_at')) {
                    $table->timestamp('accountant_recorded_at')->nullable()->after('receiver_notes');
                }
                if (! Schema::hasColumn('purchase_receipts', 'accountant_recorded_by_user_id')) {
                    $table->foreignId('accountant_recorded_by_user_id')->nullable()->after('accountant_recorded_at')->constrained('users')->nullOnDelete();
                }
                if (! Schema::hasColumn('purchase_receipts', 'accountant_recording_notes')) {
                    $table->text('accountant_recording_notes')->nullable()->after('accountant_recorded_by_user_id');
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('purchase_receipts')) {
            Schema::table('purchase_receipts', function (Blueprint $table) {
                if (Schema::hasColumn('purchase_receipts', 'accountant_recording_notes')) {
                    $table->dropColumn('accountant_recording_notes');
                }
                if (Schema::hasColumn('purchase_receipts', 'accountant_recorded_by_user_id')) {
                    $table->dropForeign(['accountant_recorded_by_user_id']);
                    $table->dropColumn('accountant_recorded_by_user_id');
                }
                if (Schema::hasColumn('purchase_receipts', 'accountant_recorded_at')) {
                    $table->dropColumn('accountant_recorded_at');
                }
            });
        }
    }
};
