<?php

namespace Tests\Feature\Api\V1;

use App\Models\Department;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\PurchaseReceipt;
use App\Models\PurchaseReceiptItem;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestItem;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\SystemEvent;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AdminMasterOrdersTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);
    }

    private function makeUser(string $roleSlug, string $email): User
    {
        $user = User::create([
            'name' => ucfirst($roleSlug) . ' Test User',
            'email' => $email,
            'password' => Hash::make('Secret123!'),
            'is_active' => true,
        ]);

        $role = Role::where('slug', $roleSlug)->firstOrFail();
        $user->roles()->attach($role->id);

        return $user;
    }

    public function test_admin_can_access_all_orders_master(): void
    {
        $admin = $this->makeUser('admin', 'admin-master-test@ashbiliya.com');
        $dept = Department::create(['name' => 'إدارة التنفيذ', 'code' => 'EXEC']);
        $supplier = Supplier::create([
            'company_name' => 'شركة الراجحي للحديد',
            'name' => 'سعيد الراجحي',
            'email' => 'rajhi@example.com',
            'is_active' => true,
        ]);

        $pr = PurchaseRequest::create([
            'request_number' => 'PR-2026-9001',
            'department_id' => $dept->id,
            'user_id' => $admin->id,
            'status' => 'APPROVED_BY_PROCUREMENT',
            'total_estimated_cost' => 50000,
        ]);

        $po = PurchaseOrder::create([
            'po_number' => 'PO-2026-9001',
            'purchase_request_id' => $pr->id,
            'supplier_id' => $supplier->id,
            'created_by_user_id' => $admin->id,
            'status' => 'ISSUED',
            'subtotal' => 50000,
            'grand_total' => 50000,
        ]);

        PurchaseOrderItem::create([
            'purchase_order_id' => $po->id,
            'item_description' => 'حديد تسليح 16 مم',
            'quantity' => 10,
            'uom' => 'TON',
            'unit_price' => 5000,
            'line_total' => 50000,
        ]);

        $response = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/admin/all-orders-master');

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonStructure([
                'success',
                'data',
                'meta',
                'stats' => [
                    'total_count',
                    'invoiced_count',
                    'actual_po_count',
                    'pending_actual_po_count',
                    'po_issued_count',
                    'total_financial_value',
                ],
                'lookups',
            ]);

        $data = $response->json('data');
        $this->assertNotEmpty($data);
        $this->assertEquals('PO-2026-9001', $data[0]['po_number']);
        $this->assertEquals('PO_ISSUED', $data[0]['cycle_stage']);
    }

    public function test_admin_can_perform_force_update_override_on_order(): void
    {
        $admin = $this->makeUser('admin', 'admin-force-test@ashbiliya.com');
        $dept = Department::create(['name' => 'إدارة المشروعات', 'code' => 'PROJ']);
        $supplier = Supplier::create([
            'company_name' => 'مؤسسة البناء الحديث',
            'name' => 'أحمد البناء',
            'email' => 'binaa@example.com',
            'is_active' => true,
        ]);

        $pr = PurchaseRequest::create([
            'request_number' => 'PR-2026-9002',
            'department_id' => $dept->id,
            'user_id' => $admin->id,
            'status' => 'APPROVED_BY_ACCOUNTING',
            'total_estimated_cost' => 10000,
        ]);

        $po = PurchaseOrder::create([
            'po_number' => 'PO-2026-9002',
            'purchase_request_id' => $pr->id,
            'supplier_id' => $supplier->id,
            'created_by_user_id' => $admin->id,
            'status' => 'PENDING_ACTUAL_PO',
            'subtotal' => 10000,
            'grand_total' => 10000,
        ]);

        $poItem = PurchaseOrderItem::create([
            'purchase_order_id' => $po->id,
            'item_description' => 'إسمنت بورتلاندي',
            'quantity' => 100,
            'uom' => 'BAG',
            'unit_price' => 100,
            'line_total' => 10000,
        ]);

        $receipt = PurchaseReceipt::create([
            'purchase_order_id' => $po->id,
            'receipt_number' => 'GRN-2026-9002',
            'status' => 'APPROVED',
        ]);

        PurchaseReceiptItem::create([
            'purchase_receipt_id' => $receipt->id,
            'purchase_order_item_id' => $poItem->id,
            'ordered_quantity' => 100,
            'received_quantity' => 100,
            'uom' => 'BAG',
        ]);

        // Force update: change price from 100 to 120 and qty from 100 to 120, and force status to ISSUED + is_actual_po
        $payload = [
            'status' => 'ISSUED',
            'is_actual_po' => true,
            'admin_reason' => 'تصحيح مباشر للكميات الفعلية بعد توقيع محاضر الموقع',
            'sync_receipt' => true,
            'sync_pr' => true,
            'items' => [
                [
                    'id' => $poItem->id,
                    'item_description' => 'إسمنت بورتلاندي ممتاز',
                    'quantity' => 120,
                    'uom' => 'BAG',
                    'unit_price' => 120,
                    'specifications' => 'مقاوم للكبريتات',
                ],
            ],
        ];

        $response = $this->actingAs($admin, 'sanctum')
            ->putJson("/api/v1/admin/orders/{$po->id}/force-update", $payload);

        $response->assertOk()
            ->assertJsonPath('success', true);

        // Verify PO was updated
        $po->refresh();
        $this->assertEquals('ISSUED', $po->status);
        $this->assertNotNull($po->finalized_at);
        $this->assertEquals(14400, (float) $po->grand_total);

        // Verify receipt item was synchronized
        $rcptItem = PurchaseReceiptItem::where('purchase_receipt_id', $receipt->id)->first();
        $this->assertEquals(120, (float) $rcptItem->received_quantity);

        // Verify Audit Log was recorded
        $auditEvent = SystemEvent::where('action', 'ADMIN_FORCE_UPDATE')
            ->where('entity_id', $po->id)
            ->first();

        $this->assertNotNull($auditEvent);
        $this->assertEquals($admin->id, $auditEvent->actor_user_id);
        $this->assertStringContainsString('تصحيح مباشر للكميات الفعلية', $auditEvent->description);
    }

    public function test_non_admin_cannot_access_or_force_update(): void
    {
        $employee = $this->makeUser('employee', 'emp-test@ashbiliya.com');

        $response = $this->actingAs($employee, 'sanctum')
            ->getJson('/api/v1/admin/all-orders-master');
        $response->assertForbidden();

        $response2 = $this->actingAs($employee, 'sanctum')
            ->putJson('/api/v1/admin/orders/1/force-update', [
                'admin_reason' => 'hacking',
            ]);
        $response2->assertForbidden();
    }
}
