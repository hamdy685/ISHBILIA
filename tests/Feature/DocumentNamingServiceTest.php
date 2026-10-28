<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Item;
use App\Models\LandParcel;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestItem;
use App\Models\Supplier;
use App\Models\User;
use App\Models\WeighingGroup;
use App\Models\WeighingGroupItem;
use App\Services\DocumentNamingService;
use App\Services\StorageService;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class DocumentNamingServiceTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Supplier $supplier;
    private Department $department;
    private LandParcel $parcel;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);

        $this->department = Department::create([
            'name' => 'إدارة المشروعات',
            'code' => 'PRJ',
            'is_active' => true,
        ]);

        $this->supplier = Supplier::create([
            'name' => 'شركة الأهرام',
            'company_name' => 'شركة الأهرام للصلب',
            'code' => 'SUP-001',
            'is_active' => true,
        ]);

        $this->parcel = LandParcel::create([
            'parcel_reference' => '148',
            'region' => 'التجمع',
            'opening_balance' => 0,
            'funded_total' => 0,
            'expense_total' => 0,
            'balance' => 0,
            'is_active' => true,
        ]);

        $this->user = User::create([
            'department_id' => $this->department->id,
            'name' => 'مدير المشتريات',
            'email' => 'proc@example.com',
            'password' => Hash::make('Secret123!'),
            'is_active' => true,
        ]);
        $role = \App\Models\Role::where('slug', 'procurement_manager')->first();
        if ($role) {
            $this->user->roles()->attach($role->id);
        }
    }

    private function createPr(string $number = 'PR-148', ?string $parcelRef = '148', ?string $region = 'التجمع'): PurchaseRequest
    {
        return PurchaseRequest::create([
            'user_id' => $this->user->id,
            'department_id' => $this->department->id,
            'request_number' => $number,
            'parcel_reference' => $parcelRef,
            'region' => $region,
            'land_parcel_id' => $parcelRef === '148' ? $this->parcel->id : null,
            'status' => 'APPROVED',
        ]);
    }

    public function test_receipt_name_with_single_item_plot_and_region(): void
    {
        $pr = $this->createPr('PR-148', '148', 'التجمع');

        $item = Item::create([
            'sku' => 'STL-12',
            'name' => 'حديد تسليح',
            'uom' => 'طن',
            'is_active' => true,
        ]);

        $po = PurchaseOrder::create([
            'po_number' => 'PO-148',
            'purchase_request_id' => $pr->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $this->user->id,
            'status' => 'ISSUED',
        ]);

        $poItem = PurchaseOrderItem::create([
            'purchase_order_id' => $po->id,
            'item_id' => $item->id,
            'item_description' => 'حديد تسليح 12 مم',
            'item_reference' => '148',
            'region' => 'التجمع',
            'quantity' => 10,
            'unit_price' => 25000,
            'line_total' => 250000,
        ]);

        $fileName = DocumentNamingService::generateReceiptName(
            $po,
            [['purchase_order_item_id' => $poItem->id, 'received_quantity' => 10]],
            null,
            'jpg',
            null,
            1,
            '2026-10-28'
        );

        $this->assertStringContainsString('إذن_استلام', $fileName);
        $this->assertStringContainsString('قطعة-148', $fileName);
        $this->assertStringContainsString('منطقة-التجمع', $fileName);
        $this->assertStringContainsString('حديد-تسليح', $fileName);
        $this->assertStringContainsString('PO-148', $fileName);
        $this->assertStringContainsString('شركة-الأهرام', $fileName);
        $this->assertStringContainsString('2026-10-28', $fileName);
        $this->assertStringEndsWith('.jpg', $fileName);
    }

    public function test_scale_ticket_for_steel_weighing_group(): void
    {
        $pr = $this->createPr('PR-148', '148', 'التجمع');

        $po = PurchaseOrder::create([
            'po_number' => 'PO-148',
            'purchase_request_id' => $pr->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $this->user->id,
            'status' => 'ISSUED',
        ]);

        $poItem = PurchaseOrderItem::create([
            'purchase_order_id' => $po->id,
            'item_description' => 'حديد تسليح',
            'item_reference' => '148',
            'region' => 'التجمع',
            'quantity' => 25,
            'unit_price' => 25000,
            'line_total' => 625000,
        ]);

        $group = WeighingGroup::create([
            'group_number' => 'WG-101',
            'purchase_order_id' => $po->id,
            'supplier_id' => $this->supplier->id,
            'group_type' => 'STEEL',
            'status' => 'PENDING',
            'created_by_user_id' => $this->user->id,
        ]);

        WeighingGroupItem::create([
            'weighing_group_id' => $group->id,
            'purchase_order_item_id' => $poItem->id,
            'item_description' => 'حديد تسليح',
            'ordered_weight' => 25,
            'land_plot_number' => '148',
            'region' => 'التجمع',
        ]);

        $fileName = DocumentNamingService::generateScaleTicketName(
            $group,
            'WG-101',
            'jpg',
            1,
            '2026-10-28'
        );

        $this->assertStringContainsString('تذكرة_ميزان', $fileName);
        $this->assertStringContainsString('قطعة-148', $fileName);
        $this->assertStringContainsString('منطقة-التجمع', $fileName);
        $this->assertStringContainsString('حديد-تسليح', $fileName);
        $this->assertStringContainsString('PO-148', $fileName);
        $this->assertStringContainsString('2026-10-28', $fileName);
        $this->assertStringEndsWith('.jpg', $fileName);
    }

    public function test_invoice_with_single_item(): void
    {
        $pr = $this->createPr('PR-148', '148', 'التجمع');

        $po = PurchaseOrder::create([
            'po_number' => 'PO-148',
            'purchase_request_id' => $pr->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $this->user->id,
            'status' => 'ISSUED',
        ]);

        PurchaseOrderItem::create([
            'purchase_order_id' => $po->id,
            'item_description' => 'أسمنت',
            'item_reference' => '148',
            'region' => 'التجمع',
            'quantity' => 100,
            'unit_price' => 2000,
            'line_total' => 200000,
        ]);

        $fileName = DocumentNamingService::generateInvoiceName(
            $po,
            'INV-990',
            'pdf',
            1,
            '2026-10-28'
        );

        $this->assertStringContainsString('فاتورة', $fileName);
        $this->assertStringContainsString('قطعة-148', $fileName);
        $this->assertStringContainsString('منطقة-التجمع', $fileName);
        $this->assertStringContainsString('أسمنت', $fileName);
        $this->assertStringContainsString('PO-148', $fileName);
        $this->assertStringContainsString('شركة-الأهرام', $fileName);
        $this->assertStringEndsWith('.pdf', $fileName);
    }

    public function test_invoice_with_multiple_items_uses_multi_item_label(): void
    {
        $pr = $this->createPr('PR-148', '148', 'التجمع');

        $po = PurchaseOrder::create([
            'po_number' => 'PO-148',
            'purchase_request_id' => $pr->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $this->user->id,
            'status' => 'ISSUED',
        ]);

        PurchaseOrderItem::create([
            'purchase_order_id' => $po->id,
            'item_description' => 'أسمنت',
            'item_reference' => '148',
            'region' => 'التجمع',
            'quantity' => 50,
            'unit_price' => 2000,
            'line_total' => 100000,
        ]);

        PurchaseOrderItem::create([
            'purchase_order_id' => $po->id,
            'item_description' => 'رمل',
            'item_reference' => '148',
            'region' => 'التجمع',
            'quantity' => 30,
            'unit_price' => 500,
            'line_total' => 15000,
        ]);

        $fileName = DocumentNamingService::generateInvoiceName($po, null, 'pdf', 1, '2026-10-28');

        $this->assertStringContainsString('متعدد-البنود', $fileName);
        $this->assertStringContainsString('قطعة-148', $fileName);
    }

    public function test_quotation_with_multiple_items_uses_multi_item_label(): void
    {
        $pr = $this->createPr('PR-151', '151', 'الساحل');

        PurchaseRequestItem::create([
            'purchase_request_id' => $pr->id,
            'item_description' => 'كابلات 10 مم',
            'item_reference' => '151',
            'region' => 'الساحل',
            'quantity' => 100,
            'estimated_unit_price' => 100,
        ]);

        PurchaseRequestItem::create([
            'purchase_request_id' => $pr->id,
            'item_description' => 'قواطع كهربائية',
            'item_reference' => '151',
            'region' => 'الساحل',
            'quantity' => 20,
            'estimated_unit_price' => 500,
        ]);

        $supplier = Supplier::create([
            'name' => 'الشركة العالمية',
            'company_name' => 'الشركة العالمية للكابلات',
            'code' => 'SUP-002',
            'is_active' => true,
        ]);

        $fileName = DocumentNamingService::generateQuotationName($pr, $supplier, null, 'pdf', 1);

        $this->assertStringContainsString('عرض_سعر', $fileName);
        $this->assertStringContainsString('قطعة-151', $fileName);
        $this->assertStringContainsString('منطقة-الساحل', $fileName);
        $this->assertStringContainsString('متعدد-البنود', $fileName);
        $this->assertStringContainsString('PR-151', $fileName);
        $this->assertStringContainsString('الشركة-العالمية', $fileName);
        $this->assertStringEndsWith('.pdf', $fileName);
    }

    public function test_document_with_missing_plot_and_region_uses_fallback_gracefully(): void
    {
        $pr = $this->createPr('PR-200', null, null);

        $po = PurchaseOrder::create([
            'po_number' => 'PO-200',
            'purchase_request_id' => $pr->id,
            'created_by_user_id' => $this->user->id,
            'status' => 'ISSUED',
        ]);

        PurchaseOrderItem::create([
            'purchase_order_id' => $po->id,
            'item_description' => 'أدوات مكتبية',
            'quantity' => 5,
            'unit_price' => 100,
            'line_total' => 500,
        ]);

        $fileName = DocumentNamingService::generateInvoiceName($po, null, 'pdf', 1, '2026-10-28');

        $this->assertStringContainsString('فاتورة', $fileName);
        $this->assertStringContainsString('غير-محدد', $fileName);
        $this->assertStringContainsString('أدوات-مكتبية', $fileName);
        $this->assertStringContainsString('PO-200', $fileName);
    }

    public function test_sanitization_removes_invalid_characters_and_preserves_arabic(): void
    {
        $dirty = 'فاتورة / توريد: حديد*تسليح? "عز" <12مم> | قطاع #1';
        $clean = DocumentNamingService::sanitizeSegment($dirty);

        $this->assertStringNotContainsString('/', $clean);
        $this->assertStringNotContainsString(':', $clean);
        $this->assertStringNotContainsString('*', $clean);
        $this->assertStringNotContainsString('?', $clean);
        $this->assertStringNotContainsString('"', $clean);
        $this->assertStringNotContainsString('<', $clean);
        $this->assertStringNotContainsString('>', $clean);
        $this->assertStringNotContainsString('|', $clean);
        $this->assertStringContainsString('حديد-تسليح', $clean);
    }

    public function test_storage_service_honors_custom_name_for_uploaded_file(): void
    {
        Storage::fake('public');
        Config::set('google_drive.enabled', false);

        $file = UploadedFile::fake()->create('raw_scan.pdf', 100, 'application/pdf');
        $customName = 'فاتورة_قطعة-148_منطقة-التجمع_حديد-تسليح_PO-148_شركة-الأهرام_2026-10-28_01.pdf';

        $stored = StorageService::storeUploadedFile($file, 'invoices', $customName);

        $this->assertEquals($customName, $stored['name']);
        $this->assertStringEndsWith('.pdf', $stored['path']);
        Storage::disk('public')->assertExists($stored['path']);
    }

    public function test_storage_service_honors_custom_name_for_base64(): void
    {
        Storage::fake('public');
        Config::set('google_drive.enabled', false);

        $base64 = 'data:image/jpeg;base64,' . base64_encode('fake-image-bytes');
        $customName = 'تذكرة_ميزان_قطعة-148_منطقة-التجمع_حديد-تسليح_PO-148_2026-10-28_01.jpg';

        $stored = StorageService::storeBase64($base64, 'receipts', $customName);

        $this->assertNotNull($stored);
        $this->assertEquals($customName, $stored['name']);
        $this->assertStringEndsWith('.jpg', $stored['path']);
        Storage::disk('public')->assertExists($stored['path']);
    }

    public function test_sequence_increment_prevents_name_collision(): void
    {
        $pr = $this->createPr('PR-148', '148', 'التجمع');
        $po = PurchaseOrder::create([
            'po_number' => 'PO-148',
            'purchase_request_id' => $pr->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $this->user->id,
            'status' => 'ISSUED',
        ]);

        $file1 = DocumentNamingService::generateInvoiceName($po, null, 'pdf', 1, '2026-10-28');
        $file2 = DocumentNamingService::generateInvoiceName($po, null, 'pdf', 2, '2026-10-28');

        $this->assertStringEndsWith('_01.pdf', $file1);
        $this->assertStringEndsWith('_02.pdf', $file2);
        $this->assertNotEquals($file1, $file2);
    }

    public function test_mixed_arabic_english_and_symbols_sanitization(): void
    {
        $complex = 'Material: حديد Steel #4 (Plot: B-12 / قطاع 3)';
        $sanitized = DocumentNamingService::sanitizeSegment($complex);

        $this->assertStringContainsString('Material', $sanitized);
        $this->assertStringContainsString('حديد', $sanitized);
        $this->assertStringContainsString('Steel', $sanitized);
        $this->assertStringContainsString('B-12', $sanitized);
        $this->assertStringContainsString('قطاع-3', $sanitized);
        $this->assertStringNotContainsString(':', $sanitized);
        $this->assertStringNotContainsString('#', $sanitized);
        $this->assertStringNotContainsString('/', $sanitized);
    }

    public function test_google_drive_failure_throws_exception_preventing_false_success(): void
    {
        Config::set('google_drive.enabled', true);
        Config::set('google_drive.client_id', 'test_client_id');
        Config::set('google_drive.client_secret', 'test_client_secret');
        Config::set('google_drive.refresh_token', 'test_refresh_token');
        Config::set('google_drive.folder_id', 'test_folder_id');

        // Mock Http to simulate Google OAuth failure
        \Illuminate\Support\Facades\Http::fake([
            'https://oauth2.googleapis.com/token' => \Illuminate\Support\Facades\Http::response(['error' => 'invalid_grant'], 400),
        ]);

        $file = UploadedFile::fake()->create('receipt.jpg', 50, 'image/jpeg');

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('تعذر الاتصال بـ Google Drive');

        StorageService::storeUploadedFile($file, 'receipts', 'test_name.jpg');
    }
}
