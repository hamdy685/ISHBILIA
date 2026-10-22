<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('purchase_orders', function (Blueprint $table) {
            if (! Schema::hasColumn('purchase_orders', 'invoice_photo_path')) {
                $table->string('invoice_photo_path', 1000)->nullable()->after('finalization_notes');
            }
            if (! Schema::hasColumn('purchase_orders', 'invoice_photo_name')) {
                $table->string('invoice_photo_name', 255)->nullable()->after('invoice_photo_path');
            }
            if (! Schema::hasColumn('purchase_orders', 'invoice_photo_size')) {
                $table->unsignedBigInteger('invoice_photo_size')->nullable()->after('invoice_photo_name');
            }
            if (! Schema::hasColumn('purchase_orders', 'invoice_photo_mime_type')) {
                $table->string('invoice_photo_mime_type', 100)->nullable()->after('invoice_photo_size');
            }
            if (! Schema::hasColumn('purchase_orders', 'invoice_photo_uploaded_at')) {
                $table->timestamp('invoice_photo_uploaded_at')->nullable()->after('invoice_photo_mime_type');
            }
            if (! Schema::hasColumn('purchase_orders', 'invoice_photo_uploaded_by_user_id')) {
                $table->foreignId('invoice_photo_uploaded_by_user_id')->nullable()->constrained('users')->nullOnDelete()->after('invoice_photo_uploaded_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('purchase_orders', function (Blueprint $table) {
            if (Schema::hasColumn('purchase_orders', 'invoice_photo_uploaded_by_user_id')) {
                $table->dropConstrainedForeignId('invoice_photo_uploaded_by_user_id');
            }
            $cols = array_filter([
                'invoice_photo_path',
                'invoice_photo_name',
                'invoice_photo_size',
                'invoice_photo_mime_type',
                'invoice_photo_uploaded_at',
            ], fn ($c) => Schema::hasColumn('purchase_orders', $c));

            if (! empty($cols)) {
                $table->dropColumn($cols);
            }
        });
    }
};
