<?php

namespace Tests\Feature\Api\V1;

use App\Models\Accounting\Account;
use App\Models\Accounting\CostCenter;
use App\Models\Accounting\JournalEntry;
use App\Models\Accounting\JournalEntryLine;
use App\Models\Department;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CostCenterReportTest extends TestCase
{
    use RefreshDatabase;

    private User $accountant;
    private User $employee;
    private CostCenter $costCenterA;
    private CostCenter $costCenterB;
    private CostCenter $inactiveCenter;
    private Account $expenseAccount;
    private Account $payableAccount;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);

        $dept = Department::create([
            'name' => 'Finance & Accounting',
            'code' => 'DEPT-FIN',
        ]);

        $accountantRole = Role::where('slug', 'accountant')->first();
        $employeeRole = Role::where('slug', 'employee')->first();

        $this->accountant = User::create([
            'name' => 'General Accountant',
            'email' => 'accountant@alashbiliya.com',
            'password' => Hash::make('password123'),
            'department_id' => $dept->id,
            'is_active' => true,
        ]);
        $this->accountant->roles()->attach($accountantRole->id);

        $this->employee = User::create([
            'name' => 'Regular Employee',
            'email' => 'employee@alashbiliya.com',
            'password' => Hash::make('password123'),
            'department_id' => $dept->id,
            'is_active' => true,
        ]);
        $this->employee->roles()->attach($employeeRole->id);

        // Setup Accounts
        $this->expenseAccount = Account::create([
            'code' => '512',
            'name' => 'تكاليف ومصنعيات مقاولي الباطن',
            'type' => 'expense',
            'is_active' => true,
        ]);

        $this->payableAccount = Account::create([
            'code' => '2113',
            'name' => 'مقاولو التشطيبات والخرسانات',
            'type' => 'liability',
            'is_active' => true,
        ]);

        // Setup Cost Centers
        $this->costCenterA = CostCenter::create([
            'code' => 'CC-101',
            'name' => 'مشروع كمبوند الياسمين',
            'is_active' => true,
        ]);

        $this->costCenterB = CostCenter::create([
            'code' => 'CC-102',
            'name' => 'مشروع برج النرجس',
            'is_active' => true,
        ]);

        $this->inactiveCenter = CostCenter::create([
            'code' => 'CC-999',
            'name' => 'مشروع منتهي ومغلق',
            'is_active' => false,
        ]);
    }

    public function test_guest_cannot_access_cost_center_reports(): void
    {
        $responseSummary = $this->getJson('/api/v1/accounting/reports/cost-centers');
        $responseSummary->assertStatus(401);

        $responseStatement = $this->getJson("/api/v1/accounting/reports/cost-centers/{$this->costCenterA->id}/statement");
        $responseStatement->assertStatus(401);
    }

    public function test_unauthorized_employee_is_forbidden(): void
    {
        Sanctum::actingAs($this->employee);

        $responseSummary = $this->getJson('/api/v1/accounting/reports/cost-centers');
        $responseSummary->assertStatus(403);

        $responseStatement = $this->getJson("/api/v1/accounting/reports/cost-centers/{$this->costCenterA->id}/statement");
        $responseStatement->assertStatus(403);
    }

    public function test_accountant_can_get_summary_with_accurate_aggregations(): void
    {
        Sanctum::actingAs($this->accountant);

        // Create 2 posted journal entries charging costCenterA: 50,000 + 30,000 = 80,000
        $entry1 = JournalEntry::create([
            'date' => '2026-09-18',
            'description' => 'مستخلص خرسانات - كمبوند الياسمين',
            'reference_number' => 'JE-001',
            'status' => 'POSTED',
        ]);
        JournalEntryLine::create([
            'journal_entry_id' => $entry1->id,
            'account_id' => $this->expenseAccount->id,
            'cost_center_id' => $this->costCenterA->id,
            'debit' => 50000.00,
            'credit' => 0,
            'description' => 'أعمال صب الأساسات',
        ]);
        JournalEntryLine::create([
            'journal_entry_id' => $entry1->id,
            'account_id' => $this->payableAccount->id,
            'cost_center_id' => null,
            'debit' => 0,
            'credit' => 50000.00,
            'description' => 'استحقاق مقاول',
        ]);

        $entry2 = JournalEntry::create([
            'date' => '2026-09-19',
            'description' => 'مستخلص تشطيبات - كمبوند الياسمين',
            'reference_number' => 'JE-002',
            'status' => 'POSTED',
        ]);
        JournalEntryLine::create([
            'journal_entry_id' => $entry2->id,
            'account_id' => $this->expenseAccount->id,
            'cost_center_id' => $this->costCenterA->id,
            'debit' => 30000.00,
            'credit' => 0,
            'description' => 'أعمال محارة وبياض',
        ]);
        JournalEntryLine::create([
            'journal_entry_id' => $entry2->id,
            'account_id' => $this->payableAccount->id,
            'cost_center_id' => null,
            'debit' => 0,
            'credit' => 30000.00,
            'description' => 'استحقاق مقاول',
        ]);

        // Create 1 draft entry (MUST NOT be counted in actual costs)
        $draftEntry = JournalEntry::create([
            'date' => '2026-09-19',
            'description' => 'مسودة غير معتمدة',
            'reference_number' => 'JE-DRAFT',
            'status' => 'DRAFT',
        ]);
        JournalEntryLine::create([
            'journal_entry_id' => $draftEntry->id,
            'account_id' => $this->expenseAccount->id,
            'cost_center_id' => $this->costCenterA->id,
            'debit' => 99999.00,
            'credit' => 0,
            'description' => 'مسودة',
        ]);

        // Fetch summary
        $response = $this->getJson('/api/v1/accounting/reports/cost-centers');
        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.summary.total_projects', 2)
            ->assertJsonPath('data.summary.highest_project.code', 'CC-101');

        $this->assertEquals(80000.00, $response->json('data.summary.total_expenditure'));
        $this->assertEquals(40000.00, $response->json('data.summary.average_project_cost'));
        $this->assertEquals(80000.00, $response->json('data.summary.highest_project.total_cost'));

        $costCenters = $response->json('data.cost_centers');
        $this->assertCount(2, $costCenters);

        // Verify first center is CC-101 with 80,000 and 2 movements
        $this->assertEquals('CC-101', $costCenters[0]['code']);
        $this->assertEquals(80000.00, $costCenters[0]['total_cost']);
        $this->assertEquals(2, $costCenters[0]['movements_count']);

        // Verify CC-102 has 0 cost and 0 movements
        $this->assertEquals('CC-102', $costCenters[1]['code']);
        $this->assertEquals(0, $costCenters[1]['total_cost']);
        $this->assertEquals(0, $costCenters[1]['movements_count']);
    }

    public function test_accountant_can_get_detailed_statement(): void
    {
        Sanctum::actingAs($this->accountant);

        $entry = JournalEntry::create([
            'date' => '2026-09-19',
            'description' => 'مستخلص مقاول برج النرجس',
            'reference_number' => 'CONT-INV-55',
            'status' => 'POSTED',
        ]);
        JournalEntryLine::create([
            'journal_entry_id' => $entry->id,
            'account_id' => $this->expenseAccount->id,
            'cost_center_id' => $this->costCenterB->id,
            'debit' => 45000.00,
            'credit' => 0,
            'description' => 'أعمال واجهات زجاجية',
        ]);

        $response = $this->getJson("/api/v1/accounting/reports/cost-centers/{$this->costCenterB->id}/statement");
        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.cost_center.code', 'CC-102')
            ->assertJsonPath('data.totals.movements_count', 1);

        $this->assertEquals(45000.00, $response->json('data.totals.total_debit'));
        $this->assertEquals(0.00, $response->json('data.totals.total_credit'));
        $this->assertEquals(45000.00, $response->json('data.totals.net_cost'));

        $movements = $response->json('data.movements');
        $this->assertCount(1, $movements);
        $this->assertEquals('CONT-INV-55', $movements[0]['reference_number']);
        $this->assertEquals('512', $movements[0]['account_code']);
        $this->assertEquals('تكاليف ومصنعيات مقاولي الباطن', $movements[0]['account_name']);
        $this->assertEquals(45000.00, $movements[0]['debit']);
    }

    public function test_search_filter_in_summary_returns_matched_cost_centers(): void
    {
        Sanctum::actingAs($this->accountant);

        $response = $this->getJson('/api/v1/accounting/reports/cost-centers?search=الياسمين');
        $response->assertOk();

        $costCenters = $response->json('data.cost_centers');
        $this->assertCount(1, $costCenters);
        $this->assertEquals('CC-101', $costCenters[0]['code']);
    }

    public function test_statement_for_empty_cost_center_returns_zero_totals(): void
    {
        Sanctum::actingAs($this->accountant);

        $response = $this->getJson("/api/v1/accounting/reports/cost-centers/{$this->costCenterB->id}/statement");
        $response->assertOk()
            ->assertJsonPath('data.totals.movements_count', 0)
            ->assertJsonPath('data.movements', []);

        $this->assertEquals(0.00, $response->json('data.totals.net_cost'));
    }
}
