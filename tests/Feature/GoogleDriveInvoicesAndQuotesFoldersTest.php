<?php

namespace Tests\Feature;

use App\Models\Attachment;
use App\Models\Department;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\PurchaseReceipt;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestItem;
use App\Models\PurchaseRequestQuote;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use App\Models\WeighingGroup;
use App\Models\WeighingGroupItem;
use App\Services\GoogleDriveService;
use App\Services\PurchaseQuoteService;
use App\Services\StorageService;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class GoogleDriveInvoicesAndQuotesFoldersTest extends TestCase
{
    use RefreshDatabase;

    private User $procurementManager;
    private User $siteAccountant;
    private User $warehouseKeeper;
    private User $siteEngineer;
    private Supplier $supplier1;
    private Supplier $supplier2;
    private Department $dept;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        Cache::flush();
        $this->seed(RolePermissionSeeder::class);

        Config::set('google_drive.enabled', true);
        Config::set('google_drive.client_id', 'test-client-id');
        Config::set('google_drive.client_secret', 'test-client-secret');
        Config::set('google_drive.refresh_token', 'test-refresh-token');
        Config::set('google_drive.folder_id', '1EB9h3hue3aPM_zlx_AbRBydPZP3nnPDU');
        Config::set('google_drive.receipts_folder_id', '1rWlfFrs1yKe6XW5wJh2tl5e8I3gBncqh');
        Config::set('google_drive.invoices_folder_id', '1OPejUvtGzsvs8vxXjEET47EUvgnF_O4F');
        Config::set('google_drive.quotes_folder_id', '1osldpISMDMMxYsggcwSQm6viRO46TNui');

        $this->dept = Department::firstOrCreate(
            ['code' => 'EXECUTION'],
            ['name' => 'إدارة التنفيذ', 'is_active' => true]
        );

        $this->procurementManager = $this->makeUser('proc.manager@example.com', 'مدير المشتريات', 'procurement_manager');
        $this->siteAccountant = $this->makeUser('accountant@example.com', 'محاسب الموقع', 'site_accountant');
        $this->warehouseKeeper = $this->makeUser('warehouse@example.com', 'أمين المخزن', 'warehouse_keeper');
        $this->siteEngineer = $this->makeUser('engineer@example.com', 'مهندس الموقع', 'site_engineer');

        $this->dept->update(['site_engineer_user_id' => $this->siteEngineer->id]);

        $this->supplier1 = Supplier::create([
            'name' => 'شركة التوريدات المتكاملة',
            'company_name' => 'شركة التوريدات المتكاملة',
            'contact_person' => 'محمود كمال',
            'phone' => '01099887766',
            'email' => 'supplier1@example.com',
            'is_active' => true,
        ]);

        $this->supplier2 = Supplier::create([
            'name' => 'شركة الحديد والصلب الحديثة',
            'company_name' => 'شركة الحديد والصلب الحديثة',
            'contact_person' => 'علي عثمان',
            'phone' => '01055443322',
            'email' => 'supplier2@example.com',
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

    private function createSamplePr(string $number, string $status = 'APPROVED_BY_GENERAL_MANAGER'): PurchaseRequest
    {
        return PurchaseRequest::create([
            'request_number' => $number,
            'request_type' => 'PROJECT_MATERIALS',
            'department_id' => $this->dept->id,
            'user_id' => $this->procurementManager->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
            'status' => $status,
            'notes' => 'طلب شراء تجريبي لمواد بناء',
            'parcel_reference' => '102',
            'region' => 'أكتوبر',
        ]);
    }

    private function fakeGoogleDriveHttpSuccess(): void
    {
        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::response(['access_token' => 'fake-valid-access-token', 'expires_in' => 3600], 200),
            'https://www.googleapis.com/upload/drive/v3/files*' => function ($request) {
                static $counter = 100;
                $counter++;
                $fileId = "test-drive-file-id-{$counter}";
                return Http::response([
                    'id' => $fileId,
                    'name' => 'uploaded_document.pdf',
                    'webViewLink' => "https://drive.google.com/file/d/{$fileId}/view",
                    'webContentLink' => "https://drive.google.com/uc?id={$fileId}&export=download",
                ], 200);
            },
            'https://www.googleapis.com/drive/v3/files/*/permissions*' => Http::response(['id' => 'anyoneWithLink'], 200),
            'https://www.googleapis.com/drive/v3/files*' => Http::response(['files' => []], 200),
        ]);
    }

    /**
     * Test 1: Uploading multiple invoices on actual PO persists to Google Drive "فواتير" folder and attachments.
     */
    public function test_uploading_multiple_invoices_on_actual_po_persists_each_to_attachments_without_overwriting(): void
    {
        $this->fakeGoogleDriveHttpSuccess();

        $pr = $this->createSamplePr('PR-2026-INV-1');
        $po = PurchaseOrder::create([
            'po_number' => 'PO-2026-INV-1',
            'purchase_request_id' => $pr->id,
            'supplier_id' => $this->supplier1->id,
            'created_by_user_id' => $this->procurementManager->id,
            'status' => 'APPROVED_BY_ACCOUNTING',
            'subtotal' => 60000,
            'grand_total' => 60000,
            'currency' => 'EGP',
        ]);

        // 1. Upload first invoice
        $file1 = UploadedFile::fake()->create('tax_invoice_1.pdf', 200, 'application/pdf');
        $res1 = $this->actingAs($this->procurementManager, 'sanctum')
            ->postJson("/api/v1/procurement/purchase-orders/{$po->id}/upload-invoice", [
                'invoice_file' => $file1,
            ]);
        $res1->assertOk();

        $po->refresh();
        $this->assertStringContainsString('https://drive.google.com/file/d/test-drive-file-id-', $po->invoice_photo_path);
        $this->assertNotEmpty($po->invoice_photo_drive_id);
        $this->assertEquals('tax_invoice_1.pdf', $po->invoice_photo_name);
        $this->assertTrue((bool) $po->has_invoice_attachment);

        $attachments = Attachment::where('attachable_type', PurchaseOrder::class)
            ->where('attachable_id', $po->id)
            ->get();
        $this->assertCount(1, $attachments);
        $firstDriveId = $attachments[0]->drive_id;
        $this->assertNotEmpty($firstDriveId);

        // 2. Upload second invoice (should NOT delete or overwrite the first attachment)
        $file2 = UploadedFile::fake()->create('tax_invoice_2.pdf', 300, 'application/pdf');
        $res2 = $this->actingAs($this->procurementManager, 'sanctum')
            ->postJson("/api/v1/procurement/purchase-orders/{$po->id}/upload-invoice", [
                'invoice_file' => $file2,
            ]);
        $res2->assertOk();

        $po->refresh();
        $this->assertNotEmpty($po->invoice_photo_drive_id);
        $this->assertNotEquals($firstDriveId, $po->invoice_photo_drive_id);

        $attachmentsAfter = Attachment::where('attachable_type', PurchaseOrder::class)
            ->where('attachable_id', $po->id)
            ->orderBy('id', 'asc')
            ->get();
        $this->assertCount(2, $attachmentsAfter);
        $this->assertEquals($firstDriveId, $attachmentsAfter[0]->drive_id);
        $this->assertEquals('tax_invoice_1.pdf', $attachmentsAfter[0]->file_name);
        $this->assertEquals($po->invoice_photo_drive_id, $attachmentsAfter[1]->drive_id);
        $this->assertEquals('tax_invoice_2.pdf', $attachmentsAfter[1]->file_name);
    }

    /**
     * Test 2: Finalizing an actual PO with invoice creates attachment record with drive_id.
     */
    public function test_finalizing_actual_po_with_invoice_creates_attachment_record(): void
    {
        $this->fakeGoogleDriveHttpSuccess();

        $pr = $this->createSamplePr('PR-2026-FIN-1');
        $prItem = PurchaseRequestItem::create([
            'purchase_request_id' => $pr->id,
            'item_description' => 'حديد تسليح 16 مم',
            'quantity' => 10,
            'estimated_unit_price' => 38000,
            'estimated_total_price' => 380000,
            'uom' => 'طن',
        ]);

        $po = PurchaseOrder::create([
            'po_number' => 'PO-2026-FIN-1',
            'purchase_request_id' => $pr->id,
            'supplier_id' => $this->supplier1->id,
            'created_by_user_id' => $this->procurementManager->id,
            'status' => 'PENDING_ACTUAL_PO',
            'subtotal' => 380000,
            'grand_total' => 380000,
            'currency' => 'EGP',
        ]);

        PurchaseOrderItem::create([
            'purchase_order_id' => $po->id,
            'pr_item_id' => $prItem->id,
            'item_description' => 'حديد تسليح 16 مم',
            'quantity' => 10,
            'unit_price' => 38000,
            'total_price' => 380000,
            'uom' => 'طن',
        ]);

        $file = UploadedFile::fake()->create('final_po_invoice.pdf', 500, 'application/pdf');

        $response = $this->actingAs($this->procurementManager, 'sanctum')
            ->post("/api/v1/procurement/purchase-orders/{$po->id}/finalize", [
                'items' => [
                    [
                        'pr_item_id' => $prItem->id,
                        'item_description' => 'حديد تسليح 16 مم فعلي',
                        'quantity' => 10,
                        'unit_price' => 38000,
                        'uom' => 'طن',
                    ],
                ],
                'notes' => 'تم توريد الكمية بالكامل وإرفاق الفاتورة الفعلية',
                'invoice_file' => $file,
            ]);

        $response->assertOk();

        $po->refresh();
        $this->assertNotEmpty($po->invoice_photo_drive_id);

        $attachment = Attachment::where('attachable_type', PurchaseOrder::class)
            ->where('attachable_id', $po->id)
            ->first();
        $this->assertNotNull($attachment);
        $this->assertEquals($po->invoice_photo_drive_id, $attachment->drive_id);
        $this->assertEquals('final_po_invoice.pdf', $attachment->file_name);
    }

    /**
     * Test 3: StorageService routes 'receipts' to Google Drive folder "أذونات استلام إشبيليا".
     */
    public function test_storage_service_routes_receipts_to_google_drive(): void
    {
        $this->fakeGoogleDriveHttpSuccess();

        $file = UploadedFile::fake()->image('grn_delivery_note.jpg', 800, 600);

        $result = StorageService::storeUploadedFile($file, 'receipts');

        $this->assertStringContainsString('https://drive.google.com/file/d/test-drive-file-id-', $result['url']);
        $this->assertNotEmpty($result['drive_id']);
        $this->assertEquals('grn_delivery_note.jpg', $result['name']);
        $this->assertEquals('google_drive', $result['disk']);
    }

    /**
     * Test 4: Warehouse keeper creates purchase receipt and saves photo_drive_id in "أذونات استلام إشبيليا".
     */
    public function test_warehouse_keeper_receipt_upload_saves_photo_drive_id(): void
    {
        $this->fakeGoogleDriveHttpSuccess();

        $pr = $this->createSamplePr('PR-2026-WH-1');
        $prItem = PurchaseRequestItem::create([
            'purchase_request_id' => $pr->id,
            'item_description' => 'أسمنت مقاوم للملوحة',
            'quantity' => 100,
            'estimated_unit_price' => 200,
            'estimated_total_price' => 20000,
            'uom' => 'شكارة',
        ]);

        $po = PurchaseOrder::create([
            'po_number' => 'PO-2026-WH-1',
            'purchase_request_id' => $pr->id,
            'supplier_id' => $this->supplier1->id,
            'created_by_user_id' => $this->procurementManager->id,
            'status' => 'APPROVED_BY_ACCOUNTING',
            'subtotal' => 20000,
            'grand_total' => 20000,
            'currency' => 'EGP',
        ]);

        $poItem = PurchaseOrderItem::create([
            'purchase_order_id' => $po->id,
            'pr_item_id' => $prItem->id,
            'item_description' => 'أسمنت مقاوم للملوحة',
            'quantity' => 100,
            'unit_price' => 200,
            'total_price' => 20000,
            'uom' => 'شكارة',
        ]);

        $receiptPhoto = UploadedFile::fake()->image('cement_grn.jpg', 1000, 800);

        $response = $this->actingAs($this->warehouseKeeper, 'sanctum')
            ->post("/api/v1/purchase-receipts/purchase-orders/{$po->id}", [
                'items' => [
                    [
                        'purchase_order_item_id' => $poItem->id,
                        'received_quantity' => 100,
                    ],
                ],
                'photo' => $receiptPhoto,
                'warehouse_notes' => 'تم استلام الكمية وفحصها في المخزن بحالة ممتازة',
                'actual_receiver_name' => 'محمد رجب - أمين المخزن',
            ]);

        $response->assertStatus(201);

        $receipt = PurchaseReceipt::where('purchase_order_id', $po->id)->first();
        $this->assertNotNull($receipt);
        $this->assertNotEmpty($receipt->photo_drive_id);
        $this->assertStringContainsString('https://drive.google.com/file/d/test-drive-file-id-', $receipt->photo_path);
        $this->assertEquals('cement_grn.jpg', $receipt->photo_name);
    }

    /**
     * Test 5: StorageService routes 'quotes' to Google Drive and captures drive_id.
     */
    public function test_storage_service_routes_quotes_to_google_drive(): void
    {
        $this->fakeGoogleDriveHttpSuccess();

        $file = UploadedFile::fake()->create('quote_supplier_abc.pdf', 400, 'application/pdf');

        $result = StorageService::storeUploadedFile($file, 'quotes');

        $this->assertStringContainsString('https://drive.google.com/file/d/test-drive-file-id-', $result['url']);
        $this->assertNotEmpty($result['drive_id']);
        $this->assertEquals('quote_supplier_abc.pdf', $result['name']);
        $this->assertEquals('google_drive', $result['disk']);
    }

    /**
     * Test 6: Creating quotes with file persists file_drive_id in database.
     */
    public function test_creating_quotes_with_file_persists_file_drive_id(): void
    {
        $this->fakeGoogleDriveHttpSuccess();

        $pr = $this->createSamplePr('PR-2026-Q-1', PurchaseQuoteService::QUOTES_PENDING);
        $prItem = PurchaseRequestItem::create([
            'purchase_request_id' => $pr->id,
            'item_description' => 'أسمنت بورتلاندي عادي',
            'quantity' => 50,
            'estimated_unit_price' => 300,
            'estimated_total_price' => 15000,
            'uom' => 'شكارة',
        ]);

        $quoteFile1 = UploadedFile::fake()->create('vendor1_quotation.pdf', 350, 'application/pdf');
        $quoteFile2 = UploadedFile::fake()->create('vendor2_quotation.pdf', 400, 'application/pdf');

        /** @var PurchaseQuoteService $quoteService */
        $quoteService = app(PurchaseQuoteService::class);
        $updatedPr = $quoteService->createQuotes($this->procurementManager, $pr, [
            [
                'supplier_id' => $this->supplier1->id,
                'total_amount' => 14000,
                'unit_price' => 280,
                'file' => $quoteFile1,
                'notes' => 'عرض السعر الأول مع التوصيل',
            ],
            [
                'supplier_id' => $this->supplier2->id,
                'total_amount' => 14500,
                'unit_price' => 290,
                'file' => $quoteFile2,
                'notes' => 'عرض السعر الثاني',
            ],
        ]);

        $quotes = PurchaseRequestQuote::where('purchase_request_id', $pr->id)->get();
        $this->assertCount(2, $quotes);
        $this->assertNotEmpty($quotes[0]->file_drive_id);
        $this->assertNotEmpty($quotes[1]->file_drive_id);
        $this->assertStringContainsString('https://drive.google.com/file/d/', $quotes[0]->file_path);
        $this->assertStringContainsString('https://drive.google.com/file/d/', $quotes[1]->file_path);
    }

    /**
     * Test 7: Production safeguard refuses silent local storage when Google Drive fails for quotes and receipts.
     */
    public function test_production_safeguard_refuses_silent_local_fallback_when_drive_fails(): void
    {
        $this->app->detectEnvironment(fn () => 'production');
        Config::set('google_drive.enabled', true);

        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::response(['error' => 'invalid_grant'], 400),
        ]);

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('تعذر الاتصال بـ Google Drive');

        $file = UploadedFile::fake()->create('failing_quote.pdf', 200, 'application/pdf');

        StorageService::storeUploadedFile($file, 'quotes');
    }

    /**
     * Test 8: Folders configuration matches Google Drive structure.
     */
    public function test_google_drive_three_folders_configuration(): void
    {
        $this->assertNotEmpty(config('google_drive.folder_id'));
        $this->assertNotEmpty(config('google_drive.receipts_folder_id'));
        $this->assertNotEmpty(config('google_drive.invoices_folder_id'));
        $this->assertNotEmpty(config('google_drive.quotes_folder_id'));

        $this->assertEquals('1EB9h3hue3aPM_zlx_AbRBydPZP3nnPDU', config('google_drive.folder_id'));
        $this->assertEquals('1rWlfFrs1yKe6XW5wJh2tl5e8I3gBncqh', config('google_drive.receipts_folder_id'));
        $this->assertEquals('1OPejUvtGzsvs8vxXjEET47EUvgnF_O4F', config('google_drive.invoices_folder_id'));
        $this->assertEquals('1osldpISMDMMxYsggcwSQm6viRO46TNui', config('google_drive.quotes_folder_id'));

        $this->assertEquals('1rWlfFrs1yKe6XW5wJh2tl5e8I3gBncqh', GoogleDriveService::receiptsFolderId());
        $this->assertEquals('1OPejUvtGzsvs8vxXjEET47EUvgnF_O4F', GoogleDriveService::invoicesFolderId());
        $this->assertEquals('1osldpISMDMMxYsggcwSQm6viRO46TNui', GoogleDriveService::quotesFolderId());
    }
}
