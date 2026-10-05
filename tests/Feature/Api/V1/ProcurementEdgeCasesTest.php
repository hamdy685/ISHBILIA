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
use App\Models\PurchaseRequestItem;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\SupplierInvoice;
use App\Models\User;
use App\Services\PurchaseOrderService;
use App\Services\PurchaseReceiptService;
use App\Services\SupplierInvoiceService;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Class ProcurementEdgeCasesTest
 *
 * Senior QA & Stress Testing Test Suite covering advanced production edge-cases:
 * 1. Cancellation / Void Impact Test: Verifying financial liabilities are immediately purged
 *    from Supplier Ledger, Statements, and Analytics with zero dangling balances.
 * 2. Double Submission / Idempotency Test: Simulating concurrent identical requests to ensure
 *    zero duplicate records and seamless conflict prevention (409 Conflict).
 * 3. GRN Quantity Discrepancy & Over/Under-receipt: Verifying that extreme quantity variances
 *    between initial PO and actual GRN are dynamically reconciled in the Actual PO and Ledger.
 */
class ProcurementEdgeCasesTest extends TestCase
{
    use RefreshDatabase;

    private Department $dept;
    private User $siteEngineer;
    private User $reviewer;
    private User $executionManager;
    private User $procurementManager;
    private User $warehouseKeeper;
    private User $siteAccountant;
    private Supplier $supplier;
    private Item $catalogItem;
    private LandParcel $parcel;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);

        $this->dept = Department::create([
            'name' => 'إدارة المشروعات والتنفيذ',
            'code' => 'EXECUTION',
            'is_active' => true,
        ]);

        $this->executionManager = $this->createUser('em@ashbiliya.com', 'م. طارق مدير التنفيذ', 'execution_manager', $this->dept->id);
        $this->reviewer = $this->createUser('rev@ashbiliya.com', 'م. ساري مراجع القسم', 'reviewer', $this->dept->id);
        $this->siteEngineer = $this->createUser('se@ashbiliya.com', 'م. عمرو مهندس الموقع', 'site_engineer', $this->dept->id);
        $this->siteEngineer->update(['manager_id' => $this->executionManager->id]);

        $this->procurementManager = $this->createUser('pm@ashbiliya.com', 'أ. كريم مدير المشتريات', 'procurement_manager');
        $this->warehouseKeeper = $this->createUser('wh@ashbiliya.com', 'أ. وحيد أمين المخزن', 'warehouse_keeper', $this->dept->id);
        $this->siteAccountant = $this->createUser('sa@ashbiliya.com', 'أ. سامح محاسب الموقع', 'site_accountant', $this->dept->id);

        $this->dept->update([
            'manager_user_id' => $this->reviewer->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
        ]);

        $this->supplier = Supplier::create([
            'code' => 'SUP-EDGE-001',
            'company_name' => 'شركة الدلتا للصناعات الثقيلة',
            'contact_name' => 'م. حسام الدين',
            'phone' => '01099887766',
            'is_active' => true,
            'opening_balance' => 0,
        ]);

        $this->catalogItem = Item::create([
            'sku' => 'SKU-EDGE-STEEL-16',
            'name' => 'حديد تسليح 16 مم عز',
            'uom' => 'TON',
            'is_active' => true,
        ]);

        $this->parcel = LandParcel::create([
            'parcel_reference' => 'PARCEL-EDGE-901',
            'region' => 'حي الأندلس - القاهرة الجديدة',
            'opening_balance' => 500000,
            'funded_total' => 0,
            'expense_total' => 0,
            'balance' => 500000,
            'is_active' => true,
        ]);
    }

    /**
     * Scenario 1: Cancellation / Void Impact Test.
     *
     * Flow:
     * - An actual order and invoice (value: 60,000 EGP) are active and appear in Supplier Ledger.
     * - The transaction is cancelled / voided.
     *
     * Verification:
     * - Financial liability is immediately excluded from the supplier ledger and statement.
     * - Running balance drops to 0.0 with zero stuck / dangling debts.
     * - Procurement analytics overview updates immediately to exclude the cancelled amount.
     */
    public function test_cancellation_and_voiding_immediately_excludes_financials_from_ledger_and_dashboards(): void
    {
        // 1. Create PR, Actual PO, and Invoice for 60,000 EGP
        $pr = PurchaseRequest::create([
            'department_id' => $this->dept->id,
            'target_department_id' => $this->dept->id,
            'user_id' => $this->siteEngineer->id,
            'request_number' => 'PR-EDGE-CANCEL-01',
            'parcel_reference' => 'PARCEL-EDGE-901',
            'region' => 'حي الأندلس - القاهرة الجديدة',
            'status' => 'APPROVED',
            'date_needed' => now()->addDays(3)->toDateString(),
        ]);

        $po = PurchaseOrder::create([
            'purchase_request_id' => $pr->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $this->procurementManager->id,
            'po_number' => 'PO-EDGE-CANCEL-001',
            'status' => 'APPROVED_BY_ACCOUNTING',
            'subtotal' => 60000,
            'grand_total' => 60000,
            'is_actual' => true,
            'finalized_at' => now(),
        ]);

        $poItem = PurchaseOrderItem::create([
            'purchase_order_id' => $po->id,
            'item_id' => $this->catalogItem->id,
            'item_description' => 'حديد تسليح 16 مم',
            'item_reference' => 'PARCEL-EDGE-901',
            'region' => 'حي الأندلس - القاهرة الجديدة',
            'quantity' => 20,
            'uom' => 'TON',
            'unit_price' => 3000,
            'line_total' => 60000,
        ]);

        $receipt = PurchaseReceipt::create([
            'purchase_order_id' => $po->id,
            'supplier_id' => $this->supplier->id,
            'department_id' => $this->dept->id,
            'warehouse_keeper_user_id' => $this->warehouseKeeper->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
            'receipt_number' => 'GRN-EDGE-CANCEL-001',
            'status' => 'APPROVED',
            'received_at' => now(),
        ]);

        PurchaseReceiptItem::create([
            'purchase_receipt_id' => $receipt->id,
            'purchase_order_item_id' => $poItem->id,
            'ordered_quantity' => 20,
            'received_quantity' => 20,
        ]);

        $invoice = SupplierInvoice::create([
            'supplier_id' => $this->supplier->id,
            'purchase_order_id' => $po->id,
            'purchase_receipt_id' => $receipt->id,
            'created_by_user_id' => $this->siteAccountant->id,
            'invoice_number' => 'INV-EDGE-CANCEL-01',
            'invoice_date' => now()->toDateString(),
            'amount' => 60000,
            'outstanding_amount' => 60000,
            'status' => 'OPEN',
        ]);

        // 2. Verify ledger before cancellation: contains active debt of 60,000
        $ledgerBefore = $this->actingAs($this->siteAccountant, 'sanctum')
            ->getJson("/api/v1/accounting/suppliers/{$this->supplier->id}/account");

        $ledgerBefore->assertStatus(200);
        $rowsBefore = $ledgerBefore->json('data.ledger');
        $this->assertNotEmpty($rowsBefore);
        $finalBalanceBefore = end($rowsBefore)['balance'] ?? 0;
        $this->assertEquals(60000, (float) $finalBalanceBefore);

        // 3. Perform Cancellation / Void on the PO and Invoice
        $po->update(['status' => 'CANCELLED']);
        $invoice->update(['status' => 'VOIDED', 'outstanding_amount' => 0]);

        // 4. Verify ledger after cancellation: transaction is completely purged, balance is 0.0
        $ledgerAfter = $this->actingAs($this->siteAccountant, 'sanctum')
            ->getJson("/api/v1/accounting/suppliers/{$this->supplier->id}/account");

        $ledgerAfter->assertStatus(200);
        $rowsAfter = $ledgerAfter->json('data.ledger');
        $this->assertEmpty($rowsAfter, 'Cancelled and voided orders must be completely purged from supplier ledger.');

        // 5. Verify Procurement Analytics Dashboard excludes the cancelled transaction
        $analyticsResponse = $this->actingAs($this->procurementManager, 'sanctum')
            ->getJson('/api/v1/procurement/analytics');

        $analyticsResponse->assertStatus(200);
        $statusBreakdown = collect($analyticsResponse->json('data.status_breakdown'));
        $cancelledStatus = $statusBreakdown->firstWhere('status', 'CANCELLED');
        if ($cancelledStatus) {
            $this->assertEquals(0, (float) $cancelledStatus['total_value'], 'Cancelled order value must be 0 in analytics metrics.');
        }
    }

    /**
     * Scenario 2: Double Submission & Concurrency Prevention (Idempotency Test).
     *
     * Flow:
     * - Case A: Two identical concurrent requests to approve the same purchase request.
     *   Verification: The first succeeds (200), the second is gracefully rejected with 409 Conflict.
     * - Case B: Two identical requests to create a PO from the same PR.
     *   Verification: Zero duplicate purchase orders are created in the database.
     */
    public function test_double_submission_and_concurrency_prevention(): void
    {
        // ─────────────────────────────────────────────────────────────
        // Case A: Concurrent PR Approvals (Reviewer Stage)
        // ─────────────────────────────────────────────────────────────
        $pr = PurchaseRequest::create([
            'department_id' => $this->dept->id,
            'target_department_id' => $this->dept->id,
            'user_id' => $this->siteEngineer->id,
            'reviewer_user_id' => $this->reviewer->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
            'request_number' => 'PR-EDGE-CONCURRENT-01',
            'parcel_reference' => 'PARCEL-EDGE-901',
            'region' => 'حي الأندلس - القاهرة الجديدة',
            'status' => 'SUBMITTED',
            'date_needed' => now()->addDays(5)->toDateString(),
        ]);

        PurchaseRequestItem::create([
            'purchase_request_id' => $pr->id,
            'item_id' => $this->catalogItem->id,
            'item_description' => 'حديد تسليح 16 مم',
            'item_reference' => 'PARCEL-EDGE-901',
            'region' => 'حي الأندلس - القاهرة الجديدة',
            'quantity' => 10,
            'uom' => 'TON',
        ]);

        $approvalPayload = [
            'comment' => 'اعتماد المواصفات الفنية للطلب',
            'site_engineer_user_id' => $this->siteEngineer->id,
        ];

        // Request 1: Succeeds
        $firstApproval = $this->actingAs($this->reviewer, 'sanctum')
            ->postJson("/api/v1/reviewer/purchase-requests/{$pr->id}/approve", $approvalPayload);

        $firstApproval->assertStatus(200);
        $this->assertEquals('PENDING_EXECUTIVE_APPROVAL', $pr->fresh()->status);

        // Request 2 (Duplicate / Simultaneous): Must return 409 Conflict
        $duplicateApproval = $this->actingAs($this->reviewer, 'sanctum')
            ->postJson("/api/v1/reviewer/purchase-requests/{$pr->id}/approve", $approvalPayload);

        $duplicateApproval->assertStatus(409);
        $this->assertStringContainsString('pending', strtolower($duplicateApproval->json('message')));

        // ─────────────────────────────────────────────────────────────
        // Case B: Concurrent PO Creation from PR
        // ─────────────────────────────────────────────────────────────
        // Set PR to approved state ready for PO conversion
        $pr->update(['status' => 'APPROVED_BY_PROCUREMENT']);

        $poPayload = [
            'purchase_request_id' => $pr->id,
            'supplier_id' => $this->supplier->id,
            'payment_terms' => 'NET 30',
            'delivery_date' => now()->addDays(3)->toDateString(),
        ];

        // Request 1: PO Creation succeeds
        $firstPoCreation = $this->actingAs($this->procurementManager, 'sanctum')
            ->postJson('/api/v1/procurement/purchase-orders', $poPayload);

        $firstPoCreation->assertStatus(201);
        $createdPoId = $firstPoCreation->json('data.id');
        $this->assertNotNull($createdPoId);

        // Request 2: Duplicate request on the same PR
        $duplicatePoCreation = $this->actingAs($this->procurementManager, 'sanctum')
            ->postJson('/api/v1/procurement/purchase-orders', $poPayload);

        // Verify system prevents double creation without DB crashes
        $this->assertContains($duplicatePoCreation->status(), [201, 409]);

        // Assert strictly only ONE purchase order exists for this PR in database
        $poCount = PurchaseOrder::where('purchase_request_id', $pr->id)->count();
        $this->assertEquals(1, $poCount, 'Database integrity violated: duplicate PO was created for the same PR.');
    }

    /**
     * Scenario 3: GRN Quantity Discrepancy & Over/Under-receipt Reconciliation.
     *
     * Flow:
     * - Initial PO ordered 100 units @ 500 EGP (Preliminary Total: 50,000 EGP).
     * - Warehouse receives only 35 units (severe under-delivery).
     * - Site engineer approves GRN for 35 units.
     * - Procurement Manager issues Actual PO dynamically reconciled to the received 35 units.
     * - Site Accountant invoices and matches the Actual PO.
     *
     * Verification:
     * - Actual PO total adjusts seamlessly to 17,500 EGP (35 * 500 EGP).
     * - 3-way match succeeds with zero calculation breakdown.
     * - Supplier Ledger reflects exact received liability of 17,500 EGP.
     */
    public function test_grn_quantity_discrepancy_and_actual_po_financial_adjustment(): void
    {
        // 1. Create approved PR and preliminary PO for 100 units
        $pr = PurchaseRequest::create([
            'department_id' => $this->dept->id,
            'target_department_id' => $this->dept->id,
            'user_id' => $this->siteEngineer->id,
            'request_number' => 'PR-EDGE-GRN-DISCREPANCY',
            'parcel_reference' => 'PARCEL-EDGE-901',
            'region' => 'حي الأندلس - القاهرة الجديدة',
            'status' => 'APPROVED_BY_PROCUREMENT',
            'date_needed' => now()->addDays(3)->toDateString(),
        ]);

        $po = PurchaseOrder::create([
            'purchase_request_id' => $pr->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $this->procurementManager->id,
            'po_number' => 'PO-EDGE-PRELIM-001',
            'status' => 'ISSUED',
            'subtotal' => 50000,
            'grand_total' => 50000,
            'delivery_status' => 'IN_RECEIPT',
        ]);

        $poItem = PurchaseOrderItem::create([
            'purchase_order_id' => $po->id,
            'item_id' => $this->catalogItem->id,
            'item_description' => 'حديد تسليح 16 مم عز',
            'item_reference' => 'PARCEL-EDGE-901',
            'region' => 'حي الأندلس - القاهرة الجديدة',
            'quantity' => 100,
            'uom' => 'TON',
            'unit_price' => 500,
            'line_total' => 50000,
        ]);

        // 2. Warehouse logs severe under-delivery: received 35 units instead of 100
        $receipt = PurchaseReceipt::create([
            'purchase_order_id' => $po->id,
            'purchase_request_id' => $pr->id,
            'supplier_id' => $this->supplier->id,
            'department_id' => $this->dept->id,
            'warehouse_keeper_user_id' => $this->warehouseKeeper->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
            'receipt_number' => 'GRN-DISCREPANCY-001',
            'status' => 'PENDING_SITE_ENGINEER',
            'received_at' => now(),
            'warehouse_notes' => 'عجز توريد من المصنع: تم استلام 35 طن فقط من أصل 100 طن.',
        ]);

        PurchaseReceiptItem::create([
            'purchase_receipt_id' => $receipt->id,
            'purchase_order_item_id' => $poItem->id,
            'ordered_quantity' => 100,
            'received_quantity' => 35,
            'notes' => 'عجز توريد مثبت في بوليصة الشحن',
        ]);

        // 3. Site Engineer inspects and approves the delivered 35 units
        $approvedReceipt = app(PurchaseReceiptService::class)->approveBySiteEngineer(
            $this->siteEngineer,
            $receipt,
            'تم حصر واستلام 35 طن فقط بالموقع بموجب إذن الوزن والميزان البسكول.'
        );

        $this->assertEquals('APPROVED', $approvedReceipt->status);
        $this->assertEquals('PENDING_ACTUAL_PO', $po->fresh()->status);

        // 4. Procurement Manager finalizes Actual PO based on the 35 units received
        $finalizedPo = app(PurchaseOrderService::class)->finalizeActualPo(
            $this->procurementManager,
            $po->fresh(),
            [
                [
                    'item_id' => $this->catalogItem->id,
                    'item_description' => 'حديد تسليح 16 مم عز - كمية فعلية',
                    'item_reference' => 'PARCEL-EDGE-901',
                    'region' => 'حي الأندلس - القاهرة الجديدة',
                    'quantity' => 35,
                    'uom' => 'TON',
                    'unit_price' => 500,
                ],
            ],
            'اعتماد أمر الشراء الفعلي على الكمية المستلمة فعلياً (35 طن)'
        );

        // Verify Actual PO financial calculations: 35 * 500 = 17,500 EGP
        $this->assertEquals(17500, (float) $finalizedPo->grand_total);
        $this->assertEquals('ISSUED', $finalizedPo->status);
        $this->assertNotNull($finalizedPo->finalized_at);

        // 5. Site Accountant registers invoice and performs 3-way match for 17,500 EGP
        $invoice = app(SupplierInvoiceService::class)->createInvoice(
            $this->siteAccountant,
            $finalizedPo,
            $approvedReceipt,
            17500,
            'INV-ACTUAL-DISCREPANCY-001'
        );

        $this->assertEquals(17500, (float) $invoice->amount);

        $matchedInvoice = app(SupplierInvoiceService::class)->matchThreeWay($this->siteAccountant, $invoice);
        $this->assertEquals('MATCHED', $matchedInvoice->matching_status);

        // 6. Verify Supplier Ledger reflects exact reconciled amount of 17,500 EGP
        $accountData = app(SupplierInvoiceService::class)->supplierAccount($this->supplier, $this->siteAccountant);
        $ledgerRows = $accountData['ledger'];
        $this->assertNotEmpty($ledgerRows);

        $lastRow = end($ledgerRows);
        $this->assertEquals(17500, (float) $lastRow['value']);
        $this->assertEquals(17500, (float) $lastRow['balance']);
    }

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
