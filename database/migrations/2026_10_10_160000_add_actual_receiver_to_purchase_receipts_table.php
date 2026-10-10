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
                if (! Schema::hasColumn('purchase_receipts', 'actual_receiver_name')) {
                    $table->string('actual_receiver_name')->nullable()->after('receiver_user_id');
                }
                if (! Schema::hasColumn('purchase_receipts', 'actual_receiver_user_id')) {
                    $table->foreignId('actual_receiver_user_id')
                        ->nullable()
                        ->after('actual_receiver_name')
                        ->constrained('users')
                        ->nullOnDelete();
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('purchase_receipts')) {
            Schema::table('purchase_receipts', function (Blueprint $table) {
                if (Schema::hasColumn('purchase_receipts', 'actual_receiver_user_id')) {
                    $table->dropForeign(['actual_receiver_user_id']);
                    $table->dropColumn('actual_receiver_user_id');
                }
                if (Schema::hasColumn('purchase_receipts', 'actual_receiver_name')) {
                    $table->dropColumn('actual_receiver_name');
                }
            });
        }
    }
};
