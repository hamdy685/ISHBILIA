<?php

namespace Tests\Feature\Api\V1;

use App\Models\Department;
use App\Models\LandParcel;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\PurchaseReceipt;
use App\Models\PurchaseReceiptItem;
use App\Models\PurchaseRequest;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\SupplierInvoice;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AdminControlCenterReceiptsSearchTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);
    }

    private function makeUser(string $roleSlug, string $email): User
    {
        $role = Role::where('slug', $roleSlug)->first() ?: Role::create(['name' => $roleSlug, 'slug' => $roleSlug, 'label' => $roleSlug]);
        $user = User::create([
            'name' => "User {$roleSlug}",
            'email' => $email,
            'password' => Hash::make('password123'),
            'role_id' => $role->id,
            'is_active' => true,
        ]);
        $user->roles()->syncWithoutDetaching([$role->id]);

        return $user;
    }

    public function test_admin_control_center_search_returns_rich_decision_making_columns_for_receipts(): void
    {
        $admin = $this->makeUser('admin', 'admin-rich-receipts@ashbiliya.com');
        $dept = Department::create(['name' => 'إدارة التنفيذ والإنشاءات', 'code' => 'EXEC-01']);

        $supplier = Supplier::create([
            'company_name' => 'شركة الأهرام للحديد والصلب',
            'name' => 'المورد الأساسي',
            'email' => 'steel@ahram.com',
            'is_active' => true,
        ]);

        $landParcel = LandParcel::create([
            'parcel_reference' => '142',
            'region' => 'A1',
            'notes' => 'مشروع فيلات الياسمين',
        ]);

        $requester = $this->makeUser('employee', 'eng-ahmed@ashbiliya.com');
        $siteEngineer = $this->makeUser('site_engineer', 'site-hatem@ashbiliya.com');

        $pr = PurchaseRequest::create([
            'request_number' => 'PR-2026-SITE-142',
            'department_id' => $dept->id,
            'user_id' => $requester->id,
            'land_parcel_id' => $landParcel->id,
            'project_site' => 'مشروع فيلات الياسمين',
            'status' => 'APPROVED_BY_PROCUREMENT',
            'total_estimated_cost' => 60000,
        ]);

        $po = PurchaseOrder::create([
            'po_number' => 'PO-2026-REC-142',
            'purchase_request_id' => $pr->id,
            'supplier_id' => $supplier->id,
            'created_by_user_id' => $admin->id,
            'status' => 'ISSUED',
            'subtotal' => 60000,
            'grand_total' => 60000,
        ]);

        $poItem1 = PurchaseOrderItem::create([
            'purchase_order_id' => $po->id,
            'item_description' => 'حديد تسليح 12 مم عز',
            'item_reference' => '142',
            'region' => 'A1',
            'quantity' => 10,
            'uom' => 'TON',
            'unit_price' => 4500,
            'line_total' => 45000,
        ]);

        $poItem2 = PurchaseOrderItem::create([
            'purchase_order_id' => $po->id,
            'item_description' => 'سلك رباط مجلفن',
            'item_reference' => '142',
            'region' => 'A1',
            'quantity' => 50,
            'uom' => 'ROLL',
            'unit_price' => 300,
            'line_total' => 15000,
        ]);

        $receipt = PurchaseReceipt::create([
            'purchase_order_id' => $po->id,
            'purchase_request_id' => $pr->id,
            'receipt_number' => 'REC-2026-999',
            'supplier_id' => $supplier->id,
            'site_engineer_user_id' => $siteEngineer->id,
            'actual_receiver_name' => 'م. حاتم الشرقاوي',
            'status' => 'PENDING_SITE_ENGINEER',
            'photo_path' => 'receipts/photos/slip_142.jpg',
            'photo_name' => 'slip_142.jpg',
            'site_engineer_notes' => 'تم فحص أقطار الحديد ومطابقتها للمواصفات بالكود المصري',
            'warehouse_notes' => 'تم الاستلام بمدخل الموقع',
        ]);

        PurchaseReceiptItem::create([
            'purchase_receipt_id' => $receipt->id,
            'purchase_order_item_id' => $poItem1->id,
            'ordered_quantity' => 10,
            'received_quantity' => 10,
        ]);

        PurchaseReceiptItem::create([
            'purchase_receipt_id' => $receipt->id,
            'purchase_order_item_id' => $poItem2->id,
            'ordered_quantity' => 50,
            'received_quantity' => 40,
        ]);

        // Search Admin Control Center for this receipt
        $response = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/admin/control/search?entity_type=PURCHASE_RECEIPT&q=REC-2026-999');

        $response->assertOk()
            ->assertJsonPath('success', true);

        $data = $response->json('data');
        $this->assertNotEmpty($data);

        $row = collect($data)->firstWhere('id', $receipt->id);
        $this->assertNotNull($row);

        // Assert rich fields are present and accurate
        $this->assertEquals('PURCHASE_RECEIPT', $row['entity_type']);
        $this->assertEquals('REC-2026-999', $row['code']);
        $this->assertEquals($po->id, $row['po_id']);
        $this->assertEquals('PO-2026-REC-142', $row['po_number']);
        $this->assertEquals($pr->id, $row['pr_id']);
        $this->assertEquals('PR-2026-SITE-142', $row['pr_number']);
        $this->assertEquals($requester->name, $row['requester_name']);
        $this->assertEquals('شركة الأهرام للحديد والصلب', $row['supplier']);
        $this->assertEquals('إدارة التنفيذ والإنشاءات', $row['department']);
        $this->assertEquals('م. حاتم الشرقاوي', $row['receiver']);
        $this->assertEquals('142', $row['parcel_reference']);
        $this->assertEquals('A1', $row['region']);
        $this->assertStringContainsString('142', $row['project_site']);
        $this->assertStringContainsString('A1', $row['project_site']);
        $this->assertTrue($row['has_photo']);
        $this->assertNotNull($row['photo_url']);
        $this->assertEquals(2, $row['items_count']);
        $this->assertEquals(50, (float) $row['total_quantity']); // 10 ton + 40 rolls = 50 total qty
        // Calculated amount: 10 * 4500 + 40 * 300 = 45000 + 12000 = 57000
        $this->assertEquals(57000, (float) $row['amount']);
        $this->assertCount(2, $row['items_list']);
        $this->assertEquals('حديد تسليح 12 مم عز', $row['items_list'][0]['item_description']);
        $this->assertEquals(10, (float) $row['items_list'][0]['received_quantity']);
        $this->assertEquals('PENDING_INVOICE', $row['invoice_status']);
    }
}
