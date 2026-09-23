<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Cleanly zeroes out all purchase requests, orders, receipts, transactions, and logs for a clean production start.
     */
    public function up(): void
    {
        $driver = DB::getDriverName();
        if ($driver === 'mysql') {
            DB::statement('SET FOREIGN_KEY_CHECKS=0;');
        } elseif ($driver === 'sqlite') {
            DB::statement('PRAGMA foreign_keys = OFF;');
        }

        try {
            Schema::disableForeignKeyConstraints();
        } catch (\Throwable $e) {}

        try {
            $tablesToClear = [
                'supplier_invoice_land_allocations',
                'land_parcel_transactions',
                'supplier_payment_allocations',
                'supplier_payments',
                'supplier_invoices',
                'accounting_contractor_invoices',
                'accounting_petty_cash_settlements',
                'journal_entry_lines',
                'journal_entries',
                'purchase_receipt_items',
                'purchase_receipts',
                'purchase_order_items',
                'purchase_orders',
                'purchase_request_quote_recommendations',
                'purchase_quote_recommendations',
                'purchase_request_quotes',
                'purchase_quote_items',
                'purchase_quotes',
                'purchase_request_supplements',
                'purchase_request_items',
                'purchase_requests',
                'items',
                'approval_history',
                'audit_logs',
                'system_events',
                'notifications',
                'attachments',
            ];

            foreach ($tablesToClear as $table) {
                if (Schema::hasTable($table)) {
                    DB::table($table)->delete();
                    if ($driver === 'mysql') {
                        try {
                            DB::statement("ALTER TABLE `{$table}` AUTO_INCREMENT = 1;");
                        } catch (\Throwable $e) {}
                    }
                }
            }

            if (Schema::hasTable('supplier_balances')) {
                DB::table('supplier_balances')->update([
                    'total_invoiced' => 0,
                    'total_paid' => 0,
                    'balance' => 0,
                    'last_activity_at' => null,
                    'updated_at' => now(),
                ]);
            }
        } catch (\Throwable $e) {
            logger()->error('Zero-out migration error: ' . $e->getMessage());
        } finally {
            try {
                Schema::enableForeignKeyConstraints();
            } catch (\Throwable $e) {}

            if ($driver === 'mysql') {
                DB::statement('SET FOREIGN_KEY_CHECKS=1;');
            } elseif ($driver === 'sqlite') {
                DB::statement('PRAGMA foreign_keys = ON;');
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        //
    }
};
