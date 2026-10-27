<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestItem;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class GeneralManagerDecisionWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private User $generalManager;
    private User $requester;
    private User $reviewer;
    private Department $department;
    private Supplier $supplier;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);

        $this->department = Department::create([
            'name' => 'إدارة المشروعات',
            'code' => 'PRJ',
            'is_active' => true,
        ]);

        $this->supplier = Supplier::create([
            'company_name' => 'شركة التوريدات الحديثة',
            'code' => 'SUP-001',
            'is_active' => true,
        ]);

        $this->generalManager = $this->makeUser('gm@example.com', 'المدير العام', 'general_manager');
        $this->requester = $this->makeUser('eng@example.com', 'المهندس مقدم الطلب', 'employee');
        $this->reviewer = $this->makeUser('reviewer@example.com', 'مراجع القسم', 'reviewer');
        $this->department->update(['manager_user_id' => $this->reviewer->id]);
    }

    private function makeUser(string $email, string $name, string $roleSlug): User
    {
        $user = User::create([
            'department_id' => $this->department->id,
            'name' => $name,
            'email' => $email,
            'password' => Hash::make('Secret123!'),
            'is_active' => true,
        ]);
        $user->roles()->attach(Role::where('slug', $roleSlug)->firstOrFail()->id);
        return $user;
    }

    public function test_initial_unpriced_request_approval_routes_to_procurement_not_accounting(): void
    {
        // مثل PR-162: طلب جديد معتمد من المراجع، مساره غير محدد، ولم يتم تسعيره من المشتريات
        $pr = PurchaseRequest::create([
            'request_number' => 'PR-162-TEST',
            'user_id' => $this->requester->id,
            'department_id' => $this->department->id,
            'reviewer_user_id' => $this->reviewer->id,
            'site_engineer_user_id' => $this->reviewer->id,
            'priority' => 'HIGH',
            'status' => 'PENDING_EXECUTIVE_APPROVAL',
            'procurement_route' => 'UNDECIDED',
            'total_estimated_cost' => 0.00,
            'date_needed' => now()->addDays(5)->toDateString(),
        ]);

        PurchaseRequestItem::create([
            'purchase_request_id' => $pr->id,
            'item_description' => 'أسمنت بورتلاندي',
            'quantity' => 100,
            'uom' => 'TON',
            'estimated_unit_price' => 0.00,
            'estimated_line_total' => 0.00,
        ]);

        // تأكد من تصنيف الحالة التنفيذية للموديل
        $this->assertSame('INITIAL_APPROVAL', $pr->getExecutiveDecisionStage());
        $this->assertFalse($pr->isPricedForFinalApproval());

        $response = $this->actingAs($this->generalManager, 'sanctum')
            ->postJson("/api/v1/general-manager/purchase-requests/{$pr->id}/approve", [
                'comment' => 'موافقة مبدئية وإحالة للمشتريات للتسعير',
            ]);

        $response->assertOk()
            ->assertJsonPath('data.status', 'PENDING_PROCUREMENT_APPROVAL');

        $this->assertDatabaseHas('purchase_requests', [
            'id' => $pr->id,
            'status' => 'PENDING_PROCUREMENT_APPROVAL',
        ]);

        $this->assertDatabaseHas('approval_history', [
            'target_id' => $pr->id,
            'action' => 'APPROVED_BY_EXECUTIVE',
            'to_state' => 'PENDING_PROCUREMENT_APPROVAL',
        ]);
    }

    public function test_final_priced_request_approval_routes_to_accounting(): void
    {
        // مثل PR-160: تم تسعيره وتحديد المورد من إدارة المشتريات
        $pr = PurchaseRequest::create([
            'request_number' => 'PR-160-TEST',
            'user_id' => $this->requester->id,
            'department_id' => $this->department->id,
            'reviewer_user_id' => $this->reviewer->id,
            'site_engineer_user_id' => $this->reviewer->id,
            'direct_supplier_id' => $this->supplier->id,
            'priority' => 'NORMAL',
            'status' => 'PENDING_EXECUTIVE_APPROVAL',
            'procurement_route' => 'DIRECT',
            'total_estimated_cost' => 25000.00,
            'date_needed' => now()->addDays(3)->toDateString(),
        ]);

        PurchaseRequestItem::create([
            'purchase_request_id' => $pr->id,
            'item_description' => 'حديد تسليح 12 مم',
            'quantity' => 5,
            'uom' => 'TON',
            'supplier_id' => $this->supplier->id,
            'estimated_unit_price' => 5000.00,
            'estimated_line_total' => 25000.00,
        ]);

        // تأكد من تصنيف الحالة التنفيذية للموديل
        $this->assertSame('FINAL_APPROVAL', $pr->getExecutiveDecisionStage());
        $this->assertTrue($pr->isPricedForFinalApproval());

        $response = $this->actingAs($this->generalManager, 'sanctum')
            ->postJson("/api/v1/general-manager/purchase-requests/{$pr->id}/approve", [
                'comment' => 'معتمد نهائياً بعد مراجعة أسعار المشتريات',
            ]);

        $response->assertOk()
            ->assertJsonPath('data.status', 'PENDING_ACCOUNTING_APPROVAL');

        $this->assertDatabaseHas('purchase_requests', [
            'id' => $pr->id,
            'status' => 'PENDING_ACCOUNTING_APPROVAL',
        ]);

        $this->assertDatabaseHas('approval_history', [
            'target_id' => $pr->id,
            'action' => 'APPROVED_BY_EXECUTIVE',
            'to_state' => 'PENDING_ACCOUNTING_APPROVAL',
        ]);
    }

    public function test_executive_can_reject_request_with_reason(): void
    {
        $pr = PurchaseRequest::create([
            'request_number' => 'PR-REJECT-TEST',
            'user_id' => $this->requester->id,
            'department_id' => $this->department->id,
            'reviewer_user_id' => $this->reviewer->id,
            'site_engineer_user_id' => $this->reviewer->id,
            'status' => 'PENDING_EXECUTIVE_APPROVAL',
            'procurement_route' => 'UNDECIDED',
            'total_estimated_cost' => 0.00,
            'date_needed' => now()->toDateString(),
        ]);

        $response = $this->actingAs($this->generalManager, 'sanctum')
            ->postJson("/api/v1/general-manager/purchase-requests/{$pr->id}/reject", [
                'comment' => 'لا توجد حاجة فعلية لهذه الكميات حالياً بالموقع',
            ]);

        $response->assertOk()
            ->assertJsonPath('data.status', 'REJECTED');

        $this->assertDatabaseHas('purchase_requests', [
            'id' => $pr->id,
            'status' => 'REJECTED',
            'rejection_reason' => 'لا توجد حاجة فعلية لهذه الكميات حالياً بالموقع',
        ]);
    }

    public function test_double_approval_is_prevented_by_backend(): void
    {
        $pr = PurchaseRequest::create([
            'request_number' => 'PR-DOUBLE-APP-TEST',
            'user_id' => $this->requester->id,
            'department_id' => $this->department->id,
            'reviewer_user_id' => $this->reviewer->id,
            'site_engineer_user_id' => $this->reviewer->id,
            'status' => 'PENDING_EXECUTIVE_APPROVAL',
            'procurement_route' => 'UNDECIDED',
            'total_estimated_cost' => 0.00,
            'date_needed' => now()->toDateString(),
        ]);

        // الاعتماد الأول ينجح
        $first = $this->actingAs($this->generalManager, 'sanctum')
            ->postJson("/api/v1/general-manager/purchase-requests/{$pr->id}/approve");
        $first->assertOk();

        // المحاولة الثانية يجب أن تفشل لأن الطلب لم يعد PENDING_EXECUTIVE_APPROVAL
        $second = $this->actingAs($this->generalManager, 'sanctum')
            ->postJson("/api/v1/general-manager/purchase-requests/{$pr->id}/approve");

        $this->assertTrue(in_array($second->status(), [400, 404, 422, 500], true));
    }
}
