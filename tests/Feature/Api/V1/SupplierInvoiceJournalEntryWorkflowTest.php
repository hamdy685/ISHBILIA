<?php

namespace Tests\Feature\Api\V1;

use App\Models\Accounting\Account;
use App\Models\Accounting\CostCenter;
use App\Models\Accounting\JournalEntry;
use App\Models\Department;
use App\Models\LandParcel;
use App\Models\PurchaseOrder;
use App\Models\PurchaseRequest;
use App\Models\PurchaseReceipt;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\SupplierInvoice;
use App\Models\User;
use App\Services\PurchaseReceiptService;
use App\Services\SupplierInvoiceService;
use Database\Seeders\AccountingDemoSeeder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class SupplierInvoiceJournalEntryWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private User $accountant;
    private User $siteEngineer;
    private User $warehouse;
    private Department $department;
    private Supplier $supplier;
    private LandParcel $parcel;
    private CostCenter $costCenter;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RolePermissionSeeder::class);
        $this->seed(AccountingDemoSeeder::class);

        $this->department = Department::firstOrCreate(
            ['code' => 'EXECUTION'],
            ['name' => 'إدارة التنفيذ الإنشائي', 'is_active' => true]
        );

        $this->accountant = $this->makeUser('acc-procurement@test.com', 'محاسب المشتريات', 'accountant');
        $this->siteEngineer = $this->makeUser('site-procurement@test.com', 'مهندس الموقع', 'site_engineer');
        $this->warehouse = $this->makeUser('wh-procurement@test.com', 'أمين المخزن', 'warehouse_keeper');

        $this->supplier = Supplier::create([
            'code' => 'SUP-MAT-001',
            'company_name' => 'الشركة المتحدة لتوريد حديد التسليح والإسمنت',
            'is_active' => true,
        ]);

        $this->parcel = LandParcel::firstOrCreate(
            ['parcel_reference' => 'PARCEL-YASMIN-01', 'region' => 'التجمع الخامس'],
            [
                'opening_balance' => 50000,
                'balance' => 50000,
                'is_active' => true,
            ]
        );

        $this->costCenter = CostCenter::where('code', 'CC-101')->firstOrFail();
    }

    private function makeUser(string $email, string $name, string $roleSlug): User
    {
        $user = User::create([
            'department_id' => $this->department?->id,
            'name' => $name,
            'email' => $email,
            'password' => Hash::make('password123'),
            'is_active' => true,
        ]);

        $roleModel = Role::where('slug', $roleSlug)->firstOrFail();
        $user->roles()->attach($roleModel->id);

        return $user;
    }

    private function createOrderAndApprovedReceipt(float $totalAmount = 15000): array
    {
        $pr = PurchaseRequest::create([
            'request_number' => 'PR-MAT-' . uniqid(),
            'user_id' => $this->siteEngineer->id,
            'department_id' => $this->department->id,
            'status' => 'APPROVED',
            'estimated_total' => $totalAmount,
            'parcel_reference' => $this->parcel->parcel_reference,
            'region' => $this->parcel->region,
            'land_parcel_id' => $this->parcel->id,
        ]);

        $po = PurchaseOrder::create([
            'po_number' => 'PO-MAT-' . uniqid(),
            'purchase_request_id' => $pr->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $this->accountant->id,
            'status' => 'APPROVED',
            'total_amount' => $totalAmount,
            'payment_terms' => 'AGREED',
            'delivery_terms' => 'DELIVERED',
        ]);

        $poItem = $po->items()->create([
            'item_id' => null,
            'item_name' => 'حديد تسليح 12 مم عز الدخيلة',
            'item_description' => 'حديد تسليح 12 مم عز الدخيلة',
            'quantity' => 10,
            'unit_price' => $totalAmount / 10,
            'total_price' => $totalAmount,
        ]);

        $receipt = PurchaseReceipt::create([
            'receipt_number' => 'REC-MAT-' . uniqid(),
            'purchase_order_id' => $po->id,
            'warehouse_keeper_user_id' => $this->warehouse->id,
            'receipt_date' => now()->toDateString(),
            'status' => 'APPROVED',
            'site_engineer_approved_at' => now(),
            'site_engineer_user_id' => $this->siteEngineer->id,
        ]);

        $receipt->items()->create([
            'purchase_order_item_id' => $poItem->id,
            'ordered_quantity' => 10,
            'received_quantity' => 10,
            'accepted_quantity' => 10,
            'rejected_quantity' => 0,
            'status' => 'ACCEPTED',
        ]);

        return [$po, $receipt];
    }

    public function test_three_way_match_generates_balanced_journal_entry_for_material_cost_and_supplier_liability(): void
    {
        [$po, $receipt] = $this->createOrderAndApprovedReceipt(25000);
        $service = app(SupplierInvoiceService::class);

        // 1. Accountant records invoice
        $invoice = $service->createInvoice(
            $this->accountant,
            $po,
            $receipt,
            25000,
            'INV-SUPP-2026-001',
            '2026-09-19',
            '2026-10-19',
            [['land_parcel_id' => $this->parcel->id, 'amount' => 25000]]
        );

        $this->assertNull($invoice->journal_entry_id);

        // 2. 3-Way Match execution (Approval)
        $matched = $service->matchThreeWay($this->accountant, $invoice);

        $this->assertSame('MATCHED', $matched->matching_status);
        $this->assertNotNull($matched->journal_entry_id);

        // 3. Verify Journal Entry
        $entry = JournalEntry::with('lines.account')->findOrFail($matched->journal_entry_id);
        $this->assertSame('POSTED', $entry->status);
        $this->assertSame('INV-SUPP-2026-001', $entry->reference_number);
        $this->assertStringContainsString('الشركة المتحدة لتوريد حديد التسليح', $entry->description);

        $this->assertCount(2, $entry->lines);

        // Debit: Material Expense (Code 511)
        $debitLine = $entry->lines->firstWhere('debit', '>', 0);
        $this->assertNotNull($debitLine);
        $this->assertSame('25000.00', (string) $debitLine->debit);
        $this->assertSame('511', $debitLine->account->code);
        $this->assertNotNull($debitLine->cost_center_id);

        // Credit: Supplier Payable (Code 2111)
        $creditLine = $entry->lines->firstWhere('credit', '>', 0);
        $this->assertNotNull($creditLine);
        $this->assertSame('25000.00', (string) $creditLine->credit);
        $this->assertSame('2111', $creditLine->account->code);
        $this->assertNull($creditLine->cost_center_id);

        // Perfectly Balanced
        $this->assertSame($entry->lines->sum('debit'), $entry->lines->sum('credit'));
    }

    public function test_recording_bank_payment_generates_balanced_journal_entry_reducing_payable_and_crediting_bank(): void
    {
        [$po, $receipt] = $this->createOrderAndApprovedReceipt(40000);
        $service = app(SupplierInvoiceService::class);

        $invoice = $service->createInvoice(
            $this->accountant,
            $po,
            $receipt,
            40000,
            'INV-SUPP-2026-002',
            '2026-09-19',
            null,
            [['land_parcel_id' => $this->parcel->id, 'amount' => 40000]]
        );
        $matched = $service->matchThreeWay($this->accountant, $invoice);

        // Record partial payment via BANK_TRANSFER
        $result = $service->recordPayment(
            $this->accountant,
            $matched,
            15000,
            '2026-09-20',
            'BANK_TRANSFER',
            'CHQ-BANK-889922'
        );

        $payment = $result['payment'];
        $this->assertNotNull($payment->journal_entry_id);

        $entry = JournalEntry::with('lines.account')->findOrFail($payment->journal_entry_id);
        $this->assertSame('POSTED', $entry->status);
        $this->assertSame('CHQ-BANK-889922', $entry->reference_number);
        $this->assertStringContainsString('تحويل بنكي', $entry->description);

        $this->assertCount(2, $entry->lines);

        // Debit: Supplier Payable (Code 2111) to reduce liability
        $debitLine = $entry->lines->firstWhere('debit', '>', 0);
        $this->assertSame('15000.00', (string) $debitLine->debit);
        $this->assertSame('2111', $debitLine->account->code);

        // Credit: Bank Account (Code 1112)
        $creditLine = $entry->lines->firstWhere('credit', '>', 0);
        $this->assertSame('15000.00', (string) $creditLine->credit);
        $this->assertSame('1112', $creditLine->account->code);

        // Balanced
        $this->assertSame($entry->lines->sum('debit'), $entry->lines->sum('credit'));
    }

    public function test_recording_cash_payment_credits_treasury_cash_account_1111(): void
    {
        [$po, $receipt] = $this->createOrderAndApprovedReceipt(10000);
        $service = app(SupplierInvoiceService::class);

        $invoice = $service->createInvoice(
            $this->accountant,
            $po,
            $receipt,
            10000,
            'INV-SUPP-2026-003',
            '2026-09-19',
            null,
            [['land_parcel_id' => $this->parcel->id, 'amount' => 10000]]
        );
        $matched = $service->matchThreeWay($this->accountant, $invoice);

        // Record payment via CASH
        $result = $service->recordPayment(
            $this->accountant,
            $matched,
            10000,
            '2026-09-20',
            'CASH',
            'RECEIPT-CASH-001'
        );

        $payment = $result['payment'];
        $this->assertNotNull($payment->journal_entry_id);

        $entry = JournalEntry::with('lines.account')->findOrFail($payment->journal_entry_id);
        $this->assertCount(2, $entry->lines);

        // Credit line must be Treasury Cash Account (Code 1111)
        $creditLine = $entry->lines->firstWhere('credit', '>', 0);
        $this->assertSame('10000.00', (string) $creditLine->credit);
        $this->assertSame('1111', $creditLine->account->code);
    }

    public function test_cost_center_report_summary_includes_supplier_invoice_materials_cost(): void
    {
        [$po, $receipt] = $this->createOrderAndApprovedReceipt(35000);
        $service = app(SupplierInvoiceService::class);

        $invoice = $service->createInvoice(
            $this->accountant,
            $po,
            $receipt,
            35000,
            'INV-SUPP-2026-CC',
            '2026-09-19',
            null,
            [['land_parcel_id' => $this->parcel->id, 'amount' => 35000]]
        );
        $matched = $service->matchThreeWay($this->accountant, $invoice);

        $entry = JournalEntry::with('lines')->find($matched->journal_entry_id);
        $debitLine = $entry->lines->firstWhere('debit', '>', 0);
        $costCenterId = $debitLine->cost_center_id;

        $response = $this->actingAs($this->accountant, 'sanctum')
            ->getJson('/api/v1/accounting/reports/cost-centers');

        $response->assertStatus(200);
        $data = collect($response->json('data.cost_centers'));
        $ccData = $data->firstWhere('id', $costCenterId);

        $this->assertNotNull($ccData);
        $this->assertGreaterThanOrEqual(35000.0, (float) $ccData['total_cost']);
    }
}
