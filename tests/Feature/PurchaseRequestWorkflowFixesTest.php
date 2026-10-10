<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Department;
use App\Models\PurchaseOrder;
use App\Models\PurchaseRequest;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use App\Services\PurchaseRequestService;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\ExecutionManagerSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class PurchaseRequestWorkflowFixesTest extends TestCase
{
    use RefreshDatabase;

    protected PurchaseRequestService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);
        Role::firstOrCreate(
            ['slug' => 'execution_manager'],
            ['name' => 'Execution Projects Manager']
        );
        $this->service = app(PurchaseRequestService::class);
    }

    protected function createUserWithRole(string $roleSlug, ?int $departmentId = null, ?int $managerId = null, string $name = 'User'): User
    {
        $user = User::create([
            'name' => $name,
            'email' => uniqid('user_') . '@ashbiliya.com',
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

    /**
     * Test 1: Reviewer requesting for their own department skips technical review to PENDING_EXECUTIVE_APPROVAL.
     */
    public function test_reviewer_requesting_for_same_department_skips_to_executive_approval(): void
    {
        $dept = Department::create(['code' => 'CIVIL', 'name' => 'قسم المدني', 'is_active' => true]);
        $reviewer = $this->createUserWithRole('reviewer', $dept->id, null, 'مراجع المدني');
        $dept->update(['manager_user_id' => $reviewer->id]);

        $siteEngineer = $this->createUserWithRole('site_engineer', $dept->id, null, 'مهندس الموقع');

        $pr = $this->service->createRequest($reviewer, [
            'request_type' => 'PROJECT_ITEMS',
            'department_id' => $dept->id,
            'target_department_id' => $dept->id,
            'priority' => 'NORMAL',
            'items' => [
                [
                    'item_description' => 'إسمنت بورتلاندي',
                    'quantity' => 10,
                    'uom' => 'طن',
                    'item_reference' => 'قطعة 5',
                    'region' => 'أكتوبر',
                ],
            ],
        ]);

        $submittedPr = $this->service->submitRequest($reviewer, $pr, $siteEngineer->id, true);

        $this->assertSame('PENDING_EXECUTIVE_APPROVAL', $submittedPr->status);
        $this->assertSame($reviewer->id, $submittedPr->reviewer_user_id);
    }

    /**
     * Test 2: Reviewer A requesting for Department B does NOT bypass Reviewer B (status must be SUBMITTED).
     */
    public function test_reviewer_requesting_for_another_department_routes_to_target_reviewer_as_submitted(): void
    {
        $deptA = Department::create(['code' => 'DEPT_A', 'name' => 'قسم أ', 'is_active' => true]);
        $deptB = Department::create(['code' => 'DEPT_B', 'name' => 'قسم ب', 'is_active' => true]);

        $reviewerA = $this->createUserWithRole('reviewer', $deptA->id, null, 'مراجع قسم أ');
        $deptA->update(['manager_user_id' => $reviewerA->id]);

        $reviewerB = $this->createUserWithRole('reviewer', $deptB->id, null, 'مراجع قسم ب');
        $deptB->update(['manager_user_id' => $reviewerB->id]);

        $siteEngineerB = $this->createUserWithRole('site_engineer', $deptB->id, null, 'مهندس موقع ب');
        $deptB->update(['site_engineer_user_id' => $siteEngineerB->id]);

        // Reviewer A creates a draft targeting Department B
        $pr = $this->service->createRequest($reviewerA, [
            'request_type' => 'PROJECT_ITEMS',
            'department_id' => $deptA->id,
            'target_department_id' => $deptB->id,
            'priority' => 'NORMAL',
            'items' => [
                [
                    'item_description' => 'معدات قسم ب',
                    'quantity' => 5,
                    'uom' => 'عدد',
                    'item_reference' => 'موقع 12',
                    'region' => 'التجمع',
                ],
            ],
        ]);

        // Reviewer A submits the request
        $submittedPr = $this->service->submitRequest($reviewerA, $pr);

        // Crucial assertions for Issue 1:
        // Must be SUBMITTED for Reviewer B, NOT PENDING_EXECUTIVE_APPROVAL!
        $this->assertSame('SUBMITTED', $submittedPr->status);
        // Reviewer must be Reviewer B, NOT Reviewer A!
        $this->assertSame($reviewerB->id, $submittedPr->reviewer_user_id);
        $this->assertNotSame($reviewerA->id, $submittedPr->reviewer_user_id);
    }

    /**
     * Test 3: Eng. Karim (execution_manager) creating a normal PR routes directly to PENDING_PROCUREMENT_APPROVAL.
     */
    public function test_execution_manager_karim_creates_normal_request_routes_directly_to_procurement(): void
    {
        $dept = Department::create(['code' => 'MGMT', 'name' => 'الإدارة التنفيذية', 'is_active' => true]);
        $karim = $this->createUserWithRole('execution_manager', $dept->id, null, 'م. كريم');
        $siteEngineer = $this->createUserWithRole('site_engineer', $dept->id, null, 'مهندس استلام');

        $pr = $this->service->createRequest($karim, [
            'request_type' => 'PROJECT_ITEMS',
            'department_id' => $dept->id,
            'target_department_id' => $dept->id,
            'priority' => 'HIGH',
            'items' => [
                [
                    'item_description' => 'مهمات تنفيذ عاجلة',
                    'quantity' => 2,
                    'uom' => 'وحدة',
                    'item_reference' => 'مشروع أ',
                    'region' => 'القاهرة',
                ],
            ],
        ]);

        $submittedPr = $this->service->submitRequest($karim, $pr, $siteEngineer->id, true);

        // Crucial assertion for Issue 2:
        // Must route directly to procurement approval, NOT SUBMITTED to a reviewer!
        $this->assertSame('PENDING_PROCUREMENT_APPROVAL', $submittedPr->status);
        $this->assertNull($submittedPr->reviewer_user_id);
    }

    /**
     * Test 4: PO approval endpoints return 403 Forbidden for GM and Accountant.
     */
    public function test_po_approval_endpoints_return_403_prohibited(): void
    {
        $dept = Department::create(['code' => 'ACC', 'name' => 'الحسابات', 'is_active' => true]);
        $gm = $this->createUserWithRole('general_manager', $dept->id, null, 'المدير العام');
        $accountant = $this->createUserWithRole('accountant', $dept->id, null, 'المحاسب');

        $supplier = Supplier::create([
            'code' => 'SUP-TEST-001',
            'company_name' => 'مورد تجريبي',
            'is_active' => true,
        ]);

        $dummyPr = PurchaseRequest::create([
            'request_number' => 'PR-TEST-999',
            'user_id' => $gm->id,
            'department_id' => $dept->id,
            'target_department_id' => $dept->id,
            'status' => 'PENDING_PROCUREMENT_APPROVAL',
            'priority' => 'NORMAL',
            'requires_warehouse_receipt' => true,
        ]);

        $po = PurchaseOrder::create([
            'po_number' => 'PO-TEST-001',
            'purchase_request_id' => $dummyPr->id,
            'supplier_id' => $supplier->id,
            'department_id' => $dept->id,
            'created_by_user_id' => $gm->id,
            'status' => 'ISSUED',
            'subtotal' => 1000,
            'tax_amount' => 140,
            'grand_total' => 1140,
        ]);

        // General Manager attempting to approve PO
        $responseGm = $this->actingAs($gm, 'sanctum')
            ->postJson("/api/v1/general-manager/purchase-orders/{$po->id}/approve");

        $responseGm->assertStatus(403)
            ->assertJsonFragment([
                'message' => 'Prohibited action: General Manager has read-only access. Approval is not allowed.',
            ]);

        // Accountant attempting to approve PO
        $responseAcc = $this->actingAs($accountant, 'sanctum')
            ->postJson("/api/v1/accounting/purchase-orders/{$po->id}/approve");

        $responseAcc->assertStatus(403)
            ->assertJsonFragment([
                'message' => 'Prohibited action: Accountant has read-only access. Approval is not allowed.',
            ]);
    }

    /**
     * Test 5: Reviewer B approves request created by Reviewer A -> transitions to PENDING_EXECUTIVE_APPROVAL.
     */
    public function test_reviewer_b_approves_pr_from_reviewer_a_transitions_to_executive_approval(): void
    {
        $deptA = Department::create(['code' => 'DEPT_1', 'name' => 'قسم 1', 'is_active' => true]);
        $deptB = Department::create(['code' => 'DEPT_2', 'name' => 'قسم 2', 'is_active' => true]);

        $reviewerA = $this->createUserWithRole('reviewer', $deptA->id, null, 'مراجع قسم 1');
        $deptA->update(['manager_user_id' => $reviewerA->id]);

        $reviewerB = $this->createUserWithRole('reviewer', $deptB->id, null, 'مراجع قسم 2');
        $deptB->update(['manager_user_id' => $reviewerB->id]);

        $siteEngineerB = $this->createUserWithRole('site_engineer', $deptB->id, null, 'مهندس موقع 2');
        $deptB->update(['site_engineer_user_id' => $siteEngineerB->id]);

        $pr = $this->service->createRequest($reviewerA, [
            'request_type' => 'PROJECT_ITEMS',
            'department_id' => $deptA->id,
            'target_department_id' => $deptB->id,
            'priority' => 'NORMAL',
            'items' => [
                [
                    'item_description' => 'مهمات',
                    'quantity' => 1,
                    'uom' => 'عدد',
                    'item_reference' => 'موقع 1',
                    'region' => 'أكتوبر',
                ],
            ],
        ]);

        $submittedPr = $this->service->submitRequest($reviewerA, $pr);
        $this->assertSame('SUBMITTED', $submittedPr->status);

        // Now Reviewer B approves it
        $reviewerService = app(\App\Services\ReviewerPurchaseRequestService::class);
        $approvedPr = $reviewerService->approveRequest($reviewerB, $submittedPr, 'موافق على المهمات', $siteEngineerB->id);

        $this->assertSame('PENDING_EXECUTIVE_APPROVAL', $approvedPr->status);
    }

    /**
     * Test 6: Eng. Kamel (subordinate of Karim) has executive manager as Karim, not Mohamed.
     */
    public function test_kamel_reports_to_karim_and_routes_to_karim(): void
    {
        $dept = Department::create(['code' => 'SITE', 'name' => 'مشروعات الموقع', 'is_active' => true]);
        $karim = $this->createUserWithRole('execution_manager', $dept->id, null, 'المهندس كريم');
        $kamel = $this->createUserWithRole('site_engineer', $dept->id, $karim->id, 'المهندس كامل');
        $reviewer = $this->createUserWithRole('reviewer', $dept->id, null, 'مراجع المشروعات');
        $dept->update(['manager_user_id' => $reviewer->id]);

        $pr = $this->service->createRequest($kamel, [
            'request_type' => 'PROJECT_ITEMS',
            'department_id' => $dept->id,
            'target_department_id' => $dept->id,
            'priority' => 'NORMAL',
            'items' => [
                [
                    'item_description' => 'خرسانة جاهزة',
                    'quantity' => 50,
                    'uom' => 'م3',
                    'item_reference' => 'قطعة 10',
                    'region' => 'التجمع الخامس',
                ],
            ],
        ]);

        $submittedPr = $this->service->submitRequest($kamel, $pr, $kamel->id, true);
        $this->assertSame('SUBMITTED', $submittedPr->status);

        // Reviewer approves
        $reviewerService = app(\App\Services\ReviewerPurchaseRequestService::class);
        $approvedPr = $reviewerService->approveRequest($reviewer, $submittedPr, 'معتمد فني', $kamel->id);

        $this->assertSame('PENDING_EXECUTIVE_APPROVAL', $approvedPr->status);

        // Check GM / Executive visibility
        $gmService = app(\App\Services\GeneralManagerPurchaseRequestService::class);
        $karimRequests = $gmService->getPendingRequests(50, $karim);
        $this->assertTrue($karimRequests->getCollection()->contains('id', $approvedPr->id));
    }

    /**
     * Test 7: Supplementary request by reviewer fast-tracks directly to PENDING_PROCUREMENT_APPROVAL.
     */
    public function test_supplement_request_bypasses_executives_and_routes_directly_to_procurement(): void
    {
        $dept = Department::create(['code' => 'CIVIL_SUP', 'name' => 'قسم مدني كمالة', 'is_active' => true]);
        $reviewer = $this->createUserWithRole('reviewer', $dept->id, null, 'مراجع كمالة');
        $dept->update(['manager_user_id' => $reviewer->id]);
        $siteEngineer = $this->createUserWithRole('site_engineer', $dept->id, null, 'مهندس استلام');

        $parentPr = $this->service->createRequest($reviewer, [
            'request_type' => 'PROJECT_ITEMS',
            'department_id' => $dept->id,
            'target_department_id' => $dept->id,
            'priority' => 'NORMAL',
            'items' => [
                [
                    'item_description' => 'بند رئيسي',
                    'quantity' => 10,
                    'uom' => 'طن',
                    'item_reference' => 'قطعة 1',
                    'region' => 'الشروق',
                ],
            ],
        ]);

        // Create a complementary PR
        $supplementPr = $this->service->createRequest($reviewer, [
            'request_type' => 'COMPLEMENTARY',
            'parent_request_id' => $parentPr->id,
            'department_id' => $dept->id,
            'target_department_id' => $dept->id,
            'priority' => 'NORMAL',
            'items' => [
                [
                    'item_description' => 'كمالة إسمنت',
                    'quantity' => 3,
                    'uom' => 'طن',
                    'item_reference' => 'قطعة 1',
                    'region' => 'الشروق',
                ],
            ],
        ]);

        $submittedSupplement = $this->service->submitRequest($reviewer, $supplementPr, $siteEngineer->id, true);

        // Must fast-track to procurement, bypassing executive approval!
        $this->assertSame('PENDING_PROCUREMENT_APPROVAL', $submittedSupplement->status);
    }
}

