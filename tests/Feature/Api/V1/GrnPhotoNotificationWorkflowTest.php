<?php

namespace Tests\Feature\Api\V1;

use App\Models\Department;
use App\Models\Item;
use App\Models\LandParcel;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\PurchaseReceipt;
use App\Models\PurchaseReceiptItem;
use App\Models\PurchaseRequest;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use App\Notifications\ProcurementWorkflowNotification;
use App\Services\StorageService;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Class GrnPhotoNotificationWorkflowTest
 *
 * Senior QA & Integration Automation Test Suite verifying:
 * 1. Physical inspection and photo attachment upload for Goods Receipt Note (GRN).
 * 2. Backend storage integrity, file metadata registration, and photo linking.
 * 3. Role-based notification dispatching:
 *    - site_engineer: Notified on receipt creation for site inspection and approval.
 *    - procurement_manager: Notified on receipt approval to issue the Actual PO.
 *    - site_accountant: Notified on receipt approval for 3-way matching and invoice booking.
 * 4. Photo viewing authorization, role access, and tenant/department isolation.
 */
class GrnPhotoNotificationWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private Department $dept;
    private Department $otherDept;
    private User $warehouseKeeper;
    private User $siteEngineer;
    private User $otherSiteEngineer;
    private User $procurementManager;
    private User $siteAccountant;
    private User $licensesAccountant;
    private User $reviewer;
    private Supplier $supplier;
    private Item $catalogItem;
    private LandParcel $parcel;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);

        // Primary Execution Department (mapped to site_accountant)
        $this->dept = Department::create([
            'name' => 'إدارة المشروعات والتنفيذ',
            'code' => 'EXECUTION',
            'is_active' => true,
        ]);

        // Unrelated Department for isolation testing
        $this->otherDept = Department::create([
            'name' => 'إدارة التراخيص والتصاريح',
            'code' => 'LICENSES',
            'is_active' => true,
        ]);

        // Stakeholder Users
        $this->reviewer = $this->createUser('reviewer@ashbiliya.com', 'م. ساري مراجع القسم', 'reviewer', $this->dept->id);
        $this->siteEngineer = $this->createUser('se.primary@ashbiliya.com', 'م. عمرو مهندس الموقع المعتمد', 'site_engineer', $this->dept->id);
        $this->otherSiteEngineer = $this->createUser('se.other@ashbiliya.com', 'م. خالد مهندس موقع خارجي', 'site_engineer', $this->otherDept->id);
        $this->warehouseKeeper = $this->createUser('wh.keeper@ashbiliya.com', 'أ. وحيد أمين المخزن', 'warehouse_keeper', $this->dept->id);
        $this->procurementManager = $this->createUser('proc.manager@ashbiliya.com', 'أ. كريم مدير المشتريات', 'procurement_manager');
        $this->siteAccountant = $this->createUser('site.accountant@ashbiliya.com', 'أ. سامح محاسب الموقع', 'site_accountant', $this->dept->id);
        $this->licensesAccountant = $this->createUser('lic.accountant@ashbiliya.com', 'أ. وليد محاسب التراخيص', 'licenses_accountant', $this->otherDept->id);

        $this->dept->update([
            'manager_user_id' => $this->reviewer->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
        ]);

        // Master Data
        $this->supplier = Supplier::create([
            'code' => 'SUP-GRN-001',
            'company_name' => 'شركة النيل للحديد والصلب',
            'contact_name' => 'م. حازم القاضي',
            'phone' => '01012345678',
            'is_active' => true,
            'opening_balance' => 0,
        ]);

        $this->catalogItem = Item::create([
            'sku' => 'SKU-REBAR-16MM',
            'name' => 'حديد تسليح 16 مم عز الدخيلة',
            'uom' => 'TON',
            'is_active' => true,
        ]);

        $this->parcel = LandParcel::create([
            'parcel_reference' => 'PARCEL-GRN-TEST-101',
            'region' => 'النرجس الجديدة - التجمع الخامس',
            'opening_balance' => 250000,
            'funded_total' => 0,
            'expense_total' => 0,
            'balance' => 250000,
            'is_active' => true,
        ]);
    }

    /**
     * Test 1: Simulating GRN photo upload, file storage on disk, and instant notification to Site Engineer.
     */
    public function test_grn_photo_upload_stores_image_and_notifies_site_engineer(): void
    {
        $disk = StorageService::disk();
        Storage::fake($disk);
        Notification::fake();

        // 1. Prepare issued Purchase Order
        $po = $this->createIssuedPurchaseOrder(10, 42000);
        $poItem = $po->items->first();

        // 2. Simulate taking and uploading a photo of the GRN receipt note with inspection items
        $fakePhoto = UploadedFile::fake()->image('grn_receipt.jpg', 1200, 900)->size(850); // 850 KB

        $payload = [
            'received_at' => now()->toDateString(),
            'warehouse_notes' => 'تم استلام وتفريغ حديد التسليح في الموقع وحالته ممتازة مع إرفاق صورة إذن الاستلام الميداني.',
            'photo' => $fakePhoto,
            'items' => [
                [
                    'purchase_order_item_id' => $poItem->id,
                    'received_quantity' => 10,
                    'notes' => 'الكمية كاملة ومطابقة لشهادة المنشأ ووزنة البسكول.',
                ],
            ],
        ];

        // 3. Warehouse Keeper submits receipt with photo
        $response = $this->actingAs($this->warehouseKeeper, 'sanctum')
            ->post("/api/v1/purchase-receipts/purchase-orders/{$po->id}", $payload, [
                'Accept' => 'application/json',
            ]);

        $response->assertStatus(201);
        $responseData = $response->json('data');

        $this->assertNotEmpty($responseData['id']);
        $this->assertNotEmpty($responseData['photo_path']);
        $this->assertEquals('grn_receipt.jpg', $responseData['photo_name']);
        $this->assertEquals('PENDING_SITE_ENGINEER', $responseData['status']);

        // 4. Verify storage integrity on the target disk
        Storage::disk($disk)->assertExists($responseData['photo_path']);

        // 5. Verify database persistence and linking
        $this->assertDatabaseHas('purchase_receipts', [
            'id' => $responseData['id'],
            'purchase_order_id' => $po->id,
            'warehouse_keeper_user_id' => $this->warehouseKeeper->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
            'status' => 'PENDING_SITE_ENGINEER',
            'photo_name' => 'grn_receipt.jpg',
        ]);

        $receipt = PurchaseReceipt::find($responseData['id']);
        $this->assertNotNull($receipt->photo_size);
        $this->assertEquals('image/jpeg', $receipt->photo_mime_type);

        // 6. Strict Verification: Instant Notification dispatched to Site Engineer
        Notification::assertSentTo(
            $this->siteEngineer,
            ProcurementWorkflowNotification::class,
            function (ProcurementWorkflowNotification $notification) use ($receipt) {
                return $notification->type === 'purchase_receipt_pending_site_engineer'
                    && (int) $notification->notifiable?->id === (int) $receipt->id;
            }
        );

        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->siteEngineer->id,
            'type' => 'purchase_receipt_pending_site_engineer',
            'purchase_receipt_id' => $receipt->id,
        ]);
    }

    /**
     * Test 2: Site Engineer approval triggers notifications to Procurement Manager (for Actual PO)
     * and Site Accountant (for 3-way matching and invoice).
     */
    public function test_site_engineer_approval_notifies_procurement_manager_and_site_accountant(): void
    {
        $disk = StorageService::disk();
        Storage::fake($disk);
        Notification::fake();

        // 1. Setup PO and Receipt with attached photo
        $po = $this->createIssuedPurchaseOrder(10, 42000);
        $poItem = $po->items->first();

        $fakePhoto = UploadedFile::fake()->image('grn_receipt.jpg', 800, 600);
        $createResponse = $this->actingAs($this->warehouseKeeper, 'sanctum')
            ->post("/api/v1/purchase-receipts/purchase-orders/{$po->id}", [
                'received_at' => now()->toDateString(),
                'warehouse_notes' => 'تم استلام الشحنة وتفريغها.',
                'photo' => $fakePhoto,
                'items' => [
                    [
                        'purchase_order_item_id' => $poItem->id,
                        'received_quantity' => 10,
                    ],
                ],
            ], ['Accept' => 'application/json']);

        $createResponse->assertStatus(201);
        $receiptId = $createResponse->json('data.id');
        $receipt = PurchaseReceipt::findOrFail($receiptId);

        // 2. Site Engineer inspects and approves the GRN
        $approveResponse = $this->actingAs($this->siteEngineer, 'sanctum')
            ->postJson("/api/v1/purchase-receipts/{$receiptId}/approve", [
                'site_engineer_notes' => 'تم فحص خامة الحديد والقطر بالميكروميتر ومطابق للمواصفات الإنشائية بالكود.',
            ]);

        $approveResponse->assertStatus(200);

        // 3. Verify Receipt and PO state changes
        $this->assertDatabaseHas('purchase_receipts', [
            'id' => $receiptId,
            'status' => 'APPROVED',
            'site_engineer_user_id' => $this->siteEngineer->id,
        ]);

        $this->assertDatabaseHas('purchase_orders', [
            'id' => $po->id,
            'status' => 'PENDING_ACTUAL_PO',
            'delivery_status' => 'DELIVERED',
        ]);

        // 4. Strict Role Notification Assertions:
        // A. Procurement Manager: Notified to issue Actual PO
        Notification::assertSentTo(
            $this->procurementManager,
            ProcurementWorkflowNotification::class,
            function (ProcurementWorkflowNotification $notification) use ($po) {
                return $notification->type === 'grn_approved_pending_actual_po'
                    && (int) $notification->notifiable?->id === (int) $po->id;
            }
        );

        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->procurementManager->id,
            'type' => 'grn_approved_pending_actual_po',
            'purchase_order_id' => $po->id,
        ]);

        // B. Site Accountant: Notified that GRN is approved with PO for 3-way matching
        Notification::assertSentTo(
            $this->siteAccountant,
            ProcurementWorkflowNotification::class,
            function (ProcurementWorkflowNotification $notification) use ($po) {
                return $notification->type === 'purchase_order_and_receipt_ready_accounting'
                    && (int) $notification->notifiable?->id === (int) $po->id;
            }
        );

        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->siteAccountant->id,
            'type' => 'purchase_order_and_receipt_ready_accounting',
            'purchase_order_id' => $po->id,
            'purchase_receipt_id' => $receipt->id,
        ]);

        // C. Warehouse Keeper: Confirmation notification of approval
        Notification::assertSentTo(
            $this->warehouseKeeper,
            ProcurementWorkflowNotification::class,
            function (ProcurementWorkflowNotification $notification) use ($receipt) {
                return $notification->type === 'purchase_receipt_approved_site_engineer'
                    && (int) $notification->notifiable?->id === (int) $receipt->id;
            }
        );
    }

    /**
     * Test 3: GRN photo streaming endpoint authorization and cross-department security isolation.
     */
    public function test_grn_photo_streaming_authorization_and_isolation(): void
    {
        $disk = StorageService::disk();
        Storage::fake($disk);

        $po = $this->createIssuedPurchaseOrder(10, 42000);
        $poItem = $po->items->first();

        $fakePhoto = UploadedFile::fake()->image('grn_delivery_slip.jpg', 640, 480);
        $createResponse = $this->actingAs($this->warehouseKeeper, 'sanctum')
            ->post("/api/v1/purchase-receipts/purchase-orders/{$po->id}", [
                'received_at' => now()->toDateString(),
                'warehouse_notes' => 'استلام تجريبي لفحص عرض الصورة.',
                'photo' => $fakePhoto,
                'items' => [
                    [
                        'purchase_order_item_id' => $poItem->id,
                        'received_quantity' => 10,
                    ],
                ],
            ], ['Accept' => 'application/json']);

        $createResponse->assertStatus(201);
        $receiptId = $createResponse->json('data.id');

        // A. Authorized Roles CAN view/stream the GRN photo
        // 1. Procurement Manager can inspect photo
        $pmPhotoResponse = $this->actingAs($this->procurementManager, 'sanctum')
            ->get("/api/v1/purchase-receipts/{$receiptId}/photo");
        $pmPhotoResponse->assertStatus(200);

        // 2. Site Accountant can inspect photo
        $saPhotoResponse = $this->actingAs($this->siteAccountant, 'sanctum')
            ->get("/api/v1/purchase-receipts/{$receiptId}/photo");
        $saPhotoResponse->assertStatus(200);

        // 3. Assigned Site Engineer can inspect photo
        $sePhotoResponse = $this->actingAs($this->siteEngineer, 'sanctum')
            ->get("/api/v1/purchase-receipts/{$receiptId}/photo");
        $sePhotoResponse->assertStatus(200);

        // 4. Warehouse Keeper can inspect photo
        $whPhotoResponse = $this->actingAs($this->warehouseKeeper, 'sanctum')
            ->get("/api/v1/purchase-receipts/{$receiptId}/photo");
        $whPhotoResponse->assertStatus(200);

        // B. Unauthorized Roles CANNOT view/stream the GRN photo (Security & Isolation)
        // 1. Another Site Engineer from different department/site is FORBIDDEN / ISOLATED (403 or 404)
        $unauthorizedSeResponse = $this->actingAs($this->otherSiteEngineer, 'sanctum')
            ->get("/api/v1/purchase-receipts/{$receiptId}/photo");
        $this->assertTrue(in_array($unauthorizedSeResponse->status(), [403, 404], true));

        // 2. Accountant from unrelated department (Licenses) is FORBIDDEN / ISOLATED (403 or 404)
        $unauthorizedAccResponse = $this->actingAs($this->licensesAccountant, 'sanctum')
            ->get("/api/v1/purchase-receipts/{$receiptId}/photo");
        $this->assertTrue(in_array($unauthorizedAccResponse->status(), [403, 404], true));

        // 3. Unauthenticated guest is UNAUTHORIZED (401)
        auth('sanctum')->forgetUser();
        $this->app['auth']->forgetGuards();
        $guestResponse = $this->getJson("/api/v1/purchase-receipts/{$receiptId}/photo");
        $guestResponse->assertStatus(401);
    }

    /**
     * Test 4: Validation strictly rejects receipts with invalid items or negative quantities.
     */
    public function test_grn_creation_validation_rejects_negative_quantities_or_missing_items(): void
    {
        $po = $this->createIssuedPurchaseOrder(10, 42000);
        $poItem = $po->items->first();

        // 1. Missing items array
        $emptyResponse = $this->actingAs($this->warehouseKeeper, 'sanctum')
            ->postJson("/api/v1/purchase-receipts/purchase-orders/{$po->id}", [
                'received_at' => now()->toDateString(),
                'items' => [],
            ]);
        $emptyResponse->assertStatus(422);

        // 2. Negative quantity entered
        $negativeResponse = $this->actingAs($this->warehouseKeeper, 'sanctum')
            ->postJson("/api/v1/purchase-receipts/purchase-orders/{$po->id}", [
                'received_at' => now()->toDateString(),
                'items' => [
                    [
                        'purchase_order_item_id' => $poItem->id,
                        'received_quantity' => -5,
                    ],
                ],
            ]);
        $negativeResponse->assertStatus(422);
    }

    /**
     * Helper to create a fully prepared, issued Purchase Order with line item.
     */
    private function createIssuedPurchaseOrder(float $quantity, float $unitPrice): PurchaseOrder
    {
        $pr = PurchaseRequest::create([
            'department_id' => $this->dept->id,
            'target_department_id' => $this->dept->id,
            'user_id' => $this->siteEngineer->id,
            'reviewer_user_id' => $this->reviewer->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
            'request_number' => 'PR-GRN-' . uniqid(),
            'parcel_reference' => $this->parcel->parcel_reference,
            'region' => $this->parcel->region,
            'status' => 'APPROVED_BY_PROCUREMENT',
            'date_needed' => now()->addDays(3)->toDateString(),
            'requires_warehouse_receipt' => true,
        ]);

        $po = PurchaseOrder::create([
            'purchase_request_id' => $pr->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $this->procurementManager->id,
            'po_number' => 'PO-GRN-' . uniqid(),
            'status' => 'ISSUED',
            'subtotal' => $quantity * $unitPrice,
            'grand_total' => $quantity * $unitPrice,
            'delivery_status' => 'IN_RECEIPT',
        ]);

        PurchaseOrderItem::create([
            'purchase_order_id' => $po->id,
            'item_id' => $this->catalogItem->id,
            'item_description' => $this->catalogItem->name,
            'item_reference' => $this->parcel->parcel_reference,
            'region' => $this->parcel->region,
            'quantity' => $quantity,
            'uom' => $this->catalogItem->uom,
            'unit_price' => $unitPrice,
            'line_total' => $quantity * $unitPrice,
        ]);

        return $po->fresh(['items', 'purchaseRequest.department']);
    }

    /**
     * Helper to create user and associate role.
     */
    private function createUser(string $email, string $name, string $roleSlug, ?int $departmentId = null): User
    {
        $user = User::create([
            'department_id' => $departmentId,
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
