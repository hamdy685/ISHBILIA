<?php

namespace Tests\Feature\Api\V1;

use App\Models\Category;
use App\Models\Department;
use App\Models\Item;
use App\Models\LandParcel;
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
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class PurchaseRequestSupplementWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private Department $dept;
    private User $employee;
    private User $reviewer;
    private User $procurement;
    private User $accountant;
    private User $warehouse;
    private User $siteEngineer;
    private Supplier $supplierA;
    private Supplier $supplierB;
    private Item $item1;
    private Item $item2;
    private LandParcel $parcel;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);

        $this->dept = Department::create(['name' => 'قسم التنفيذ', 'code' => 'EXECUTION', 'is_active' => true]);

        $this->employee = $this->createUser('emp@ashbiliya.com', 'أحمد موظف', 'employee', $this->dept->id);
        $this->reviewer = $this->createUser('rev@ashbiliya.com', 'م. أيمن مراجع', 'reviewer', $this->dept->id);
        $this->dept->update(['manager_user_id' => $this->reviewer->id]);

        $this->procurement = $this->createUser('proc@ashbiliya.com', 'مدير المشتريات', 'procurement_manager', $this->dept->id);
        $this->accountant = $this->createUser('acc@ashbiliya.com', 'المحاسب', 'accountant', $this->dept->id);
        $this->warehouse = $this->createUser('wh@ashbiliya.com', 'أمين المستودع', 'warehouse_keeper', $this->dept->id);
        $this->siteEngineer = $this->createUser('eng@ashbiliya.com', 'م. هاني موقع', 'site_engineer', $this->dept->id);
        $this->dept->update(['site_engineer_user_id' => $this->siteEngineer->id]);

        $this->supplierA = Supplier::create(['code' => 'SUP-A', 'company_name' => 'شركة الحديد والصلب', 'is_active' => true]);
        $this->supplierB = Supplier::create(['code' => 'SUP-B', 'company_name' => 'شركة الأخشاب المتحدة', 'is_active' => true]);

        $cat = Category::create(['name' => 'مواد بناء', 'code' => 'BLD', 'is_active' => true]);
        $this->item1 = Item::create(['sku' => 'ITM-01', 'name' => 'حديد 12 مم', 'category_id' => $cat->id, 'uom' => 'TON', 'is_active' => true]);
        $this->item2 = Item::create(['sku' => 'ITM-02', 'name' => 'خشب بونتي', 'category_id' => $cat->id, 'uom' => 'M3', 'is_active' => true]);

        $this->parcel = LandParcel::create([
            'parcel_reference' => 'PARCEL-100',
            'region' => 'منطقة النرجس',
            'opening_balance' => 500000,
            'balance' => 500000,
            'is_active' => true,
        ]);
    }

    private function createUser(string $email, string $name, string $roleSlug, int $deptId): User
    {
        $user = User::create([
            'name' => $name,
            'email' => $email,
            'password' => Hash::make('Secret123!'),
            'department_id' => $deptId,
            'is_active' => true,
        ]);
        $role = Role::where('slug', $roleSlug)->firstOrFail();
        $user->roles()->attach($role->id);
        return $user;
    }

    private function createSamplePrWithPo(): array
    {
        $pr = PurchaseRequest::create([
            'request_number' => 'PR-2026-00999',
            'request_type' => 'PROJECT_MATERIALS',
            'parcel_reference' => $this->parcel->parcel_reference,
            'region' => $this->parcel->region,
            'land_parcel_id' => $this->parcel->id,
            'user_id' => $this->employee->id,
            'department_id' => $this->dept->id,
            'reviewer_user_id' => $this->reviewer->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
            'status' => 'PO_ISSUED',
            'total_estimated_cost' => 10000,
            'date_needed' => now()->addDays(7),
        ]);

        $prItem = PurchaseRequestItem::create([
            'purchase_request_id' => $pr->id,
            'item_id' => $this->item1->id,
            'supplier_id' => $this->supplierA->id,
            'item_description' => $this->item1->name,
            'quantity' => 10,
            'uom' => 'TON',
            'estimated_unit_price' => 1000,
            'estimated_line_total' => 10000,
        ]);

        $po = PurchaseOrder::create([
            'po_number' => 'PO-2026-00999',
            'purchase_request_id' => $pr->id,
            'supplier_id' => $this->supplierA->id,
            'created_by_user_id' => $this->procurement->id,
            'status' => 'ISSUED',
            'subtotal' => 10000,
            'grand_total' => 10000,
        ]);

        PurchaseOrderItem::create([
            'purchase_order_id' => $po->id,
            'pr_item_id' => $prItem->id,
            'item_id' => $this->item1->id,
            'item_description' => $this->item1->name,
            'quantity' => 10,
            'uom' => 'TON',
            'unit_price' => 1000,
            'line_total' => 10000,
        ]);

        return [$pr, $po];
    }

    public function test_eligible_requests_endpoint_returns_issued_unreceived_orders(): void
    {
        [$pr, $po] = $this->createSamplePrWithPo();

        $response = $this->actingAs($this->employee)
            ->getJson('/api/v1/purchase-requests/eligible-for-supplement');

        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertSame($pr->id, $response->json('data.0.id'));

        // Even if an approved receipt is created, request remains eligible for supplements (Rule 1)
        PurchaseReceipt::create([
            'purchase_order_id' => $po->id,
            'purchase_request_id' => $pr->id,
            'warehouse_keeper_user_id' => $this->warehouse->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
            'receipt_number' => 'GRN-2026-0001',
            'receipt_type' => 'RECEIPT',
            'status' => 'APPROVED',
            'received_at' => now(),
        ]);

        $responseAfterReceipt = $this->actingAs($this->employee)
            ->getJson('/api/v1/purchase-requests/eligible-for-supplement');

        $responseAfterReceipt->assertOk();
        $this->assertCount(1, $responseAfterReceipt->json('data'));
    }

    public function test_full_supplement_lifecycle_with_same_supplier(): void
    {
        [$pr, $po] = $this->createSamplePrWithPo();

        // 1. Employee creates supplement
        $storeResponse = $this->actingAs($this->employee)
            ->postJson("/api/v1/purchase-requests/{$pr->id}/supplements", [
                'notes' => 'محتاجين زيادة طنين حديد لنفس القطعة',
                'items' => [
                    [
                        'item_id' => $this->item1->id,
                        'item_description' => 'حديد 12 مم كمالة',
                        'quantity' => 2,
                        'uom' => 'TON',
                        'estimated_unit_price' => 1000,
                    ],
                ],
            ]);

        $storeResponse->assertStatus(201);
        $supplementId = $storeResponse->json('data.id');
        $this->assertSame('SUBMITTED', $storeResponse->json('data.status'));
        $this->assertSame(1, $storeResponse->json('data.batch_number'));

        // Verify item in DB
        $this->assertDatabaseHas('purchase_request_items', [
            'purchase_request_id' => $pr->id,
            'is_supplementary' => true,
            'supplement_batch' => 1,
            'quantity' => 2,
        ]);

        // 2. Reviewer approves supplement with receiver assignment (Rule 3)
        $approveResponse = $this->actingAs($this->reviewer)
            ->postJson("/api/v1/purchase-requests/supplements/{$supplementId}/approve", [
                'receiver_user_id' => $this->siteEngineer->id,
                'notes' => 'معتمد من مراجع القسم للاحتياج الفعلي',
            ]);

        $approveResponse->assertOk();
        $this->assertSame('PENDING_PROCUREMENT_APPROVAL', $approveResponse->json('data.status'));

        // 3. Procurement Manager processes supplement with SAME supplier
        $processResponse = $this->actingAs($this->procurement)
            ->postJson("/api/v1/purchase-requests/supplements/{$supplementId}/process-procurement", [
                'supplier_id' => $this->supplierA->id,
                'merge_to_existing_po' => true,
                'notes' => 'تم التنسيق مع مورد الحديد',
                'items_pricing' => [
                    [
                        'pr_item_id' => $pr->fresh()->items()->where('is_supplementary', true)->first()->id,
                        'unit_price' => 1100, // Price updated by procurement
                    ],
                ],
            ]);

        $processResponse->assertOk();
        $this->assertSame('PROCUREMENT_PROCESSED', $processResponse->json('data.status'));

        // Check PO was updated with the supplementary item and grand total recalculated
        $po->refresh();
        $this->assertSame('12200.00', (string) $po->grand_total); // 10,000 original + 2 * 1100 = 12,200
        $this->assertDatabaseHas('purchase_order_items', [
            'purchase_order_id' => $po->id,
            'is_supplementary' => true,
            'unit_price' => 1100,
            'quantity' => 2,
        ]);
    }

    public function test_supplement_with_different_supplier_creates_new_po_on_same_pr(): void
    {
        [$pr, $po] = $this->createSamplePrWithPo();

        // 1. Reviewer directly creates supplement (auto-approves reviewer stage)
        $storeResponse = $this->actingAs($this->reviewer)
            ->postJson("/api/v1/purchase-requests/{$pr->id}/supplements", [
                'notes' => 'إضافة خشب بونتي على نفس الطلب',
                'items' => [
                    [
                        'item_id' => $this->item2->id,
                        'item_description' => 'خشب بونتي كمالة',
                        'quantity' => 5,
                        'uom' => 'M3',
                        'estimated_unit_price' => 2000,
                    ],
                ],
            ]);

        $storeResponse->assertStatus(201);
        $supplementId = $storeResponse->json('data.id');
        // Reviewer creator smart bypass directly to PENDING_PROCUREMENT_APPROVAL (Rule 2)
        $this->assertSame('PENDING_PROCUREMENT_APPROVAL', $storeResponse->json('data.status'));

        // 2. Procurement processes with DIFFERENT supplier (Supplier B)
        $processResponse = $this->actingAs($this->procurement)
            ->postJson("/api/v1/purchase-requests/supplements/{$supplementId}/process-procurement", [
                'supplier_id' => $this->supplierB->id,
                'merge_to_existing_po' => false,
                'notes' => 'مورد أخشاب مختلف لنفس الطلب',
                'items_pricing' => [
                    [
                        'pr_item_id' => $pr->fresh()->items()->where('is_supplementary', true)->first()->id,
                        'unit_price' => 2200,
                    ],
                ],
            ]);

        $processResponse->assertOk();
        $this->assertSame('PROCUREMENT_PROCESSED', $processResponse->json('data.status'));

        // Verify a new PO was created for Supplier B linked to the SAME PR
        $this->assertCount(2, $pr->fresh()->purchaseOrders);
        $newPo = PurchaseOrder::where('purchase_request_id', $pr->id)
            ->where('supplier_id', $this->supplierB->id)
            ->firstOrFail();

        $this->assertSame('11000.00', (string) $newPo->grand_total); // 5 * 2200 = 11,000
        $this->assertDatabaseHas('purchase_order_items', [
            'purchase_order_id' => $newPo->id,
            'is_supplementary' => true,
            'line_total' => 11000,
        ]);
    }

    public function test_can_create_supplement_even_if_order_already_has_approved_receipt(): void
    {
        [$pr, $po] = $this->createSamplePrWithPo();

        // Simulate approved receipt
        PurchaseReceipt::create([
            'purchase_order_id' => $po->id,
            'purchase_request_id' => $pr->id,
            'warehouse_keeper_user_id' => $this->warehouse->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
            'receipt_number' => 'GRN-2026-0002',
            'receipt_type' => 'RECEIPT',
            'status' => 'APPROVED',
            'received_at' => now(),
        ]);

        // Creating supplement must succeed even with an approved receipt (Rule 1)
        $response = $this->actingAs($this->employee)
            ->postJson("/api/v1/purchase-requests/{$pr->id}/supplements", [
                'items' => [
                    [
                        'item_description' => 'بند إضافي بعد الاستلام',
                        'quantity' => 1,
                    ],
                ],
            ]);

        $response->assertStatus(201);
        $this->assertSame('SUBMITTED', $response->json('data.status'));
    }

    public function test_can_list_supplements_for_purchase_request(): void
    {
        [$pr, $po] = $this->createSamplePrWithPo();

        $this->actingAs($this->employee)
            ->postJson("/api/v1/purchase-requests/{$pr->id}/supplements", [
                'notes' => 'كمالة استعجال',
                'items' => [
                    [
                        'item_description' => 'بند كمالة تجريبي',
                        'quantity' => 4,
                        'uom' => 'PCS',
                    ],
                ],
            ])
            ->assertStatus(201);

        $listResponse = $this->actingAs($this->employee)
            ->getJson("/api/v1/purchase-requests/{$pr->id}/supplements");

        $listResponse->assertOk();
        $this->assertTrue($listResponse->json('can_accept_supplement'));
        $this->assertCount(1, $listResponse->json('data'));
        $this->assertSame(1, $listResponse->json('data.0.batch_number'));
        $this->assertCount(1, $listResponse->json('data.0.items'));
    }

    public function test_reviewer_approval_enforces_receiver_user_id(): void
    {
        [$pr, $po] = $this->createSamplePrWithPo();
        // Clear receiver from PR
        $pr->update(['site_engineer_user_id' => null]);

        $storeResponse = $this->actingAs($this->employee)
            ->postJson("/api/v1/purchase-requests/{$pr->id}/supplements", [
                'items' => [
                    [
                        'item_description' => 'بند إضافي',
                        'quantity' => 2,
                    ],
                ],
            ]);
        $supplementId = $storeResponse->json('data.id');

        // Approval without receiver when none is set on PR should fail with 422
        $failResponse = $this->actingAs($this->reviewer)
            ->postJson("/api/v1/purchase-requests/supplements/{$supplementId}/approve", [
                'notes' => 'بدون تحديد مستلم',
            ]);
        $failResponse->assertStatus(422);
        $failResponse->assertJsonValidationErrors('receiver_user_id');

        // Approval with receiver must succeed and update PR site_engineer_user_id
        $successResponse = $this->actingAs($this->reviewer)
            ->postJson("/api/v1/purchase-requests/supplements/{$supplementId}/approve", [
                'receiver_user_id' => $this->warehouse->id,
                'notes' => 'تم تعيين أمين المخزن للاستلام',
            ]);
        $successResponse->assertOk();
        $this->assertSame('PENDING_PROCUREMENT_APPROVAL', $successResponse->json('data.status'));
        $this->assertSame($this->warehouse->id, (int) $pr->fresh()->site_engineer_user_id);
    }
}

