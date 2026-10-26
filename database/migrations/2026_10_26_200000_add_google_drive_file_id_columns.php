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
        if (Schema::hasTable('purchase_receipts')) {
            Schema::table('purchase_receipts', function (Blueprint $table) {
                if (! Schema::hasColumn('purchase_receipts', 'photo_drive_id')) {
                    $table->string('photo_drive_id', 120)->nullable()->after('photo_mime_type');
                }
            });
        }

        if (Schema::hasTable('purchase_orders')) {
            Schema::table('purchase_orders', function (Blueprint $table) {
                if (! Schema::hasColumn('purchase_orders', 'invoice_photo_drive_id')) {
                    $table->string('invoice_photo_drive_id', 120)->nullable()->after('invoice_photo_mime_type');
                }
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('purchase_receipts')) {
            Schema::table('purchase_receipts', function (Blueprint $table) {
                if (Schema::hasColumn('purchase_receipts', 'photo_drive_id')) {
                    $table->dropColumn('photo_drive_id');
                }
            });
        }

        if (Schema::hasTable('purchase_orders')) {
            Schema::table('purchase_orders', function (Blueprint $table) {
                if (Schema::hasColumn('purchase_orders', 'invoice_photo_drive_id')) {
                    $table->dropColumn('invoice_photo_drive_id');
                }
            });
        }
    }
};
