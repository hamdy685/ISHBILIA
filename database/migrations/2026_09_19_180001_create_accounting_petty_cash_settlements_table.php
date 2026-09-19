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
        Schema::create('accounting_petty_cash_settlements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('cost_center_id')->constrained('cost_centers')->restrictOnDelete();
            $table->string('employee_name');
            $table->string('settlement_number')->unique();
            $table->date('date');
            $table->decimal('amount', 15, 2);
            $table->text('description')->nullable();
            $table->enum('status', ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'])->default('DRAFT');
            $table->foreignId('journal_entry_id')->nullable()->constrained('journal_entries')->nullOnDelete();
            $table->timestamps();

            $table->index(['status', 'date']);
            $table->index('employee_name');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('accounting_petty_cash_settlements');
    }
};
