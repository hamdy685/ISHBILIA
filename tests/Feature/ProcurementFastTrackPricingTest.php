<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Department;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestItem;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use App\Services\GeneralManagerPurchaseRequestService;
use App\Services\ProcurementPurchaseRequestService;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ProcurementFastTrackPricingTest extends TestCase
{
    use RefreshDatabase;

    protected ProcurementPurchaseRequestService $procurementService;
    protected GeneralManagerPurchaseRequestService $gmService;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);
        $this->procurementService = app(ProcurementPurchaseRequestService::class);
        $this->gmService = app(GeneralManagerPurchaseRequestService::class);
    }

    protected function createUserWithRole(string $roleSlug, ?int $departmentId = null, string $name = 'Test User'): User
    {
        $user = User::create([
            'name' => $name,
            'email' => uniqid('user_') . '@ashbiliya.com',
            'password' => Hash::make('password123'),
            'department_id' => $departmentId,
            'is_active' => true,
        ]);

        $role = Role::where('slug', $roleSlug)->first();
        if ($role) {
            $user->roles()->attach($role->id);
        }

        return $user;
    }

    /**
     * Test procurement manager can view and fast-track price an unapproved PR directly to GM final approval.
     */
    public function test_procurement_manager_can_fast_track_price_request_from_executive_pending(): void
    {
        $dept = Department::create(['name' => 'الهندسة المدنية', 'code' => 'CIVIL']);
        $requester = $this->createUserWithRole('employee', $dept->id, 'المهندس أحمد');
        $procurementManager = $this->createUserWithRole('procurement_manager', $dept->id, 'مدير المشتريات');
        $generalManager = $this->createUserWithRole('general_manager', $dept->id, 'م. محمد المدير التنفيذي');

        $supplier = Supplier::create([
            'company_name' => 'شركة الأهرام للتوريدات',
            'contact_name' => 'محمود',
            'is_active' => true,
        ]);

        // Create an unpriced PR in PENDING_EXECUTIVE_APPROVAL (waiting preliminary GM decision)
        $pr = PurchaseRequest::create([
            'request_number' => 'PR-2026-TEST-001',
            'user_id' => $requester->id,
            'department_id' => $dept->id,
            'status' => 'PENDING_EXECUTIVE_APPROVAL',
            'procurement_route' => null,
            'total_estimated_cost' => 0,
        ]);

        $item = PurchaseRequestItem::create([
            'purchase_request_id' => $pr->id,
            'item_description' => 'أسمنت بورتلاندي مقاوم',
            'quantity' => 100,
            'uom' => 'طن',
        ]);

        // 1. Procurement manager fetches executive pending requests via service
        $pendingList = $this->procurementService->getExecutivePendingRequests(50);
        $this->assertTrue($pendingList->contains('id', $pr->id));

        // 2. Fast-track price the PR without quotes
        $financialData = [
            'items' => [
                [
                    'pr_item_id' => $item->id,
                    'supplier_id' => $supplier->id,
                    'quantity' => 100,
                    'unit_price' => 2500.0,
                    'uom' => 'طن',
                ],
            ],
            'notes' => 'تسعير مباشر متفق عليه مع المورد للتسليم الفوري',
        ];

        $updatedPr = $this->procurementService->sendToAccountingWithoutQuotes(
            $procurementManager,
            $pr,
            $financialData,
            'تسعير فوري وتخطي الاعتماد المبدئي'
        );

        // Verify status and route
        $this->assertEquals('PENDING_EXECUTIVE_APPROVAL', $updatedPr->status);
        $this->assertEquals('DIRECT', $updatedPr->procurement_route);
        $this->assertEquals(250000.0, (float) $updatedPr->total_estimated_cost);
        $this->assertEquals($supplier->id, $updatedPr->direct_supplier_id);

        // Verify history contains fast-track action
        $latestHistory = $updatedPr->approvalHistory()->latest('id')->first();
        $this->assertNotNull($latestHistory);
        $this->assertEquals('FAST_TRACK_PRICING_SKIPPED_PRELIMINARY', $latestHistory->action);
        $this->assertEquals('PENDING_EXECUTIVE_APPROVAL', $latestHistory->from_state);
        $this->assertEquals('PENDING_EXECUTIVE_APPROVAL', $latestHistory->to_state);

        // 3. Now GM approves this priced PR: it must go STRAIGHT to PENDING_ACCOUNTING_APPROVAL
        $approvedByGm = $this->gmService->approveRequest($generalManager, $updatedPr, 'معتمد للتوريد الفوري');
        $this->assertEquals('PENDING_ACCOUNTING_APPROVAL', $approvedByGm->status);
    }

    /**
     * Test procurement manager can route an executive pending PR to 3 quotes.
     */
    public function test_procurement_manager_can_route_executive_pending_pr_to_quotes(): void
    {
        $dept = Department::create(['name' => 'المشروعات', 'code' => 'PROJ']);
        $requester = $this->createUserWithRole('employee', $dept->id, 'مهندس الموقع');
        $procurementManager = $this->createUserWithRole('procurement_manager', $dept->id, 'مدير المشتريات');

        $pr = PurchaseRequest::create([
            'request_number' => 'PR-2026-TEST-002',
            'user_id' => $requester->id,
            'department_id' => $dept->id,
            'status' => 'PENDING_EXECUTIVE_APPROVAL',
            'procurement_route' => null,
            'total_estimated_cost' => 0,
        ]);

        PurchaseRequestItem::create([
            'purchase_request_id' => $pr->id,
            'item_description' => 'حديد تسليح 12 مم',
            'quantity' => 50,
            'uom' => 'طن',
        ]);

        $routedPr = $this->procurementService->approvePurchaseRequest(
            $procurementManager,
            $pr,
            'بدء مسار المنافسة لجمع 3 عروض أسعار'
        );

        $this->assertEquals('PENDING_QUOTE_RECOMMENDATIONS', $routedPr->status);
        $this->assertEquals('QUOTES', $routedPr->procurement_route);
    }
}
