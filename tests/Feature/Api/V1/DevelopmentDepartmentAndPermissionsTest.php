<?php

namespace Tests\Feature\Api\V1;

use App\Models\Department;
use App\Models\PurchaseOrder;
use App\Models\PurchaseReceipt;
use App\Models\PurchaseRequest;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\SupplierInvoice;
use App\Models\User;
use App\Services\ReviewerPurchaseRequestService;
use App\Services\SupplierInvoiceService;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DevelopmentDepartmentAndPermissionsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);

        $dept = Department::firstOrCreate(
            ['code' => 'DEVELOPMENT'],
            ['name' => 'التطوير', 'is_active' => true]
        );

        $reviewerRole = Role::firstOrCreate(['slug' => 'reviewer'], ['name' => 'Reviewer']);
        $accountantRole = Role::firstOrCreate(['slug' => 'accountant'], ['name' => 'Accountant']);
        $generalAccountantRole = Role::firstOrCreate(['slug' => 'general_accountant'], ['name' => 'General Accountant']);

        $mahmoud = User::firstOrCreate(
            ['email' => 'mahmoud@gmail.com'],
            [
                'name' => 'المهندس محمود',
                'department_id' => $dept->id,
                'is_active' => true,
                'password' => bcrypt('123456'),
            ]
        );
        $mahmoud->roles()->syncWithoutDetaching([$reviewerRole->id]);
        $dept->update(['manager_user_id' => $mahmoud->id]);

        $ahmed = User::firstOrCreate(
            ['email' => 'ahmed.dev@gmail.com'],
            [
                'name' => 'المهندس أحمد',
                'department_id' => $dept->id,
                'is_active' => true,
                'password' => bcrypt('123456'),
            ]
        );
        $ahmed->roles()->syncWithoutDetaching([$accountantRole->id]);

        $execDept = Department::firstOrCreate(['code' => 'EXECUTION'], ['name' => 'التنفيذ', 'is_active' => true]);
        $ayman = User::firstOrCreate(
            ['email' => 'ayman@gmail.com'],
            [
                'name' => 'المهندس أيمن',
                'department_id' => $execDept->id,
                'is_active' => true,
                'password' => bcrypt('123456'),
            ]
        );
        $ayman->roles()->syncWithoutDetaching([$reviewerRole->id]);
        $execDept->update(['manager_user_id' => $ayman->id]);

        $habiba = User::firstOrCreate(
            ['email' => 'habiba@gmail.com'],
            [
                'name' => 'المهندسة حبيبة',
                'is_active' => true,
                'password' => bcrypt('123456'),
            ]
        );
        $habiba->roles()->syncWithoutDetaching([$generalAccountantRole->id]);
    }

    public function test_development_department_and_users_are_properly_configured(): void
    {
        $dept = Department::where('code', 'DEVELOPMENT')->first();
        $this->assertNotNull($dept, 'Development department should exist.');
        $this->assertEquals('التطوير', $dept->name);

        $mahmoud = User::where('email', 'mahmoud@gmail.com')->first();
        $this->assertNotNull($mahmoud, 'Eng. Mahmoud should exist.');
        $this->assertTrue($mahmoud->hasRole('reviewer'), 'Eng. Mahmoud should have reviewer role.');
        $this->assertEquals($dept->id, $mahmoud->department_id);
        $this->assertEquals($mahmoud->id, $dept->manager_user_id, 'Eng. Mahmoud should be designated manager of Development department.');

        $ahmed = User::where('email', 'ahmed.dev@gmail.com')->first();
        $this->assertNotNull($ahmed, 'Eng. Ahmed should exist.');
        $this->assertTrue($ahmed->hasRole('accountant'), 'Eng. Ahmed should have accountant role.');
        $this->assertEquals($dept->id, $ahmed->department_id);
    }

    public function test_eng_mahmoud_can_review_requests_for_development_department(): void
    {
        $dept = Department::where('code', 'DEVELOPMENT')->firstOrFail();
        $mahmoud = User::where('email', 'mahmoud@gmail.com')->firstOrFail();
        $otherReviewer = User::where('email', 'ayman@gmail.com')->firstOrFail(); // Execution reviewer

        $pr = PurchaseRequest::create([
            'request_number' => 'PR-DEV-TEST-1',
            'user_id' => $mahmoud->id,
            'department_id' => $dept->id,
            'target_department_id' => $dept->id,
            'status' => 'SUBMITTED',
            'title' => 'Development Equipment',
            'procurement_route' => 'UNDECIDED',
        ]);

        $reviewerService = app(ReviewerPurchaseRequestService::class);

        // Eng. Mahmoud can review this request
        $this->assertTrue($reviewerService->canUserReviewRequest($mahmoud, $pr));

        // Execution reviewer cannot review Development request
        $this->assertFalse($reviewerService->canUserReviewRequest($otherReviewer, $pr));

        // Query scope returns the request for Eng. Mahmoud
        $requests = $reviewerService->getReviewableRequests($mahmoud);
        $this->assertTrue($requests->pluck('id')->contains($pr->id));

        $otherRequests = $reviewerService->getReviewableRequests($otherReviewer);
        $this->assertFalse($otherRequests->pluck('id')->contains($pr->id));
    }

    public function test_general_accountant_habiba_always_receives_development_department_financial_records(): void
    {
        $supplierInvoiceService = app(SupplierInvoiceService::class);
        $habiba = $supplierInvoiceService->getGeneralAccountant();
        $this->assertNotNull($habiba, 'Eng. Habiba should exist as General Accountant.');

        // 1. Accountant resolution includes Eng. Habiba for DEVELOPMENT
        $resolvedAccountants = $supplierInvoiceService->getAccountantsForDepartment('DEVELOPMENT');
        $this->assertTrue(
            $resolvedAccountants->pluck('id')->contains($habiba->id),
            'General Accountant Eng. Habiba must always be resolved for DEVELOPMENT department.'
        );

        $ahmed = User::where('email', 'ahmed.dev@gmail.com')->firstOrFail();
        $this->assertTrue(
            $resolvedAccountants->pluck('id')->contains($ahmed->id),
            'Eng. Ahmed must also be resolved as the department accountant.'
        );

        // 2. Unrestricted scope for Habiba: getAllowedDepartmentCodesForAccountant returns null (all departments)
        $this->assertNull(
            $supplierInvoiceService->getAllowedDepartmentCodesForAccountant($habiba),
            'Eng. Habiba should have null allowed department codes (unrestricted company-wide access).'
        );

        // 3. Habiba is not restricted: isRestrictedDepartmentAccountant returns false
        $this->assertFalse(
            $supplierInvoiceService->isRestrictedDepartmentAccountant($habiba),
            'Eng. Habiba should not be restricted to specific departments.'
        );

        // 4. Approved receipts for DEVELOPMENT appear in Habiba dashboard
        $devDept = Department::where('code', 'DEVELOPMENT')->firstOrFail();
        $supplier = Supplier::create([
            'company_name' => 'Tech Supply Co',
            'contact_name' => 'Supplier Rep',
            'phone' => '01000000000',
            'is_active' => true,
        ]);

        $pr = PurchaseRequest::create([
            'request_number' => 'PR-DEV-TEST-2',
            'user_id' => $ahmed->id,
            'department_id' => $devDept->id,
            'target_department_id' => $devDept->id,
            'status' => 'ISSUED',
        ]);

        $po = PurchaseOrder::create([
            'po_number' => 'PO-DEV-TEST-1',
            'purchase_request_id' => $pr->id,
            'supplier_id' => $supplier->id,
            'status' => 'ISSUED',
            'created_by_user_id' => $ahmed->id,
        ]);

        $receipt = PurchaseReceipt::create([
            'receipt_number' => 'REC-DEV-TEST-1',
            'purchase_order_id' => $po->id,
            'purchase_request_id' => $pr->id,
            'supplier_id' => $supplier->id,
            'status' => 'APPROVED',
        ]);

        $habibaReceipts = $supplierInvoiceService->approvedReceipts(100, $habiba, 'pending');
        $this->assertTrue(
            $habibaReceipts->pluck('id')->contains($receipt->id),
            'Approved receipt for DEVELOPMENT department must appear in Eng. Habiba dashboard.'
        );

        // 5. Eng. Habiba can create invoice for DEVELOPMENT without restriction
        $invoice = $supplierInvoiceService->createInvoice(
            $habiba,
            $po,
            $receipt,
            5000.00,
            'INV-DEV-TEST-1',
            now()->toDateString(),
            now()->addDays(30)->toDateString(),
            [],
            'Invoice for development equipment'
        );

        $this->assertInstanceOf(SupplierInvoice::class, $invoice);
        $this->assertEquals(5000.00, (float) $invoice->amount);
    }

    public function test_reviewer_can_assign_receiver_and_warehouse_route_when_creating_request(): void
    {
        $dept = Department::where('code', 'DEVELOPMENT')->firstOrFail();
        $mahmoud = User::where('email', 'mahmoud@gmail.com')->firstOrFail();

        // 1. Create a draft request by reviewer
        $pr = PurchaseRequest::create([
            'request_number' => 'PR-DEV-SUBMIT-1',
            'user_id' => $mahmoud->id,
            'department_id' => $dept->id,
            'target_department_id' => $dept->id,
            'status' => 'DRAFT',
            'request_type' => 'PROJECT',
            'parcel_reference' => 'PARCEL-100',
            'region' => 'DEV-ZONE',
        ]);

        $pr->items()->create([
            'item_description' => 'Server Equipment',
            'quantity' => 2,
            'uom' => 'PCS',
        ]);

        $service = app(\App\Services\PurchaseRequestService::class);

        // 2. Reviewer submits choosing HIMSELF as the receiver and requires_warehouse_receipt = false (direct delivery)
        $submitted = $service->submitRequest(
            $mahmoud,
            $pr,
            $mahmoud->id, // Choosing himself as the receiver!
            false, // Bypassing Uncle Salama (requires_warehouse_receipt = false)
            'اعتماد مبدئي من مراجع قسم التطوير مع الاستلام الشخصي'
        );

        $this->assertEquals('PENDING_EXECUTIVE_APPROVAL', $submitted->status);
        $this->assertEquals($mahmoud->id, $submitted->site_engineer_user_id, 'Reviewer can designate himself as the receiver.');
        $this->assertFalse($submitted->requires_warehouse_receipt, 'Requires warehouse receipt should be false when reviewer specifies direct delivery.');
        $this->assertEquals($mahmoud->id, $submitted->reviewer_user_id);

        // Verify ApprovalHistory was created
        $history = \App\Models\ApprovalHistory::where('target_id', $pr->id)
            ->where('actor_user_id', $mahmoud->id)
            ->first();

        $this->assertNotNull($history, 'Approval history should be recorded for reviewer submission.');
        $this->assertEquals('APPROVED_BY_REVIEWER', $history->action);
        $this->assertEquals('PENDING_EXECUTIVE_APPROVAL', $history->to_state);
    }

    public function test_reviewer_submitting_via_api_with_uncle_salama_warehouse_routing(): void
    {
        $dept = Department::where('code', 'DEVELOPMENT')->firstOrFail();
        $mahmoud = User::where('email', 'mahmoud@gmail.com')->firstOrFail();
        $ayman = User::where('email', 'ayman@gmail.com')->firstOrFail();

        $pr = PurchaseRequest::create([
            'request_number' => 'PR-DEV-SUBMIT-2',
            'user_id' => $mahmoud->id,
            'department_id' => $dept->id,
            'target_department_id' => $dept->id,
            'status' => 'DRAFT',
            'request_type' => 'PROJECT',
            'parcel_reference' => 'PARCEL-200',
            'region' => 'DEV-ZONE-2',
        ]);

        $pr->items()->create([
            'item_description' => 'Cables & Routers',
            'quantity' => 10,
            'uom' => 'PCS',
        ]);

        $response = $this->actingAs($mahmoud)->postJson("/api/v1/purchase-requests/{$pr->id}/submit", [
            'site_engineer_user_id' => $ayman->id,
            'requires_warehouse_receipt' => true,
            'comment' => 'إرسال للمدير التنفيذي مع المرور على عم سلامة في المخزن',
        ]);

        $response->assertOk();
        $this->assertEquals('PENDING_EXECUTIVE_APPROVAL', $response->json('data.status'));
        $this->assertEquals($ayman->id, $response->json('data.site_engineer_user_id'));
        $this->assertTrue($response->json('data.requires_warehouse_receipt'));
    }
}
