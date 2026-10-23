<?php

namespace Tests\Feature;

use App\Models\ApprovalHistory;
use App\Models\Category;
use App\Models\Department;
use App\Models\Item;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestItem;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class PurchaseRequestCancellationTest extends TestCase
{
    use RefreshDatabase;

    private User $requester;
    private User $reviewer;
    private User $otherUser;
    private Department $department;
    private Category $category;
    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);

        $this->department = Department::firstOrCreate(
            ['code' => 'TEST-DEPT'],
            ['name' => 'إدارة الاختبارات', 'is_active' => true]
        );

        $this->requester = $this->makeUser('requester@example.com', 'مقدم الطلب', 'employee');
        $this->reviewer = $this->makeUser('reviewer@example.com', 'المراجع', 'reviewer');
        $this->otherUser = $this->makeUser('other@example.com', 'موظف آخر', 'employee');

        $this->category = Category::create([
            'name' => 'أدوات ومهمات',
            'code' => 'TOOLS',
            'is_active' => true,
        ]);

        $this->item = Item::create([
            'category_id' => $this->category->id,
            'name' => 'طابعة ليزرية',
            'sku' => 'PRN-001',
            'uom' => 'piece',
            'is_active' => true,
        ]);
    }

    private function makeUser(string $email, string $name, string $roleSlug): User
    {
        $user = User::create([
            'name' => $name,
            'email' => $email,
            'password' => Hash::make('password123'),
            'department_id' => $this->department->id,
            'is_active' => true,
        ]);

        $role = Role::where('slug', $roleSlug)->first();
        if ($role) {
            $user->roles()->syncWithoutDetaching([$role->id]);
        }

        return $user;
    }

    public function test_requester_can_cancel_rejected_purchase_request_and_audit_history_is_preserved(): void
    {
        // 1. Create a rejected PR
        $pr = PurchaseRequest::create([
            'request_number' => 'PR-TEST-REJECTED',
            'user_id' => $this->requester->id,
            'department_id' => $this->department->id,
            'status' => 'REJECTED',
            'priority' => 'HIGH',
            'notes' => 'شراء طابعة للمكتب الفرعي',
        ]);

        PurchaseRequestItem::create([
            'purchase_request_id' => $pr->id,
            'item_id' => $this->item->id,
            'item_description' => 'طابعة ليزرية للمكتب',
            'quantity' => 1,
            'uom' => 'piece',
            'status' => 'PENDING',
        ]);

        // Prior rejection history
        ApprovalHistory::create([
            'target_type' => PurchaseRequest::class,
            'target_id' => $pr->id,
            'actor_user_id' => $this->reviewer->id,
            'action' => 'REJECTED',
            'from_state' => 'UNDER_REVIEW',
            'to_state' => 'REJECTED',
            'comments' => 'تم الرفض لعدم توفر ميزانية حالية',
        ]);

        // 2. Requester cancels the rejected request
        $response = $this->actingAs($this->requester, 'sanctum')
            ->postJson("/api/v1/purchase-requests/{$pr->id}/cancel", [
                'reason' => 'تم الاستغناء عن الشراء لعدم الحاجة',
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.status', 'CANCELLED');

        // 3. Verify Database state
        $pr->refresh();
        $this->assertEquals('CANCELLED', $pr->status);

        // 4. Verify ApprovalHistory contains both the prior REJECTED record and the new CANCELLED record
        $history = ApprovalHistory::where('target_type', PurchaseRequest::class)
            ->where('target_id', $pr->id)
            ->orderBy('id', 'asc')
            ->get();

        $this->assertCount(2, $history);
        $this->assertEquals('REJECTED', $history[0]->action);
        $this->assertEquals('CANCELLED', $history[1]->action);
        $this->assertEquals('REJECTED', $history[1]->from_state);
        $this->assertEquals('CANCELLED', $history[1]->to_state);
        $this->assertEquals($this->requester->id, $history[1]->actor_user_id);
    }

    public function test_cannot_cancel_already_cancelled_purchase_request(): void
    {
        $pr = PurchaseRequest::create([
            'request_number' => 'PR-TEST-ALREADY-CANCELLED',
            'user_id' => $this->requester->id,
            'department_id' => $this->department->id,
            'status' => 'CANCELLED',
            'priority' => 'NORMAL',
            'notes' => 'طلب ملغي مسبقا',
        ]);

        $response = $this->actingAs($this->requester, 'sanctum')
            ->postJson("/api/v1/purchase-requests/{$pr->id}/cancel");

        $response->assertStatus(409)
            ->assertJsonFragment(['message' => 'طلب الشراء ملغي بالفعل ولا يمكن إلغاؤه مرة أخرى.']);
    }

    public function test_cannot_cancel_approved_purchase_request(): void
    {
        $pr = PurchaseRequest::create([
            'request_number' => 'PR-TEST-APPROVED',
            'user_id' => $this->requester->id,
            'department_id' => $this->department->id,
            'status' => 'APPROVED_BY_REVIEWER',
            'priority' => 'HIGH',
            'notes' => 'طلب معتمد',
        ]);

        $response = $this->actingAs($this->requester, 'sanctum')
            ->postJson("/api/v1/purchase-requests/{$pr->id}/cancel");

        $response->assertStatus(422);
    }

    public function test_unauthorized_user_cannot_cancel_another_users_request(): void
    {
        $pr = PurchaseRequest::create([
            'request_number' => 'PR-TEST-OTHERS',
            'user_id' => $this->requester->id,
            'department_id' => $this->department->id,
            'status' => 'REJECTED',
            'priority' => 'NORMAL',
            'notes' => 'طلب يخص عمرو بيومي',
        ]);

        $response = $this->actingAs($this->otherUser, 'sanctum')
            ->postJson("/api/v1/purchase-requests/{$pr->id}/cancel");

        $response->assertStatus(403);
    }
}
