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
        if (Schema::hasTable('purchase_orders')) {
            Schema::table('purchase_orders', function (Blueprint $table) {
                if (! Schema::hasColumn('purchase_orders', 'discount_type')) {
                    $table->string('discount_type', 30)->default('NONE')->after('subtotal');
                }
                if (! Schema::hasColumn('purchase_orders', 'discount_percentage')) {
                    $table->decimal('discount_percentage', 8, 4)->default(0.0000)->after('discount_type');
                }
            });
        }

        if (Schema::hasTable('purchase_order_items')) {
            Schema::table('purchase_order_items', function (Blueprint $table) {
                if (! Schema::hasColumn('purchase_order_items', 'is_discount_applied')) {
                    $table->boolean('is_discount_applied')->default(false)->after('discount_amount');
                }
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('purchase_orders')) {
            Schema::table('purchase_orders', function (Blueprint $table) {
                if (Schema::hasColumn('purchase_orders', 'discount_percentage')) {
                    $table->dropColumn('discount_percentage');
                }
                if (Schema::hasColumn('purchase_orders', 'discount_type')) {
                    $table->dropColumn('discount_type');
                }
            });
        }

        if (Schema::hasTable('purchase_order_items')) {
            Schema::table('purchase_order_items', function (Blueprint $table) {
                if (Schema::hasColumn('purchase_order_items', 'is_discount_applied')) {
                    $table->dropColumn('is_discount_applied');
                }
            });
        }
    }
};
