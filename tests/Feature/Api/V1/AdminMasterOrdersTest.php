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
use App\Models\SupplierInvoice;
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

        $response3 = $this->actingAs($employee, 'sanctum')
            ->deleteJson('/api/v1/admin/orders/1/force-delete', [
                'reason' => 'hacking',
            ]);
        $response3->assertForbidden();
    }

    public function test_admin_can_force_delete_order_and_its_entire_document_cycle(): void
    {
        $admin = $this->makeUser('admin', 'admin-delete-test@ashbiliya.com');
        $dept = Department::create(['name' => 'إدارة التنفيذ', 'code' => 'EXEC2']);
        $supplier = Supplier::create([
            'company_name' => 'شركة توريدات الدلتا',
            'name' => 'محمد الدلتا',
            'email' => 'delta@example.com',
            'is_active' => true,
        ]);

        $pr = PurchaseRequest::create([
            'request_number' => 'PR-2026-9003',
            'department_id' => $dept->id,
            'user_id' => $admin->id,
            'status' => 'APPROVED_BY_ACCOUNTING',
            'total_estimated_cost' => 30000,
        ]);

        $prItem = PurchaseRequestItem::create([
            'purchase_request_id' => $pr->id,
            'item_description' => 'طوب أحمر مفرغ',
            'quantity' => 1000,
            'uom' => 'PIECE',
            'estimated_unit_price' => 30,
            'estimated_line_total' => 30000,
        ]);

        $po = PurchaseOrder::create([
            'po_number' => 'PO-2026-9003',
            'purchase_request_id' => $pr->id,
            'supplier_id' => $supplier->id,
            'created_by_user_id' => $admin->id,
            'status' => 'ISSUED',
            'subtotal' => 30000,
            'grand_total' => 30000,
        ]);

        $poItem = PurchaseOrderItem::create([
            'purchase_order_id' => $po->id,
            'item_description' => 'طوب أحمر مفرغ',
            'quantity' => 1000,
            'uom' => 'PIECE',
            'unit_price' => 30,
            'line_total' => 30000,
        ]);

        $receipt = PurchaseReceipt::create([
            'purchase_order_id' => $po->id,
            'purchase_request_id' => $pr->id,
            'receipt_number' => 'GRN-2026-9003',
            'status' => 'APPROVED',
        ]);

        $receiptItem = PurchaseReceiptItem::create([
            'purchase_receipt_id' => $receipt->id,
            'purchase_order_item_id' => $poItem->id,
            'ordered_quantity' => 1000,
            'received_quantity' => 1000,
            'uom' => 'PIECE',
        ]);

        $invoice = SupplierInvoice::create([
            'supplier_id' => $supplier->id,
            'purchase_order_id' => $po->id,
            'purchase_receipt_id' => $receipt->id,
            'created_by_user_id' => $admin->id,
            'invoice_number' => 'INV-2026-9003',
            'amount' => 30000,
            'status' => 'PENDING',
            'invoice_date' => now()->toDateString(),
        ]);

        $response = $this->actingAs($admin, 'sanctum')
            ->deleteJson("/api/v1/admin/orders/{$po->id}/force-delete", [
                'reason' => 'طلب تجريبي تم إلغاؤه نهائياً',
            ]);

        $response->assertOk()
            ->assertJsonPath('success', true);

        // Verify cascading hard deletion of entire cycle
        $this->assertDatabaseMissing('purchase_orders', ['id' => $po->id]);
        $this->assertDatabaseMissing('purchase_order_items', ['id' => $poItem->id]);
        $this->assertDatabaseMissing('purchase_receipts', ['id' => $receipt->id]);
        $this->assertDatabaseMissing('purchase_receipt_items', ['id' => $receiptItem->id]);
        $this->assertDatabaseMissing('supplier_invoices', ['id' => $invoice->id]);
        $this->assertDatabaseMissing('purchase_requests', ['id' => $pr->id]);
        $this->assertDatabaseMissing('purchase_request_items', ['id' => $prItem->id]);

        // Verify System Audit Trail Event was recorded
        $auditEvent = SystemEvent::where('action', 'ADMIN_FORCE_DELETE')->latest('id')->first();
        $this->assertNotNull($auditEvent);
        $this->assertEquals($admin->id, $auditEvent->actor_user_id);
        $this->assertStringContainsString('طلب تجريبي تم إلغاؤه نهائياً', $auditEvent->description);
    }

    public function test_admin_can_force_delete_standalone_purchase_request(): void
    {
        $admin = $this->makeUser('admin', 'admin-pr-del@ashbiliya.com');
        $dept = Department::create(['name' => 'إدارة الخدمات', 'code' => 'SERV']);

        $pr = PurchaseRequest::create([
            'request_number' => 'PR-2026-9004',
            'department_id' => $dept->id,
            'user_id' => $admin->id,
            'status' => 'SUBMITTED',
            'total_estimated_cost' => 5000,
        ]);

        $prItem = PurchaseRequestItem::create([
            'purchase_request_id' => $pr->id,
            'item_description' => 'أدوات مكتبية وقرطاسية',
            'quantity' => 10,
            'uom' => 'SET',
            'estimated_unit_price' => 500,
            'estimated_line_total' => 5000,
        ]);

        $response = $this->actingAs($admin, 'sanctum')
            ->deleteJson("/api/v1/admin/orders/{$pr->id}/force-delete", [
                'entity_type' => 'request',
                'reason' => 'طلب مكرر بالخطأ',
            ]);

        $response->assertOk()
            ->assertJsonPath('success', true);

        $this->assertDatabaseMissing('purchase_requests', ['id' => $pr->id]);
        $this->assertDatabaseMissing('purchase_request_items', ['id' => $prItem->id]);
    }
}

