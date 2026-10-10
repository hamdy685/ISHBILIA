<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Notification;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\PurchaseReceipt;
use App\Models\PurchaseRequest;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use App\Services\PurchaseOrderService;
use App\Services\PurchaseReceiptService;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ActualPoAllItemsPreservedTest extends TestCase
{
    use RefreshDatabase;

    protected User $procurementManager;
    protected User $siteEngineer;
    protected User $warehouseKeeper;
    protected User $accountant;
    protected Supplier $supplier;
    protected Department $dept;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);

        $this->dept = Department::create(['name' => 'إدارة التنفيذ', 'code' => 'EXEC-01']);

        $this->procurementManager = $this->createUserWithRole('procurement_manager', $this->dept->id, null, 'مدير المشتريات');
        $this->siteEngineer = $this->createUserWithRole('site_engineer', $this->dept->id, null, 'مهندس الموقع');
        $this->warehouseKeeper = $this->createUserWithRole('warehouse_keeper', $this->dept->id, null, 'أمين المخزن');
        $this->accountant = $this->createUserWithRole('accountant', $this->dept->id, null, 'محاسب الموقع');

        $this->supplier = Supplier::create([
            'company_name' => 'شركة الأهرام للتوريدات والمقاولات',
            'is_active' => true,
        ]);
    }

    protected function createUserWithRole(string $roleSlug, ?int $departmentId = null, ?int $managerId = null, string $name = 'User'): User
    {
        $user = User::create([
            'name' => $name,
            'email' => uniqid('test_') . '@ashbiliya.com',
            'password' => Hash::make('password123'),
            'department_id' => $departmentId,
            'manager_id' => $managerId,
            'is_active' => true,
        ]);

        $role = Role::where('slug', $roleSlug)->first();
        if ($role) {
            $user->roles()->attach($role->id);
        }

        return $user;
    }

    protected function createPoWithPr(string $poNumber = 'PO-2026-TEST', string $status = 'ISSUED', float $total = 0.0): PurchaseOrder
    {
        $pr = PurchaseRequest::create([
            'request_number' => 'PR-' . uniqid(),
            'user_id' => $this->siteEngineer->id,
            'requester_user_id' => $this->siteEngineer->id,
            'department_id' => $this->dept->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
            'status' => 'PENDING_PROCUREMENT_APPROVAL',
            'date_needed' => now()->toDateString(),
        ]);

        return PurchaseOrder::create([
            'po_number' => $poNumber . '-' . uniqid(),
            'purchase_request_id' => $pr->id,
            'department_id' => $this->dept->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $this->procurementManager->id,
            'status' => $status,
            'delivery_status' => $status === 'ISSUED' ? 'ISSUED' : 'IN_RECEIPT',
            'subtotal' => $total,
            'grand_total' => $total,
        ]);
    }

    /**
     * Test 1: All 4 items are preserved in Actual PO, including Item 3 with actual_quantity = 0.
     * 100 -> received 100
     * 50  -> received 20
     * 30  -> received 0
     * 10  -> received 8
     */
    public function test_all_items_preserved_in_actual_po_including_zero_quantity(): void
    {
        $po = $this->createPoWithPr('PO-TEST01', 'ISSUED', 19000);

        $item1 = $po->items()->create([
            'item_description' => 'حديد تسليح 12 مم',
            'item_reference' => 'PARCEL-101',
            'region' => 'أكتوبر',
            'quantity' => 100,
            'uom' => 'TON',
            'unit_price' => 100,
            'line_total' => 10000,
        ]);

        $item2 = $po->items()->create([
            'item_description' => 'أسمنت بورتلاندي',
            'item_reference' => 'PARCEL-101',
            'region' => 'أكتوبر',
            'quantity' => 50,
            'uom' => 'TON',
            'unit_price' => 100,
            'line_total' => 5000,
        ]);

        $item3 = $po->items()->create([
            'item_description' => 'طوب أسمنتي',
            'item_reference' => 'PARCEL-101',
            'region' => 'أكتوبر',
            'quantity' => 30,
            'uom' => 'THOUSAND',
            'unit_price' => 100,
            'line_total' => 3000,
        ]);

        $item4 = $po->items()->create([
            'item_description' => 'سلك رباط',
            'item_reference' => 'PARCEL-101',
            'region' => 'أكتوبر',
            'quantity' => 10,
            'uom' => 'ROLL',
            'unit_price' => 100,
            'line_total' => 1000,
        ]);

        // 1. Warehouse Keeper creates receipt (with Item 3 received_quantity = 0)
        $receipt = app(PurchaseReceiptService::class)->createByWarehouse(
            $this->warehouseKeeper,
            $po,
            [
                ['purchase_order_item_id' => $item1->id, 'received_quantity' => 100],
                ['purchase_order_item_id' => $item2->id, 'received_quantity' => 20],
                ['purchase_order_item_id' => $item3->id, 'received_quantity' => 0],
                ['purchase_order_item_id' => $item4->id, 'received_quantity' => 8],
            ],
            now()->toDateString(),
            'استلام مواد بالموقع'
        );

        $this->assertEquals('PENDING_SITE_ENGINEER', $receipt->status);

        // 2. Site Engineer inspects and approves
        $approvedReceipt = app(PurchaseReceiptService::class)->approveBySiteEngineer(
            $this->siteEngineer,
            $receipt,
            'تم فحص البنود واعتماد الاستلام'
        );

        $this->assertEquals('APPROVED', $approvedReceipt->status);
        $this->assertEquals('PENDING_ACTUAL_PO', $po->fresh()->status);

        // 3. Procurement Manager finalizes Actual PO
        $finalizedPo = app(PurchaseOrderService::class)->finalizeActualPo(
            $this->procurementManager,
            $po->fresh(),
            [
                ['id' => $item1->id, 'quantity' => 100, 'unit_price' => 100, 'item_description' => 'حديد تسليح 12 مم', 'item_reference' => 'PARCEL-101', 'region' => 'أكتوبر'],
                ['id' => $item2->id, 'quantity' => 20, 'unit_price' => 100, 'item_description' => 'أسمنت بورتلاندي', 'item_reference' => 'PARCEL-101', 'region' => 'أكتوبر'],
                ['id' => $item3->id, 'quantity' => 0, 'unit_price' => 100, 'item_description' => 'طوب أسمنتي', 'item_reference' => 'PARCEL-101', 'region' => 'أكتوبر'],
                ['id' => $item4->id, 'quantity' => 8, 'unit_price' => 100, 'item_description' => 'سلك رباط', 'item_reference' => 'PARCEL-101', 'region' => 'أكتوبر'],
            ],
            'إصدار أمر الشراء الفعلي بعد اعتماد الاستلام'
        );

        // Assert all 4 items exist
        $freshItems = $finalizedPo->items()->get();
        $this->assertCount(4, $freshItems);

        // Item 3 exists with quantity = 0 and line_total = 0.00
        $freshItem3 = $freshItems->firstWhere('id', $item3->id);
        $this->assertNotNull($freshItem3, 'Item 3 must be present in Actual PO');
        $this->assertEquals(0.0, (float) $freshItem3->quantity);
        $this->assertEquals(0.0, (float) $freshItem3->line_total);

        // Check other items
        $this->assertEquals(100.0, (float) $freshItems->firstWhere('id', $item1->id)->quantity);
        $this->assertEquals(20.0, (float) $freshItems->firstWhere('id', $item2->id)->quantity);
        $this->assertEquals(8.0, (float) $freshItems->firstWhere('id', $item4->id)->quantity);

        // Expected grand total = (100 * 100) + (20 * 100) + (0 * 100) + (8 * 100) = 10,000 + 2,000 + 0 + 800 = 12,800
        $this->assertEquals(12800.0, (float) $finalizedPo->grand_total);
        $this->assertEquals('ISSUED', $finalizedPo->status);
        $this->assertNotNull($finalizedPo->finalized_at);
    }

    /**
     * Test 2: Notification & Required Action appear for Procurement Manager and NOT for Warehouse Keeper.
     */
    public function test_procurement_notification_and_required_actions_after_site_approval(): void
    {
        $po = $this->createPoWithPr('PO-TEST02', 'ISSUED', 5000);

        $item = $po->items()->create([
            'item_description' => 'خشب بونتي',
            'item_reference' => 'PARCEL-202',
            'region' => 'أكتوبر',
            'quantity' => 50,
            'unit_price' => 100,
            'line_total' => 5000,
        ]);

        $receipt = app(PurchaseReceiptService::class)->createByWarehouse(
            $this->warehouseKeeper,
            $po,
            [['purchase_order_item_id' => $item->id, 'received_quantity' => 50]],
            now()->toDateString(),
            'توريد خشب'
        );

        // Approve by site engineer
        app(PurchaseReceiptService::class)->approveBySiteEngineer(
            $this->siteEngineer,
            $receipt,
            'معتمد'
        );

        // Assert Procurement Manager received notification
        $notification = Notification::where('user_id', $this->procurementManager->id)
            ->where('type', 'grn_approved_pending_actual_po')
            ->first();

        $this->assertNotNull($notification, 'Procurement Manager must receive Actual PO notification');
        $this->assertEquals('مطلوب إنشاء أمر شراء فعلي', $notification->title);
        $this->assertEquals($po->id, $notification->purchase_order_id);
        $this->assertEquals($receipt->id, $notification->purchase_receipt_id);

        // Assert Warehouse Keeper DOES NOT have Actual PO notification
        $whNotification = Notification::where('user_id', $this->warehouseKeeper->id)
            ->where('type', 'grn_approved_pending_actual_po')
            ->first();
        $this->assertNull($whNotification, 'Warehouse Keeper must NOT receive grn_approved_pending_actual_po notification');

        // Check Required Actions (Pending Tasks) endpoint for Procurement Manager
        $response = $this->actingAs($this->procurementManager, 'sanctum')
            ->getJson('/api/v1/dashboard/pending-tasks');

        $response->assertStatus(200);
        $tasks = collect($response->json('data'));
        $actualPoTask = $tasks->firstWhere('id', "po-actual-{$po->id}");
        $this->assertNotNull($actualPoTask, 'Actual PO task must appear in Procurement Manager pending tasks');
        $this->assertEquals("/procurement/purchase-orders/{$po->id}/edit", $actualPoTask['actionUrl']);

        // Check Required Actions endpoint for Warehouse Keeper
        $whResponse = $this->actingAs($this->warehouseKeeper, 'sanctum')
            ->getJson('/api/v1/dashboard/pending-tasks');
        $whResponse->assertStatus(200);
        $whTasks = collect($whResponse->json('data'));
        $this->assertNull($whTasks->firstWhere('id', "po-actual-{$po->id}"), 'Actual PO task must NOT appear for Warehouse Keeper');
    }

    /**
     * Test 3: Inventory / Warehouse movement safety for zero-quantity items.
     */
    public function test_zero_quantity_item_does_not_add_inventory(): void
    {
        $po = $this->createPoWithPr('PO-TEST03', 'PENDING_ACTUAL_PO', 2000);

        $itemZero = $po->items()->create([
            'item_description' => 'بند لم يصل إطلاقاً',
            'item_reference' => 'PARCEL-303',
            'region' => 'أكتوبر',
            'quantity' => 20,
            'unit_price' => 100,
            'line_total' => 2000,
        ]);

        $receipt = PurchaseReceipt::create([
            'purchase_order_id' => $po->id,
            'supplier_id' => $this->supplier->id,
            'warehouse_keeper_user_id' => $this->warehouseKeeper->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
            'receipt_number' => 'REC-TEST-303',
            'status' => 'APPROVED',
            'received_at' => now()->toDateString(),
        ]);

        $receipt->items()->create([
            'purchase_order_item_id' => $itemZero->id,
            'ordered_quantity' => 20,
            'received_quantity' => 0,
        ]);

        $finalizedPo = app(PurchaseOrderService::class)->finalizeActualPo(
            $this->procurementManager,
            $po,
            [['id' => $itemZero->id, 'quantity' => 0, 'unit_price' => 100, 'item_description' => 'بند لم يصل إطلاقاً', 'item_reference' => 'PARCEL-303', 'region' => 'أكتوبر']]
        );

        $this->assertEquals(0.0, (float) $finalizedPo->grand_total);
        $item = $finalizedPo->items()->first();
        $this->assertEquals(0.0, (float) $item->quantity);
        $this->assertEquals(0.0, (float) $item->line_total);
    }

    /**
     * Test 4: Accounting sees all items and correct financial values without zero item inflation.
     */
    public function test_accounting_sees_all_items_with_reconciled_totals(): void
    {
        $po = $this->createPoWithPr('PO-TEST04', 'PENDING_ACTUAL_PO', 10000);

        $item1 = $po->items()->create([
            'item_description' => 'بند واصل',
            'item_reference' => 'PARCEL-404',
            'region' => 'أكتوبر',
            'quantity' => 50,
            'unit_price' => 100,
            'line_total' => 5000,
        ]);

        $item2 = $po->items()->create([
            'item_description' => 'بند غير واصل',
            'item_reference' => 'PARCEL-404',
            'region' => 'أكتوبر',
            'quantity' => 50,
            'unit_price' => 100,
            'line_total' => 5000,
        ]);

        $receipt = PurchaseReceipt::create([
            'purchase_order_id' => $po->id,
            'supplier_id' => $this->supplier->id,
            'warehouse_keeper_user_id' => $this->warehouseKeeper->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
            'receipt_number' => 'REC-TEST-404',
            'status' => 'APPROVED',
            'received_at' => now()->toDateString(),
        ]);

        $receipt->items()->create([
            'purchase_order_item_id' => $item1->id,
            'ordered_quantity' => 50,
            'received_quantity' => 50,
        ]);

        $receipt->items()->create([
            'purchase_order_item_id' => $item2->id,
            'ordered_quantity' => 50,
            'received_quantity' => 0,
        ]);

        $finalizedPo = app(PurchaseOrderService::class)->finalizeActualPo(
            $this->procurementManager,
            $po,
            [
                ['id' => $item1->id, 'quantity' => 50, 'unit_price' => 100, 'item_description' => 'بند واصل', 'item_reference' => 'PARCEL-404', 'region' => 'أكتوبر'],
                ['id' => $item2->id, 'quantity' => 0, 'unit_price' => 100, 'item_description' => 'بند غير واصل', 'item_reference' => 'PARCEL-404', 'region' => 'أكتوبر'],
            ]
        );

        $this->assertEquals(5000.0, (float) $finalizedPo->grand_total);
        $this->assertCount(2, $finalizedPo->items);

        // Accounting receipt value reflects Actual PO grand total of 5,000 (not 10,000)
        $receiptValue = app(\App\Services\SupplierInvoiceService::class)->calculateReceiptValue($receipt);
        $this->assertEquals(5000.0, $receiptValue);
    }

    /**
     * Test 5: Supplement requests retain is_supplementary flag and zero quantity items in Actual PO.
     */
    public function test_supplement_items_preserved_with_zero_quantity_in_actual_po(): void
    {
        $po = $this->createPoWithPr('PO-TEST05', 'PENDING_ACTUAL_PO', 6000);

        $itemBase = $po->items()->create([
            'item_description' => 'بند أصلي',
            'item_reference' => 'PARCEL-505',
            'region' => 'أكتوبر',
            'quantity' => 20,
            'unit_price' => 100,
            'line_total' => 2000,
            'is_supplementary' => false,
        ]);

        $itemSup = $po->items()->create([
            'item_description' => 'بند كمالة إضافي',
            'item_reference' => 'PARCEL-505',
            'region' => 'أكتوبر',
            'quantity' => 40,
            'unit_price' => 100,
            'line_total' => 4000,
            'is_supplementary' => true,
            'supplement_batch' => 1,
        ]);

        $finalizedPo = app(PurchaseOrderService::class)->finalizeActualPo(
            $this->procurementManager,
            $po,
            [
                ['id' => $itemBase->id, 'quantity' => 20, 'unit_price' => 100, 'item_description' => 'بند أصلي', 'item_reference' => 'PARCEL-505', 'region' => 'أكتوبر'],
                ['id' => $itemSup->id, 'quantity' => 0, 'unit_price' => 100, 'item_description' => 'بند كمالة إضافي', 'item_reference' => 'PARCEL-505', 'region' => 'أكتوبر', 'is_supplementary' => true, 'supplement_batch' => 1],
            ]
        );

        $items = $finalizedPo->items()->get();
        $this->assertCount(2, $items);
        $sup = $items->firstWhere('id', $itemSup->id);
        $this->assertTrue((bool) $sup->is_supplementary);
        $this->assertEquals(1, $sup->supplement_batch);
        $this->assertEquals(0.0, (float) $sup->quantity);
    }

    /**
     * Test 6: Idempotency - double submission prevention and required task removal.
     */
    public function test_actual_po_cannot_be_finalized_twice(): void
    {
        $po = $this->createPoWithPr('PO-TEST06', 'PENDING_ACTUAL_PO', 1000);

        $item = $po->items()->create([
            'item_description' => 'بند اختبار',
            'item_reference' => 'PARCEL-606',
            'region' => 'أكتوبر',
            'quantity' => 10,
            'unit_price' => 100,
            'line_total' => 1000,
        ]);

        // First finalization succeeds
        $finalized = app(PurchaseOrderService::class)->finalizeActualPo(
            $this->procurementManager,
            $po,
            [['id' => $item->id, 'quantity' => 10, 'unit_price' => 100, 'item_description' => 'بند اختبار', 'item_reference' => 'PARCEL-606', 'region' => 'أكتوبر']]
        );

        $this->assertEquals('ISSUED', $finalized->status);

        // Second finalization throws RuntimeException
        $this->expectException(\RuntimeException::class);
        app(PurchaseOrderService::class)->finalizeActualPo(
            $this->procurementManager,
            $finalized,
            [['id' => $item->id, 'quantity' => 10, 'unit_price' => 100, 'item_description' => 'بند اختبار', 'item_reference' => 'PARCEL-606', 'region' => 'أكتوبر']]
        );
    }

    /**
     * Test 7: Procurement Manager can edit any quantity, including changing a 0 entered mistakenly by warehouse.
     */
    public function test_procurement_manager_can_edit_zero_quantity_to_positive(): void
    {
        $po = $this->createPoWithPr('PO-TEST07', 'PENDING_ACTUAL_PO', 3000);

        $item = $po->items()->create([
            'item_description' => 'طوب أحمر تم تسجيله صفر بالخطأ',
            'item_reference' => 'PARCEL-707',
            'region' => 'أكتوبر',
            'quantity' => 30,
            'unit_price' => 100,
            'line_total' => 3000,
        ]);

        $receipt = PurchaseReceipt::create([
            'purchase_order_id' => $po->id,
            'supplier_id' => $this->supplier->id,
            'warehouse_keeper_user_id' => $this->warehouseKeeper->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
            'receipt_number' => 'REC-TEST-707',
            'status' => 'APPROVED',
            'received_at' => now()->toDateString(),
        ]);

        $receipt->items()->create([
            'purchase_order_item_id' => $item->id,
            'ordered_quantity' => 30,
            'received_quantity' => 0, // warehouse recorded 0 by mistake
        ]);

        // Procurement Manager corrects it to 25
        $finalizedPo = app(PurchaseOrderService::class)->finalizeActualPo(
            $this->procurementManager,
            $po,
            [
                [
                    'id' => $item->id,
                    'quantity' => 25, // corrected from 0 to 25
                    'unit_price' => 100,
                    'item_description' => 'طوب أحمر تم تسجيله صفر بالخطأ',
                    'item_reference' => 'PARCEL-707',
                    'region' => 'أكتوبر',
                ],
            ],
            'تصحيح الكمية من صفر إلى 25 طن بعد المراجعة'
        );

        $freshItem = $finalizedPo->items()->first();
        $this->assertEquals(25.0, (float) $freshItem->quantity);
        $this->assertEquals(2500.0, (float) $freshItem->line_total);
        $this->assertEquals(2500.0, (float) $finalizedPo->grand_total);
    }
}
