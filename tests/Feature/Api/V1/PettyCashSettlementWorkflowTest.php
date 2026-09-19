<?php

namespace Tests\Feature\Api\V1;

use App\Models\Accounting\Account;
use App\Models\Accounting\CostCenter;
use App\Models\Accounting\JournalEntry;
use App\Models\Accounting\PettyCashSettlement;
use App\Models\Department;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PettyCashSettlementWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private User $accountant;
    private User $employee;
    private CostCenter $costCenter;
    private Account $expenseAccount;
    private Account $assetAccount;

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

        $this->costCenter = CostCenter::create([
            'code' => 'CC-101',
            'name' => 'مشروع كمبوند الياسمين',
            'is_active' => true,
        ]);

        $this->expenseAccount = Account::create([
            'code' => '513',
            'name' => 'مصروفات تشغيلية ونثرية للموقع',
            'type' => 'expense',
            'is_active' => true,
        ]);

        $this->assetAccount = Account::create([
            'code' => '112',
            'name' => 'صندوق عهد الموظفين',
            'type' => 'asset',
            'is_active' => true,
        ]);
    }

    public function test_guest_cannot_access_petty_cash_settlements(): void
    {
        $this->getJson('/api/v1/accounting/petty-cash-settlements')->assertStatus(401);
    }

    public function test_unauthorized_employee_is_forbidden(): void
    {
        Sanctum::actingAs($this->employee);

        $this->getJson('/api/v1/accounting/petty-cash-settlements')->assertStatus(403);
    }

    public function test_accountant_can_create_and_list_petty_cash_settlements(): void
    {
        Sanctum::actingAs($this->accountant);

        $payload = [
            'cost_center_id' => $this->costCenter->id,
            'employee_name' => 'م. أحمد مهدي (مهندس الموقع)',
            'settlement_number' => 'PC-2026-001',
            'date' => '2026-09-19',
            'amount' => 3500.00,
            'description' => 'شراء خراطيم مياه ومستلزمات صيانة عاجلة للموقع',
            'status' => 'DRAFT',
        ];

        $createRes = $this->postJson('/api/v1/accounting/petty-cash-settlements', $payload);
        $createRes->assertStatus(201)
            ->assertJsonPath('data.employee_name', 'م. أحمد مهدي (مهندس الموقع)')
            ->assertJsonPath('data.status', 'DRAFT');

        $settlementId = $createRes->json('data.id');

        $listRes = $this->getJson('/api/v1/accounting/petty-cash-settlements');
        $listRes->assertStatus(200)
            ->assertJsonPath('count', 1);

        $showRes = $this->getJson("/api/v1/accounting/petty-cash-settlements/{$settlementId}");
        $showRes->assertStatus(200)
            ->assertJsonPath('data.settlement_number', 'PC-2026-001');
    }

    public function test_approve_creates_balanced_journal_entry(): void
    {
        Sanctum::actingAs($this->accountant);

        $settlement = PettyCashSettlement::create([
            'cost_center_id' => $this->costCenter->id,
            'employee_name' => 'م. سارة كمال',
            'settlement_number' => 'PC-2026-002',
            'date' => '2026-09-19',
            'amount' => 4800.00,
            'description' => 'مصاريف ضيافة وبوفيه ونثريات مكتب الموقع',
            'status' => 'DRAFT',
        ]);

        $approveRes = $this->postJson("/api/v1/accounting/petty-cash-settlements/{$settlement->id}/approve");
        $approveRes->assertStatus(200)
            ->assertJsonPath('data.status', 'APPROVED');

        $settlement->refresh();
        $this->assertEquals('APPROVED', $settlement->status);
        $this->assertNotNull($settlement->journal_entry_id);

        // Verify Journal Entry
        $journalEntry = JournalEntry::with('lines')->find($settlement->journal_entry_id);
        $this->assertNotNull($journalEntry);
        $this->assertEquals('POSTED', $journalEntry->status);
        $this->assertEquals('PC-2026-002', $journalEntry->reference_number);
        $this->assertCount(2, $journalEntry->lines);

        // Debit Line: Project Operating / Petty Cash Expense with Cost Center
        $debitLine = $journalEntry->lines->where('debit', '>', 0)->first();
        $this->assertNotNull($debitLine);
        $this->assertEquals($this->expenseAccount->id, $debitLine->account_id);
        $this->assertEquals($this->costCenter->id, $debitLine->cost_center_id);
        $this->assertEquals('4800.00', $debitLine->debit);
        $this->assertEquals('0.00', $debitLine->credit);

        // Credit Line: Custody Asset / Petty Cash Box
        $creditLine = $journalEntry->lines->where('credit', '>', 0)->first();
        $this->assertNotNull($creditLine);
        $this->assertEquals($this->assetAccount->id, $creditLine->account_id);
        $this->assertNull($creditLine->cost_center_id);
        $this->assertEquals('0.00', $creditLine->debit);
        $this->assertEquals('4800.00', $creditLine->credit);

        // Balance Check
        $this->assertEquals($journalEntry->lines->sum('debit'), $journalEntry->lines->sum('credit'));
    }

    public function test_approve_returns_422_gracefully_when_accounts_not_found(): void
    {
        Sanctum::actingAs($this->accountant);

        // Set non-existent account codes in config
        Config::set('accounting.petty_cash_expense_account_code', '99999');
        Config::set('accounting.petty_cash_asset_account_code', '88888');

        $settlement = PettyCashSettlement::create([
            'cost_center_id' => $this->costCenter->id,
            'employee_name' => 'موظف تجريبي',
            'settlement_number' => 'PC-999',
            'date' => '2026-09-19',
            'amount' => 1500.00,
            'status' => 'DRAFT',
        ]);

        $res = $this->postJson("/api/v1/accounting/petty-cash-settlements/{$settlement->id}/approve");
        $res->assertStatus(422)
            ->assertJsonPath('message', 'تعذر إنشاء القيد: حساب مصروفات العهد أو حساب صندوق العهدة غير معرف في شجرة الحسابات. يرجى مراجعة الإعدادات المالية.');

        $settlement->refresh();
        $this->assertEquals('DRAFT', $settlement->status);
        $this->assertNull($settlement->journal_entry_id);
    }

    public function test_cannot_edit_or_delete_approved_settlement(): void
    {
        Sanctum::actingAs($this->accountant);

        $settlement = PettyCashSettlement::create([
            'cost_center_id' => $this->costCenter->id,
            'employee_name' => 'مشرف أمن الموقع',
            'settlement_number' => 'PC-2026-004',
            'date' => '2026-09-19',
            'amount' => 2000.00,
            'status' => 'DRAFT',
        ]);

        $this->postJson("/api/v1/accounting/petty-cash-settlements/{$settlement->id}/approve")->assertStatus(200);

        // Try updating
        $this->putJson("/api/v1/accounting/petty-cash-settlements/{$settlement->id}", [
            'amount' => 3000.00,
        ])->assertStatus(422);

        // Try deleting
        $this->deleteJson("/api/v1/accounting/petty-cash-settlements/{$settlement->id}")
            ->assertStatus(422);
    }
}
