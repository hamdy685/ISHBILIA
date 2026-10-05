<?php

namespace Tests\Feature\Api\V1;

use App\Models\ApprovalHistory;
use App\Models\AuditLog;
use App\Models\Department;
use App\Models\Item;
use App\Models\LandParcel;
use App\Models\PurchaseOrder;
use App\Models\PurchaseReceipt;
use App\Models\PurchaseRequest;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\SupplierInvoice;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ProcurementLifecycleEndToEndRbacTest extends TestCase
{
    use RefreshDatabase;

    private Department $deptExecution;
    private User $siteEngineer;
    private User $reviewer;
    private User $executionManager;
    private User $procurementManager;
    private User $warehouseKeeper;
    private User $siteAccountant;
    private User $financialDirector;
    private User $generalManager;
    private User $admin;
    private Supplier $supplier;
    private LandParcel $parcel;
    private Item $catalogItem;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);

        $this->deptExecution = Department::create([
            'name' => 'إدارة المشروعات والتنفيذ',
            'code' => 'EXECUTION',
            'is_active' => true,
        ]);

        // 1. Roles & Users Creation
        $this->reviewer = $this->createUser('rev@ashbiliya.com', 'م. ساري مراجع القسم', 'reviewer', $this->deptExecution->id);
        $this->executionManager = $this->createUser('em@ashbiliya.com', 'م. طارق مدير التنفيذ', 'execution_manager', $this->deptExecution->id);
        $this->siteEngineer = $this->createUser('se@ashbiliya.com', 'م. عمرو مهندس الموقع', 'site_engineer', $this->deptExecution->id);
        // Link siteEngineer to executionManager as direct manager
        $this->siteEngineer->update(['manager_id' => $this->executionManager->id]);

        $this->procurementManager = $this->createUser('pm@ashbiliya.com', 'أ. كريم مدير المشتريات', 'procurement_manager', $this->deptExecution->id);
        $this->warehouseKeeper = $this->createUser('wh@ashbiliya.com', 'أ. وحيد أمين المخزن', 'warehouse_keeper', $this->deptExecution->id);
        $this->siteAccountant = $this->createUser('sa@ashbiliya.com', 'أ. سامح محاسب الموقع', 'site_accountant', $this->deptExecution->id);
        $this->financialDirector = $this->createUser('cfo@ashbiliya.com', 'أ. فؤاد المدير المالي', 'accountant', $this->deptExecution->id);
        $this->generalManager = $this->createUser('gm@ashbiliya.com', 'م. هاني المدير العام', 'general_manager');
        $this->admin = $this->createUser('admin@ashbiliya.com', 'مدير النظام السيادي', 'admin');

        $this->deptExecution->update([
            'manager_user_id' => $this->reviewer->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
        ]);

        // 2. Master Data
        $this->supplier = Supplier::create([
            'code' => 'SUP-E2E-999',
            'company_name' => 'الشركة المصرية لمواد البناء الحديثة',
            'contact_name' => 'الحاج ممدوح الشريف',
            'phone' => '01011223344',
            'is_active' => true,
            'opening_balance' => 0,
        ]);

        $this->parcel = LandParcel::create([
            'parcel_reference' => 'PARCEL-RBAC-007',
            'region' => 'حي الوطن - التجمع',
            'opening_balance' => 100000,
            'funded_total' => 0,
            'expense_total' => 0,
            'balance' => 100000,
            'is_active' => true,
        ]);

        $this->catalogItem = Item::create([
            'sku' => 'SKU-RBAC-CEMENT',
            'name' => 'أسمنت بورتلاندي عادي 42.5',
            'uom' => 'TON',
            'is_active' => true,
        ]);
    }

    /**
     * Complete Procurement Life-Cycle End-to-End Simulation:
     * Step 1: site_engineer creates & submits Purchase Request (PR).
     * Step 2: execution_manager reviews & approves PR.
     * Step 3: procurement_manager prices & issues Preliminary PO.
     * Step 4: warehouse_keeper logs receipt & site_engineer inspects and approves GRN.
     * Step 5: procurement_manager issues Actual PO based on received quantities.
     * Step 6: Strict SOD check (procurement blocked from invoicing) + site_accountant records invoice & 3-way match.
     * Step 7: admin verifies full transaction in Master Orders Control and verifies Sovereign Force Delete.
     */
    public function test_complete_procurement_lifecycle_end_to_end_rbac(): void
    {
        // ─────────────────────────────────────────────────────────────
        // 1. SITE ENGINEER (site_engineer): CREATE & SUBMIT PR
        // ─────────────────────────────────────────────────────────────
        $createPrPayload = [
            'department_id' => $this->deptExecution->id,
            'target_department_id' => $this->deptExecution->id,
            'date_needed' => now()->addDays(5)->toDateString(),
            'notes' => 'طلب توريد أسمنت صبة سقف الدور الأرضي للموقع.',
            'priority' => 'HIGH',
            'items' => [
                [
                    'item_id' => $this->catalogItem->id,
                    'item_description' => 'أسمنت بورتلاندي مقاوم للرطوبة',
                    'item_reference' => 'PARCEL-RBAC-007',
                    'region' => 'حي الوطن - التجمع',
                    'quantity' => 20,
                    'uom' => 'TON',
                    'specifications' => 'شكاير 50 كجم سويسي معتمد',
                ],
            ],
        ];

        $createPrResponse = $this->actingAs($this->siteEngineer, 'sanctum')
            ->postJson('/api/v1/purchase-requests', $createPrPayload);

        $createPrResponse->assertStatus(201);
        $prId = $createPrResponse->json('data.id');
        $this->assertNotNull($prId);
        $this->assertSame('DRAFT', $createPrResponse->json('data.status'));

        // Submit the PR
        $submitPrResponse = $this->actingAs($this->siteEngineer, 'sanctum')
            ->postJson("/api/v1/purchase-requests/{$prId}/submit", [
                'site_engineer_user_id' => $this->siteEngineer->id,
            ]);

        $submitPrResponse->assertStatus(200);
        $pr = PurchaseRequest::findOrFail($prId);
        $this->assertSame('SUBMITTED', $pr->status);

        // ─────────────────────────────────────────────────────────────
        // 2. REVIEWER & EXECUTION MANAGER: APPROVAL FLOW
        // ─────────────────────────────────────────────────────────────
        // A) Department Reviewer reviews and approves PR (SUBMITTED -> PENDING_EXECUTIVE_APPROVAL)
        $reviewerApproveResponse = $this->actingAs($this->reviewer, 'sanctum')
            ->postJson("/api/v1/reviewer/purchase-requests/{$prId}/approve", [
                'comment' => 'تمت مراجعة الكميات والمواصفات الهندسية واعتمادها.',
                'site_engineer_user_id' => $this->siteEngineer->id,
            ]);

        $reviewerApproveResponse->assertStatus(200);
        $pr->refresh();
        $this->assertSame('PENDING_EXECUTIVE_APPROVAL', $pr->status);

        // B) Execution Manager (مدير التنفيذ) gives Executive Approval (PENDING_EXECUTIVE_APPROVAL -> PENDING_PROCUREMENT_APPROVAL)
        $emApproveResponse = $this->actingAs($this->executionManager, 'sanctum')
            ->postJson("/api/v1/general-manager/purchase-requests/{$prId}/approve", [
                'comment' => 'معتمد من مدير مشروعات التنفيذ ومطابق للجدول الزمني للصبة.',
            ]);

        $emApproveResponse->assertStatus(200);
        $pr->refresh();
        $this->assertSame('PENDING_PROCUREMENT_APPROVAL', $pr->status);

        // ─────────────────────────────────────────────────────────────
        // 3. PROCUREMENT MANAGER (procurement_manager): PRELIMINARY PO
        // ─────────────────────────────────────────────────────────────
        $prItem = $pr->items()->firstOrFail();

        $createPoPayload = [
            'purchase_request_id' => $pr->id,
            'supplier_id' => $this->supplier->id,
            'po_date' => now()->toDateString(),
            'expected_delivery_date' => now()->addDays(2)->toDateString(),
            'notes' => 'أمر توريد مبدئي - أسمنت 20 طن بسعر 3500 ج/طن.',
            'items' => [
                [
                    'pr_item_id' => $prItem->id,
                    'item_id' => $this->catalogItem->id,
                    'item_description' => 'أسمنت بورتلاندي مقاوم للرطوبة',
                    'item_reference' => 'PARCEL-RBAC-007',
                    'region' => 'حي الوطن - التجمع',
                    'quantity' => 20,
                    'unit_price' => 3500,
                    'uom' => 'TON',
                ],
            ],
        ];

        $createPoResponse = $this->actingAs($this->procurementManager, 'sanctum')
            ->postJson('/api/v1/procurement/purchase-orders', $createPoPayload);

        $createPoResponse->assertStatus(201);
        $poId = $createPoResponse->json('data.id');
        $this->assertNotNull($poId);

        // Submit PO to Accounting / Issuance
        $submitPoResponse = $this->actingAs($this->procurementManager, 'sanctum')
            ->postJson("/api/v1/procurement/purchase-orders/{$poId}/submit");

        $submitPoResponse->assertStatus(200);
        $po = PurchaseOrder::findOrFail($poId);
        $this->assertSame('ISSUED', $po->status);
        $this->assertEquals(70000.0, (float) $po->grand_total); // 20 * 3500 = 70,000

        // ─────────────────────────────────────────────────────────────
        // 4. WAREHOUSE KEEPER & SITE ENGINEER: LOG & APPROVE GRN
        // ─────────────────────────────────────────────────────────────
        $poItem = $po->items()->firstOrFail();

        // Warehouse Keeper logs received delivery of 18 tons (2 tons short)
        $logReceiptPayload = [
            'received_at' => now()->toDateString(),
            'warehouse_notes' => 'وصلت الشحنة بالموقع وتم تفريغ 18 طن فقط لوجود عجز في التريلا.',
            'items' => [
                [
                    'purchase_order_item_id' => $poItem->id,
                    'received_quantity' => 18,
                    'notes' => '18 طن مستلمة سليمة ومطابقة للمواصفات.',
                ],
            ],
        ];

        $createGrnResponse = $this->actingAs($this->warehouseKeeper, 'sanctum')
            ->postJson("/api/v1/purchase-receipts/purchase-orders/{$po->id}", $logReceiptPayload);

        $createGrnResponse->assertStatus(201);
        $receiptId = $createGrnResponse->json('data.id');
        $this->assertNotNull($receiptId);

        $receipt = PurchaseReceipt::findOrFail($receiptId);
        $this->assertSame('PENDING_SITE_ENGINEER', $receipt->status);

        // Site Engineer inspects quality and approves GRN
        $approveGrnResponse = $this->actingAs($this->siteEngineer, 'sanctum')
            ->postJson("/api/v1/purchase-receipts/{$receiptId}/approve", [
                'site_engineer_notes' => 'تم فحص جودة الشكاير وتاريخ الإنتاج ومطابقتها للمعايير واعتماد كمية 18 طن.',
            ]);

        $approveGrnResponse->assertStatus(200);
        $receipt->refresh();
        $po->refresh();

        $this->assertSame('APPROVED', $receipt->status);
        $this->assertSame('PENDING_ACTUAL_PO', $po->status);
        $this->assertSame('DELIVERED', $po->delivery_status);

        // ─────────────────────────────────────────────────────────────
        // 5. PROCUREMENT MANAGER: ISSUE ACTUAL PO
        // ─────────────────────────────────────────────────────────────
        // Finalize actual PO reconciling quantity to 18 tons (18 * 3500 = 63,000)
        $finalizeActualPoPayload = [
            'items' => [
                [
                    'id' => $poItem->id,
                    'pr_item_id' => $prItem->id,
                    'item_description' => 'أسمنت بورتلاندي مقاوم للرطوبة (كمية فعلية)',
                    'item_reference' => 'PARCEL-RBAC-007',
                    'region' => 'حي الوطن - التجمع',
                    'quantity' => 18,
                    'unit_price' => 3500,
                    'uom' => 'TON',
                    'supplier_id' => $this->supplier->id,
                ],
            ],
            'notes' => 'إصدار أمر الشراء الفعلي بعد استلام واعتماد 18 طن بموقع حي الوطن.',
        ];

        $finalizeResponse = $this->actingAs($this->procurementManager, 'sanctum')
            ->postJson("/api/v1/procurement/purchase-orders/{$po->id}/finalize", $finalizeActualPoPayload);

        $finalizeResponse->assertStatus(200);
        $po->refresh();
        $this->assertSame('ISSUED', $po->status);
        $this->assertNotNull($po->finalized_at);
        $this->assertEquals(63000.0, (float) $po->grand_total);
        $this->assertTrue($po->isActualPo());

        // ─────────────────────────────────────────────────────────────
        // 6. STRICT SOD CHECK & SITE ACCOUNTANT INVOICE & MATCH
        // ─────────────────────────────────────────────────────────────
        // A) Strict SOD: Procurement Manager MUST NOT be able to create invoices
        $unauthorizedInvoiceResponse = $this->actingAs($this->procurementManager, 'sanctum')
            ->postJson('/api/v1/accounting/invoices', [
                'purchase_order_id' => $po->id,
                'purchase_receipt_id' => $receipt->id,
                'amount' => 63000,
            ]);
        $unauthorizedInvoiceResponse->assertStatus(403);

        // B) Site Accountant creates supplier invoice
        $createInvoicePayload = [
            'purchase_order_id' => $po->id,
            'purchase_receipt_id' => $receipt->id,
            'invoice_number' => 'INV-SUP-E2E-2026',
            'amount' => 63000,
            'invoice_date' => now()->toDateString(),
            'notes' => 'فاتورة شركة الأسمنت عن توريد 18 طن للموقع.',
            'land_allocations' => [
                [
                    'land_parcel_id' => $this->parcel->id,
                    'amount' => 63000,
                    'notes' => 'تحميل القيمة على قطعة أرض حي الوطن - التجمع',
                ],
            ],
        ];

        $createInvoiceResponse = $this->actingAs($this->siteAccountant, 'sanctum')
            ->postJson('/api/v1/accounting/invoices', $createInvoicePayload);

        $createInvoiceResponse->assertStatus(201);
        $invoiceId = $createInvoiceResponse->json('data.id');
        $this->assertNotNull($invoiceId);

        // C) 3-Way Matching (PR + PO + GRN + Invoice)
        $matchResponse = $this->actingAs($this->siteAccountant, 'sanctum')
            ->postJson("/api/v1/accounting/invoices/{$invoiceId}/match");

        $matchResponse->assertStatus(200);
        $this->assertSame('MATCHED', $matchResponse->json('data.matching_status'));

        // D) SOD Check: Site Accountant attempts payment -> 403 Forbidden (Only Financial Director can disburse)
        $unauthorizedPaymentResponse = $this->actingAs($this->siteAccountant, 'sanctum')
            ->postJson("/api/v1/accounting/invoices/{$invoiceId}/payments", [
                'amount' => 63000,
                'payment_date' => now()->toDateString(),
                'payment_method' => 'BANK_TRANSFER',
                'reference_number' => 'CHQ-E2E-998877',
                'notes' => 'محاولة سداد غير مصرح بها لمحاسب الموقع.',
            ]);

        $unauthorizedPaymentResponse->assertStatus(403);

        // E) Record Supplier Payment by Financial Director (accountant role)
        $paymentResponse = $this->actingAs($this->financialDirector, 'sanctum')
            ->postJson("/api/v1/accounting/invoices/{$invoiceId}/payments", [
                'amount' => 63000,
                'payment_date' => now()->toDateString(),
                'payment_method' => 'BANK_TRANSFER',
                'reference_number' => 'CHQ-E2E-998877',
                'notes' => 'سداد مستحقات المورد بشيك بنكي بعد مطابقة الفاتورة مع إذن الاستلام.',
            ]);

        $paymentResponse->assertStatus(201);
        $invoice = SupplierInvoice::findOrFail($invoiceId);
        $this->assertSame('PAID', $invoice->status);

        // ─────────────────────────────────────────────────────────────
        // 7. ADMIN: MASTER ORDERS CONTROL & SOVEREIGN FORCE DELETE
        // ─────────────────────────────────────────────────────────────
        // A) Admin views transaction in Master Orders Control
        $masterResponse = $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/v1/admin/all-orders-master');

        $masterResponse->assertStatus(200);
        $ordersList = $masterResponse->json('data');
        $this->assertNotEmpty($ordersList);

        $matchedMasterRow = collect($ordersList)->firstWhere('request_id', $pr->id);
        $this->assertNotNull($matchedMasterRow, 'Transaction must appear in Admin Master Orders Control');
        $this->assertSame($pr->request_number, $matchedMasterRow['pr_number']);
        $this->assertSame($po->po_number, $matchedMasterRow['po_number']);
        $this->assertSame($receipt->receipt_number, $matchedMasterRow['receipt']['receipt_number']);
        $this->assertSame('INV-SUP-E2E-2026', $matchedMasterRow['invoice']['invoice_number']);
        $this->assertEquals(63000.0, (float) $matchedMasterRow['grand_total']);

        // B) Admin executes Sovereign Force Delete
        $deleteResponse = $this->actingAs($this->admin, 'sanctum')
            ->deleteJson("/api/v1/admin/orders/{$pr->id}/force-delete", [
                'reason' => 'اختبار الحذف النهائي الشامل (Sovereign Force Delete) في بيئة الفحص والتكامل.',
            ]);

        $deleteResponse->assertStatus(200);
        $deleteResponse->assertJsonPath('success', true);

        // Verify Cascade Deletion from Database
        $this->assertDatabaseMissing('purchase_requests', ['id' => $pr->id]);
        $this->assertDatabaseMissing('purchase_orders', ['id' => $po->id]);
        $this->assertDatabaseMissing('purchase_receipts', ['id' => $receipt->id]);
        $this->assertDatabaseMissing('supplier_invoices', ['id' => $invoice->id]);
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
