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
        Schema::create('material_transfer_requests', function (Blueprint $table) {
            $table->id();
            $table->string('request_number', 50)->unique();
            $table->date('transfer_date');
            $table->string('from_project', 255);
            $table->string('to_project', 255);
            $table->string('driver_name', 255)->nullable();
            $table->string('vehicle_plate_number', 100)->nullable();
            $table->string('status', 50)->default('PENDING_REVIEWER');

            // Audit & Roles Lifecycle
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            
            $table->foreignId('reviewer_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->text('review_notes')->nullable();

            $table->foreignId('accountant_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('accounted_at')->nullable();
            $table->text('accounting_notes')->nullable();

            $table->text('rejection_reason')->nullable();
            $table->text('return_reason')->nullable();
            $table->text('general_notes')->nullable();

            $table->timestamps();
            $table->softDeletes();

            $table->index(['status', 'created_at']);
            $table->index(['user_id', 'status']);
            $table->index('from_project');
            $table->index('to_project');
        });

        Schema::create('material_transfer_request_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('material_transfer_request_id')
                ->constrained('material_transfer_requests')
                ->cascadeOnDelete();
            $table->unsignedInteger('item_order')->default(1);
            $table->string('item_description', 255);
            $table->string('uom', 50);
            $table->decimal('quantity', 14, 2);
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['material_transfer_request_id', 'item_order'], 'mtr_items_order_idx');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('material_transfer_request_items');
        Schema::dropIfExists('material_transfer_requests');
    }
};
