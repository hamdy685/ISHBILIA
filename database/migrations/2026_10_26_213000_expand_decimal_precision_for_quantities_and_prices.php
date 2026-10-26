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
        // 1. purchase_order_items: quantity & unit_price
        if (Schema::hasTable('purchase_order_items')) {
            Schema::table('purchase_order_items', function (Blueprint $table) {
                if (Schema::hasColumn('purchase_order_items', 'quantity')) {
                    $table->decimal('quantity', 15, 4)->change();
                }
                if (Schema::hasColumn('purchase_order_items', 'unit_price')) {
                    $table->decimal('unit_price', 15, 4)->default(0)->change();
                }
            });
        }

        // 2. purchase_orders: unit_price
        if (Schema::hasTable('purchase_orders')) {
            Schema::table('purchase_orders', function (Blueprint $table) {
                if (Schema::hasColumn('purchase_orders', 'unit_price')) {
                    $table->decimal('unit_price', 15, 4)->default(0)->change();
                }
            });
        }

        // 3. purchase_request_items: quantity & estimated_unit_price
        if (Schema::hasTable('purchase_request_items')) {
            Schema::table('purchase_request_items', function (Blueprint $table) {
                if (Schema::hasColumn('purchase_request_items', 'quantity')) {
                    $table->decimal('quantity', 15, 4)->change();
                }
                if (Schema::hasColumn('purchase_request_items', 'estimated_unit_price')) {
                    $table->decimal('estimated_unit_price', 15, 4)->default(0)->change();
                }
            });
        }

        // 4. purchase_receipt_items: ordered_quantity & received_quantity
        if (Schema::hasTable('purchase_receipt_items')) {
            Schema::table('purchase_receipt_items', function (Blueprint $table) {
                if (Schema::hasColumn('purchase_receipt_items', 'ordered_quantity')) {
                    $table->decimal('ordered_quantity', 15, 4)->change();
                }
                if (Schema::hasColumn('purchase_receipt_items', 'received_quantity')) {
                    $table->decimal('received_quantity', 15, 4)->change();
                }
            });
        }

        // 5. weighing_group_items: ordered_weight, received_weight & unit_price
        if (Schema::hasTable('weighing_group_items')) {
            Schema::table('weighing_group_items', function (Blueprint $table) {
                if (Schema::hasColumn('weighing_group_items', 'ordered_weight')) {
                    $table->decimal('ordered_weight', 15, 4)->default(0)->change();
                }
                if (Schema::hasColumn('weighing_group_items', 'received_weight')) {
                    $table->decimal('received_weight', 15, 4)->nullable()->change();
                }
                if (Schema::hasColumn('weighing_group_items', 'unit_price')) {
                    $table->decimal('unit_price', 15, 4)->default(0)->change();
                }
            });
        }

        // 6. weighing_groups: weights & unit_price
        if (Schema::hasTable('weighing_groups')) {
            Schema::table('weighing_groups', function (Blueprint $table) {
                if (Schema::hasColumn('weighing_groups', 'total_ordered_weight')) {
                    $table->decimal('total_ordered_weight', 15, 4)->default(0)->change();
                }
                if (Schema::hasColumn('weighing_groups', 'total_received_weight')) {
                    $table->decimal('total_received_weight', 15, 4)->nullable()->change();
                }
                if (Schema::hasColumn('weighing_groups', 'weight_difference')) {
                    $table->decimal('weight_difference', 15, 4)->nullable()->change();
                }
                if (Schema::hasColumn('weighing_groups', 'unit_price')) {
                    $table->decimal('unit_price', 15, 4)->default(0)->change();
                }
            });
        }

        // 7. purchase_request_quotes: unit_price
        if (Schema::hasTable('purchase_request_quotes')) {
            Schema::table('purchase_request_quotes', function (Blueprint $table) {
                if (Schema::hasColumn('purchase_request_quotes', 'unit_price')) {
                    $table->decimal('unit_price', 15, 4)->default(0)->change();
                }
            });
        }

        // 8. material_transfer_request_items: quantity
        if (Schema::hasTable('material_transfer_request_items')) {
            Schema::table('material_transfer_request_items', function (Blueprint $table) {
                if (Schema::hasColumn('material_transfer_request_items', 'quantity')) {
                    $table->decimal('quantity', 15, 4)->change();
                }
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('purchase_order_items')) {
            Schema::table('purchase_order_items', function (Blueprint $table) {
                if (Schema::hasColumn('purchase_order_items', 'quantity')) {
                    $table->decimal('quantity', 10, 2)->change();
                }
                if (Schema::hasColumn('purchase_order_items', 'unit_price')) {
                    $table->decimal('unit_price', 12, 2)->default(0)->change();
                }
            });
        }

        if (Schema::hasTable('purchase_orders')) {
            Schema::table('purchase_orders', function (Blueprint $table) {
                if (Schema::hasColumn('purchase_orders', 'unit_price')) {
                    $table->decimal('unit_price', 14, 2)->default(0)->change();
                }
            });
        }

        if (Schema::hasTable('purchase_request_items')) {
            Schema::table('purchase_request_items', function (Blueprint $table) {
                if (Schema::hasColumn('purchase_request_items', 'quantity')) {
                    $table->decimal('quantity', 10, 2)->change();
                }
                if (Schema::hasColumn('purchase_request_items', 'estimated_unit_price')) {
                    $table->decimal('estimated_unit_price', 12, 2)->default(0)->change();
                }
            });
        }

        if (Schema::hasTable('purchase_receipt_items')) {
            Schema::table('purchase_receipt_items', function (Blueprint $table) {
                if (Schema::hasColumn('purchase_receipt_items', 'ordered_quantity')) {
                    $table->decimal('ordered_quantity', 15, 3)->change();
                }
                if (Schema::hasColumn('purchase_receipt_items', 'received_quantity')) {
                    $table->decimal('received_quantity', 15, 3)->change();
                }
            });
        }
    }
};
