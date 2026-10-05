<?php

namespace Tests\Feature\Api\V1;

use App\Models\Department;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\PurchaseRequest;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\SupplierPayment;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class SupplierLedgerBalanceBroughtForwardTest extends TestCase
{
    use RefreshDatabase;

    public function test_supplier_ledger_calculates_balance_brought_forward_correctly(): void
    {
        $this->seed(RolePermissionSeeder::class);

        $admin = $this->createUser('admin@ashbiliya.com', 'مدير النظام', 'admin');
        $dept = Department::create(['name' => 'إدارة التنفيذ', 'code' => 'EXECUTION', 'is_active' => true]);
        $supplier = Supplier::create([
            'company_name' => 'مورد الأسمنت والحديد',
            'opening_balance' => 10000.00,
            'is_active' => true,
            'created_at' => '2026-01-15 09:00:00',
        ]);

        $pr = PurchaseRequest::create([
            'user_id' => $admin->id,
            'department_id' => $dept->id,
            'requester_user_id' => $admin->id,
            'request_number' => 'PR-LEDGER-001',
            'status' => 'APPROVED_BY_PROCUREMENT',
            'requires_warehouse_receipt' => true,
            'created_at' => '2026-02-01 09:00:00',
        ]);

        // Historical order in February 2026: 25,000 EGP
        $poPast = PurchaseOrder::create([
            'purchase_request_id' => $pr->id,
            'supplier_id' => $supplier->id,
            'created_by_user_id' => $admin->id,
            'po_number' => 'PO-PAST-01',
            'status' => 'FINAL_APPROVED',
            'finalized_at' => '2026-02-10 10:00:00',
            'order_date' => '2026-02-10',
            'created_at' => '2026-02-10 10:00:00',
            'grand_total' => 25000,
        ]);

        PurchaseOrderItem::create([
            'purchase_order_id' => $poPast->id,
            'supplier_id' => $supplier->id,
            'item_description' => 'أسمنت مقاوم',
            'quantity' => 10,
            'unit_price' => 2500,
            'line_total' => 25000,
        ]);

        // Historical payment in February 2026: 15,000 EGP
        SupplierPayment::create([
            'supplier_id' => $supplier->id,
            'accountant_user_id' => $admin->id,
            'payment_number' => 'PAY-PAST-01',
            'amount' => 15000,
            'payment_date' => '2026-02-15',
            'payment_method' => 'BANK_TRANSFER',
        ]);

        // Order in March 2026 (Current period): 40,000 EGP
        $poCurrent = PurchaseOrder::create([
            'purchase_request_id' => $pr->id,
            'supplier_id' => $supplier->id,
            'created_by_user_id' => $admin->id,
            'po_number' => 'PO-CURRENT-01',
            'status' => 'FINAL_APPROVED',
            'finalized_at' => '2026-03-05 10:00:00',
            'order_date' => '2026-03-05',
            'grand_total' => 40000,
        ]);

        PurchaseOrderItem::create([
            'purchase_order_id' => $poCurrent->id,
            'supplier_id' => $supplier->id,
            'item_description' => 'حديد تسليح',
            'quantity' => 1,
            'unit_price' => 40000,
            'line_total' => 40000,
        ]);

        // 1. Without date filter: Returns complete ledger starting from opening balance
        $respFull = $this->actingAs($admin, 'sanctum')
            ->getJson("/api/v1/accounting/suppliers/{$supplier->id}/account");

        $respFull->assertOk();
        $ledgerFull = $respFull->json('data.ledger');
        $this->assertNotEmpty($ledgerFull);

        // 2. With date filter: from_date = 2026-03-01
        // Expected Prior Balance = Opening Balance (10,000) + Past Supply (25,000) - Past Payment (15,000) = 20,000 EGP
        $respFiltered = $this->actingAs($admin, 'sanctum')
            ->getJson("/api/v1/accounting/suppliers/{$supplier->id}/account?from_date=2026-03-01");

        $respFiltered->assertOk();
        $ledgerFiltered = $respFiltered->json('data.ledger');
        $this->assertNotEmpty($ledgerFiltered);

        // First row must be CARRIED_FORWARD with balance = 20,000
        $firstRow = $ledgerFiltered[0];
        $this->assertEquals('CARRIED_FORWARD', $firstRow['type']);
        $this->assertEquals(20000.0, (float) $firstRow['balance']);
        $this->assertEquals(20000.0, (float) $firstRow['value']);

        // Next row should be the current order and running balance should be 20,000 + 40,000 = 60,000
        $secondRow = $ledgerFiltered[1];
        $this->assertEquals('SUPPLY', $secondRow['type']);
        $this->assertEquals(60000.0, (float) $secondRow['balance']);
    }

    private function createUser(string $email, string $name, string $roleSlug): User
    {
        $user = User::create([
            'name' => $name,
            'email' => $email,
            'password' => Hash::make('password123'),
        ]);

        $role = Role::firstOrCreate(
            ['slug' => $roleSlug],
            ['name' => $name, 'is_active' => true]
        );

        $user->roles()->syncWithoutDetaching([$role->id]);

        return $user;
    }
}
