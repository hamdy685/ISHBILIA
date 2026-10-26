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
        if (Schema::hasTable('purchase_request_quotes')) {
            Schema::table('purchase_request_quotes', function (Blueprint $table) {
                if (! Schema::hasColumn('purchase_request_quotes', 'file_drive_id')) {
                    $table->string('file_drive_id', 100)->nullable()->after('file_path')->index();
                }
            });
        }

        if (Schema::hasTable('attachments')) {
            Schema::table('attachments', function (Blueprint $table) {
                if (! Schema::hasColumn('attachments', 'drive_id')) {
                    $table->string('drive_id', 100)->nullable()->after('file_path')->index();
                }
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('purchase_request_quotes')) {
            Schema::table('purchase_request_quotes', function (Blueprint $table) {
                if (Schema::hasColumn('purchase_request_quotes', 'file_drive_id')) {
                    $table->dropColumn('file_drive_id');
                }
            });
        }

        if (Schema::hasTable('attachments')) {
            Schema::table('attachments', function (Blueprint $table) {
                if (Schema::hasColumn('attachments', 'drive_id')) {
                    $table->dropColumn('drive_id');
                }
            });
        }
    }
};
