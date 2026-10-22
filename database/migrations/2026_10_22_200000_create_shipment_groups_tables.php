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
        if (! Schema::hasTable('shipment_groups')) {
            Schema::create('shipment_groups', function (Blueprint $table) {
                $table->id();
                $table->string('group_number', 50)->unique();
                $table->foreignId('purchase_order_id')->constrained('purchase_orders')->cascadeOnDelete();
                $table->foreignId('supplier_id')->constrained('suppliers')->cascadeOnDelete();
                $table->string('group_name', 255);
                $table->string('status', 40)->default('PENDING_DELIVERY'); // PENDING_DELIVERY, PARTIALLY_RECEIVED, RECEIVED, CANCELLED
                $table->string('vehicle_plate_number', 50)->nullable();
                $table->string('driver_name', 100)->nullable();
                $table->string('driver_phone', 50)->nullable();
                $table->text('notes')->nullable();
                $table->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();

                $table->index(['purchase_order_id', 'status']);
                $table->index(['supplier_id', 'status']);
            });
        }

        if (Schema::hasTable('purchase_order_items') && ! Schema::hasColumn('purchase_order_items', 'shipment_group_id')) {
            Schema::table('purchase_order_items', function (Blueprint $table) {
                $table->foreignId('shipment_group_id')
                    ->nullable()
                    ->after('purchase_order_id')
                    ->constrained('shipment_groups')
                    ->nullOnDelete();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('purchase_order_items') && Schema::hasColumn('purchase_order_items', 'shipment_group_id')) {
            Schema::table('purchase_order_items', function (Blueprint $table) {
                $table->dropConstrainedForeignId('shipment_group_id');
            });
        }

        Schema::dropIfExists('shipment_groups');
    }
};
