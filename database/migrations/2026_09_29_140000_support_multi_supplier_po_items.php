<?php

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
        // 1. Add supplier_id to purchase_order_items if not present
        if (Schema::hasTable('purchase_order_items') && ! Schema::hasColumn('purchase_order_items', 'supplier_id')) {
            Schema::table('purchase_order_items', function (Blueprint $table) {
                $table->foreignId('supplier_id')
                    ->nullable()
                    ->after('item_id')
                    ->constrained('suppliers')
                    ->nullOnDelete();
            });
        }

        // 2. Make supplier_id nullable on purchase_orders if needed (for multi-supplier unified POs)
        if (Schema::hasTable('purchase_orders') && Schema::hasColumn('purchase_orders', 'supplier_id')) {
            try {
                Schema::table('purchase_orders', function (Blueprint $table) {
                    $table->foreignId('supplier_id')->nullable()->change();
                });
            } catch (\Throwable $e) {
                // Ignore if driver doesn't support changing foreign key nullability directly
            }
        }

        // 3. Backfill supplier_id on existing purchase_order_items
        if (Schema::hasTable('purchase_order_items') && Schema::hasColumn('purchase_order_items', 'supplier_id')) {
            $poItems = DB::table('purchase_order_items')->whereNull('supplier_id')->get();
            foreach ($poItems as $poi) {
                $supplierId = null;
                if ($poi->pr_item_id) {
                    $supplierId = DB::table('purchase_request_items')
                        ->where('id', $poi->pr_item_id)
                        ->value('supplier_id');
                }
                if (! $supplierId && $poi->purchase_order_id) {
                    $supplierId = DB::table('purchase_orders')
                        ->where('id', $poi->purchase_order_id)
                        ->value('supplier_id');
                }
                if ($supplierId) {
                    DB::table('purchase_order_items')
                        ->where('id', $poi->id)
                        ->update(['supplier_id' => $supplierId]);
                }
            }
        }

        // 4. Historical Fix for PR 9, PO 9, and its Goods Receipt (Receipt 8 / GRN-SITE-20260928152325-9)
        $this->syncPo9AndReceipt8();
    }

    private function syncPo9AndReceipt8(): void
    {
        if (! Schema::hasTable('purchase_orders') || ! Schema::hasTable('purchase_order_items')) {
            return;
        }

        $po9 = DB::table('purchase_orders')->where('id', 9)->first();
        $pr9 = DB::table('purchase_requests')->where('id', 9)->first();

        if (! $po9 || ! $pr9) {
            return;
        }

        // Ensure item 21 on PO 9 has supplier_id 153
        DB::table('purchase_order_items')
            ->where('purchase_order_id', 9)
            ->where('pr_item_id', 21)
            ->update(['supplier_id' => 153]);

        // Check if item 22 (طوب اسمنتى) exists on PO 9
        $existingPoi22 = DB::table('purchase_order_items')
            ->where('purchase_order_id', 9)
            ->where('pr_item_id', 22)
            ->first();

        $poi22Id = $existingPoi22?->id;
        if (! $existingPoi22) {
            $poi22Id = DB::table('purchase_order_items')->insertGetId([
                'purchase_order_id' => 9,
                'pr_item_id'        => 22,
                'item_id'           => 17,
                'item_description'  => 'طوب اسمنتى',
                'item_reference'    => 'مبانى الاول علوى ٨١٨',
                'region'            => 'م ٢٦',
                'quantity'          => 3.00,
                'uom'               => 'THOUSAND_BRICKS',
                'unit_price'        => 3150.00,
                'discount_amount'   => 0.00,
                'tax_amount'        => 0.00,
                'line_total'        => 9450.00,
                'supplier_id'       => 126,
                'specifications'    => null,
                'created_at'        => $po9->created_at ?? now(),
                'updated_at'        => now(),
            ]);
        } else {
            DB::table('purchase_order_items')
                ->where('id', $poi22Id)
                ->update(['supplier_id' => 126]);
        }

        // Check if item 23 (اسمنت الممتاز) exists on PO 9
        $existingPoi23 = DB::table('purchase_order_items')
            ->where('purchase_order_id', 9)
            ->where('pr_item_id', 23)
            ->first();

        $poi23Id = $existingPoi23?->id;
        if (! $existingPoi23) {
            $poi23Id = DB::table('purchase_order_items')->insertGetId([
                'purchase_order_id' => 9,
                'pr_item_id'        => 23,
                'item_id'           => 18,
                'item_description'  => 'اسمنت الممتاز',
                'item_reference'    => 'مبانى الاول علوى ٨١٨',
                'region'            => 'م ٢٦',
                'quantity'          => 2.00,
                'uom'               => 'TON',
                'unit_price'        => 4070.00,
                'discount_amount'   => 0.00,
                'tax_amount'        => 0.00,
                'line_total'        => 8140.00,
                'supplier_id'       => 126,
                'specifications'    => null,
                'created_at'        => $po9->created_at ?? now(),
                'updated_at'        => now(),
            ]);
        } else {
            DB::table('purchase_order_items')
                ->where('id', $poi23Id)
                ->update(['supplier_id' => 126]);
        }

        // Recalculate PO 9 subtotal and grand_total
        $total = DB::table('purchase_order_items')
            ->where('purchase_order_id', 9)
            ->sum('line_total');

        DB::table('purchase_orders')
            ->where('id', 9)
            ->update([
                'subtotal'    => $total,
                'grand_total' => $total,
            ]);

        // Sync with PO 9's Goods Receipt (Receipt 8)
        if (Schema::hasTable('purchase_receipts') && Schema::hasTable('purchase_receipt_items')) {
            $receipt = DB::table('purchase_receipts')->where('purchase_order_id', 9)->first();
            if ($receipt) {
                // Ensure receipt item for poi22
                if ($poi22Id) {
                    $hasRi22 = DB::table('purchase_receipt_items')
                        ->where('purchase_receipt_id', $receipt->id)
                        ->where('purchase_order_item_id', $poi22Id)
                        ->exists();

                    if (! $hasRi22) {
                        DB::table('purchase_receipt_items')->insert([
                            'purchase_receipt_id'    => $receipt->id,
                            'purchase_order_item_id' => $poi22Id,
                            'ordered_quantity'       => 3.00,
                            'received_quantity'      => 3.00,
                            'notes'                  => 'توريد مباشر لموقع المباني',
                            'created_at'             => $receipt->created_at ?? now(),
                            'updated_at'             => now(),
                        ]);
                    }
                }

                // Ensure receipt item for poi23
                if ($poi23Id) {
                    $hasRi23 = DB::table('purchase_receipt_items')
                        ->where('purchase_receipt_id', $receipt->id)
                        ->where('purchase_order_item_id', $poi23Id)
                        ->exists();

                    if (! $hasRi23) {
                        DB::table('purchase_receipt_items')->insert([
                            'purchase_receipt_id'    => $receipt->id,
                            'purchase_order_item_id' => $poi23Id,
                            'ordered_quantity'       => 2.00,
                            'received_quantity'      => 2.00,
                            'notes'                  => 'توريد مباشر لموقع المباني',
                            'created_at'             => $receipt->created_at ?? now(),
                            'updated_at'             => now(),
                        ]);
                    }
                }
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('purchase_order_items') && Schema::hasColumn('purchase_order_items', 'supplier_id')) {
            Schema::table('purchase_order_items', function (Blueprint $table) {
                $table->dropForeign(['supplier_id']);
                $table->dropColumn('supplier_id');
            });
        }
    }
};
