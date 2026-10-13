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
        if (! Schema::hasTable('weighing_groups')) {
            Schema::create('weighing_groups', function (Blueprint $table) {
                $table->id();
                $table->string('group_number', 50)->unique();
                $table->foreignId('purchase_order_id')->constrained('purchase_orders')->cascadeOnDelete();
                $table->foreignId('supplier_id')->constrained('suppliers')->cascadeOnDelete();
                $table->string('group_type', 40)->default('STEEL_WEIGHT');
                $table->string('status', 40)->default('PENDING_RECEIPT'); // PENDING_RECEIPT, RECEIVED, CANCELLED
                $table->decimal('total_ordered_weight', 15, 3)->default(0);
                $table->decimal('total_received_weight', 15, 3)->nullable();
                $table->decimal('weight_difference', 15, 3)->nullable();
                $table->string('uom', 20)->default('TON');
                $table->string('scale_ticket_photo')->nullable();
                $table->text('notes')->nullable();
                $table->text('receiver_notes')->nullable();
                $table->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('received_by_user_id')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('received_at')->nullable();
                $table->timestamps();

                $table->index(['purchase_order_id', 'status']);
                $table->index(['supplier_id', 'status']);
            });
        }

        if (! Schema::hasTable('weighing_group_items')) {
            Schema::create('weighing_group_items', function (Blueprint $table) {
                $table->id();
                $table->foreignId('weighing_group_id')->constrained('weighing_groups')->cascadeOnDelete();
                $table->foreignId('purchase_order_item_id')->constrained('purchase_order_items')->cascadeOnDelete();
                $table->string('item_description');
                $table->string('size_or_diameter', 50)->nullable();
                $table->decimal('ordered_weight', 15, 3)->default(0);
                $table->decimal('received_weight', 15, 3)->nullable();
                $table->string('uom', 20)->default('TON');
                $table->decimal('unit_price', 15, 2)->default(0);
                $table->decimal('line_total', 15, 2)->default(0);
                $table->string('region')->nullable();
                $table->string('land_plot_number')->nullable();
                $table->string('purpose')->nullable();
                $table->timestamps();

                $table->unique(['weighing_group_id', 'purchase_order_item_id'], 'uq_wg_po_item');
            });
        }

        if (Schema::hasTable('purchase_receipts') && ! Schema::hasColumn('purchase_receipts', 'weighing_group_id')) {
            Schema::table('purchase_receipts', function (Blueprint $table) {
                $table->foreignId('weighing_group_id')->nullable()->after('supplier_id')->constrained('weighing_groups')->nullOnDelete();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('purchase_receipts') && Schema::hasColumn('purchase_receipts', 'weighing_group_id')) {
            Schema::table('purchase_receipts', function (Blueprint $table) {
                $table->dropConstrainedForeignId('weighing_group_id');
            });
        }

        Schema::dropIfExists('weighing_group_items');
        Schema::dropIfExists('weighing_groups');
    }
};
