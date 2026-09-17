<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('purchase_request_supplements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('purchase_request_id')->constrained('purchase_requests')->cascadeOnDelete();
            $table->unsignedInteger('batch_number')->default(1);
            $table->foreignId('requested_by_user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('reviewer_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('reviewed_at')->nullable();
            $table->foreignId('procurement_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('procurement_processed_at')->nullable();
            $table->foreignId('purchase_order_id')->nullable()->constrained('purchase_orders')->nullOnDelete();
            $table->foreignId('supplier_id')->nullable()->constrained('suppliers')->nullOnDelete();
            $table->string('status', 40)->default('SUBMITTED'); // SUBMITTED, REVIEWER_APPROVED, PROCUREMENT_PROCESSED, REJECTED
            $table->text('notes')->nullable();
            $table->text('rejection_reason')->nullable();
            $table->timestamps();

            $table->index(['purchase_request_id', 'status']);
        });

        Schema::table('purchase_request_items', function (Blueprint $table) {
            $table->boolean('is_supplementary')->default(false)->after('purchase_request_id');
            $table->foreignId('supplement_id')->nullable()->after('is_supplementary')->constrained('purchase_request_supplements')->nullOnDelete();
            $table->unsignedInteger('supplement_batch')->default(1)->after('supplement_id');
        });

        Schema::table('purchase_order_items', function (Blueprint $table) {
            $table->boolean('is_supplementary')->default(false)->after('purchase_order_id');
            $table->unsignedInteger('supplement_batch')->default(1)->after('is_supplementary');
        });
    }

    public function down(): void
    {
        Schema::table('purchase_order_items', function (Blueprint $table) {
            $table->dropColumn(['is_supplementary', 'supplement_batch']);
        });

        Schema::table('purchase_request_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('supplement_id');
            $table->dropColumn(['is_supplementary', 'supplement_batch']);
        });

        Schema::dropIfExists('purchase_request_supplements');
    }
};
