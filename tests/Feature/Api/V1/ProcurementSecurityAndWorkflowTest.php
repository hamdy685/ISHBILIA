<?php

namespace Tests\Feature\Api\V1;

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
use App\Models\SupplierInvoice;
use App\Models\SupplierPayment;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Class ProcurementSecurityAndWorkflowTest
 *
 * Senior QA & Security Automation Test Suite covering:
 * 1. Horizontal Privilege Escalation & Data Isolation (Site Engineer A vs Site Engineer B).
 * 2. Separation of Duties (SOD): Procurement Manager blocked from recording accounting payments.
 * 3. Reject and Resubmit Workflow: Clean state transitions without relation corruption.
 * 4. Actual PO Immutability: Finalized Purchase Orders are strictly tamper-proof.
 */
class ProcurementSecurityAndWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private Department $deptA;
    private Department $deptB;
    private User $engineerA;
    private User $engineerB;
    private User $executionManagerA;
    private User $procurementManager;
    private User $accountant;
    private Supplier $supplier;
    private Item $item;
    private LandParcel $parcel;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);

        // Departments
        $this->deptA = Department::create([
            'name' => 'مشروع التجمع والإنشاءات (أ)',
            'code' => 'DEPT-PRJ-A',
            'is_active' => true,
        ]);

        $this->deptB = Department::create([
            'name' => 'مشروع العاصمة والتشطيبات (ب)',
            'code' => 'DEPT-PRJ-B',
            'is_active' => true,
        ]);

        // Roles & Users
        $this->executionManagerA = $this->createUser('em_a@ashbiliya.com', 'م. فؤاد مدير تنفيذ أ ومراجع', 'execution_manager', $this->deptA->id);
        // Attach reviewer role to executionManagerA so they can review and reject department PRs
        $reviewerRole = Role::where('slug', 'reviewer')->firstOrFail();
        $this->executionManagerA->roles()->syncWithoutDetaching([$reviewerRole->id]);

        $this->engineerA = $this->createUser('eng_a@ashbiliya.com', 'م. عمرو مهندس موقع أ', 'site_engineer', $this->deptA->id);
        $this->engineerA->update(['manager_id' => $this->executionManagerA->id]);

        $this->engineerB = $this->createUser('eng_b@ashbiliya.com', 'م. حسام مهندس موقع ب', 'site_engineer', $this->deptB->id);

        $this->procurementManager = $this->createUser('pm@ashbiliya.com', 'أ. طارق مدير المشتريات', 'procurement_manager', $this->deptA->id);
        $this->accountant = $this->createUser('acc@ashbiliya.com', 'أ. وجدي المدير المالي', 'accountant', $this->deptA->id);

        $this->deptA->update([
            'manager_user_id' => $this->executionManagerA->id,
            'site_engineer_user_id' => $this->engineerA->id,
        ]);

        // Master Data
        $this->supplier = Supplier::create([
            'code' => 'SUP-SEC-101',
            'company_name' => 'شركة النيل للحديد والصلب',
            'contact_name' => 'م. حسن البدري',
            'phone' => '01000000001',
            'is_active' => true,
            'opening_balance' => 0,
        ]);

        $this->item = Item::create([
            'sku' => 'SKU-SEC-STEEL-12',
            'name' => 'حديد تسليح 12 مم عز',
            'uom' => 'TON',
            'is_active' => true,
        ]);

        $this->parcel = LandParcel::create([
            'parcel_reference' => 'PARCEL-SEC-007',
            'region' => 'حي الوطن - التجمع',
            'opening_balance' => 200000,
            'funded_total' => 0,
            'expense_total' => 0,
            'balance' => 200000,
            'is_active' => true,
        ]);
    }

    /**
     * Scenario 1: Horizontal Privilege Escalation & Cross-Project Data Isolation Test.
     *
     * Engineer A creates a PR for Dept A.
     * Engineer B (from Dept B) attempts to:
     * - View Engineer A's PR (GET /api/v1/purchase-requests/{id})
     * - Edit Engineer A's PR (PUT /api/v1/purchase-requests/{id})
     * - List PRs (GET /api/v1/purchase-requests)
     *
     * Verification:
     * System strictly returns 403 Forbidden or 404 Not Found without leaking any sensitive data.
     * Engineer A's PR never appears in Engineer B's listings.
     */
    public function test_horizontal_privilege_escalation_and_data_isolation_between_engineers(): void
    {
        // 1. Engineer A creates a PR
        $createResponse = $this->actingAs($this->engineerA, 'sanctum')
            ->postJson('/api/v1/purchase-requests', [
                'department_id' => $this->deptA->id,
                'target_department_id' => $this->deptA->id,
                'parcel_reference' => 'PARCEL-SEC-007',
                'region' => 'حي الوطن - التجمع',
                'date_needed' => now()->addDays(4)->toDateString(),
                'priority' => 'HIGH',
                'notes' => 'بيانات سرية خاصة بصبة خرسانة مشروع أ',
                'items' => [
                    [
                        'item_id' => $this->item->id,
                        'item_description' => 'حديد تسليح 12 مم تسليم موقع أ',
                        'item_reference' => 'PARCEL-SEC-007',
                        'region' => 'حي الوطن - التجمع',
                        'quantity' => 15,
                        'uom' => 'TON',
                        'specifications' => 'مطابق لمواصفات الكود المصري',
                    ],
                ],
            ]);

        $createResponse->assertStatus(201);
        $prId = $createResponse->json('data.id');
        $this->assertNotNull($prId);

        // 2. Engineer B attempts to access Engineer A's PR via GET
        $getResponse = $this->actingAs($this->engineerB, 'sanctum')
            ->getJson("/api/v1/purchase-requests/{$prId}");

        $this->assertContains(
            $getResponse->status(),
            [403, 404],
            'Cross-department engineer must receive 403 Forbidden or 404 Not Found.'
        );
        $this->assertNull($getResponse->json('data.notes'), 'Data isolation failed: sensitive notes leaked.');

        // 3. Engineer B attempts to modify Engineer A's PR via PUT
        $updateResponse = $this->actingAs($this->engineerB, 'sanctum')
            ->putJson("/api/v1/purchase-requests/{$prId}", [
                'notes' => 'محاولة اختراق أفقي لتعديل الطلب',
                'priority' => 'LOW',
            ]);

        $this->assertContains(
            $updateResponse->status(),
            [403, 404],
            'Cross-department engineer must not be allowed to modify another engineer’s request.'
        );

        // 4. Verify listing: Engineer B must not see Engineer A's PR
        $listResponse = $this->actingAs($this->engineerB, 'sanctum')
            ->getJson('/api/v1/purchase-requests');

        $listResponse->assertStatus(200);
        $prIdsInList = collect($listResponse->json('data'))->pluck('id')->all();
        $this->assertNotContains($prId, $prIdsInList, 'Data Isolation Scope violated: PR leaked into listing.');
    }

    /**
     * Scenario 2: Separation of Duties (SOD) & Sovereign Financial Protection.
     *
     * Attempting to record financial payments using a Procurement Manager account.
     *
     * Verification:
     * System rejects the operation with 403 Forbidden under SOD rules.
     * Zero financial payment records are committed to the database.
     * Conversely, authorized financial personnel can successfully record payments.
     */
    public function test_procurement_manager_cannot_record_financial_payments_sod_violation(): void
    {
        // 1. Create a supplier invoice
        $pr = PurchaseRequest::create([
            'department_id' => $this->deptA->id,
            'target_department_id' => $this->deptA->id,
            'user_id' => $this->engineerA->id,
            'request_number' => 'PR-SOD-001',
            'parcel_reference' => 'PARCEL-SEC-007',
            'region' => 'حي الوطن - التجمع',
            'status' => 'APPROVED',
            'date_needed' => now()->addDays(5)->toDateString(),
        ]);

        $po = PurchaseOrder::create([
            'purchase_request_id' => $pr->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $this->procurementManager->id,
            'po_number' => 'PO-SOD-001',
            'status' => 'APPROVED_BY_ACCOUNTING',
            'subtotal' => 45000,
            'grand_total' => 45000,
            'is_actual' => true,
            'finalized_at' => now(),
        ]);

        $receipt = PurchaseReceipt::create([
            'purchase_order_id' => $po->id,
            'supplier_id' => $this->supplier->id,
            'department_id' => $this->deptA->id,
            'warehouse_keeper_user_id' => $this->engineerA->id,
            'receipt_number' => 'GRN-SOD-001',
            'status' => 'APPROVED',
            'received_at' => now(),
        ]);

        $invoice = SupplierInvoice::create([
            'supplier_id' => $this->supplier->id,
            'purchase_order_id' => $po->id,
            'purchase_receipt_id' => $receipt->id,
            'created_by_user_id' => $this->accountant->id,
            'invoice_number' => 'INV-SOD-888',
            'invoice_date' => now()->toDateString(),
            'amount' => 45000,
            'outstanding_amount' => 45000,
            'status' => 'OPEN',
        ]);

        // 2. Procurement Manager attempts to record payment via /api/v1/accounting/payments
        $unauthorizedGenericPayment = $this->actingAs($this->procurementManager, 'sanctum')
            ->postJson('/api/v1/accounting/payments', [
                'invoice_id' => $invoice->id,
                'amount' => 15000,
                'payment_method' => 'BANK_TRANSFER',
                'notes' => 'محاولة سداد من مدير المشتريات خرقاً لمبدأ فصل المهام',
            ]);

        $unauthorizedGenericPayment->assertStatus(403);

        // 3. Procurement Manager attempts to record payment via /api/v1/accounting/invoices/{id}/payments
        $unauthorizedDirectPayment = $this->actingAs($this->procurementManager, 'sanctum')
            ->postJson("/api/v1/accounting/invoices/{$invoice->id}/payments", [
                'amount' => 15000,
                'payment_method' => 'BANK_TRANSFER',
            ]);

        $unauthorizedDirectPayment->assertStatus(403);

        // 4. Verify no payment was logged in the database
        $this->assertDatabaseCount('supplier_payments', 0);

        // 5. Verify that authorized Financial Accountant CAN record payment
        $authorizedPayment = $this->actingAs($this->accountant, 'sanctum')
            ->postJson('/api/v1/accounting/payments', [
                'invoice_id' => $invoice->id,
                'amount' => 15000,
                'payment_method' => 'BANK_TRANSFER',
                'notes' => 'سداد نظامي معتمد من الإدارة المالية',
            ]);

        $authorizedPayment->assertStatus(201);
        $this->assertDatabaseHas('supplier_payments', [
            'supplier_id' => $this->supplier->id,
            'amount' => 15000,
        ]);
    }

    /**
     * Scenario 3: Reject and Resubmit Workflow Test.
     *
     * Flow:
     * - Engineer creates a PR (DRAFT) and submits it (SUBMITTED).
     * - Execution Manager / Reviewer rejects the PR with feedback (REJECTED).
     * - Engineer modifies the rejected PR with requested corrections and resubmits it.
     *
     * Verification:
     * - Transitions from SUBMITTED -> REJECTED -> SUBMITTED smoothly.
     * - Database state and line items remain fully intact with no relation corruption.
     */
    public function test_purchase_request_reject_and_resubmit_lifecycle(): void
    {
        // 1. Create Draft PR
        $createResponse = $this->actingAs($this->engineerA, 'sanctum')
            ->postJson('/api/v1/purchase-requests', [
                'department_id' => $this->deptA->id,
                'target_department_id' => $this->deptA->id,
                'parcel_reference' => 'PARCEL-SEC-007',
                'region' => 'حي الوطن - التجمع',
                'date_needed' => now()->addDays(7)->toDateString(),
                'priority' => 'NORMAL',
                'notes' => 'طلب حديد تسليح أولي للمشروع',
                'items' => [
                    [
                        'item_id' => $this->item->id,
                        'item_description' => 'حديد تسليح 12 مم',
                        'item_reference' => 'PARCEL-SEC-007',
                        'region' => 'حي الوطن - التجمع',
                        'quantity' => 10,
                        'uom' => 'TON',
                    ],
                ],
            ]);

        $createResponse->assertStatus(201);
        $prId = $createResponse->json('data.id');
        $this->assertSame('DRAFT', $createResponse->json('data.status'));

        // 2. Submit PR
        $submitResponse = $this->actingAs($this->engineerA, 'sanctum')
            ->postJson("/api/v1/purchase-requests/{$prId}/submit");

        $submitResponse->assertStatus(200);
        $this->assertDatabaseHas('purchase_requests', [
            'id' => $prId,
            'status' => 'SUBMITTED',
        ]);

        // 3. Execution Manager / Reviewer Rejects PR with justification
        $rejectResponse = $this->actingAs($this->executionManagerA, 'sanctum')
            ->postJson("/api/v1/reviewer/purchase-requests/{$prId}/reject", [
                'comment' => 'يرجى مراجعة الكمية وزيادتها إلى 25 طن لتغطية الصبة كاملة.',
            ]);

        $rejectResponse->assertStatus(200);
        $this->assertDatabaseHas('purchase_requests', [
            'id' => $prId,
            'status' => 'REJECTED',
        ]);

        // 4. Site Engineer updates the REJECTED PR
        $updateResponse = $this->actingAs($this->engineerA, 'sanctum')
            ->putJson("/api/v1/purchase-requests/{$prId}", [
                'parcel_reference' => 'PARCEL-SEC-007',
                'region' => 'حي الوطن - التجمع',
                'notes' => 'تم تعديل الكمية إلى 25 طن طبقاً لملاحظات مدير التنفيذ',
                'items' => [
                    [
                        'item_id' => $this->item->id,
                        'item_description' => 'حديد تسليح 12 مم - كمية معدلة',
                        'item_reference' => 'PARCEL-SEC-007',
                        'region' => 'حي الوطن - التجمع',
                        'quantity' => 25,
                        'uom' => 'TON',
                    ],
                ],
            ]);

        $updateResponse->assertStatus(200);

        // 5. Site Engineer Resubmits the PR
        $resubmitResponse = $this->actingAs($this->engineerA, 'sanctum')
            ->postJson("/api/v1/purchase-requests/{$prId}/submit");

        $resubmitResponse->assertStatus(200);
        $this->assertDatabaseHas('purchase_requests', [
            'id' => $prId,
            'status' => 'SUBMITTED',
        ]);

        // Verify line items and relations integrity
        $freshPr = PurchaseRequest::with('items')->findOrFail($prId);
        $this->assertSame('SUBMITTED', $freshPr->status);
        $this->assertCount(1, $freshPr->items);
        $this->assertEquals(25, (float) $freshPr->items->first()->quantity);
        $this->assertSame('تم تعديل الكمية إلى 25 طن طبقاً لملاحظات مدير التنفيذ', $freshPr->notes);
    }

    /**
     * Scenario 4: Actual PO Immutability and Audit Integrity Test.
     *
     * Flow:
     * - An Actual PO is finalized (finalized_at recorded and linked to supplier invoice).
     * - An unauthorized user (e.g. Site Engineer) attempts to edit items or headers -> 403 Forbidden.
     * - An authorized user (Procurement Manager) attempts to alter quantities/prices on finalized PO -> 409 Conflict.
     *
     * Verification:
     * - The system guarantees financial immutability.
     * - Quantities, unit prices, and financial totals remain intact in the database.
     */
    public function test_finalized_actual_purchase_order_is_strictly_immutable(): void
    {
        // 1. Create a finalized Actual Purchase Order
        $pr = PurchaseRequest::create([
            'department_id' => $this->deptA->id,
            'target_department_id' => $this->deptA->id,
            'user_id' => $this->engineerA->id,
            'request_number' => 'PR-IMMUTABLE-001',
            'parcel_reference' => 'PARCEL-SEC-007',
            'region' => 'حي الوطن - التجمع',
            'status' => 'APPROVED',
            'date_needed' => now()->addDays(3)->toDateString(),
        ]);

        $po = PurchaseOrder::create([
            'purchase_request_id' => $pr->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $this->procurementManager->id,
            'po_number' => 'PO-FINAL-IMMUTABLE-001',
            'status' => 'APPROVED_BY_ACCOUNTING',
            'subtotal' => 50000,
            'grand_total' => 50000,
            'is_actual' => true,
            'finalized_at' => now(),
            'notes' => 'أمر شراء فعلي معتمد نهائي',
        ]);

        $poItem = PurchaseOrderItem::create([
            'purchase_order_id' => $po->id,
            'item_id' => $this->item->id,
            'item_description' => 'حديد تسليح معتمد',
            'item_reference' => 'PARCEL-SEC-007',
            'region' => 'حي الوطن - التجمع',
            'quantity' => 100,
            'uom' => 'TON',
            'unit_price' => 500,
            'line_total' => 50000,
        ]);

        // 2. Unauthorized User (Site Engineer) attempts to modify PO Item
        $unauthorizedItemUpdate = $this->actingAs($this->engineerA, 'sanctum')
            ->putJson("/api/v1/procurement/purchase-orders/{$po->id}/items/{$poItem->id}", [
                'quantity' => 150,
                'unit_price' => 600,
            ]);

        $unauthorizedItemUpdate->assertStatus(403);

        // 3. Unauthorized User attempts to modify PO Header
        $unauthorizedHeaderUpdate = $this->actingAs($this->engineerA, 'sanctum')
            ->putJson("/api/v1/procurement/purchase-orders/{$po->id}", [
                'notes' => 'محاولة تعديل غير مصرح بها',
            ]);

        $unauthorizedHeaderUpdate->assertStatus(403);

        // 4. Authorized User (Procurement Manager) attempts to alter the finalized Actual PO Item
        $tamperItemAttempt = $this->actingAs($this->procurementManager, 'sanctum')
            ->putJson("/api/v1/procurement/purchase-orders/{$po->id}/items/{$poItem->id}", [
                'quantity' => 200,
                'unit_price' => 800,
                'item_reference' => 'PARCEL-SEC-007',
                'region' => 'حي الوطن - التجمع',
            ]);

        $tamperItemAttempt->assertStatus(409);
        $this->assertStringContainsString('لا يمكن تعديل أمر الشراء بعد اعتماده', $tamperItemAttempt->json('message'));

        // 5. Authorized User attempts to alter header of finalized PO
        $tamperHeaderAttempt = $this->actingAs($this->procurementManager, 'sanctum')
            ->putJson("/api/v1/procurement/purchase-orders/{$po->id}", [
                'notes' => 'محاولة التلاعب بالملاحظات بعد الاعتماد المالي',
            ]);

        $tamperHeaderAttempt->assertStatus(409);

        // 6. Verify Database Immutability: original quantities and amounts are untouched
        $freshPoItem = PurchaseOrderItem::findOrFail($poItem->id);
        $this->assertEquals(100, (float) $freshPoItem->quantity);
        $this->assertEquals(500, (float) $freshPoItem->unit_price);
        $this->assertEquals(50000, (float) $freshPoItem->line_total);

        $freshPo = PurchaseOrder::findOrFail($po->id);
        $this->assertEquals(50000, (float) $freshPo->grand_total);
        $this->assertSame('أمر شراء فعلي معتمد نهائي', $freshPo->notes);
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
