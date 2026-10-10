<?php

namespace Tests\Feature\Api\V1;

use App\Http\Resources\NotificationResource;
use App\Models\ApprovalHistory;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\Department;
use App\Models\Item;
use App\Models\Notification;
use App\Models\PurchaseOrder;
use App\Models\PurchaseReceipt;
use App\Models\PurchaseRequest;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\SupplierInvoice;
use App\Models\SystemEvent;
use App\Models\User;
use App\Services\AccountingPurchaseOrderService;
use App\Services\AccountingPurchaseRequestService;
use App\Services\GeneralManagerPurchaseRequestService;
use App\Services\NotificationService;
use App\Services\ProcurementPurchaseRequestService;
use App\Services\PurchaseOrderService;
use App\Services\PurchaseQuoteService;
use App\Services\PurchaseReceiptService;
use App\Services\PurchaseRequestService;
use App\Services\ReviewerPurchaseRequestService;
use App\Services\SupplierInvoiceService;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Tests\TestCase;

class WorkflowAuditComprehensiveTest extends TestCase
{
    use RefreshDatabase;

    private Department $deptA;
    private Department $deptB;
    private User $employeeA;
    private User $employeeB;
    private User $reviewerA;
    private User $reviewerB;
    private User $procurementManager;
    private User $financialDirector;
    private User $siteAccountant;
    private User $gmUser;
    private User $warehouseKeeper;
    private User $siteEngineer;
    private Supplier $supplierA;
    private Supplier $supplierB;
    private Supplier $supplierC;
    private Item $item1;
    private Category $category;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);

        $this->deptA = Department::create(['name' => 'Department Execution', 'code' => 'EXECUTION']);
        $this->deptB = Department::create(['name' => 'Department Buildings', 'code' => 'BUILDINGS']);

        $this->employeeA = $this->createUser('empA@ashbiliya.com', 'Employee A', 'employee', $this->deptA->id);
        $this->employeeB = $this->createUser('empB@ashbiliya.com', 'Employee B', 'employee', $this->deptB->id);

        $this->reviewerA = $this->createUser('ayman@gmail.com', 'Reviewer Ayman', 'reviewer', $this->deptA->id);
        $this->deptA->update(['manager_user_id' => $this->reviewerA->id]);

        $this->reviewerB = $this->createUser('hatem@gmail.com', 'Reviewer Hatem', 'reviewer', $this->deptB->id);
        $this->deptB->update(['manager_user_id' => $this->reviewerB->id]);

        $this->siteEngineer = $this->createUser('eng@ashbiliya.com', 'Engineer Hani', 'site_engineer', $this->deptA->id);
        $this->deptA->update(['site_engineer_user_id' => $this->siteEngineer->id]);

        $this->warehouseKeeper = $this->createUser('wh@ashbiliya.com', 'Warehouse Keeper', 'warehouse_keeper', $this->deptA->id);
        $this->procurementManager = $this->createUser('proc@ashbiliya.com', 'Procurement Tariq', 'procurement_manager', $this->deptA->id);
        $this->financialDirector = $this->createUser('hasan@gmail.com', 'Financial Director Hasan', 'accountant', $this->deptA->id);
        $this->siteAccountant = $this->createUser('siteacc@ashbiliya.com', 'Site Accountant', 'site_accountant', $this->deptA->id);
        $this->gmUser = $this->createUser('gm@ashbiliya.com', 'General Manager Mohamed', 'general_manager', $this->deptA->id);

        $this->supplierA = Supplier::create(['code' => 'SUP-AUD-1', 'company_name' => 'Supplier One', 'email' => 'sup1@audit.com', 'is_active' => true]);
        $this->supplierB = Supplier::create(['code' => 'SUP-AUD-2', 'company_name' => 'Supplier Two', 'email' => 'sup2@audit.com', 'is_active' => true]);
        $this->supplierC = Supplier::create(['code' => 'SUP-AUD-3', 'company_name' => 'Supplier Three', 'email' => 'sup3@audit.com', 'is_active' => true]);

        $this->category = Category::create(['name' => 'مواد البناء', 'code' => 'BUILDING', 'is_active' => true]);
        $this->item1 = Item::create([
            'sku' => 'ITEM-AUD-01',
            'name' => 'حديد تسليح 16 مم',
            'category_id' => $this->category->id,
            'uom' => 'TON',
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

    private function createDraftPR(User $creator, Department $targetDept, string $route = 'COMMERCIAL'): PurchaseRequest
    {
        $request = PurchaseRequest::create([
            'request_number' => 'PR-AUD-' . uniqid(),
            'user_id' => $creator->id,
            'department_id' => $creator->department_id,
            'target_department_id' => $targetDept->id,
            'reviewer_user_id' => $targetDept->manager_user_id,
            'site_engineer_user_id' => $targetDept->site_engineer_user_id,
            'priority' => 'HIGH',
            'procurement_route' => $route,
            'status' => 'DRAFT',
            'total_estimated_cost' => 5000,
            'date_needed' => now()->addDays(7)->toDateString(),
        ]);
        $request->items()->create([
            'item_id' => $this->item1->id,
            'item_description' => 'حديد تسليح 16 مم للمشروع',
            'item_reference' => 'PARCEL-101',
            'region' => 'منطقة الموقع الأولى',
            'quantity' => 10,
            'uom' => 'TON',
            'estimated_unit_price' => 500,
            'estimated_line_total' => 5000,
        ]);
        return $request->fresh(['items.item', 'department', 'targetDepartment', 'requester']);
    }

    /**
     * Test 1: Full End-to-End Standard Commercial Requisition with Multi-Quote Sequence
     */
    public function test_full_commercial_requisition_lifecycle(): void
    {
        $prService = app(PurchaseRequestService::class);
        $revService = app(ReviewerPurchaseRequestService::class);
        $gmService = app(GeneralManagerPurchaseRequestService::class);
        $procService = app(ProcurementPurchaseRequestService::class);
        $quoteService = app(PurchaseQuoteService::class);
        $poService = app(PurchaseOrderService::class);
        $receiptService = app(PurchaseReceiptService::class);
        $invoiceService = app(SupplierInvoiceService::class);

        // Step 1: Draft Creation & Submission
        $pr = $this->createDraftPR($this->employeeA, $this->deptA, 'COMMERCIAL');
        $this->assertEquals('DRAFT', $pr->status);

        $submittedPr = $prService->submitRequest($this->employeeA, $pr, $this->siteEngineer->id);
        $this->assertEquals('SUBMITTED', $submittedPr->status);

        // Verify Reviewer A received notification
        $revNotif = Notification::where('user_id', $this->reviewerA->id)->where('notifiable_id', $pr->id)->first();
        $this->assertNotNull($revNotif);
        $this->assertEquals('purchase_request_submitted', $revNotif->type);

        // Step 2: Reviewer starts review and approves
        $reviewedPr = $revService->startReview($this->reviewerA, $submittedPr);
        $this->assertEquals('UNDER_REVIEW', $reviewedPr->status);

        $approvedByRev = $revService->approveRequest($this->reviewerA, $reviewedPr, 'Approved technical specifications', $this->siteEngineer->id);
        $this->assertEquals('PENDING_EXECUTIVE_APPROVAL', $approvedByRev->status);

        // Verify notification to GM
        $gmNotif = Notification::where('user_id', $this->gmUser->id)->where('notifiable_id', $pr->id)->first();
        $this->assertNotNull($gmNotif);
        $this->assertEquals('purchase_request_pending_executive', $gmNotif->type);

        // Step 3: GM approves (commercial route -> PENDING_PROCUREMENT_APPROVAL)
        $approvedByGm = $gmService->approveRequest($this->gmUser, $approvedByRev, 'Approved by GM');
        $this->assertEquals('PENDING_PROCUREMENT_APPROVAL', $approvedByGm->status);

        // Verify Procurement Manager receives notification
        $procNotif = Notification::where('user_id', $this->procurementManager->id)->where('notifiable_id', $pr->id)->first();
        $this->assertNotNull($procNotif);
        $this->assertEquals('purchase_request_pending_procurement', $procNotif->type);

        // Step 4: Procurement initiates quotes (PENDING_QUOTE_RECOMMENDATIONS)
        $quotesStarted = $procService->approvePurchaseRequest($this->procurementManager, $approvedByGm, 'Quotes required');
        $this->assertEquals('PENDING_QUOTE_RECOMMENDATIONS', $quotesStarted->status);

        // Step 5: Procurement inputs 3 supplier quotes
        $withQuotes = $quoteService->createQuotes($this->procurementManager, $quotesStarted, [
            ['supplier_id' => $this->supplierA->id, 'unit_price' => 520, 'total_amount' => 5200],
            ['supplier_id' => $this->supplierB->id, 'unit_price' => 500, 'total_amount' => 5000],
            ['supplier_id' => $this->supplierC->id, 'unit_price' => 480, 'total_amount' => 4800],
        ]);
        $this->assertCount(3, $withQuotes->quotes);

        // Step 6: Sequential Quote Recommendations:
        // A) Financial Director (Hasan) recommended FIRST
        $cheapestQuote = $withQuotes->quotes->where('supplier_id', $this->supplierC->id)->first();
        $accRecommended = $quoteService->recommend($this->financialDirector, $cheapestQuote, 'RECOMMEND', 'Lowest financial cost');
        $this->assertEquals('PENDING_QUOTE_RECOMMENDATIONS', $accRecommended->status);

        // B) Department Reviewer recommended SECOND
        $revRecommended = $quoteService->recommend($this->reviewerA, $cheapestQuote, 'RECOMMEND', 'Complies with technical standard');
        $this->assertEquals('PENDING_EXECUTIVE_QUOTE_DECISION', $revRecommended->status);

        // Step 7: GM decides and selects quote
        $decidedPr = $quoteService->decide($this->gmUser, $cheapestQuote, 'SELECT', 'Best evaluated offer selected');
        $this->assertEquals('APPROVED_BY_PROCUREMENT', $decidedPr->status);
        $this->assertEquals($cheapestQuote->id, $decidedPr->selected_quote_id);

        // Step 8: Procurement creates PO and issues it
        $po = $poService->createPoFromPr($this->procurementManager, $decidedPr->id, $this->supplierC->id, ['payment_terms' => 'NET 30']);
        $this->assertEquals('PO_DRAFT', $po->status);

        $issuedPo = $poService->submitToAccounting($this->procurementManager, $po);
        $this->assertEquals('ISSUED', $issuedPo->status);

        // Verify Financial Director was EXCLUDED from PO issuance, and Site Accountant was notified
        $this->assertDatabaseMissing('notifications', ['user_id' => $this->financialDirector->id, 'type' => 'purchase_order_issued_accounting']);
        $this->assertDatabaseHas('notifications', ['user_id' => $this->siteAccountant->id, 'type' => 'purchase_order_issued_accounting']);

        // Step 9: Warehouse Receipt
        $receipt = $receiptService->createByWarehouse($this->warehouseKeeper, $issuedPo, [
            [
                'purchase_order_item_id' => $issuedPo->items->first()->id,
                'received_quantity' => 10,
            ],
        ], now()->toDateString(), 'Delivered to site warehouse');
        $this->assertEquals('PENDING_SITE_ENGINEER', $receipt->status);

        // Step 10: Site Engineer approves receipt
        $approvedReceipt = $receiptService->approveBySiteEngineer($this->siteEngineer, $receipt, 'Materials verified on site');
        $this->assertEquals('APPROVED', $approvedReceipt->status);

        // Step 11: Site Accountant creates invoice from receipt & matches three-way
        $invoice = $invoiceService->createInvoice(
            $this->siteAccountant,
            $issuedPo,
            $approvedReceipt,
            4800,
            'INV-AUD-001'
        );
        $this->assertEquals('OPEN', $invoice->status);
        $this->assertEquals(4800, (float) $invoice->amount);

        $matchedInvoice = $invoiceService->matchThreeWay($this->siteAccountant, $invoice);
        $this->assertEquals('MATCHED', $matchedInvoice->matching_status);

        // Step 12: Financial Director processes supplier payment
        $paymentResult = $invoiceService->recordSupplierPayment(
            $this->financialDirector,
            $this->supplierC,
            4800,
            now()->toDateString(),
            'BANK_TRANSFER',
            'TRX-AUD-999'
        );
        $this->assertEquals('PAID', $matchedInvoice->fresh()->status);
        $this->assertDatabaseHas('approval_history', ['target_type' => PurchaseRequest::class, 'target_id' => $pr->id]);
        $this->assertDatabaseHas('audit_logs', ['entity_type' => PurchaseRequest::class, 'entity_id' => $pr->id]);
    }

    /**
     * Test 2: Direct Purchase Route (Bypasses quotes; goes to PENDING_ACCOUNTING_APPROVAL)
     */
    public function test_direct_purchase_route(): void
    {
        $prService = app(PurchaseRequestService::class);
        $revService = app(ReviewerPurchaseRequestService::class);
        $gmService = app(GeneralManagerPurchaseRequestService::class);
        $accPrService = app(AccountingPurchaseRequestService::class);

        $pr = $this->createDraftPR($this->employeeA, $this->deptA, 'DIRECT');
        $prService->submitRequest($this->employeeA, $pr, $this->siteEngineer->id);
        $revService->approveRequest($this->reviewerA, $pr->fresh(), 'Approved direct purchase', $this->siteEngineer->id);

        // GM Approves -> Direct purchase transitions to PENDING_ACCOUNTING_APPROVAL
        $approvedPr = $gmService->approveRequest($this->gmUser, $pr->fresh(), 'Approved direct route');
        $this->assertEquals('PENDING_ACCOUNTING_APPROVAL', $approvedPr->status);

        // Financial Director (Hasan) enters financial data & approves directly
        $accApproved = $accPrService->approveRequest($this->financialDirector, $approvedPr, [
            'items' => [
                [
                    'pr_item_id' => $approvedPr->items->first()->id,
                    'supplier_id' => $this->supplierA->id,
                    'quantity' => 10,
                    'unit_price' => 500,
                ],
            ],
        ], 'Financial funds allocated');
        $this->assertEquals('APPROVED_BY_ACCOUNTING', $accApproved->status);
    }

    /**
     * Test 3: Executive Requisition (GM creates PR -> skips Reviewer and GM approval -> directly in PENDING_PROCUREMENT_APPROVAL)
     */
    public function test_general_manager_requisition_skips_reviewer_and_executive_approval(): void
    {
        $prService = app(PurchaseRequestService::class);
        $pr = $this->createDraftPR($this->gmUser, $this->deptA, 'COMMERCIAL');

        $submitted = $prService->submitRequest($this->gmUser, $pr, $this->siteEngineer->id);
        $this->assertEquals('PENDING_PROCUREMENT_APPROVAL', $submitted->status);

        // Reviewer must NOT be notified or assigned
        $this->assertNull($submitted->reviewer_user_id);
        $this->assertDatabaseMissing('notifications', ['user_id' => $this->reviewerA->id, 'notifiable_id' => $pr->id]);

        // Procurement Manager MUST be notified
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->procurementManager->id,
            'notifiable_id' => $pr->id,
            'type' => 'purchase_request_pending_procurement',
        ]);
    }

    /**
     * Test 4: Department Manager Requisition in same department (skips review -> goes to PENDING_EXECUTIVE_APPROVAL)
     */
    public function test_department_manager_requisition_skips_self_review(): void
    {
        $prService = app(PurchaseRequestService::class);
        $pr = $this->createDraftPR($this->reviewerA, $this->deptA, 'COMMERCIAL');

        $submitted = $prService->submitRequest($this->reviewerA, $pr, $this->siteEngineer->id);
        $this->assertEquals('PENDING_EXECUTIVE_APPROVAL', $submitted->status);

        // GM MUST be notified directly
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->gmUser->id,
            'notifiable_id' => $pr->id,
            'type' => 'purchase_request_pending_executive_approval',
        ]);
    }

    /**
     * Test 5: Cross-Department Isolation (Reviewer B cannot review PR of Department A)
     */
    public function test_cross_department_isolation_blocks_unauthorized_reviewer(): void
    {
        $pr = $this->createDraftPR($this->employeeA, $this->deptA, 'COMMERCIAL');
        app(PurchaseRequestService::class)->submitRequest($this->employeeA, $pr, $this->siteEngineer->id);

        $revService = app(ReviewerPurchaseRequestService::class);

        // Reviewer A (Department Execution) CAN review
        $this->assertTrue($revService->canUserReviewRequest($this->reviewerA, $pr->fresh()));

        // Reviewer B (Department Buildings) CANNOT review and must receive AccessDeniedHttpException
        $this->assertFalse($revService->canUserReviewRequest($this->reviewerB, $pr->fresh()));

        $this->expectException(AccessDeniedHttpException::class);
        $revService->startReview($this->reviewerB, $pr->fresh());
    }

    /**
     * Test 6: Requester Isolation (Employee B cannot view or edit Employee A's draft)
     */
    public function test_requester_isolation(): void
    {
        $pr = $this->createDraftPR($this->employeeA, $this->deptA, 'COMMERCIAL');

        // Employee A has access
        $resA = $this->actingAs($this->employeeA, 'sanctum')->getJson("/api/v1/purchase-requests/{$pr->id}");
        $resA->assertStatus(200);

        // Employee B receives 403 Forbidden
        $resB = $this->actingAs($this->employeeB, 'sanctum')->getJson("/api/v1/purchase-requests/{$pr->id}");
        $this->assertContains($resB->status(), [403, 404]);
    }

    /**
     * Test 7: Locked State Enforcement & Invalid Transitions
     */
    public function test_invalid_state_transitions_are_blocked(): void
    {
        $pr = $this->createDraftPR($this->employeeA, $this->deptA, 'COMMERCIAL');

        // Cannot start review on a DRAFT PR
        $this->expectException(\RuntimeException::class);
        app(ReviewerPurchaseRequestService::class)->startReview($this->reviewerA, $pr);
    }

    /**
     * Test 8: Cannot edit PR after Reviewer approval
     */
    public function test_cannot_edit_pr_after_reviewer_approval(): void
    {
        $pr = $this->createDraftPR($this->employeeA, $this->deptA, 'COMMERCIAL');
        app(PurchaseRequestService::class)->submitRequest($this->employeeA, $pr, $this->siteEngineer->id);
        app(ReviewerPurchaseRequestService::class)->approveRequest($this->reviewerA, $pr->fresh(), 'Approved', $this->siteEngineer->id);

        $tokenA = $this->employeeA->createToken('tokenA')->plainTextToken;
        $res = $this->withHeader('Authorization', 'Bearer ' . $tokenA)->putJson("/api/v1/purchase-requests/{$pr->id}", [
            'notes' => 'Attempting post-approval edit',
        ]);
        $res->assertStatus(409); // Conflict: Request locked after reviewer approval
    }

    /**
     * Test 9: Deduplication & Database Cleanliness
     */
    public function test_database_integrity_and_deduplication(): void
    {
        $pr = $this->createDraftPR($this->employeeA, $this->deptA, 'COMMERCIAL');
        $notificationService = app(NotificationService::class);

        // Queue same notification twice
        $notificationService->createNotification($this->employeeA, 'test_alert', 'تنبيه', 'رسالة تنبيه', $pr);
        $notificationService->createNotification($this->employeeA, 'test_alert', 'تنبيه جديد', 'رسالة تنبيه معدلة', $pr);

        // Assert only ONE notification row exists in database for this user, type, and entity
        $count = Notification::where('user_id', $this->employeeA->id)
            ->where('type', 'test_alert')
            ->where('notifiable_id', $pr->id)
            ->count();
        $this->assertEquals(1, $count, 'Deduplication must prevent multiple identical notifications');

        // Check for orphaned notifications
        $orphaned = Notification::whereNull('notifiable_type')->orWhereNull('notifiable_id')->count();
        $this->assertEquals(0, $orphaned, 'There must be no orphaned notifications in the database');
    }
}
