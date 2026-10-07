<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Item;
use App\Models\PurchaseOrder;
use App\Models\PurchaseReceipt;
use App\Models\PurchaseRequest;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use Database\Seeders\CleanProductionPurgeSeeder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class PurgeOperationalPurchasingDataTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);
    }

    public function test_purge_command_clears_operational_data_and_strictly_preserves_master_records(): void
    {
        // 1. Arrange master data (users, roles, departments, suppliers, items)
        $department = Department::firstOrCreate(['code' => 'TEST_DEPT'], ['name' => 'قسم التجربة', 'is_active' => true]);
        
        $user = User::create([
            'department_id' => $department->id,
            'name' => 'مهندس تجريبي',
            'email' => 'eng_test@ashbiliya.com',
            'password' => Hash::make('Password123!'),
            'is_active' => true,
        ]);

        $supplier = Supplier::create([
            'code' => 'SUP-PURGE-001',
            'company_name' => 'شركة المورد المعتمد',
            'is_active' => true,
            'opening_balance' => 1000,
        ]);

        $item = Item::create([
            'sku' => 'SKU-REBAR-12',
            'name' => 'حديد تسليح 12 مم',
            'uom' => 'طن',
            'is_active' => true,
        ]);

        $userCountBefore = User::count();
        $supplierCountBefore = Supplier::count();
        $itemCountBefore = Item::count();
        $deptCountBefore = Department::count();
        $roleCountBefore = Role::count();

        // 2. Create operational transactions (PR, PO, Receipt, Quote, Supplement)
        $pr = PurchaseRequest::create([
            'request_number' => 'PR-2026-99991',
            'user_id' => $user->id,
            'department_id' => $department->id,
            'status' => 'PENDING_APPROVAL',
            'date_needed' => now()->toDateString(),
        ]);

        DB::table('purchase_request_items')->insert([
            'purchase_request_id' => $pr->id,
            'item_id' => $item->id,
            'item_description' => 'حديد تسليح 12 مم',
            'quantity' => 50,
            'uom' => 'طن',
            'item_reference' => 'قطعة 10',
            'region' => 'منطقة أ',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('purchase_request_supplements')->insert([
            'purchase_request_id' => $pr->id,
            'batch_number' => 1,
            'requested_by_user_id' => $user->id,
            'status' => 'PENDING_PROCUREMENT',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('purchase_request_quotes')->insert([
            'purchase_request_id' => $pr->id,
            'supplier_id' => $supplier->id,
            'created_by_user_id' => $user->id,
            'total_amount' => 50000,
            'status' => 'PENDING',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $po = PurchaseOrder::create([
            'po_number' => 'PO-TEST-99991',
            'purchase_request_id' => $pr->id,
            'supplier_id' => $supplier->id,
            'status' => 'ISSUED',
            'created_by_user_id' => $user->id,
            'grand_total' => 50000,
        ]);

        $poItemId = DB::table('purchase_order_items')->insertGetId([
            'purchase_order_id' => $po->id,
            'item_description' => 'حديد تسليح',
            'quantity' => 50,
            'unit_price' => 1000,
            'line_total' => 50000,
            'supplier_id' => $supplier->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $receipt = PurchaseReceipt::create([
            'receipt_number' => 'GRN-TEST-99991',
            'purchase_order_id' => $po->id,
            'purchase_request_id' => $pr->id,
            'supplier_id' => $supplier->id,
            'warehouse_keeper_user_id' => $user->id,
            'site_engineer_user_id' => $user->id,
            'status' => 'APPROVED',
        ]);

        DB::table('purchase_receipt_items')->insert([
            'purchase_receipt_id' => $receipt->id,
            'purchase_order_item_id' => $poItemId,
            'ordered_quantity' => 50,
            'received_quantity' => 50,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('supplier_invoices')->insert([
            'invoice_number' => 'INV-99991',
            'purchase_order_id' => $po->id,
            'purchase_receipt_id' => $receipt->id,
            'supplier_id' => $supplier->id,
            'created_by_user_id' => $user->id,
            'amount' => 50000,
            'invoice_date' => now()->toDateString(),
            'status' => 'REGISTERED',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('supplier_balances')->insert([
            'supplier_id' => $supplier->id,
            'total_invoiced' => 50000,
            'total_paid' => 10000,
            'balance' => 40000,
            'opening_balance' => 1000,
            'last_activity_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Assert operational records exist before purge
        $this->assertGreaterThan(0, PurchaseRequest::count());
        $this->assertGreaterThan(0, PurchaseOrder::count());
        $this->assertGreaterThan(0, PurchaseReceipt::count());
        $this->assertGreaterThan(0, DB::table('purchase_request_supplements')->count());
        $this->assertGreaterThan(0, DB::table('purchase_request_quotes')->count());
        $this->assertGreaterThan(0, DB::table('supplier_invoices')->count());

        // 3. Act: Run the purge command with --force
        $this->artisan('purchasing:purge-operational-data', ['--force' => true])
            ->assertSuccessful();

        // 4. Assert: All operational tables are 0
        $this->assertSame(0, PurchaseRequest::count());
        $this->assertSame(0, PurchaseOrder::count());
        $this->assertSame(0, PurchaseReceipt::count());
        $this->assertSame(0, DB::table('purchase_request_items')->count());
        $this->assertSame(0, DB::table('purchase_order_items')->count());
        $this->assertSame(0, DB::table('purchase_receipt_items')->count());
        $this->assertSame(0, DB::table('purchase_request_quotes')->count());
        $this->assertSame(0, DB::table('purchase_request_supplements')->count());
        $this->assertSame(0, DB::table('supplier_invoices')->count());

        // Supplier balance reset to opening_balance, invoices and payments cleared
        $supplierBalance = DB::table('supplier_balances')->where('supplier_id', $supplier->id)->first();
        $this->assertNotNull($supplierBalance);
        $this->assertEquals(0, $supplierBalance->total_invoiced);
        $this->assertEquals(0, $supplierBalance->total_paid);
        $this->assertEquals(1000, $supplierBalance->balance);
        $this->assertNull($supplierBalance->last_activity_at);

        // 5. Assert: Master data is 100% preserved
        $this->assertSame($userCountBefore, User::count());
        $this->assertSame($supplierCountBefore, Supplier::count());
        $this->assertSame($itemCountBefore, Item::count());
        $this->assertSame($deptCountBefore, Department::count());
        $this->assertSame($roleCountBefore, Role::count());
    }

    public function test_clean_production_purge_seeder_runs_cleanly(): void
    {
        $department = Department::firstOrCreate(['code' => 'SEEDED_DEPT'], ['name' => 'قسم تجريبي آخر', 'is_active' => true]);
        
        $user = User::create([
            'department_id' => $department->id,
            'name' => 'موظف بذور',
            'email' => 'seeder_user@ashbiliya.com',
            'password' => Hash::make('Password123!'),
            'is_active' => true,
        ]);

        $supplier = Supplier::create([
            'code' => 'SUP-SEED-001',
            'company_name' => 'مورد إضافي',
            'is_active' => true,
            'opening_balance' => 0,
        ]);

        $pr = PurchaseRequest::create([
            'request_number' => 'PR-2026-88881',
            'user_id' => $user->id,
            'department_id' => $department->id,
            'status' => 'PENDING_APPROVAL',
            'date_needed' => now()->toDateString(),
        ]);

        $this->assertGreaterThan(0, PurchaseRequest::count());

        // Run the seeder
        $this->seed(CleanProductionPurgeSeeder::class);

        // Operational data cleared
        $this->assertSame(0, PurchaseRequest::count());

        // Users & Suppliers preserved
        $this->assertTrue(User::where('id', $user->id)->exists());
        $this->assertTrue(Supplier::where('id', $supplier->id)->exists());
    }
}
