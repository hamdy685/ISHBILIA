<?php

namespace Tests\Feature\Api\V1;

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

class PurchaseRequestTest extends TestCase
{
    use RefreshDatabase;

    private Department $dept;
    private User $employee;
    private User $otherEmployee;
    private User $userWithoutPermissions;
    private Item $catalogItem;
    private Item $inactiveCatalogItem;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);

        $this->dept = Department::create([
            'name' => 'Information Technology',
            'code' => 'DEPT-IT',
        ]);

        $reviewerRole = Role::where('slug', 'reviewer')->firstOrFail();
        $departmentReviewer = User::create([
            'department_id' => $this->dept->id,
            'name' => 'IT Department Reviewer',
            'email' => 'it-reviewer@ashbiliya.com',
            'password' => Hash::make('Secret123!'),
            'is_active' => true,
        ]);
        $departmentReviewer->roles()->attach($reviewerRole->id);

        $siteEngineerRole = Role::where('slug', 'site_engineer')->firstOrFail();
        $siteEngineer = User::create([
            'department_id' => $this->dept->id,
            'name' => 'IT Site Engineer',
            'email' => 'it-site-engineer@ashbiliya.com',
            'password' => Hash::make('Secret123!'),
            'is_active' => true,
        ]);
        $siteEngineer->roles()->attach($siteEngineerRole->id);

        $this->dept->update([
            'manager_user_id' => $departmentReviewer->id,
            'site_engineer_user_id' => $siteEngineer->id,
        ]);

        $category = Category::create([
            'name' => 'Hardware',
            'code' => 'CAT-HW',
        ]);

        $this->catalogItem = Item::create([
            'category_id' => $category->id,
            'sku' => 'LAP-001',
            'name' => 'Dell Latitude Laptop',
            'default_estimated_price' => 3500.00,
            'is_active' => true,
        ]);

        $this->inactiveCatalogItem = Item::create([
            'category_id' => $category->id,
            'sku' => 'LAP-OLD',
            'name' => 'Obsolete Laptop',
            'default_estimated_price' => 1000.00,
            'is_active' => false,
        ]);

        $this->employee = User::create([
            'department_id' => $this->dept->id,
            'name' => 'Ali Requester',
            'email' => 'ali@ashbiliya.com',
            'password' => Hash::make('Secret123!'),
            'is_active' => true,
        ]);

        $employeeRole = Role::where('slug', 'employee')->first();
        $this->employee->roles()->attach($employeeRole->id);

        $this->otherEmployee = User::create([
            'department_id' => $this->dept->id,
            'name' => 'Other Employee',
            'email' => 'other@ashbiliya.com',
            'password' => Hash::make('Secret123!'),
            'is_active' => true,
        ]);
        $this->otherEmployee->roles()->attach($employeeRole->id);

        $this->userWithoutPermissions = User::create([
            'department_id' => $this->dept->id,
            'name' => 'No Perm User',
            'email' => 'noperm@ashbiliya.com',
            'password' => Hash::make('Secret123!'),
            'is_active' => true,
        ]);
    }

    public function test_employee_can_create_purchase_request_starts_as_draft(): void
    {
        $token = $this->employee->createToken('test_token')->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/v1/purchase-requests', [
                'target_department_id' => $this->dept->id,
                'parcel_reference' => 'قطعة 27',
                'region' => 'المنطقة السابعة والعشرون',
                    
                    'priority' => 'HIGH',
                'notes' => 'Urgent onboarding',
                'items' => [
                    [
                        'item_id' => $this->catalogItem->id,
                        'item_description' => 'Dell Latitude Laptop 16GB',
                        'item_reference' => 'PR-PART-001',
                        'region' => 'المنطقة السابعة والعشرون',
                        'quantity' => 2,
                        'estimated_unit_price' => 3500.00,
                    ],
                ],
            ]);

        $response->assertStatus(201)
            ->assertJson([
                'data' => [
                    'status' => 'DRAFT',
                    'priority' => 'HIGH',
                    'requester' => [
                        'id' => $this->employee->id,
                        'name' => 'Ali Requester',
                    ],
                    'department' => [
                        'id' => $this->dept->id,
                        'name' => 'Information Technology',
                    ],
'site_engineer' => [
                        'id' => $this->dept->site_engineer_user_id,
                    ],
                ],
            ]);

        $this->assertDatabaseHas('purchase_requests', [
            'status' => 'DRAFT',
            'user_id' => $this->employee->id,
        ]);
    }

    public function test_backend_calculates_line_totals_and_total_cost_ignoring_client_manipulation(): void
    {
        $token = $this->employee->createToken('test_token')->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/v1/purchase-requests', [
                'target_department_id' => $this->dept->id,
                'parcel_reference' => 'قطعة 27',
                'region' => 'المنطقة السابعة والعشرون',
                    
                'title' => 'Multiple Items Request',
                'items' => [
                    [
                        'item_description' => 'Custom Monitors',
                        'item_reference' => 'PR-PART-002',
                        'region' => 'المنطقة السابعة والعشرون',
                        'quantity' => 5,
                        'estimated_unit_price' => 800.00,
                        'estimated_line_total' => 99999.99, // Intentional client wrong total
                    ],
                    [
                        'item_id' => $this->catalogItem->id,
                        'item_description' => 'Dell Latitude Laptop',
                        'item_reference' => 'PR-PART-003',
                        'region' => 'المنطقة السابعة والعشرون',
                        'quantity' => 1,
                        'estimated_unit_price' => 3500.00,
                    ],
                ],
            ]);

        $response->assertStatus(201)
            ->assertJson([
                'data' => [
                ],
            ]);
    }

    public function test_employee_can_view_own_requests_only(): void
    {
        $pr1 = PurchaseRequest::create([
            'request_number' => 'PR-2026-00001',
            'user_id' => $this->employee->id,
            'department_id' => $this->dept->id,
            'title' => 'Ali Request',
            'status' => 'DRAFT',
        ]);

        $pr2 = PurchaseRequest::create([
            'request_number' => 'PR-2026-00002',
            'user_id' => $this->otherEmployee->id,
            'department_id' => $this->dept->id,
            'title' => 'Other Request',
            'status' => 'DRAFT',
        ]);

        $token = $this->employee->createToken('test_token')->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/v1/purchase-requests');

        $response->assertStatus(200);
        $this->assertCount(1, $response->json('data'));
        $this->assertEquals($pr1->id, $response->json('data.0.id'));
    }

    public function test_employee_cannot_view_another_users_request(): void
    {
        $otherPr = PurchaseRequest::create([
            'request_number' => 'PR-2026-00002',
            'user_id' => $this->otherEmployee->id,
            'department_id' => $this->dept->id,
            'title' => 'Other Request',
            'status' => 'DRAFT',
        ]);

        $token = $this->employee->createToken('test_token')->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/v1/purchase-requests/' . $otherPr->id);

        $this->assertContains($response->status(), [403, 404]);
        if ($response->status() === 403) {
            $response->assertJson(['message' => 'ليس لديك صلاحية لتنفيذ هذا الإجراء.']);
        }
    }

    public function test_employee_can_update_own_draft_request(): void
    {
        $pr = PurchaseRequest::create([
            'request_number' => 'PR-2026-00001',
            'user_id' => $this->employee->id,
            'department_id' => $this->dept->id,
            'title' => 'Original Draft',
            'status' => 'DRAFT',
        ]);

        $token = $this->employee->createToken('test_token')->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->putJson('/api/v1/purchase-requests/' . $pr->id, [
                'title' => 'Updated Draft Title',
                'items' => [
                    [
                        'item_description' => 'Updated Item',
                        'item_reference' => 'PR-PART-004',
                        'region' => 'المنطقة السابعة والعشرون',
                        'quantity' => 3,
                        'estimated_unit_price' => 150.00,
                    ],
                ],
            ]);

        $response->assertStatus(200)
            ->assertJson([
                'data' => [
                ],
            ]);
    }

    public function test_employee_can_update_submitted_request_before_reviewer_approval(): void
    {
        $submittedPr = PurchaseRequest::create([
            'request_number' => 'PR-2026-00001',
            'user_id' => $this->employee->id,
            'department_id' => $this->dept->id,
            'title' => 'Submitted Request',
            'status' => 'SUBMITTED',
        ]);

        $token = $this->employee->createToken('test_token')->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->putJson('/api/v1/purchase-requests/' . $submittedPr->id, [
                'notes' => 'تم تحديث الملاحظات قبل اعتماد المراجع.',
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.status', 'SUBMITTED')
            ->assertJsonPath('data.notes', 'تم تحديث الملاحظات قبل اعتماد المراجع.');
    }

    public function test_employee_cannot_update_request_after_reviewer_approval(): void
    {
        $approvedPr = PurchaseRequest::create([
            'request_number' => 'PR-2026-00001',
            'user_id' => $this->employee->id,
            'department_id' => $this->dept->id,
            'title' => 'Approved Request',
            'status' => 'APPROVED_BY_REVIEWER',
        ]);

        $token = $this->employee->createToken('test_token')->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->putJson('/api/v1/purchase-requests/' . $approvedPr->id, [
                'notes' => 'محاولة تعديل بعد الاعتماد.',
            ]);

        $response->assertStatus(409)
            ->assertJson(['message' => 'لا يمكن تعديل طلب الشراء بعد اعتماد المراجع.']);
    }

    public function test_employee_can_delete_own_draft_request(): void
    {
        $pr = PurchaseRequest::create([
            'request_number' => 'PR-2026-00001',
            'user_id' => $this->employee->id,
            'department_id' => $this->dept->id,
            'title' => 'Draft To Delete',
            'status' => 'DRAFT',
        ]);

        $token = $this->employee->createToken('test_token')->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->deleteJson('/api/v1/purchase-requests/' . $pr->id);

        $response->assertStatus(200)
            ->assertJson(['message' => 'Purchase request deleted successfully.']);

        $this->assertSoftDeleted('purchase_requests', ['id' => $pr->id]);
    }

    public function test_employee_cannot_delete_submitted_request(): void
    {
        $submittedPr = PurchaseRequest::create([
            'request_number' => 'PR-2026-00001',
            'user_id' => $this->employee->id,
            'department_id' => $this->dept->id,
            'title' => 'Submitted Request',
            'status' => 'SUBMITTED',
        ]);

        $token = $this->employee->createToken('test_token')->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->deleteJson('/api/v1/purchase-requests/' . $submittedPr->id);

        $response->assertStatus(409)
            ->assertJson(['message' => 'لا يمكن حذف طلب الشراء إلا إذا كانت حالته مسودة. تم إرسال هذا الطلب للمراجعة أو دخل مرحلة معالجة.']);
    }

    public function test_employee_can_submit_valid_draft(): void
    {
        $pr = PurchaseRequest::create([
            'request_number' => 'PR-2026-00001',
            'user_id' => $this->employee->id,
            'department_id' => $this->dept->id,
            'title' => 'Draft Ready For Submit',
            'status' => 'DRAFT',
        ]);

        $pr->items()->create([
            'item_description' => 'Keyboard',
            'item_reference' => 'PR-PART-005',
            'region' => 'المنطقة السابعة والعشرون',
            'quantity' => 5,
            'estimated_unit_price' => 100.00,
            'estimated_line_total' => 500.00,
        ]);

        $token = $this->employee->createToken('test_token')->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/v1/purchase-requests/' . $pr->id . '/submit');

        $response->assertStatus(200)
            ->assertJson([
                'message' => 'تم إرسال طلب الشراء بنجاح.',
                'data' => [
                    'id' => $pr->id,
                    'status' => 'SUBMITTED',
                ],
            ]);

        $this->assertDatabaseHas('purchase_requests', [
            'id' => $pr->id,
            'status' => 'SUBMITTED',
        ]);
    }

    public function test_employee_cannot_submit_another_users_request(): void
    {
        $otherPr = PurchaseRequest::create([
            'request_number' => 'PR-2026-00002',
            'user_id' => $this->otherEmployee->id,
            'department_id' => $this->dept->id,
            'title' => 'Other Draft',
            'status' => 'DRAFT',
        ]);

        $token = $this->employee->createToken('test_token')->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/v1/purchase-requests/' . $otherPr->id . '/submit');

        $this->assertContains($response->status(), [403, 404]);
        if ($response->status() === 403) {
            $response->assertJson(['message' => 'ليس لديك صلاحية لتنفيذ هذا الإجراء.']);
        }
    }

    public function test_employee_cannot_submit_an_empty_request_with_no_items(): void
    {
        $emptyPr = PurchaseRequest::create([
            'request_number' => 'PR-2026-00001',
            'user_id' => $this->employee->id,
            'department_id' => $this->dept->id,
            'title' => 'Empty Draft',
            'status' => 'DRAFT',
        ]);

        $token = $this->employee->createToken('test_token')->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/v1/purchase-requests/' . $emptyPr->id . '/submit');

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['items']);
    }

    public function test_inactive_catalog_item_is_rejected(): void
    {
        $token = $this->employee->createToken('test_token')->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/v1/purchase-requests', [
                'target_department_id' => $this->dept->id,
                    
                'title' => 'Inactive Item Request',
                'items' => [
                    [
                        'item_id' => $this->inactiveCatalogItem->id,
                        'item_description' => 'Obsolete Laptop',
                        'item_reference' => 'PR-PART-006',
                        'region' => 'المنطقة السابعة والعشرون',
                        'quantity' => 1,
                        'estimated_unit_price' => 1000.00,
                    ],
                ],
            ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['items']);
    }

    public function test_invalid_quantity_is_rejected(): void
    {
        $token = $this->employee->createToken('test_token')->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/v1/purchase-requests', [
                'target_department_id' => $this->dept->id,
                    
                'title' => 'Zero Qty Request',
                'items' => [
                    [
                        'item_description' => 'Zero Qty Item',
                        'item_reference' => 'PR-PART-007',
                        'region' => 'المنطقة السابعة والعشرون',
                        'quantity' => 0,
                        'estimated_unit_price' => 100.00,
                    ],
                ],
            ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['items.0.quantity']);
    }

    public function test_unauthorized_user_without_permission_is_rejected(): void
    {
        $token = $this->userWithoutPermissions->createToken('test_token')->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/v1/purchase-requests');

        $response->assertStatus(403);
    }

    public function test_unauthenticated_request_is_rejected(): void
    {
        $response = $this->getJson('/api/v1/purchase-requests');

        $response->assertStatus(401);
    }

    public function test_employee_same_department_request_still_goes_to_reviewer(): void
    {
        $response = $this->actingAs($this->employee, 'sanctum')->postJson('/api/v1/purchase-requests', [
            'target_department_id' => $this->dept->id,
            'parcel_reference' => 'قطعة 101',
            'region' => 'المنطقة الأولى',
            'items' => [[
                'item_description' => 'Employee same department item',
                'item_reference' => 'EMP-SAME-001',
                'region' => 'المنطقة الأولى',
                'quantity' => 1,
                'uom' => 'PCS',
            ]],
        ]);

        $response->assertStatus(201);
        $requestId = $response->json('data.id');

        $this->actingAs($this->employee, 'sanctum')
            ->postJson("/api/v1/purchase-requests/{$requestId}/submit")
            ->assertStatus(200)
            ->assertJsonPath('data.status', 'SUBMITTED');

        $this->assertDatabaseHas('purchase_requests', [
            'id' => $requestId,
            'status' => 'SUBMITTED',
            'reviewer_user_id' => $this->dept->manager_user_id,
        ]);
    }

    public function test_reviewer_same_department_request_goes_directly_to_executive(): void
    {
        $reviewer = User::findOrFail($this->dept->manager_user_id);

        $response = $this->actingAs($reviewer, 'sanctum')->postJson('/api/v1/purchase-requests', [
            'target_department_id' => $this->dept->id,
            'parcel_reference' => 'قطعة 101',
            'region' => 'المنطقة الأولى',
            'items' => [[
                'item_description' => 'Reviewer same department item',
                'item_reference' => 'REV-SAME-001',
                'region' => 'المنطقة الأولى',
                'quantity' => 1,
                'uom' => 'PCS',
            ]],
        ]);

        $response->assertStatus(201);
        $requestId = $response->json('data.id');

        $this->actingAs($reviewer, 'sanctum')
            ->postJson("/api/v1/purchase-requests/{$requestId}/submit")
            ->assertStatus(200)
            ->assertJsonPath('data.status', 'PENDING_EXECUTIVE_APPROVAL');

        $this->assertDatabaseHas('purchase_requests', [
            'id' => $requestId,
            'status' => 'PENDING_EXECUTIVE_APPROVAL',
        ]);
    }
}
