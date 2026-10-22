<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Department;
use App\Models\Item;
use App\Models\PurchaseRequest;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class PurchaseRequestPurposeLifecycleTest extends TestCase
{
    use RefreshDatabase;

    private User $requester;
    private User $reviewer;
    private User $generalManager;
    private Department $department;
    private Category $category;
    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);

        $this->department = Department::firstOrCreate(
            ['code' => 'SALES'],
            ['name' => 'إدارة المبيعات', 'is_active' => true]
        );

        $this->requester = $this->makeUser('amr.bayoumi@example.com', 'عمرو بيومي', 'employee');
        $this->reviewer = $this->makeUser('reviewer@example.com', 'المراجع الفني', 'reviewer');
        $this->generalManager = $this->makeUser('gm@example.com', 'المدير العام التنفيذي', 'general_manager');

        $this->department->update([
            'manager_user_id' => $this->reviewer->id,
            'site_engineer_user_id' => $this->reviewer->id,
        ]);

        $this->category = Category::create([
            'name' => 'أجهزة مكتبية',
            'code' => 'OFFICE-EQUIPMENT',
            'is_active' => true,
        ]);

        $this->item = Item::create([
            'sku' => 'TABLET-001',
            'name' => 'تابلت ميداني سامسونج',
            'category_id' => $this->category->id,
            'default_estimated_price' => 17500.00,
            'is_active' => true,
        ]);
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

    public function test_purchase_request_purpose_lifecycle_from_creation_to_general_manager(): void
    {
        $originalPurpose = 'توريد وتركيب أجهزة تابلت ميدانية لمشرفي الموقع لفحص ومطابقة الاستلامات';

        // 1. Creation by Requester: must store purpose in database and API response
        $createPayload = [
            'request_type' => 'OFFICE_SUPPLIES',
            'target_department_id' => $this->department->id,
            'date_needed' => now()->addDays(5)->format('Y-m-d'),
            'priority' => 'HIGH',
            'notes' => $originalPurpose,
            'items' => [
                [
                    'item_id' => $this->item->id,
                    'item_description' => 'تابلت ميداني سامسونج',
                    'quantity' => 3,
                    'uom' => 'PCS',
                ],
            ],
        ];

        $createResponse = $this->actingAs($this->requester)
            ->postJson('/api/v1/purchase-requests', $createPayload);

        $createResponse->assertStatus(201)
            ->assertJsonPath('data.notes', $originalPurpose)
            ->assertJsonPath('data.purpose', $originalPurpose);

        $prId = $createResponse->json('data.id');

        // 2. Submit Request
        $submitResponse = $this->actingAs($this->requester)
            ->postJson("/api/v1/purchase-requests/{$prId}/submit", [
                'comment' => 'إرسال للاعتماد',
            ]);

        $submitResponse->assertStatus(200)
            ->assertJsonPath('data.notes', $originalPurpose)
            ->assertJsonPath('data.purpose', $originalPurpose);

        // Verify direct DB persistence
        $pr = PurchaseRequest::findOrFail($prId);
        $this->assertSame($originalPurpose, $pr->notes);
        $this->assertSame($originalPurpose, $pr->purpose);

        // 3. Reviewer Stage: Check Reviewer can see exact purpose
        $reviewerViewResponse = $this->actingAs($this->reviewer)
            ->getJson("/api/v1/purchase-requests/{$prId}");

        $reviewerViewResponse->assertStatus(200)
            ->assertJsonPath('data.notes', $originalPurpose)
            ->assertJsonPath('data.purpose', $originalPurpose);

        // Reviewer approves the request to the Executive stage
        $reviewerApproveResponse = $this->actingAs($this->reviewer)
            ->postJson("/api/v1/reviewer/purchase-requests/{$prId}/approve", [
                'comment' => 'موافق فنيًا',
            ]);
        $reviewerApproveResponse->assertStatus(200);

        // 4. General Manager Stage: Check General Manager sees exact purpose
        $gmViewResponse = $this->actingAs($this->generalManager)
            ->getJson("/api/v1/purchase-requests/{$prId}");

        $gmViewResponse->assertStatus(200)
            ->assertJsonPath('data.notes', $originalPurpose)
            ->assertJsonPath('data.purpose', $originalPurpose);

        // Check Executive list endpoint
        $gmListResponse = $this->actingAs($this->generalManager)
            ->getJson('/api/v1/general-manager/purchase-requests');

        $gmListResponse->assertStatus(200);
        $matchedPr = collect($gmListResponse->json('data'))->firstWhere('id', $prId);
        $this->assertNotNull($matchedPr, 'Request should be visible to General Manager');
        $this->assertSame($originalPurpose, $matchedPr['notes']);
        $this->assertSame($originalPurpose, $matchedPr['purpose']);

        // Check Dashboard Pending Tasks endpoint for General Manager
        $tasksResponse = $this->actingAs($this->generalManager)
            ->getJson('/api/v1/dashboard/pending-tasks');

        $tasksResponse->assertStatus(200);
        $matchedTask = collect($tasksResponse->json('data'))->firstWhere('rawId', $prId);
        $this->assertNotNull($matchedTask, 'Task should appear in Executive Pending Tasks');
        $this->assertSame($originalPurpose, $matchedTask['purpose']);
        $this->assertSame($originalPurpose, $matchedTask['notes']);

        // 5. Simulate page reloads / fresh DB fetches
        $freshPr = PurchaseRequest::find($prId);
        $this->assertSame($originalPurpose, $freshPr->notes);
        $this->assertSame($originalPurpose, $freshPr->purpose);
    }
}
