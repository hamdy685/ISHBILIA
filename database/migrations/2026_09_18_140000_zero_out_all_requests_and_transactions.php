<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Cleanly and safely zeroes out all transactions and requests for a fresh start.
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
            $tablesToClear = [
                'supplier_invoice_land_allocations',
                'land_parcel_transactions',
                'supplier_payment_allocations',
                'supplier_payments',
                'supplier_invoices',
                'purchase_receipt_items',
                'purchase_receipts',
                'purchase_order_items',
                'purchase_orders',
                'purchase_request_quote_recommendations',
                'purchase_quote_recommendations',
                'purchase_request_quotes',
                'purchase_request_supplements',
                'purchase_request_items',
                'purchase_requests',
                'approval_history',
                'audit_logs',
                'system_events',
                'notifications',
                'attachments',
            ];

            foreach ($tablesToClear as $table) {
                if (Schema::hasTable($table)) {
                    DB::table($table)->delete();
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
