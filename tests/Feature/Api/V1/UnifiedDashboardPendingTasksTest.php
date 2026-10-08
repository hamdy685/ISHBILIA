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
            'request_type' => 'PROJECT',
            'status' => 'SUBMITTED',
            'justification' => 'طلب حديد تسليح',
        ]);

        Sanctum::actingAs($this->reviewer);

        $response = $this->getJson('/api/v1/dashboard/pending-tasks');
        $response->assertOk();

        $data = $response->json('data');
        $prTask = collect($data)->firstWhere('rawId', $submittedPr->id);

        $this->assertNotNull($prTask);
        $this->assertEquals('PR', $prTask['type']);
        $this->assertEquals("/reviewer/requests/{$submittedPr->id}/review", $prTask['actionUrl']);
    }
}
