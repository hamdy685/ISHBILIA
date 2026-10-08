<?php

namespace Tests\Feature\Api\V1;

use App\Models\Category;
use App\Models\Department;
use App\Models\Item;
use App\Models\PurchaseOrder;
use App\Models\PurchaseReceipt;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestItem;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class UnifiedDashboardPendingTasksTest extends TestCase
{
    use RefreshDatabase;

    private Department $dept;
    private User $employee;
    private User $reviewer;
    private Supplier $supplier;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);

        $this->dept = Department::create([
            'name' => 'الهندسة والإنشاءات',
            'code' => 'ENG',
        ]);

        $employeeRole = Role::where('slug', 'employee')->first();
        $reviewerRole = Role::where('slug', 'reviewer')->first();

        $this->employee = User::create([
            'name' => 'مهندس أحمد الميداني',
            'email' => 'ahmed.field@example.com',
            'password' => Hash::make('password123'),
            'department_id' => $this->dept->id,
            'is_active' => true,
        ]);
        $this->employee->roles()->attach($employeeRole);

        $this->reviewer = User::create([
            'name' => 'المراجع الفني',
            'email' => 'reviewer.eng@example.com',
            'password' => Hash::make('password123'),
            'department_id' => $this->dept->id,
            'is_active' => true,
        ]);
        $this->reviewer->roles()->attach($reviewerRole);

        $this->supplier = Supplier::create([
            'company_name' => 'شركة التوريدات العالمية',
            'contact_person' => 'علي حسن',
            'phone' => '01000000001',
            'email' => 'supplier@example.com',
        ]);
    }

    public function test_employee_dashboard_aggregates_draft_prs_and_pending_inspection_receipts(): void
    {
        // 1. Create a DRAFT Purchase Request owned by this employee
        $draftPr = PurchaseRequest::create([
            'request_number' => 'PR-TEST-001',
            'user_id' => $this->employee->id,
            'requester_user_id' => $this->employee->id,
            'department_id' => $this->dept->id,
            'request_type' => 'PROJECT',
            'status' => 'DRAFT',
            'justification' => 'شراء كابلات للموقع',
        ]);

        // 2. Create a RETURNED Purchase Request owned by this employee
        $returnedPr = PurchaseRequest::create([
            'request_number' => 'PR-TEST-002',
            'user_id' => $this->employee->id,
            'requester_user_id' => $this->employee->id,
            'department_id' => $this->dept->id,
            'request_type' => 'PROJECT',
            'status' => 'RETURNED',
            'justification' => 'شراء أدوات كهربائية',
        ]);

        // 3. Create a Purchase Order and Purchase Receipt assigned to this employee as site engineer
        $approvedPr = PurchaseRequest::create([
            'request_number' => 'PR-TEST-003',
            'user_id' => $this->reviewer->id,
            'requester_user_id' => $this->reviewer->id,
            'department_id' => $this->dept->id,
            'site_engineer_user_id' => $this->employee->id,
            'request_type' => 'PROJECT',
            'status' => 'APPROVED_BY_REVIEWER',
            'justification' => 'أسمنت وحديد',
        ]);

        $po = PurchaseOrder::create([
            'po_number' => 'PO-TEST-001',
            'purchase_request_id' => $approvedPr->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $this->reviewer->id,
            'status' => 'ISSUED',
            'grand_total' => 50000,
        ]);

        $receipt = PurchaseReceipt::create([
            'purchase_order_id' => $po->id,
            'purchase_request_id' => $approvedPr->id,
            'supplier_id' => $this->supplier->id,
            'site_engineer_user_id' => $this->employee->id,
            'receipt_number' => 'REC-TEST-001',
            'status' => 'PENDING_SITE_ENGINEER',
            'received_at' => now()->toDateString(),
        ]);

        Sanctum::actingAs($this->employee);

        // Fetch unified pending tasks
        $response = $this->getJson('/api/v1/dashboard/pending-tasks');

        $response->assertOk();
        $response->assertJsonStructure([
            'count',
            'data' => [
                '*' => [
                    'id',
                    'rawId',
                    'type',
                    'code',
                    'title',
                    'actionUrl',
                    'actionLabel',
                ],
            ],
        ]);

        $data = $response->json('data');
        $types = collect($data)->pluck('type')->all();

        // Must contain BOTH PR and RECEIPT types in a single unified collection
        $this->assertContains('PR', $types);
        $this->assertContains('RECEIPT', $types);

        // Verify receipt item details
        $receiptTask = collect($data)->firstWhere('type', 'RECEIPT');
        $this->assertNotNull($receiptTask);
        $this->assertEquals("receipt-{$receipt->id}", $receiptTask['id']);
        $this->assertEquals("/site-engineer?receipt_id={$receipt->id}", $receiptTask['actionUrl']);
        $this->assertEquals('REC-TEST-001', $receiptTask['code']);

        // Verify draft PR item details
        $draftTask = collect($data)->firstWhere('code', 'PR-TEST-001');
        $this->assertNotNull($draftTask);
        $this->assertEquals("/employee/requests/{$draftPr->id}/edit", $draftTask['actionUrl']);
    }

    public function test_reviewer_dashboard_aggregates_reviewable_prs_and_assigned_tasks(): void
    {
        // 1. Submitted PR waiting for reviewer
        $submittedPr = PurchaseRequest::create([
            'request_number' => 'PR-REV-001',
            'user_id' => $this->employee->id,
            'requester_user_id' => $this->employee->id,
            'department_id' => $this->dept->id,
            'reviewer_user_id' => $this->reviewer->id,
            'request_type' => 'PROJECT',
            'status' => 'SUBMITTED',
            'justification' => 'طلب حديد تسليح',
        ]);

        // 2. Complementary Request (PurchaseRequestSupplement) waiting for reviewer
        $supplement = \App\Models\PurchaseRequestSupplement::create([
            'purchase_request_id' => $submittedPr->id,
            'batch_number' => 1,
            'requested_by_user_id' => $this->employee->id,
            'status' => 'SUBMITTED',
            'notes' => 'كمالة عاجلة إضافية لحديد التسليح',
        ]);

        // 3. PR with quotes waiting for recommendation
        $quotePr = PurchaseRequest::create([
            'request_number' => 'PR-QUOTE-001',
            'user_id' => $this->employee->id,
            'requester_user_id' => $this->employee->id,
            'department_id' => $this->dept->id,
            'reviewer_user_id' => $this->reviewer->id,
            'request_type' => 'PROJECT',
            'status' => 'PENDING_QUOTE_RECOMMENDATIONS',
            'justification' => 'عروض أسعار خرسانة جاهزة',
            'total_estimated_cost' => 120000,
        ]);

        $quote = \App\Models\PurchaseRequestQuote::create([
            'purchase_request_id' => $quotePr->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $this->employee->id,
            'total_amount' => 120000,
        ]);

        \App\Models\PurchaseRequestQuoteRecommendation::create([
            'purchase_request_quote_id' => $quote->id,
            'user_id' => $this->employee->id,
            'role_type' => 'ACCOUNTING',
            'decision' => 'RECOMMEND',
            'comments' => 'مناسب مالياً',
        ]);

        // 4. Receipt for reviewer's department waiting for inspection
        $approvedPr = PurchaseRequest::create([
            'request_number' => 'PR-REC-001',
            'user_id' => $this->employee->id,
            'requester_user_id' => $this->employee->id,
            'department_id' => $this->dept->id,
            'reviewer_user_id' => $this->reviewer->id,
            'request_type' => 'PROJECT',
            'status' => 'APPROVED_BY_REVIEWER',
            'justification' => 'بويات وعوازل',
        ]);

        $po = PurchaseOrder::create([
            'po_number' => 'PO-REV-001',
            'purchase_request_id' => $approvedPr->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $this->reviewer->id,
            'status' => 'ISSUED',
            'grand_total' => 30000,
        ]);

        $receipt = PurchaseReceipt::create([
            'purchase_order_id' => $po->id,
            'purchase_request_id' => $approvedPr->id,
            'supplier_id' => $this->supplier->id,
            'receipt_number' => 'REC-REV-001',
            'status' => 'PENDING_SITE_ENGINEER',
            'received_at' => now()->toDateString(),
        ]);

        Sanctum::actingAs($this->reviewer);

        $response = $this->getJson('/api/v1/dashboard/pending-tasks');
        $response->assertOk();

        $data = $response->json('data');
        $types = collect($data)->pluck('type')->unique()->all();

        // Must contain PR, SUPPLEMENT, QUOTE, and RECEIPT
        $this->assertContains('PR', $types);
        $this->assertContains('SUPPLEMENT', $types);
        $this->assertContains('QUOTE', $types);
        $this->assertContains('RECEIPT', $types);

        // Verify supplement task details
        $supplementTask = collect($data)->firstWhere('type', 'SUPPLEMENT');
        $this->assertNotNull($supplementTask);
        $this->assertEquals("supplement-{$supplement->id}", $supplementTask['id']);
        $this->assertEquals($supplement->id, $supplementTask['rawId']);
        $this->assertEquals("/requests/supplements?expand_pr={$submittedPr->id}&supplement_id={$supplement->id}", $supplementTask['actionUrl']);
        $this->assertEquals('كمالة عاجلة', $supplementTask['stageBadge']['text']);

        // Verify quote task details
        $quoteTask = collect($data)->firstWhere('type', 'QUOTE');
        $this->assertNotNull($quoteTask);
        $this->assertEquals($quotePr->id, $quoteTask['rawId']);
        $this->assertEquals("/reviewer/purchase-quotes?open={$quotePr->id}", $quoteTask['actionUrl']);
        $this->assertEquals('ترشيح أسعار', $quoteTask['stageBadge']['text']);

        // Verify receipt task details
        $receiptTask = collect($data)->firstWhere('type', 'RECEIPT');
        $this->assertNotNull($receiptTask);
        $this->assertEquals("/site-engineer?receipt_id={$receipt->id}", $receiptTask['actionUrl']);
        $this->assertEquals('إذن استلام مواد', $receiptTask['stageBadge']['text']);

        // Verify dedicated reviewer endpoint returns equivalent payload
        $reviewerResponse = $this->getJson('/api/v1/reviewer/pending-tasks');
        $reviewerResponse->assertOk();
        $this->assertCount(count($data), $reviewerResponse->json('data'));
    }
}
