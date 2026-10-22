<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\PurchaseReceipt;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestItem;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PurchaseOrderInvoiceWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private User $procurementManager;
    private User $siteAccountant;
    private Supplier $supplier;
    private Department $dept;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        $this->seed(RolePermissionSeeder::class);

        $this->dept = Department::firstOrCreate(
            ['code' => 'EXECUTION'],
            ['name' => 'إدارة التنفيذ', 'is_active' => true]
        );

        $this->procurementManager = $this->makeUser('proc.mgr@example.com', 'مدير المشتريات', 'procurement_manager');
        $this->siteAccountant = $this->makeUser('accountant@example.com', 'محاسب الموقع', 'site_accountant');

        $this->supplier = Supplier::create([
            'name' => 'شركة التوريدات الحديثة',
            'company_name' => 'شركة التوريدات الحديثة',
            'contact_person' => 'أحمد علي',
            'phone' => '01012345678',
            'email' => 'supplier@example.com',
            'is_active' => true,
        ]);
    }

    private function makeUser(string $email, string $name, string $roleSlug): User
    {
        $user = User::create([
            'department_id' => $this->dept->id,
            'name' => $name,
            'email' => $email,
            'password' => Hash::make('Secret123!'),
            'is_active' => true,
        ]);
        $role = Role::where('slug', $roleSlug)->firstOrFail();
        $user->roles()->sync([$role->id]);
        return $user;
    }

    private function createSamplePr(string $number, string $notes): PurchaseRequest
    {
        return PurchaseRequest::create([
            'request_number' => $number,
            'request_type' => 'PROJECT_MATERIALS',
            'department_id' => $this->dept->id,
            'user_id' => $this->procurementManager->id,
            'status' => 'APPROVED_BY_GENERAL_MANAGER',
            'notes' => $notes,
            'parcel_reference' => '100',
            'region' => 'أكتوبر',
        ]);
    }

    public function test_procurement_manager_can_upload_invoice_to_actual_purchase_order(): void
    {
        $pr = $this->createSamplePr('PR-2026-9001', 'طلب شراء عاجل للموقع');

        $po = PurchaseOrder::create([
            'po_number' => 'PO-2026-9001',
            'purchase_request_id' => $pr->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $this->procurementManager->id,
            'status' => 'APPROVED_BY_ACCOUNTING',
            'subtotal' => 50000,
            'grand_total' => 50000,
            'currency' => 'EGP',
        ]);

        $this->assertNull($po->invoice_photo_path);
        $this->assertFalse((bool) $po->has_invoice_attachment);

        $file = UploadedFile::fake()->create('tax_invoice_supplier.pdf', 300, 'application/pdf');

        $response = $this->actingAs($this->procurementManager, 'sanctum')
            ->postJson("/api/v1/procurement/purchase-orders/{$po->id}/upload-invoice", [
                'invoice_file' => $file,
            ]);

        $response->assertOk();
        $response->assertJsonPath('data.has_invoice_attachment', true);

        $po->refresh();
        $this->assertNotNull($po->invoice_photo_path);
        $this->assertEquals('tax_invoice_supplier.pdf', $po->invoice_photo_name);
        $this->assertTrue((bool) $po->has_invoice_attachment);
        $this->assertNotNull($po->invoice_photo_url);
    }

    public function test_finalizing_actual_po_with_invoice_file_persists_invoice_attachment(): void
    {
        $pr = $this->createSamplePr('PR-2026-9002', 'توريد مواد بناء خاصة بالموقع');

        $prItem = PurchaseRequestItem::create([
            'purchase_request_id' => $pr->id,
            'item_description' => 'إسمنت بورتلاندي عادي',
            'quantity' => 100,
            'estimated_unit_price' => 250,
            'estimated_total_price' => 25000,
            'uom' => 'طن',
        ]);

        $po = PurchaseOrder::create([
            'po_number' => 'PO-2026-9002',
            'purchase_request_id' => $pr->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $this->procurementManager->id,
            'status' => 'PENDING_ACTUAL_PO',
            'subtotal' => 25000,
            'grand_total' => 25000,
            'currency' => 'EGP',
        ]);

        PurchaseOrderItem::create([
            'purchase_order_id' => $po->id,
            'pr_item_id' => $prItem->id,
            'item_description' => 'إسمنت بورتلاندي عادي',
            'quantity' => 100,
            'unit_price' => 250,
            'total_price' => 25000,
            'uom' => 'طن',
        ]);

        $invoiceFile = UploadedFile::fake()->image('invoice_photo.jpg', 800, 600);

        $response = $this->actingAs($this->procurementManager, 'sanctum')
            ->post("/api/v1/procurement/purchase-orders/{$po->id}/finalize", [
                'items' => [
                    [
                        'pr_item_id' => $prItem->id,
                        'item_description' => 'إسمنت بورتلاندي عادي فعلي',
                        'quantity' => 105,
                        'unit_price' => 250,
                        'uom' => 'طن',
                        'item_reference' => 'قطعة 55',
                        'region' => 'أكتوبر',
                    ],
                ],
                'notes' => 'تم استلام وتوريد الشحنة بالكامل مع الفاتورة الضريبية',
                'invoice_file' => $invoiceFile,
            ]);

        $response->assertOk();

        $po->refresh();
        $this->assertNotNull($po->invoice_photo_path);
        $this->assertEquals('invoice_photo.jpg', $po->invoice_photo_name);
        $this->assertTrue((bool) $po->has_invoice_attachment);
    }

    public function test_purchases_report_returns_invoice_url_and_has_invoice_attachment(): void
    {
        $pr = $this->createSamplePr('PR-2026-9003', 'حديد تسليح');

        $prItem = PurchaseRequestItem::create([
            'purchase_request_id' => $pr->id,
            'item_description' => 'حديد تسليح 12 مم',
            'quantity' => 10,
            'estimated_unit_price' => 40000,
            'estimated_total_price' => 400000,
            'uom' => 'طن',
        ]);

        $po = PurchaseOrder::create([
            'po_number' => 'PO-2026-9003',
            'purchase_request_id' => $pr->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $this->procurementManager->id,
            'status' => 'APPROVED_BY_ACCOUNTING',
            'subtotal' => 400000,
            'grand_total' => 400000,
            'currency' => 'EGP',
            'invoice_photo_path' => 'https://drive.google.com/file/d/test-invoice-123/view',
            'invoice_photo_name' => 'فاتورة_الحديد.pdf',
        ]);

        PurchaseOrderItem::create([
            'purchase_order_id' => $po->id,
            'pr_item_id' => $prItem->id,
            'item_description' => 'حديد تسليح 12 مم',
            'quantity' => 10,
            'unit_price' => 40000,
            'total_price' => 400000,
            'uom' => 'طن',
        ]);

        $response = $this->actingAs($this->siteAccountant, 'sanctum')
            ->getJson('/api/v1/procurement/reports/purchases?filter_type=custom&from_date=' . now()->subDays(5)->toDateString() . '&to_date=' . now()->addDays(5)->toDateString() . '&actual_only=0');

        $response->assertOk();
        $rows = $response->json('rows');
        $this->assertNotEmpty($rows);

        $targetRow = collect($rows)->firstWhere('po_number', 'PO-2026-9003');
        $this->assertNotNull($targetRow);
        $this->assertTrue((bool) $targetRow['has_invoice_attachment']);
        $this->assertEquals('https://drive.google.com/file/d/test-invoice-123/view', $targetRow['invoice_url']);
    }

    public function test_view_invoice_photo_endpoint_redirects_for_external_drive_links(): void
    {
        $pr = $this->createSamplePr('PR-2026-9004', 'طلب شراء لتجربة الرابط');

        $po = PurchaseOrder::create([
            'po_number' => 'PO-2026-9004',
            'purchase_request_id' => $pr->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $this->procurementManager->id,
            'status' => 'APPROVED_BY_ACCOUNTING',
            'subtotal' => 10000,
            'grand_total' => 10000,
            'currency' => 'EGP',
            'invoice_photo_path' => 'https://drive.google.com/file/d/invoice-sample-file/view',
        ]);

        $response = $this->actingAs($this->siteAccountant, 'sanctum')
            ->get("/api/v1/purchase-orders/{$po->id}/invoice-photo");

        $response->assertRedirect('https://drive.google.com/file/d/invoice-sample-file/view');
    }
}
