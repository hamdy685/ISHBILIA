<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\PurchaseReceipt;
use App\Models\PurchaseRequest;
use App\Models\Supplier;
use App\Models\User;
use App\Services\GoogleDriveService;
use App\Services\StorageService;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class GoogleDriveAttachmentLifecycleTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $procurementManager;
    private User $warehouseKeeper;
    private User $siteEngineer;
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

        $this->admin = $this->makeUser('admin@example.com', 'مدير النظام', 'admin');
        $this->procurementManager = $this->makeUser('proc@example.com', 'مدير المشتريات', 'procurement_manager');
        $this->warehouseKeeper = $this->makeUser('warehouse@example.com', 'أمين المخزن', 'warehouse_keeper');
        $this->siteEngineer = $this->makeUser('engineer@example.com', 'مهندس الموقع', 'site_engineer');

        $this->dept->update(['site_engineer_user_id' => $this->siteEngineer->id]);

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
        $role = \App\Models\Role::where('slug', $roleSlug)->firstOrFail();
        $user->roles()->sync([$role->id]);
        return $user;
    }

    /**
     * Test 1: File ID extraction utility.
     */
    public function test_extract_file_id_parses_all_google_drive_url_formats(): void
    {
        $id = '1ZdrP3K-NqU4uIs5GL3JD7biz7rDpSIdX';

        $this->assertEquals($id, GoogleDriveService::extractFileId("https://drive.google.com/file/d/{$id}/view"));
        $this->assertEquals($id, GoogleDriveService::extractFileId("https://drive.google.com/file/d/{$id}/view?usp=sharing"));
        $this->assertEquals($id, GoogleDriveService::extractFileId("https://drive.google.com/uc?id={$id}&export=download"));
        $this->assertEquals($id, GoogleDriveService::extractFileId("https://lh3.googleusercontent.com/d/{$id}=w1000"));
        $this->assertEquals($id, GoogleDriveService::extractFileId($id));
        $this->assertNull(GoogleDriveService::extractFileId('receipts/local_file_123.jpg'));
    }

    /**
     * Test 2: In production, upload failure refuses silent fallback to local disk.
     */
    public function test_production_safeguard_refuses_silent_local_fallback_when_drive_fails(): void
    {
        $this->app->detectEnvironment(fn () => 'production');
        Config::set('google_drive.enabled', true);
        Config::set('google_drive.client_id', 'invalid-client');
        Config::set('google_drive.client_secret', 'invalid-secret');
        Config::set('google_drive.refresh_token', 'invalid-refresh-token');

        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::response(['error' => 'invalid_grant'], 400),
        ]);

        $file = UploadedFile::fake()->image('receipt.jpg');

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('تعذر رفع المرفق إلى Google Drive');

        StorageService::storeUploadedFile($file, 'receipts');

        // Verify NO file was written to public disk
        $this->assertEmpty(Storage::disk('public')->files('receipts'));
    }

    /**
     * Test 3: Upload invoice persists drive_id and URL on PurchaseOrder.
     */
    public function test_invoice_upload_persists_drive_id_and_url_on_po(): void
    {
        Config::set('google_drive.enabled', true);
        Config::set('google_drive.client_id', 'test-client');
        Config::set('google_drive.client_secret', 'test-secret');
        Config::set('google_drive.refresh_token', 'test-refresh');

        $fakeDriveId = '1FakeDriveIdForInvoiceTest12345';
        $fakeViewUrl = "https://drive.google.com/file/d/{$fakeDriveId}/view";

        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::response(['access_token' => 'valid-access-token', 'expires_in' => 3600], 200),
            'https://www.googleapis.com/drive/v3/files*' => Http::response(['files' => [['id' => 'fake-invoices-folder']]], 200),
            'https://www.googleapis.com/upload/drive/v3/files*' => Http::response([
                'id' => $fakeDriveId,
                'name' => 'invoice.pdf',
                'webViewLink' => $fakeViewUrl,
                'webContentLink' => "https://drive.google.com/uc?id={$fakeDriveId}&export=download",
            ], 200),
        ]);

        $pr = PurchaseRequest::create([
            'user_id' => $this->procurementManager->id,
            'department_id' => $this->dept->id,
            'request_number' => 'PR-TEST-1',
            'status' => 'APPROVED_BY_EXECUTIVE',
            'title' => 'طلب اختبار',
        ]);

        $po = PurchaseOrder::create([
            'purchase_request_id' => $pr->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $this->procurementManager->id,
            'po_number' => 'PO-TEST-1',
            'status' => 'ISSUED',
            'total_amount' => 5000,
            'payment_terms' => 'نقد',
        ]);

        $response = $this->actingAs($this->procurementManager, 'sanctum')
            ->postJson("/api/v1/procurement/purchase-orders/{$po->id}/upload-invoice", [
                'invoice_file' => UploadedFile::fake()->create('invoice.pdf', 100, 'application/pdf'),
            ]);

        $response->assertStatus(200);

        $po->refresh();
        $this->assertEquals($fakeViewUrl, $po->invoice_photo_path);
        $this->assertEquals($fakeDriveId, $po->invoice_photo_drive_id);
    }

    /**
     * Test 4: View photo streams from Google Drive using proxy endpoint.
     */
    public function test_view_photo_streams_directly_from_google_drive(): void
    {
        Config::set('google_drive.enabled', true);
        Config::set('google_drive.client_id', 'test-client');
        Config::set('google_drive.client_secret', 'test-secret');
        Config::set('google_drive.refresh_token', 'test-refresh');

        $fakeDriveId = '1FakeDriveReceiptPhotoStream123';
        $fakeBinaryImage = "\xFF\xD8\xFF\xE0\x00\x10JFIF"; // minimal jpeg header

        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::response(['access_token' => 'valid-access-token', 'expires_in' => 3600], 200),
            "https://www.googleapis.com/drive/v3/files/{$fakeDriveId}?alt=media&supportsAllDrives=true" => Http::response($fakeBinaryImage, 200, ['Content-Type' => 'image/jpeg']),
        ]);

        $pr = PurchaseRequest::create([
            'user_id' => $this->procurementManager->id,
            'department_id' => $this->dept->id,
            'request_number' => 'PR-TEST-2',
            'status' => 'APPROVED_BY_EXECUTIVE',
            'title' => 'طلب استلام',
        ]);

        $po = PurchaseOrder::create([
            'purchase_request_id' => $pr->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $this->procurementManager->id,
            'po_number' => 'PO-TEST-2',
            'status' => 'ISSUED',
            'total_amount' => 1000,
        ]);

        $receipt = PurchaseReceipt::create([
            'purchase_order_id' => $po->id,
            'purchase_request_id' => $pr->id,
            'supplier_id' => $this->supplier->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
            'warehouse_keeper_user_id' => $this->warehouseKeeper->id,
            'receipt_number' => 'REC-TEST-1',
            'status' => 'PENDING_SITE_ENGINEER',
            'received_at' => now()->toDateString(),
            'photo_path' => "https://drive.google.com/file/d/{$fakeDriveId}/view",
            'photo_drive_id' => $fakeDriveId,
            'photo_name' => 'receipt.jpg',
            'photo_mime_type' => 'image/jpeg',
        ]);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->get("/api/v1/purchase-receipts/{$receipt->id}/photo");

        $response->assertStatus(200);
        $response->assertHeader('Content-Type', 'image/jpeg');
    }

    /**
     * Test 5: Missing legacy photo returns clear 404 message without crashing.
     */
    public function test_missing_legacy_photo_returns_graceful_404(): void
    {
        $pr = PurchaseRequest::create([
            'user_id' => $this->procurementManager->id,
            'department_id' => $this->dept->id,
            'request_number' => 'PR-TEST-3',
            'status' => 'APPROVED_BY_EXECUTIVE',
            'title' => 'طلب قديم',
        ]);

        $po = PurchaseOrder::create([
            'purchase_request_id' => $pr->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $this->procurementManager->id,
            'po_number' => 'PO-TEST-3',
            'status' => 'ISSUED',
            'total_amount' => 1000,
        ]);

        $receipt = PurchaseReceipt::create([
            'purchase_order_id' => $po->id,
            'purchase_request_id' => $pr->id,
            'supplier_id' => $this->supplier->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
            'warehouse_keeper_user_id' => $this->warehouseKeeper->id,
            'receipt_number' => 'REC-TEST-LEGACY',
            'status' => 'APPROVED',
            'received_at' => now()->toDateString(),
            'photo_path' => 'receipts/old_missing_photo_from_previous_deploy.jpg',
            'photo_name' => 'old_photo.jpg',
            'photo_mime_type' => 'image/jpeg',
        ]);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->get("/api/v1/purchase-receipts/{$receipt->id}/photo");

        $response->assertStatus(404);
        $this->assertStringContainsString('ملف الصورة مفقود من الخادم القديم', (string) $response->json('message'));
    }
}
