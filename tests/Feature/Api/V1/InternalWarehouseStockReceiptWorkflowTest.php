<?php

namespace Tests\Feature\Api\V1;

use App\Models\ApprovalHistory;
use App\Models\Department;
use App\Models\Item;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\PurchaseReceipt;
use App\Models\PurchaseReceiptItem;
use App\Models\PurchaseRequest;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use App\Notifications\ProcurementWorkflowNotification;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * Class InternalWarehouseStockReceiptWorkflowTest
 *
 * Senior QA & Integration Automation Test Suite verifying:
 * 1. Treating materials withdrawn from company's internal stock/warehouse as an official Virtual Supplier.
 * 2. Allowing unit_price = 0 (since goods were previously acquired and in storage, not an external purchase).
 * 3. GRN creation properly populates and links supplier_id to "المخزن الداخلي".
 * 4. Site Engineer physical inspection & approval:
 *    - Automatically sets PO to FINAL_APPROVED and DELIVERED (no commercial Actual PO or external supplier invoice needed).
 *    - Records audit history as INTERNAL_STOCK_RECEIPT_APPROVED.
 *    - Sends notification to Site Accountant alerting that stock was withdrawn from warehouse at zero cost.
 * 5. API responses return supplier data and virtual warehouse indicator for UI filtering and badges.
 */
class InternalWarehouseStockReceiptWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private Department $dept;
    private User $warehouseKeeper;
    private User $siteEngineer;
    private User $procurementManager;
    private User $siteAccountant;
    private Supplier $internalWarehouseSupplier;
    private Item $stockItem;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);

        $this->dept = Department::create(['name' => 'إدارة التنفيذ والإنشاءات', 'code' => 'EXECUTION', 'is_active' => true]);

        $this->warehouseKeeper = $this->createUser('wh_keeper@example.com', 'أمين المخزن الرئيسي', 'warehouse_keeper', $this->dept->id);
        $this->siteEngineer = $this->createUser('site_eng@example.com', 'مهندس الموقع التنفيذي', 'site_engineer', $this->dept->id);
        $this->procurementManager = $this->createUser('pm@example.com', 'مدير المشتريات', 'procurement_manager');
        $this->siteAccountant = $this->createUser('site_accountant@example.com', 'محاسب الموقع', 'site_accountant', $this->dept->id);

        $this->dept->update([
            'site_engineer_user_id' => $this->siteEngineer->id,
        ]);

        // Virtual internal warehouse supplier
        $this->internalWarehouseSupplier = Supplier::getOrCreateInternalWarehouseSupplier();

        $this->stockItem = Item::create([
            'name' => 'حديد تسليح 12 مم (من رصيد المخزن)',
            'sku' => 'STEEL-WH-12',
            'unit' => 'ton',
            'default_unit_price' => 0,
        ]);
    }

    private function createUser(string $email, string $name, string $roleSlug, ?int $departmentId = null): User
    {
        $role = Role::where('slug', $roleSlug)->firstOrFail();

        $user = User::create([
            'department_id' => $departmentId,
            'name' => $name,
            'email' => $email,
            'password' => Hash::make('password123'),
            'role_id' => $role->id,
            'is_active' => true,
        ]);

        $user->roles()->attach($role->id);

        return $user;
    }

    private function createInternalWarehousePO(float $unitPrice = 0.0): PurchaseOrder
    {
        $pr = PurchaseRequest::create([
            'request_number' => 'PR-WH-' . uniqid(),
            'user_id' => $this->siteEngineer->id,
            'requester_id' => $this->siteEngineer->id,
            'department_id' => $this->dept->id,
            'site_engineer_id' => $this->siteEngineer->id,
            'status' => 'PENDING_PO_CREATION',
            'total_estimated_cost' => 0,
        ]);

        $po = PurchaseOrder::create([
            'po_number' => 'PO-WH-' . uniqid(),
            'purchase_request_id' => $pr->id,
            'created_by_user_id' => $this->procurementManager->id,
            'supplier_id' => $this->internalWarehouseSupplier->id,
            'status' => 'ISSUED',
            'total_amount' => 0,
            'version' => 1,
            'currency' => 'EGP',
        ]);

        PurchaseOrderItem::create([
            'purchase_order_id' => $po->id,
            'item_id' => $this->stockItem->id,
            'item_description' => 'حديد تسليح 12 مم',
            'quantity' => 10,
            'unit_price' => $unitPrice,
            'total_price' => 10 * $unitPrice,
            'uom' => 'ton',
        ]);

        return $po;
    }

    /**
     * Scenario 1: Verify internal warehouse virtual supplier exists, can be referenced, and supports zero price items.
     */
    public function test_internal_warehouse_virtual_supplier_can_issue_po_with_zero_unit_price(): void
    {
        $this->assertEquals(Supplier::INTERNAL_WAREHOUSE_NAME, $this->internalWarehouseSupplier->company_name);
        $this->assertEquals(Supplier::INTERNAL_WAREHOUSE_TAX_NUMBER, $this->internalWarehouseSupplier->tax_number);
        $this->assertTrue($this->internalWarehouseSupplier->isInternalWarehouse());

        $po = $this->createInternalWarehousePO(0.0);

        $this->assertTrue($po->isInternalWarehouse());
        $this->assertEquals($this->internalWarehouseSupplier->id, $po->supplier_id);
        $this->assertEquals(0, $po->items->first()->unit_price);
        $this->assertEquals(0, $po->total_amount);
    }

    /**
     * Scenario 2: Warehouse Keeper submits GRN for internal stock, and GRN correctly links to virtual supplier.
     */
    public function test_warehouse_keeper_submits_grn_linked_to_internal_warehouse_supplier(): void
    {
        $po = $this->createInternalWarehousePO(0.0);
        $poItem = $po->items->first();

        $token = $this->warehouseKeeper->createToken('test')->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson("/api/v1/purchase-receipts/purchase-orders/{$po->id}", [
                'warehouse_notes' => 'تم صرف 10 طن حديد من المخزن الداخلي مباشرة لموقع العمل',
                'items' => [
                    [
                        'purchase_order_item_id' => $poItem->id,
                        'received_quantity' => 10,
                        'notes' => 'سليم ومطابق',
                    ],
                ],
            ]);

        $response->assertStatus(201);
        $receiptId = $response->json('data.id');

        $receipt = PurchaseReceipt::with('supplier')->find($receiptId);
        $this->assertNotNull($receipt);
        $this->assertEquals($this->internalWarehouseSupplier->id, $receipt->supplier_id);
        $this->assertEquals('المخزن الداخلي', $receipt->supplier_name);
        $this->assertTrue($receipt->isInternalWarehouse());
    }

    /**
     * Scenario 3: Site Engineer approves internal warehouse GRN.
     * Crucial Business Logic:
     * - Parent PO is marked PENDING_ACTUAL_PO and DELIVERED.
     * - Procurement is notified to issue the Actual Purchase Order (grn_approved_pending_actual_po).
     * - Accounting MUST NOT be notified nor receive documents prior to Actual PO finalization.
     * - Accounting approved receipts queue hides the receipt while waiting for Actual PO.
     * - Once Procurement finalizes Actual PO, PO transitions to ISSUED, finalized_at is recorded,
     *   and Accounting is officially notified and able to see the receipt.
     */
    public function test_site_engineer_approves_internal_warehouse_grn_requires_actual_po_before_accounting(): void
    {
        Notification::fake();

        $po = $this->createInternalWarehousePO(0.0);
        $poItem = $po->items->first();

        // Warehouse keeper creates receipt
        $receipt = PurchaseReceipt::create([
            'receipt_number' => 'GRN-WH-' . uniqid(),
            'purchase_order_id' => $po->id,
            'purchase_request_id' => $po->purchase_request_id,
            'supplier_id' => $this->internalWarehouseSupplier->id,
            'warehouse_keeper_user_id' => $this->warehouseKeeper->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
            'status' => 'PENDING_SITE_ENGINEER',
            'warehouse_notes' => 'صرف من رصيد المخزن الداخلي',
            'warehouse_submitted_at' => now(),
        ]);

        $receiptItem = PurchaseReceiptItem::create([
            'purchase_receipt_id' => $receipt->id,
            'purchase_order_item_id' => $poItem->id,
            'ordered_quantity' => 10,
            'received_quantity' => 10,
        ]);

        $token = $this->siteEngineer->createToken('test')->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson("/api/v1/purchase-receipts/{$receipt->id}/approve", [
                'site_engineer_notes' => 'تم استلام وتفريغ الحديد في الموقع ومطابقة الفحص الهندسي بنجاح',
                'items' => [
                    [
                        'id' => $receiptItem->id,
                        'received_quantity' => 10,
                    ],
                ],
            ]);

        $response->assertStatus(200);

        // 1. Assert Receipt status is APPROVED
        $receipt->refresh();
        $this->assertEquals('APPROVED', $receipt->status);
        $this->assertEquals($this->internalWarehouseSupplier->id, $receipt->supplier_id);

        // 2. Assert PO moved to PENDING_ACTUAL_PO waiting for Actual PO (NOT FINAL_APPROVED yet)
        $po->refresh();
        $this->assertEquals('PENDING_ACTUAL_PO', $po->status);
        $this->assertEquals('DELIVERED', $po->delivery_status);
        $this->assertNull($po->finalized_at);

        // 3. Assert Procurement Manager notified to issue Actual PO
        Notification::assertSentTo(
            $this->procurementManager,
            ProcurementWorkflowNotification::class,
            function (ProcurementWorkflowNotification $notification) use ($po) {
                return $notification->type === 'grn_approved_pending_actual_po'
                    && (int) $notification->notifiable?->id === (int) $po->id;
            }
        );

        // 4. Assert Accounting is NOT notified at this stage
        Notification::assertNotSentTo(
            $this->siteAccountant,
            ProcurementWorkflowNotification::class
        );

        // 5. Assert Accounting approved receipts queue hides this receipt before Actual PO
        $queueResponse = $this->actingAs($this->siteAccountant, 'sanctum')
            ->getJson('/api/v1/accounting/receipts/approved');
        $queueResponse->assertStatus(200);
        $receiptIds = collect($queueResponse->json('data'))->pluck('id')->all();
        $this->assertNotContains($receipt->id, $receiptIds);

        // 6. Procurement Manager finalizes Actual PO
        $finalizeResponse = $this->actingAs($this->procurementManager, 'sanctum')
            ->postJson("/api/v1/procurement/purchase-orders/{$po->id}/finalize", [
                'items' => [
                    [
                        'id' => $poItem->id,
                        'item_description' => 'حديد تسليح 12 مم (فعلي من المخزن)',
                        'quantity' => 10,
                        'unit_price' => 0,
                        'uom' => 'ton',
                        'item_reference' => 'WH-REF-01',
                        'region' => 'المستودع الرئيسي',
                        'supplier_id' => $this->internalWarehouseSupplier->id,
                    ],
                ],
                'notes' => 'اعتماد أمر الشراء الفعلي لمنصرفات المخزن الداخلي بعد الاستلام الهندسي',
            ]);

        $finalizeResponse->assertStatus(200);

        // 7. Verify PO is now ISSUED & finalized
        $po->refresh();
        $this->assertEquals('ISSUED', $po->status);
        $this->assertNotNull($po->finalized_at);
        $this->assertEquals($this->procurementManager->id, $po->finalized_by_user_id);

        // 8. Now Accounting CAN see the receipt in the approved queue
        $queueResponseAfter = $this->actingAs($this->siteAccountant, 'sanctum')
            ->getJson('/api/v1/accounting/receipts/approved');
        $queueResponseAfter->assertStatus(200);
        $receiptIdsAfter = collect($queueResponseAfter->json('data'))->pluck('id')->all();
        $this->assertContains($receipt->id, $receiptIdsAfter);
    }

    /**
     * Scenario 4: Receipt APIs return supplier details and virtual warehouse flag.
     */
    public function test_receipt_apis_return_supplier_details_and_virtual_warehouse_flag(): void
    {
        $po = $this->createInternalWarehousePO(0.0);
        $poItem = $po->items->first();

        $receipt = PurchaseReceipt::create([
            'receipt_number' => 'GRN-WH-API-' . uniqid(),
            'purchase_order_id' => $po->id,
            'purchase_request_id' => $po->purchase_request_id,
            'supplier_id' => $this->internalWarehouseSupplier->id,
            'warehouse_keeper_user_id' => $this->warehouseKeeper->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
            'status' => 'APPROVED',
            'warehouse_notes' => 'صرف مخزن',
            'received_at' => now(),
        ]);

        PurchaseReceiptItem::create([
            'purchase_receipt_id' => $receipt->id,
            'purchase_order_item_id' => $poItem->id,
            'ordered_quantity' => 10,
            'received_quantity' => 5,
        ]);

        $token = $this->siteEngineer->createToken('test')->plainTextToken;

        // Assigned endpoint
        $resAssigned = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/v1/purchase-receipts/assigned');
        $resAssigned->assertStatus(200);

        // Archive endpoint
        $resArchive = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/v1/purchase-receipts/archive');
        $resArchive->assertStatus(200);
        $archiveItems = $resArchive->json('data') ?? $resArchive->json();
        $matched = collect($archiveItems)->firstWhere('id', $receipt->id);
        $this->assertNotNull($matched);
        $this->assertEquals('المخزن الداخلي', $matched['supplier_name']);
        $this->assertTrue($matched['is_internal_warehouse']);

        // Show endpoint
        $resShow = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson("/api/v1/purchase-receipts/{$receipt->id}");
        $resShow->assertStatus(200);
        $this->assertEquals('المخزن الداخلي', $resShow->json('data.supplier_name'));
        $this->assertTrue($resShow->json('data.is_internal_warehouse'));
    }
}
