<?php

use App\Models\Supplier;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // 1. Ensure the Internal Warehouse Virtual Supplier exists
        $internalSupplier = DB::table('suppliers')->where('company_name', 'المخزن الداخلي')->first();
        if (! $internalSupplier) {
            $internalSupplierId = DB::table('suppliers')->insertGetId([
                'company_name' => 'المخزن الداخلي',
                'tax_number' => 'INTERNAL-WH-001',
                'contact_name' => 'أمين المستودع الرئيسي',
                'phone' => '01000000000',
                'address' => 'مستودع الشركة الرئيسي - المقر المركزي',
                'payment_terms' => 'صرف من الرصيد المخزني الداخلي (عهدة)',
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        } else {
            $internalSupplierId = $internalSupplier->id;
        }

        // 2. Add supplier_id to purchase_receipts if not present
        if (Schema::hasTable('purchase_receipts') && ! Schema::hasColumn('purchase_receipts', 'supplier_id')) {
            Schema::table('purchase_receipts', function (Blueprint $table) {
                $table->foreignId('supplier_id')
                    ->nullable()
                    ->after('purchase_request_id')
                    ->constrained('suppliers')
                    ->nullOnDelete();
            });
        }

        // 3. Backfill supplier_id on existing purchase_receipts from their parent purchase_orders
        if (Schema::hasTable('purchase_receipts') && Schema::hasColumn('purchase_receipts', 'supplier_id')) {
            $receipts = DB::table('purchase_receipts')->get();
            foreach ($receipts as $receipt) {
                $poSupplierId = null;
                if ($receipt->purchase_order_id) {
                    $poSupplierId = DB::table('purchase_orders')
                        ->where('id', $receipt->purchase_order_id)
                        ->value('supplier_id');
                }
                
                $finalSupplierId = $poSupplierId ?: $internalSupplierId;

                DB::table('purchase_receipts')
                    ->where('id', $receipt->id)
                    ->update(['supplier_id' => $finalSupplierId]);
            }
        }

        // 4. Backfill any purchase_orders that have null supplier_id to the Internal Warehouse Virtual Supplier
        if (Schema::hasTable('purchase_orders') && Schema::hasColumn('purchase_orders', 'supplier_id')) {
            DB::table('purchase_orders')
                ->whereNull('supplier_id')
                ->update(['supplier_id' => $internalSupplierId]);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('purchase_receipts') && Schema::hasColumn('purchase_receipts', 'supplier_id')) {
            Schema::table('purchase_receipts', function (Blueprint $table) {
                $table->dropForeign(['supplier_id']);
                $table->dropColumn('supplier_id');
            });
        }
    }
};
