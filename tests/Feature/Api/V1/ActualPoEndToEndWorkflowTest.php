<?php

namespace Tests\Feature\Api\V1;

use App\Models\ApprovalHistory;
use App\Models\AuditLog;
use App\Models\Department;
use App\Models\LandParcel;
use App\Models\PurchaseOrder;
use App\Models\PurchaseReceipt;
use App\Models\PurchaseRequest;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use App\Services\PurchaseReceiptService;
use App\Services\SupplierInvoiceService;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ActualPoEndToEndWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private Department $deptExecution;
    private User $requester;
    private User $reviewer;
    private User $procurementOfficer;
    private User $warehouseKeeper;
    private User $siteEngineer;
    private User $siteAccountant;
    private User $generalManager;
    private Supplier $supplier;
    private LandParcel $parcel;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);

        $this->deptExecution = Department::create([
            'name' => 'إدارة التنفيذ',
            'code' => 'EXECUTION',
            'is_active' => true,
        ]);

        $this->requester = $this->createUser('requester@test', 'مهندس طلبات', 'employee', $this->deptExecution->id);
        $this->reviewer = $this->createUser('reviewer@test', 'مدير التنفيذ المراجع', 'reviewer', $this->deptExecution->id);
        $this->procurementOfficer = $this->createUser('procurement@test', 'مسؤول المشتريات', 'procurement_manager', $this->deptExecution->id);
        $this->warehouseKeeper = $this->createUser('warehouse@test', 'أمين المخزن', 'warehouse_keeper', $this->deptExecution->id);
        $this->siteEngineer = $this->createUser('site_eng@test', 'مهندس الموقع', 'site_engineer', $this->deptExecution->id);
        $this->siteAccountant = $this->createUser('site_acct@test', 'محاسب التنفيذ', 'site_accountant', $this->deptExecution->id);
        $this->generalManager = $this->createUser('gm@test', 'المدير العام', 'general_manager');

        $this->supplier = Supplier::create([
            'code' => 'SUP-ACTUAL-001',
            'company_name' => 'شركة الأهرام للتوريدات الهندسية',
            'contact_name' => 'م. حسن الألفي',
            'phone' => '01000000001',
            'is_active' => true,
            'opening_balance' => 0,
        ]);

        $this->parcel = LandParcel::create([
            'parcel_reference' => 'PARCEL-E2E-001',
            'region' => 'المنطقة السابعة والعشرون',
            'opening_balance' => 50000,
            'funded_total' => 0,
            'expense_total' => 0,
            'balance' => 50000,
            'is_active' => true,
        ]);
    }

    /**
     * Complete End-to-End Workflow Test:
     * 1. PR Created & Approved
     * 2. Preliminary PO Created & Issued
     * 3. GRN Created & Approved by Site Engineer -> Moves PO to PENDING_ACTUAL_PO
     * 4. PO Appears automatically in 'Pending Actual PO' queue
     * 5. Procurement Officer finalizes Actual PO (edits quantities/prices based on GRN) -> finalized_at set
     * 6. Document combined endpoint provides PR + Actual PO + GRN
     * 7. Strict Separation of Duties (SOD): Procurement & GM blocked (403), Site Accountant creates invoice (201)
     */
    public function test_full_end_to_end_actual_po_cycle_with_sod_and_accounting_transfer(): void
    {
        // ─────────────────────────────────────────────────────────────
        // 1. CREATE & APPROVE PURCHASE REQUEST (PR)
        // ─────────────────────────────────────────────────────────────
        $pr = PurchaseRequest::create([
            'request_number' => 'PR-ACTUAL-2026-001',
            'user_id' => $this->requester->id,
            'department_id' => $this->deptExecution->id,
            'assigned_reviewer_id' => $this->reviewer->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
            'priority' => 'HIGH',
            'status' => 'PENDING_REVIEWER_APPROVAL',
            'total_estimated_cost' => 12000,
            'date_needed' => now()->addDays(7)->toDateString(),
            'justification' => 'توريد مواد تنفيذ الموقع للمنطقة السابعة والعشرون',
        ]);

        $prItem = $pr->items()->create([
            'item_description' => 'حديد تسليح 12 مم أطوال',
            'item_reference' => 'PARCEL-E2E-001',
            'region' => 'المنطقة السابعة والعشرون',
            'quantity' => 10,
            'uom' => 'TON',
            'estimated_unit_price' => 1200,
            'estimated_line_total' => 12000,
        ]);

        // Reviewer approves PR
        $pr->update(['status' => 'APPROVED_BY_REVIEWER']);

        // Procurement approves PR
        $pr->update(['status' => 'APPROVED_BY_PROCUREMENT']);
        $this->assertSame('APPROVED_BY_PROCUREMENT', $pr->fresh()->status);

        // ─────────────────────────────────────────────────────────────
        // 2. CREATE PRELIMINARY PO (امر الشراء المبدئي)
        // ─────────────────────────────────────────────────────────────
        $preliminaryPo = PurchaseOrder::create([
            'po_number' => 'PO-PRELIM-2026-001',
            'purchase_request_id' => $pr->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $this->procurementOfficer->id,
            'status' => 'ISSUED', // Issued preliminary PO
            'delivery_status' => 'NOT_STARTED',
            'subtotal' => 12000,
            'grand_total' => 12000,
            'finalized_at' => null, // Not yet an actual PO
            'finalized_by_user_id' => null,
        ]);

        $poItem = $preliminaryPo->items()->create([
            'pr_item_id' => $prItem->id,
            'item_description' => 'حديد تسليح 12 مم أطوال',
            'item_reference' => 'PARCEL-E2E-001',
            'region' => 'المنطقة السابعة والعشرون',
            'quantity' => 10,
            'uom' => 'TON',
            'unit_price' => 1200,
            'line_total' => 12000,
            'supplier_id' => $this->supplier->id,
        ]);

        $this->assertFalse($preliminaryPo->isActualPo());

        // ─────────────────────────────────────────────────────────────
        // 3. WAREHOUSE CREATES GRN & SITE ENGINEER APPROVES GRN
        // ─────────────────────────────────────────────────────────────
        // Warehouse / Site receiver records actual 8 tons (instead of 10)
        $approvedReceipt = app(PurchaseReceiptService::class)->createByWarehouse(
            $this->warehouseKeeper,
            $preliminaryPo,
            [
                [
                    'purchase_order_item_id' => $poItem->id,
                    'received_quantity' => 8,
                    'notes' => 'تم استلام وتفريغ 8 أطنان بالموقع بنجاح',
                ],
            ]
        );

        $this->assertSame('APPROVED', $approvedReceipt->status);
        $this->assertSame('DELIVERED', $preliminaryPo->fresh()->delivery_status);

        // Crucial Check: PO status transitioned to PENDING_ACTUAL_PO
        $refreshedPo = $preliminaryPo->fresh();
        $this->assertSame('PENDING_ACTUAL_PO', $refreshedPo->status);

        // ─────────────────────────────────────────────────────────────
        // 4. VERIFY PO APPEARS IN 'pending-actual-pos' API QUEUE
        // ─────────────────────────────────────────────────────────────
        $queueResponse = $this->actingAs($this->procurementOfficer, 'sanctum')
            ->getJson('/api/v1/procurement/pending-actual-pos');

        $queueResponse->assertStatus(200);
        $queueData = $queueResponse->json('data');
        $this->assertNotEmpty($queueData);

        $foundItem = collect($queueData)->firstWhere('id', $preliminaryPo->id);
        $this->assertNotNull($foundItem);
        $this->assertSame('PENDING_ACTUAL_PO', $foundItem['status']);
        $this->assertSame('PO-PRELIM-2026-001', $foundItem['po_number']);

        // ─────────────────────────────────────────────────────────────
        // 5. PROCUREMENT OFFICER FINALIZES THE ACTUAL PO
        // ─────────────────────────────────────────────────────────────
        // Adjust quantity to 8 (actual received) and adjust unit price to 1,250
        $finalizePayload = [
            'items' => [
                [
                    'id' => $poItem->id,
                    'pr_item_id' => $prItem->id,
                    'item_description' => 'حديد تسليح 12 مم أطوال (كمية فعلية)',
                    'item_reference' => 'PARCEL-E2E-001',
                    'region' => 'المنطقة السابعة والعشرون',
                    'quantity' => 8,
                    'unit_price' => 1250,
                    'uom' => 'TON',
                    'specifications' => 'مطابق للمواصفات القياسية',
                    'supplier_id' => $this->supplier->id,
                ],
            ],
            'notes' => 'إصدار أمر الشراء الفعلي بعد اعتماد الاستلام الفعلي 8 طن بسعر 1250 ج/طن.',
        ];

        $finalizeResponse = $this->actingAs($this->procurementOfficer, 'sanctum')
            ->postJson("/api/v1/procurement/purchase-orders/{$preliminaryPo->id}/finalize", $finalizePayload);

        $finalizeResponse->assertStatus(200);
        $finalizeResponse->assertJsonPath('message', 'تم إصدار أمر الشراء الفعلي بنجاح وإرساله للحسابات.');

        // Verify Database State of the Finalized Actual PO
        $actualPo = $preliminaryPo->fresh();
        $this->assertSame('ISSUED', $actualPo->status);
        $this->assertNotNull($actualPo->finalized_at);
        $this->assertSame($this->procurementOfficer->id, $actualPo->finalized_by_user_id);
        $this->assertEquals(10000.0, (float) $actualPo->grand_total); // 8 * 1250 = 10000
        $this->assertTrue($actualPo->isActualPo());

        // Verify Approval History & Audit Trail
        $this->assertDatabaseHas('approval_history', [
            'target_type' => PurchaseOrder::class,
            'target_id' => $actualPo->id,
            'actor_user_id' => $this->procurementOfficer->id,
            'action' => 'ACTUAL_PO_FINALIZED',
            'from_state' => 'PENDING_ACTUAL_PO',
            'to_state' => 'ISSUED',
        ]);

        $this->assertDatabaseHas('audit_logs', [
            'entity_type' => PurchaseOrder::class,
            'entity_id' => $actualPo->id,
            'action' => 'ACTUAL_PO_FINALIZED',
            'field_name' => 'status',
            'new_value' => 'ISSUED',
        ]);

        // ─────────────────────────────────────────────────────────────
        // 6. VERIFY COMBINED DOCUMENT API (PR + ACTUAL PO + GRN)
        // ─────────────────────────────────────────────────────────────
        $docResponse = $this->actingAs($this->procurementOfficer, 'sanctum')
            ->getJson("/api/v1/procurement/purchase-orders/{$actualPo->id}/combined-document");

        $docResponse->assertStatus(200);
        $docData = $docResponse->json('data');

        $this->assertArrayHasKey('purchase_order', $docData);
        $this->assertArrayHasKey('purchase_request', $docData);
        $this->assertArrayHasKey('receipt', $docData);

        // Verify PO dataset has finalized info
        $this->assertSame($actualPo->po_number, $docData['purchase_order']['po_number']);
        $this->assertSame('10000.00', $docData['purchase_order']['grand_total']);
        $this->assertNotNull($docData['purchase_order']['finalized_at']);

        // Verify GRN dataset has site approval info
        $this->assertSame($approvedReceipt->receipt_number, $docData['receipt']['receipt_number']);
        $this->assertSame('APPROVED', $docData['receipt']['status']);

        // ─────────────────────────────────────────────────────────────
        // 7. STRICT SEPARATION OF DUTIES (SOD) & ACCOUNTING INVOICE
        // ─────────────────────────────────────────────────────────────
        // A) Procurement Manager attempts to create financial invoice -> MUST BE FORBIDDEN (403)
        $procurementInvoiceAttempt = $this->actingAs($this->procurementOfficer, 'sanctum')
            ->postJson('/api/v1/accounting/invoices', [
                'purchase_order_id' => $actualPo->id,
                'purchase_receipt_id' => $approvedReceipt->id,
                'invoice_number' => 'INV-ILLEGAL-PROC',
                'amount' => 10000,
            ]);
        $procurementInvoiceAttempt->assertStatus(403);

        // B) General Manager attempts to create financial invoice -> MUST BE FORBIDDEN (403)
        $gmInvoiceAttempt = $this->actingAs($this->generalManager, 'sanctum')
            ->postJson('/api/v1/accounting/invoices', [
                'purchase_order_id' => $actualPo->id,
                'purchase_receipt_id' => $approvedReceipt->id,
                'invoice_number' => 'INV-ILLEGAL-GM',
                'amount' => 10000,
            ]);
        $gmInvoiceAttempt->assertStatus(403);

        // C) Site Accountant for Execution Department queries pending receipts -> Can view it
        $receiptsListResponse = $this->actingAs($this->siteAccountant, 'sanctum')
            ->getJson('/api/v1/accounting/receipts/approved');
        $receiptsListResponse->assertStatus(200);
        $receiptsData = $receiptsListResponse->json('data');
        $receiptIds = collect($receiptsData)->pluck('id')->all();
        $this->assertContains($approvedReceipt->id, $receiptIds);

        // D) Site Accountant records the Supplier Invoice against the Actual PO + Approved GRN -> SUCCESS (201)
        $accountantInvoiceResponse = $this->actingAs($this->siteAccountant, 'sanctum')
            ->postJson('/api/v1/accounting/invoices', [
                'purchase_order_id' => $actualPo->id,
                'purchase_receipt_id' => $approvedReceipt->id,
                'invoice_number' => 'INV-ACTUAL-2026-001',
                'amount' => 10000,
                'invoice_date' => now()->toDateString(),
                'notes' => 'تسجيل فاتورة المورد بناءً على أمر الشراء الفعلي المعتمد وإذن الاستلام.',
            ]);

        $accountantInvoiceResponse->assertStatus(201);
        $createdInvoiceId = $accountantInvoiceResponse->json('data.id');
        $this->assertNotNull($createdInvoiceId);

        // E) Three-Way Match against Actual PO
        $matchResponse = $this->actingAs($this->siteAccountant, 'sanctum')
            ->postJson("/api/v1/accounting/invoices/{$createdInvoiceId}/match");
        $matchResponse->assertStatus(200);
        $this->assertSame('MATCHED', $matchResponse->json('data.matching_status'));
    }

    /**
     * Verify that procurement cannot finalize a PO that is not in PENDING_ACTUAL_PO stage.
     */
    public function test_procurement_cannot_finalize_po_unless_in_pending_actual_po(): void
    {
        $pr = PurchaseRequest::create([
            'request_number' => 'PR-DRAFT-TEST',
            'user_id' => $this->requester->id,
            'department_id' => $this->deptExecution->id,
            'priority' => 'NORMAL',
            'status' => 'APPROVED_BY_PROCUREMENT',
            'total_estimated_cost' => 1000,
            'date_needed' => now()->toDateString(),
        ]);

        $po = PurchaseOrder::create([
            'po_number' => 'PO-DRAFT-TEST',
            'purchase_request_id' => $pr->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $this->procurementOfficer->id,
            'status' => 'PO_DRAFT',
            'subtotal' => 1000,
            'grand_total' => 1000,
        ]);

        $item = $po->items()->create([
            'item_description' => 'بند مسودة',
            'quantity' => 1,
            'unit_price' => 1000,
            'line_total' => 1000,
        ]);

        $response = $this->actingAs($this->procurementOfficer, 'sanctum')
            ->postJson("/api/v1/procurement/purchase-orders/{$po->id}/finalize", [
                'items' => [
                    [
                        'id' => $item->id,
                        'item_description' => 'بند مسودة معدل',
                        'item_reference' => 'PARCEL-E2E-001',
                        'region' => 'المنطقة السابعة والعشرون',
                        'quantity' => 1,
                        'unit_price' => 1000,
                    ],
                ],
            ]);

        $response->assertStatus(409);
        $response->assertJsonPath('message', 'لا يمكن إصدار أمر الشراء الفعلي لأمر شراء ليس في مرحلة بانتظار الإصدار الفعلي.');
    }

    /**
     * Verify that purchases report reflects the finalized Actual PO amounts and ignores non-received orders.
     */
    public function test_purchases_report_reflects_actual_pos_correctly(): void
    {
        $pr1 = PurchaseRequest::create([
            'request_number' => 'PR-REP-001',
            'user_id' => $this->requester->id,
            'department_id' => $this->deptExecution->id,
            'priority' => 'NORMAL',
            'status' => 'APPROVED_BY_PROCUREMENT',
            'total_estimated_cost' => 50000,
            'date_needed' => now()->toDateString(),
        ]);

        // 1. Unreceived Preliminary PO (should be excluded from Actual PO report)
        $unreceivedPo = PurchaseOrder::create([
            'po_number' => 'PO-UNRECEIVED',
            'purchase_request_id' => $pr1->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $this->procurementOfficer->id,
            'status' => 'ISSUED',
            'delivery_status' => 'NOT_STARTED',
            'subtotal' => 50000,
            'grand_total' => 50000,
            'finalized_at' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $unreceivedPo->items()->create([
            'item_description' => 'بند لم يستلم',
            'quantity' => 5,
            'unit_price' => 10000,
            'line_total' => 50000,
        ]);

        $pr2 = PurchaseRequest::create([
            'request_number' => 'PR-REP-002',
            'user_id' => $this->requester->id,
            'department_id' => $this->deptExecution->id,
            'priority' => 'NORMAL',
            'status' => 'APPROVED_BY_PROCUREMENT',
            'total_estimated_cost' => 7500,
            'date_needed' => now()->toDateString(),
        ]);

        // 2. Finalized Actual PO (delivered and finalized)
        $finalizedPo = PurchaseOrder::create([
            'po_number' => 'PO-FINALIZED-ACTUAL',
            'purchase_request_id' => $pr2->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $this->procurementOfficer->id,
            'status' => 'ISSUED',
            'delivery_status' => 'DELIVERED',
            'subtotal' => 7500,
            'grand_total' => 7500,
            'finalized_at' => now(),
            'finalized_by_user_id' => $this->procurementOfficer->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $finalizedPo->items()->create([
            'item_description' => 'بند فعلي معتمد',
            'quantity' => 3,
            'unit_price' => 2500,
            'line_total' => 7500,
        ]);

        $reportResponse = $this->actingAs($this->procurementOfficer, 'sanctum')
            ->getJson('/api/v1/procurement/reports/purchases?accounting_filter=ALL&actual_only=1');

        $reportResponse->assertStatus(200);
        $rows = $reportResponse->json('rows');
        $poNumbers = collect($rows)->pluck('po_number')->all();

        $this->assertContains('PO-FINALIZED-ACTUAL', $poNumbers);
        $this->assertNotContains('PO-UNRECEIVED', $poNumbers);
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
