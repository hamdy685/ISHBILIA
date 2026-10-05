<?php

namespace Tests\Feature\Api\V1;

use App\Models\Department;
use App\Models\PurchaseOrder;
use App\Models\PurchaseRequest;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ActualPoFinancialIntegrityTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_actual_purchase_orders_enter_financial_analytics_spend(): void
    {
        $this->seed(RolePermissionSeeder::class);

        $admin = $this->createUser('admin@ashbiliya.com', 'مدير النظام', 'admin');
        $dept = Department::create(['name' => 'مشروعات', 'code' => 'PRJ', 'is_active' => true]);
        $supplier = Supplier::create(['company_name' => 'شركة التوريدات العالمية', 'is_active' => true]);

        $pr = PurchaseRequest::create([
            'user_id' => $admin->id,
            'department_id' => $dept->id,
            'requester_user_id' => $admin->id,
            'request_number' => 'PR-TEST-001',
            'status' => 'APPROVED_BY_PROCUREMENT',
            'requires_warehouse_receipt' => true,
        ]);

        // 1. Preliminary PO (Unfinalized, waiting for actual issuance) - 50,000 EGP
        $preliminaryPo = PurchaseOrder::create([
            'purchase_request_id' => $pr->id,
            'supplier_id' => $supplier->id,
            'created_by_user_id' => $admin->id,
            'po_number' => 'PO-PRELIMINARY-1',
            'status' => 'PENDING_ACTUAL_PO',
            'finalized_at' => null,
            'grand_total' => 50000,
        ]);

        // 2. Actual Finalized PO - 30,000 EGP
        $actualPo = PurchaseOrder::create([
            'purchase_request_id' => $pr->id,
            'supplier_id' => $supplier->id,
            'created_by_user_id' => $admin->id,
            'po_number' => 'PO-ACTUAL-1',
            'status' => 'FINAL_APPROVED',
            'finalized_at' => now(),
            'grand_total' => 30000,
        ]);

        // Query Procurement Analytics API
        $response = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/procurement/analytics?period=all&actual_only=true');

        $response->assertOk();
        $metrics = $response->json('metrics');

        // Total Value must ONLY reflect the actual PO (30,000), NOT 80,000!
        $this->assertEquals('30000.00', $metrics['total_value']);
        $this->assertEquals(1, $metrics['purchase_orders_count']);

        // Check Admin Master Orders API
        $adminMasterResponse = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/admin/all-orders-master');

        $adminMasterResponse->assertOk();
        $adminStats = $adminMasterResponse->json('stats');

        // Total Financial Value must be 30,000, not including the 50,000 preliminary order
        $this->assertEquals(30000, $adminStats['total_financial_value']);
        $this->assertEquals(80000, $adminStats['total_estimated_value']);
    }

    private function createUser(string $email, string $name, string $roleSlug): User
    {
        $user = User::create([
            'name' => $name,
            'email' => $email,
            'password' => Hash::make('Secret123!'),
            'is_active' => true,
        ]);

        $role = Role::where('slug', $roleSlug)->firstOrFail();
        $user->roles()->attach($role->id);

        return $user;
    }
}
