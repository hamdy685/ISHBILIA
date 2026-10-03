<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->string('manual_po_number', 50)->nullable()->after('po_number');
            $table->string('manual_pr_number', 50)->nullable()->after('purchase_request_id');
        });

        Schema::table('purchase_requests', function (Blueprint $table) {
            $table->string('manual_request_number', 50)->nullable()->after('request_number');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->dropColumn(['manual_po_number', 'manual_pr_number']);
        });

        Schema::table('purchase_requests', function (Blueprint $table) {
            $table->dropColumn('manual_request_number');
        });
    }
};
