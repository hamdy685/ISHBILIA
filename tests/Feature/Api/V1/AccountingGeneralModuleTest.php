<?php

namespace Tests\Feature\Api\V1;

use App\Models\Accounting\Account;
use App\Models\Accounting\CostCenter;
use App\Models\Department;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AccountingGeneralModuleTest extends TestCase
{
    use RefreshDatabase;

    private User $accountant;
    private User $employee;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);

        $dept = Department::create([
            'name' => 'Financial Department',
            'code' => 'DEPT-ACC',
        ]);

        $accountantRole = Role::where('slug', 'accountant')->first();
        $employeeRole = Role::where('slug', 'employee')->first();

        $this->accountant = User::create([
            'name' => 'General Accountant',
            'email' => 'accountant.test@alashbiliya.com',
            'password' => Hash::make('password123'),
            'department_id' => $dept->id,
            'is_active' => true,
        ]);
        $this->accountant->roles()->attach($accountantRole->id);

        $this->employee = User::create([
            'name' => 'Regular Employee',
            'email' => 'employee.test@alashbiliya.com',
            'password' => Hash::make('password123'),
            'department_id' => $dept->id,
            'is_active' => true,
        ]);
        $this->employee->roles()->attach($employeeRole->id);
    }

    public function test_unauthenticated_user_cannot_access_accounts_or_cost_centers(): void
    {
        $this->getJson('/api/v1/accounting/accounts')->assertStatus(401);
        $this->getJson('/api/v1/accounting/cost-centers')->assertStatus(401);
    }

    public function test_employee_without_permission_is_forbidden(): void
    {
        Sanctum::actingAs($this->employee);

        $this->getJson('/api/v1/accounting/accounts')->assertStatus(403);
        $this->getJson('/api/v1/accounting/cost-centers')->assertStatus(403);
    }

    public function test_accountant_can_fetch_chart_of_accounts_tree(): void
    {
        Sanctum::actingAs($this->accountant);

        $root = Account::create([
            'code' => '1',
            'name' => 'الأصول',
            'type' => 'asset',
            'is_active' => true,
        ]);

        $sub = Account::create([
            'code' => '11',
            'name' => 'الأصول المتداولة',
            'type' => 'asset',
            'parent_id' => $root->id,
            'is_active' => true,
        ]);

        $response = $this->getJson('/api/v1/accounting/accounts');
        $response->assertStatus(200)
            ->assertJsonStructure([
                'data' => [
                    '*' => ['id', 'code', 'name', 'type', 'is_active', 'children']
                ],
                'count'
            ]);

        $data = $response->json('data');
        $this->assertCount(1, $data);
        $this->assertEquals('1', $data[0]['code']);
        $this->assertCount(1, $data[0]['children']);
        $this->assertEquals('11', $data[0]['children'][0]['code']);
    }

    public function test_accountant_can_fetch_cost_centers(): void
    {
        Sanctum::actingAs($this->accountant);

        CostCenter::create([
            'code' => 'CC-01',
            'name' => 'مشروع أ',
            'is_active' => true,
        ]);

        CostCenter::create([
            'code' => 'CC-02',
            'name' => 'مشروع ب (متوقف)',
            'is_active' => false,
        ]);

        // Default: active only
        $resActive = $this->getJson('/api/v1/accounting/cost-centers');
        $resActive->assertStatus(200);
        $this->assertCount(1, $resActive->json('data'));
        $this->assertEquals('CC-01', $resActive->json('data.0.code'));

        // With all=1: all cost centers
        $resAll = $this->getJson('/api/v1/accounting/cost-centers?all=1');
        $resAll->assertStatus(200);
        $this->assertCount(2, $resAll->json('data'));
    }
}
