<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\MaterialTransferItem;
use App\Models\MaterialTransferRequest;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class MaterialTransferLifecycleTest extends TestCase
{
    use RefreshDatabase;

    private Department $department;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);

        $this->department = Department::firstOrCreate(
            ['code' => 'ENG'],
            ['name' => 'إدارة التنفيذ والمشروعات', 'is_active' => true]
        );
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
        $role = Role::where('slug', $roleSlug)->first();
        if ($role) {
            $user->roles()->attach($role->id);
        }
        return $user;
    }

    public function test_engineer_can_create_material_transfer_request(): void
    {
        $engineer = $this->makeUser('engineer@example.com', 'مهندس الموقع', 'employee');

        $payload = [
            'from_project' => 'مشروع برج الأمل',
            'to_project' => 'مشروع كمبوند الزهور',
            'transfer_date' => '2026-10-25',
            'driver_name' => 'حسام البدري',
            'vehicle_plate_number' => 'ق ر س 4567',
            'items' => [
                [
                    'item_description' => 'حديد تسليح 12 مم',
                    'uom' => 'طن',
                    'quantity' => 15,
                    'notes' => 'مرصوص وجاهز للنقل',
                ],
                [
                    'item_description' => 'أسمنت أسود ممتاز',
                    'uom' => 'شيكارة',
                    'quantity' => 300,
                    'notes' => '',
                ]
            ]
        ];

        $response = $this->actingAs($engineer, 'sanctum')
            ->postJson('/api/v1/material-transfers', $payload);

        $response->assertStatus(201);
        $this->assertDatabaseHas('material_transfer_requests', [
            'from_project' => 'مشروع برج الأمل',
            'to_project' => 'مشروع كمبوند الزهور',
            'driver_name' => 'حسام البدري',
            'status' => 'PENDING_REVIEWER',
        ]);

        $transfer = MaterialTransferRequest::first();
        $this->assertCount(2, $transfer->items);
        $this->assertStringStartsWith('MTR-', $transfer->request_number);
    }

    public function test_reviewer_can_approve_material_transfer_request(): void
    {
        $engineer = $this->makeUser('engineer2@example.com', 'مهندس الموقع 2', 'employee');

        $transfer = MaterialTransferRequest::create([
            'user_id' => $engineer->id,
            'status' => 'PENDING_REVIEWER',
            'transfer_date' => '2026-10-25',
            'from_project' => 'مشروع النرجس',
            'to_project' => 'مشروع الياسمين',
        ]);

        $reviewer = $this->makeUser('reviewer@example.com', 'المراجع العام', 'reviewer');

        $response = $this->actingAs($reviewer, 'sanctum')
            ->postJson("/api/v1/material-transfers/{$transfer->id}/approve", [
                'notes' => 'معتمد وجاهز للتحميل والإحالة للحسابات',
            ]);

        $response->assertStatus(200);
        $transfer->refresh();

        $this->assertEquals(MaterialTransferRequest::STATUS_PENDING_ACCOUNTING, $transfer->status);
        $this->assertEquals($reviewer->id, $transfer->reviewer_id);
        $this->assertNotNull($transfer->reviewed_at);
        $this->assertEquals('معتمد وجاهز للتحميل والإحالة للحسابات', $transfer->review_notes);
    }

    public function test_accountant_can_archive_material_transfer_request(): void
    {
        $engineer = $this->makeUser('engineer3@example.com', 'مهندس الموقع 3', 'employee');
        $reviewer = $this->makeUser('reviewer2@example.com', 'المراجع العام 2', 'reviewer');

        $transfer = MaterialTransferRequest::create([
            'user_id' => $engineer->id,
            'reviewer_id' => $reviewer->id,
            'reviewed_at' => now(),
            'status' => MaterialTransferRequest::STATUS_PENDING_ACCOUNTING,
            'transfer_date' => '2026-10-25',
            'from_project' => 'مشروع النرجس',
            'to_project' => 'مشروع الياسمين',
        ]);

        $accountant = $this->makeUser('accountant@example.com', 'المحاسب المالي', 'accountant');

        $response = $this->actingAs($accountant, 'sanctum')
            ->postJson("/api/v1/material-transfers/{$transfer->id}/process-archive", [
                'accounting_notes' => 'تم توجيه القيد المحاسبي على مراكز التكلفة',
            ]);

        $response->assertStatus(200);
        $transfer->refresh();

        $this->assertEquals(MaterialTransferRequest::STATUS_ARCHIVED, $transfer->status);
        $this->assertEquals($accountant->id, $transfer->accountant_id);
        $this->assertNotNull($transfer->accounted_at);
        $this->assertEquals('تم توجيه القيد المحاسبي على مراكز التكلفة', $transfer->accounting_notes);

        // Check it appears in Archive endpoint
        $archiveRes = $this->actingAs($accountant, 'sanctum')
            ->getJson('/api/v1/material-transfers/archive');

        $archiveRes->assertStatus(200);
        $archiveRes->assertJsonFragment([
            'id' => $transfer->id,
            'status' => 'ARCHIVED',
        ]);
    }
}
