<?php

namespace Tests\Feature\Api\V1;

use App\Models\Accounting\Account;
use App\Models\Accounting\CostCenter;
use App\Models\Accounting\ContractorInvoice;
use App\Models\Accounting\JournalEntry;
use App\Models\Department;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ContractorInvoiceWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private User $accountant;
    private User $employee;
    private CostCenter $costCenter;
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

        $this->costCenter = CostCenter::create([
            'code' => 'CC-101',
            'name' => 'مشروع كمبوند الياسمين',
            'is_active' => true,
        ]);

        $this->expenseAccount = Account::create([
            'code' => '512',
            'name' => 'أجور عمالة مباشرة ومقاولو باطن',
            'type' => 'expense',
            'is_active' => true,
        ]);

        $this->payableAccount = Account::create([
            'code' => '2113',
            'name' => 'مقاولو التشطيبات وأعمال الكهرباء والسباكة',
            'type' => 'liability',
            'is_active' => true,
        ]);
    }

    public function test_guest_cannot_access_contractor_invoices(): void
    {
        $this->getJson('/api/v1/accounting/contractor-invoices')->assertStatus(401);
    }

    public function test_unauthorized_employee_is_forbidden(): void
    {
        Sanctum::actingAs($this->employee);

        $this->getJson('/api/v1/accounting/contractor-invoices')->assertStatus(403);
    }

    public function test_accountant_can_create_and_list_contractor_invoices(): void
    {
        Sanctum::actingAs($this->accountant);

        $payload = [
            'cost_center_id' => $this->costCenter->id,
            'contractor_name' => 'شركة النيل للخرسانات والمقاولات',
            'invoice_number' => 'INV-CTR-2026-001',
            'date' => '2026-09-19',
            'amount' => 75000.00,
            'description' => 'مستخلص أعمال صب الدور الأول فيلا 14',
            'status' => 'DRAFT',
        ];

        $createRes = $this->postJson('/api/v1/accounting/contractor-invoices', $payload);
        $createRes->assertStatus(201)
            ->assertJsonPath('data.contractor_name', 'شركة النيل للخرسانات والمقاولات')
            ->assertJsonPath('data.status', 'DRAFT');

        $invoiceId = $createRes->json('data.id');

        $listRes = $this->getJson('/api/v1/accounting/contractor-invoices');
        $listRes->assertStatus(200)
            ->assertJsonPath('count', 1);

        $showRes = $this->getJson("/api/v1/accounting/contractor-invoices/{$invoiceId}");
        $showRes->assertStatus(200)
            ->assertJsonPath('data.invoice_number', 'INV-CTR-2026-001');
    }

    public function test_approve_creates_balanced_journal_entry(): void
    {
        Sanctum::actingAs($this->accountant);

        $invoice = ContractorInvoice::create([
            'cost_center_id' => $this->costCenter->id,
            'contractor_name' => 'مؤسسة الأهرام للتشطيبات',
            'invoice_number' => 'INV-CTR-2026-002',
            'date' => '2026-09-19',
            'amount' => 120000.00,
            'description' => 'أعمال واجهات حجر هاشمي',
            'status' => 'DRAFT',
        ]);

        $approveRes = $this->postJson("/api/v1/accounting/contractor-invoices/{$invoice->id}/approve");
        $approveRes->assertStatus(200)
            ->assertJsonPath('data.status', 'APPROVED');

        $invoice->refresh();
        $this->assertEquals('APPROVED', $invoice->status);
        $this->assertNotNull($invoice->journal_entry_id);

        // Verify Journal Entry
        $journalEntry = JournalEntry::with('lines')->find($invoice->journal_entry_id);
        $this->assertNotNull($journalEntry);
        $this->assertEquals('POSTED', $journalEntry->status);
        $this->assertEquals('INV-CTR-2026-002', $journalEntry->reference_number);
        $this->assertCount(2, $journalEntry->lines);

        // Debit Line: Project Cost with Cost Center
        $debitLine = $journalEntry->lines->where('debit', '>', 0)->first();
        $this->assertNotNull($debitLine);
        $this->assertEquals($this->expenseAccount->id, $debitLine->account_id);
        $this->assertEquals($this->costCenter->id, $debitLine->cost_center_id);
        $this->assertEquals('120000.00', $debitLine->debit);
        $this->assertEquals('0.00', $debitLine->credit);

        // Credit Line: Contractors Payable
        $creditLine = $journalEntry->lines->where('credit', '>', 0)->first();
        $this->assertNotNull($creditLine);
        $this->assertEquals($this->payableAccount->id, $creditLine->account_id);
        $this->assertNull($creditLine->cost_center_id);
        $this->assertEquals('0.00', $creditLine->debit);
        $this->assertEquals('120000.00', $creditLine->credit);

        // Check sum(debit) == sum(credit)
        $this->assertEquals($journalEntry->lines->sum('debit'), $journalEntry->lines->sum('credit'));
    }

    public function test_approve_returns_422_gracefully_when_accounts_not_found(): void
    {
        Sanctum::actingAs($this->accountant);

        // Set non-existent account codes in config
        Config::set('accounting.contractor_expense_account_code', '99999');
        Config::set('accounting.contractor_payable_account_code', '88888');

        $invoice = ContractorInvoice::create([
            'cost_center_id' => $this->costCenter->id,
            'contractor_name' => 'مقاول الدهانات الحديثة',
            'invoice_number' => 'INV-CTR-999',
            'date' => '2026-09-19',
            'amount' => 50000.00,
            'status' => 'DRAFT',
        ]);

        $res = $this->postJson("/api/v1/accounting/contractor-invoices/{$invoice->id}/approve");
        $res->assertStatus(422)
            ->assertJsonPath('message', 'تعذر إنشاء القيد: حساب مصروفات المقاولين أو حساب دائنو المقاولين غير معرف في شجرة الحسابات. يرجى مراجعة الإعدادات المالية.');

        $invoice->refresh();
        $this->assertEquals('DRAFT', $invoice->status);
        $this->assertNull($invoice->journal_entry_id);
    }

    public function test_cannot_edit_or_delete_approved_invoice(): void
    {
        Sanctum::actingAs($this->accountant);

        $invoice = ContractorInvoice::create([
            'cost_center_id' => $this->costCenter->id,
            'contractor_name' => 'مقاول السيراميك',
            'invoice_number' => 'INV-CTR-2026-004',
            'date' => '2026-09-19',
            'amount' => 30000.00,
            'status' => 'DRAFT',
        ]);

        $this->postJson("/api/v1/accounting/contractor-invoices/{$invoice->id}/approve")->assertStatus(200);

        // Try updating
        $this->putJson("/api/v1/accounting/contractor-invoices/{$invoice->id}", [
            'amount' => 45000.00,
        ])->assertStatus(422);

        // Try deleting
        $this->deleteJson("/api/v1/accounting/contractor-invoices/{$invoice->id}")
            ->assertStatus(422);
    }
}
