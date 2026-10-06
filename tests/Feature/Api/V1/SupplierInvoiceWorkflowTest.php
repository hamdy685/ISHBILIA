<?php

namespace Tests\Feature\Api\V1;

use App\Models\Department;
use App\Models\LandParcel;
use App\Models\PurchaseOrder;
use App\Models\PurchaseRequest;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use App\Services\PurchaseReceiptService;
use App\Services\SupplierInvoiceService;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class SupplierInvoiceWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private User $warehouse;
    private User $siteEngineer;
    private User $accountant;
    private Department $department;
    private Supplier $supplier;
    private LandParcel $parcel;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);
        $this->department = Department::create(['name' => 'التنفيذ', 'code' => 'EXECUTION', 'is_active' => true]);
        $this->warehouse = $this->makeUser('warehouse-invoice@test', 'أمين المخزن', 'warehouse_keeper');
        $this->siteEngineer = $this->makeUser('site-invoice@test', 'مهندس الموقع', 'site_engineer');
        $this->accountant = $this->makeUser('accountant-invoice@test', 'الحسابات', 'accountant');
        $this->supplier = Supplier::create(['code' => 'FIN-SUP-001', 'company_name' => 'مورد مالي', 'is_active' => true]);
        $this->parcel = LandParcel::create([
            'parcel_reference' => 'FIN-PARCEL-001',
            'region' => 'المنطقة السابعة والعشرون',
            'opening_balance' => 10000,
            'funded_total' => 0,
            'expense_total' => 0,
            'balance' => 10000,
            'is_active' => true,
        ]);
    }

    public function test_accountant_creates_invoice_matches_and_records_partial_payment(): void
    {
        $order = $this->makeOrder('PO-FIN-001', 1000, '2026-08-01', $this->supplier);
        $receipt = $this->approveReceipt($order, 10);
        $service = app(SupplierInvoiceService::class);

        $invoice = $service->createInvoice($this->accountant, $order, $receipt, 1000, 'INV-FIN-001', '2026-08-03', null, $this->invoiceAllocations(1000));
        $matched = $service->matchThreeWay($this->accountant, $invoice);
        $result = $service->recordPayment($this->accountant, $matched, 400, '2026-08-04');

        $this->assertSame('MATCHED', $matched->fresh()->matching_status);
        $this->assertSame('PARTIALLY_PAID', $matched->fresh()->status);
        $this->assertSame('400.00', $matched->fresh()->paid_amount);
        $this->assertSame('600.00', $matched->fresh()->outstanding_amount);
        $this->assertFalse($result['overpayment_warning']);
        $this->assertSame(600.0, $result['supplier_balance']['balance']);
        $this->assertDatabaseHas('supplier_payment_allocations', ['supplier_invoice_id' => $matched->id, 'amount' => 400]);
    }

    public function test_payment_exceeding_supplier_balance_is_recorded_with_warning(): void
    {
        $order = $this->makeOrder('PO-FIN-002', 1000, '2026-08-02', $this->supplier);
        $receipt = $this->approveReceipt($order, 10);
        $service = app(SupplierInvoiceService::class);
        $invoice = $service->matchThreeWay($this->accountant, $service->createInvoice($this->accountant, $order, $receipt, 1000, 'INV-FIN-002', null, null, $this->invoiceAllocations(1000)));

        $result = $service->recordPayment($this->accountant, $invoice, 1500, '2026-08-05');

        $this->assertTrue($result['overpayment_warning']);
        $this->assertSame('500.00', $result['payment']->fresh()->overpayment_amount);
        $this->assertSame(-500.0, $result['supplier_balance']['balance']);
        $this->assertSame('PAID', $invoice->fresh()->status);
    }

    public function test_payment_distributes_to_oldest_debt_first(): void
    {
        $service = app(SupplierInvoiceService::class);
        $oldOrder = $this->makeOrder('PO-FIN-003', 1000, '2026-08-01', $this->supplier);
        $newOrder = $this->makeOrder('PO-FIN-004', 500, '2026-08-10', $this->supplier);
        $oldInvoice = $service->matchThreeWay($this->accountant, $service->createInvoice($this->accountant, $oldOrder, $this->approveReceipt($oldOrder, 10), 1000, 'INV-FIN-003', '2026-08-01', null, $this->invoiceAllocations(1000)));
        $newInvoice = $service->matchThreeWay($this->accountant, $service->createInvoice($this->accountant, $newOrder, $this->approveReceipt($newOrder, 5), 500, 'INV-FIN-004', '2026-08-10', null, $this->invoiceAllocations(500)));

        $service->recordPayment($this->accountant, $newInvoice, 1200, '2026-08-11');

        $this->assertSame('PAID', $oldInvoice->fresh()->status);
        $this->assertSame('1000.00', $oldInvoice->fresh()->paid_amount);
        $this->assertSame('PARTIALLY_PAID', $newInvoice->fresh()->status);
        $this->assertSame('200.00', $newInvoice->fresh()->paid_amount);
        $this->assertDatabaseHas('supplier_payment_allocations', ['supplier_invoice_id' => $oldInvoice->id, 'amount' => 1000]);
        $this->assertDatabaseHas('supplier_payment_allocations', ['supplier_invoice_id' => $newInvoice->id, 'amount' => 200]);
    }

    public function test_accountant_can_create_parcel_and_record_customer_funding(): void
    {
        $createResponse = $this->actingAs($this->accountant, 'sanctum')
            ->postJson('/api/v1/accounting/land-parcels', [
                'parcel_reference' => 'FIN-PARCEL-API',
                'region' => 'المنطقة التاسعة',
                'opening_balance' => 2500,
                'transaction_date' => '2026-08-15',
                'reference_number' => 'CLIENT-OPEN-001',
            ]);

        $createResponse->assertStatus(201)
            ->assertJsonPath('data.parcel_reference', 'FIN-PARCEL-API')
            ->assertJsonPath('data.balance', '2500.00');
        $parcelId = $createResponse->json('data.id');

        $fundResponse = $this->actingAs($this->accountant, 'sanctum')
            ->postJson("/api/v1/accounting/land-parcels/{$parcelId}/fund", [
                'amount' => 750,
                'transaction_date' => '2026-08-16',
                'reference_number' => 'CLIENT-FUND-001',
            ]);

        $fundResponse->assertStatus(201)
            ->assertJsonPath('data.balance', '3250.00')
            ->assertJsonPath('message', 'تم تسجيل تمويل العميل وإضافة المبلغ إلى رصيد قطعة الأرض.');
        $this->assertDatabaseHas('land_parcel_transactions', [
            'land_parcel_id' => $parcelId,
            'transaction_type' => 'CUSTOMER_FUNDING',
            'amount' => 750,
            'balance_after' => 3250,
        ]);
    }

    public function test_manual_invoice_allocation_can_make_parcel_balance_negative(): void
    {
        $lowBalanceParcel = LandParcel::create([
            'parcel_reference' => 'FIN-PARCEL-LOW',
            'region' => 'المنطقة الثامنة',
            'opening_balance' => 100,
            'funded_total' => 0,
            'expense_total' => 0,
            'balance' => 100,
            'is_active' => true,
        ]);
        $order = $this->makeOrder('PO-FIN-NEGATIVE', 1000, '2026-08-12', $this->supplier);
        $receipt = $this->approveReceipt($order, 10);
        $invoice = app(SupplierInvoiceService::class)->createInvoice(
            $this->accountant,
            $order,
            $receipt,
            1000,
            'INV-FIN-NEGATIVE',
            null,
            null,
            [['land_parcel_id' => $lowBalanceParcel->id, 'amount' => 1000]],
        );

        $this->assertSame('OPEN', $invoice->fresh()->status);
        $this->assertSame('-900.00', $lowBalanceParcel->fresh()->balance);
        $this->assertDatabaseHas('supplier_invoice_land_allocations', [
            'supplier_invoice_id' => $invoice->id,
            'land_parcel_id' => $lowBalanceParcel->id,
            'amount' => 1000,
        ]);
        $this->assertDatabaseHas('land_parcel_transactions', [
            'land_parcel_id' => $lowBalanceParcel->id,
            'transaction_type' => 'INVOICE_EXPENSE',
            'amount' => -1000,
            'balance_after' => -900,
        ]);
    }

    public function test_invoice_allows_dynamic_manual_land_allocation(): void
    {
        $order = $this->makeOrder('PO-FIN-ALLOC-VALIDATION', 1000, '2026-08-13', $this->supplier);
        $receipt = $this->approveReceipt($order, 10);

        $invoice = app(SupplierInvoiceService::class)->createInvoice(
            $this->accountant,
            $order,
            $receipt,
            1000,
            'INV-FIN-ALLOC-VALIDATION',
            null,
            null,
            [['land_parcel_id' => $this->parcel->id, 'amount' => 999]],
        );

        $this->assertDatabaseHas('supplier_invoices', ['invoice_number' => 'INV-FIN-ALLOC-VALIDATION']);
        $this->assertEquals(999, (float) $invoice->landAllocations()->sum('amount'));
    }

    public function test_supplier_accounts_are_separate_by_supplier(): void
    {
        $secondSupplier = Supplier::create(['code' => 'FIN-SUP-002', 'company_name' => 'مورد آخر', 'is_active' => true]);
        $service = app(SupplierInvoiceService::class);
        $firstOrder = $this->makeOrder('PO-FIN-005', 700, '2026-08-01', $this->supplier);
        $secondOrder = $this->makeOrder('PO-FIN-006', 300, '2026-08-02', $secondSupplier);
        $firstInvoice = $service->matchThreeWay($this->accountant, $service->createInvoice($this->accountant, $firstOrder, $this->approveReceipt($firstOrder, 7), 700, 'INV-FIN-005', null, null, $this->invoiceAllocations(700)));
        $secondInvoice = $service->matchThreeWay($this->accountant, $service->createInvoice($this->accountant, $secondOrder, $this->approveReceipt($secondOrder, 3), 300, 'INV-FIN-006', null, null, $this->invoiceAllocations(300)));

        $service->recordPayment($this->accountant, $firstInvoice, 200);
        $firstBalance = $service->getSupplierBalance($this->supplier->id);
        $secondBalance = $service->getSupplierBalance($secondSupplier->id);

        $this->assertSame(500.0, $firstBalance['balance']);
        $this->assertSame(300.0, $secondBalance['balance']);
    }

    private function invoiceAllocations(float $amount): array
    {
        return [['land_parcel_id' => $this->parcel->id, 'amount' => $amount]];
    }

    private function makeOrder(string $poNumber, float $total, string $date, Supplier $supplier): PurchaseOrder
    {
        $employee = $this->makeUser('employee-' . strtolower($poNumber) . '@test', 'موظف الطلب ' . $poNumber, 'employee');
        $request = PurchaseRequest::create([
            'request_number' => 'PR-' . $poNumber,
            'user_id' => $employee->id,
            'department_id' => $this->department->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
            'priority' => 'NORMAL',
            'status' => 'APPROVED_BY_PROCUREMENT',
            'total_estimated_cost' => $total,
            'date_needed' => $date,
        ]);
        $order = PurchaseOrder::create([
            'po_number' => $poNumber,
            'purchase_request_id' => $request->id,
            'supplier_id' => $supplier->id,
            'created_by_user_id' => $employee->id,
            'status' => 'ISSUED',
            'subtotal' => $total,
            'grand_total' => $total,
            'delivery_status' => 'NOT_STARTED',
            'created_at' => $date,
            'updated_at' => $date,
        ]);
        $order->items()->create([
            'item_description' => 'مادة بناء',
            'item_reference' => 'FIN-' . $poNumber,
            'region' => 'المنطقة السابعة والعشرون',
            'quantity' => $total / 100,
            'uom' => 'PCS',
            'unit_price' => 100,
            'line_total' => $total,
        ]);

        return $order->fresh();
    }

    private function approveReceipt(PurchaseOrder $order, float $quantity)
    {
        $item = $order->items()->first();
        $receipt = app(PurchaseReceiptService::class)->createByWarehouse(
            $this->warehouse,
            $order,
            [['purchase_order_item_id' => $item->id, 'received_quantity' => $quantity]],
        );

        return app(PurchaseReceiptService::class)->approveBySiteEngineer($this->siteEngineer, $receipt);
    }

    public function test_site_accountant_only_sees_receipts_from_allowed_departments(): void
    {
        $siteAccountant = $this->makeUser('habiba-test@test', 'حبيبة', 'site_accountant');
        $allowedDept = Department::firstOrCreate(['code' => 'FINISHING'], ['name' => 'التشطيبات', 'is_active' => true]);
        $disallowedDept = Department::firstOrCreate(['code' => 'LICENSES'], ['name' => 'التراخيص', 'is_active' => true]);

        // Order 1 in EXECUTION (allowed)
        $order1 = $this->makeOrder('PO-EXEC-001', 1000, '2026-08-01', $this->supplier);
        $receipt1 = $this->approveReceipt($order1, 10);

        // Order 2 in LICENSES (disallowed)
        $employee2 = $this->makeUser('emp-lic@test', 'موظف التراخيص', 'employee');
        $pr2 = PurchaseRequest::create([
            'request_number' => 'PR-LIC-001',
            'user_id' => $employee2->id,
            'department_id' => $disallowedDept->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
            'priority' => 'NORMAL',
            'status' => 'APPROVED_BY_PROCUREMENT',
            'total_estimated_cost' => 500,
            'date_needed' => '2026-08-01',
        ]);
        $order2 = PurchaseOrder::create([
            'po_number' => 'PO-LIC-001',
            'purchase_request_id' => $pr2->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $employee2->id,
            'status' => 'ISSUED',
            'subtotal' => 500,
            'grand_total' => 500,
            'delivery_status' => 'NOT_STARTED',
        ]);
        $order2->items()->create([
            'item_description' => 'ترخيص',
            'quantity' => 5,
            'uom' => 'PCS',
            'unit_price' => 100,
            'line_total' => 500,
        ]);
        $receipt2 = $this->approveReceipt($order2, 5);

        $service = app(SupplierInvoiceService::class);

        // Site accountant should only see receipt 1
        $siteAccountantReceipts = $service->approvedReceipts(100, $siteAccountant);
        $this->assertTrue($siteAccountantReceipts->contains('id', $receipt1->id));
        $this->assertFalse($siteAccountantReceipts->contains('id', $receipt2->id));

        // Full accountant sees both
        $accountantReceipts = $service->approvedReceipts(100, $this->accountant);
        $this->assertTrue($accountantReceipts->contains('id', $receipt1->id));
        $this->assertTrue($accountantReceipts->contains('id', $receipt2->id));
    }

    public function test_site_accountant_cannot_store_invoice_for_disallowed_department(): void
    {
        $siteAccountant = $this->makeUser('habiba-test2@test', 'حبيبة', 'site_accountant');
        $disallowedDept = Department::firstOrCreate(['code' => 'BUFFET'], ['name' => 'البوفيه', 'is_active' => true]);

        $employee = $this->makeUser('emp-buf@test', 'موظف البوفيه', 'employee');
        $pr = PurchaseRequest::create([
            'request_number' => 'PR-BUF-001',
            'user_id' => $employee->id,
            'department_id' => $disallowedDept->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
            'priority' => 'NORMAL',
            'status' => 'APPROVED_BY_PROCUREMENT',
            'total_estimated_cost' => 300,
            'date_needed' => '2026-08-01',
        ]);
        $order = PurchaseOrder::create([
            'po_number' => 'PO-BUF-001',
            'purchase_request_id' => $pr->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $employee->id,
            'status' => 'ISSUED',
            'subtotal' => 300,
            'grand_total' => 300,
            'delivery_status' => 'NOT_STARTED',
        ]);
        $order->items()->create([
            'item_description' => 'شاي وسكر',
            'quantity' => 3,
            'uom' => 'PCS',
            'unit_price' => 100,
            'line_total' => 300,
        ]);
        $receipt = $this->approveReceipt($order, 3);

        $response = $this->actingAs($siteAccountant, 'sanctum')->postJson('/api/v1/accounting/invoices', [
            'purchase_order_id' => $order->id,
            'purchase_receipt_id' => $receipt->id,
            'invoice_number' => 'INV-BUF-001',
            'invoice_date' => '2026-08-05',
            'amount' => 300,
            'land_allocations' => [
                ['land_parcel_id' => $this->parcel->id, 'amount' => 300],
            ],
        ]);

        $response->assertStatus(403);
    }

    public function test_licenses_accountant_only_sees_and_creates_invoices_for_licenses_department(): void
    {
        $licensesAccountant = $this->makeUser('ahmed-test@test', 'المهندس أحمد', 'licenses_accountant');
        $licensesDept = Department::firstOrCreate(['code' => 'LICENSES'], ['name' => 'التراخيص', 'is_active' => true]);
        $executionDept = Department::firstOrCreate(['code' => 'EXECUTION'], ['name' => 'التنفيذ', 'is_active' => true]);

        $employee = $this->makeUser('emp-lic@test', 'موظف التراخيص', 'employee');
        $prLicenses = PurchaseRequest::create([
            'request_number' => 'PR-LIC-TEST',
            'user_id' => $employee->id,
            'department_id' => $licensesDept->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
            'priority' => 'NORMAL',
            'status' => 'APPROVED_BY_PROCUREMENT',
            'total_estimated_cost' => 500,
            'date_needed' => '2026-08-01',
        ]);
        $orderLicenses = PurchaseOrder::create([
            'po_number' => 'PO-LIC-TEST',
            'purchase_request_id' => $prLicenses->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $employee->id,
            'status' => 'ISSUED',
            'subtotal' => 500,
            'grand_total' => 500,
            'delivery_status' => 'NOT_STARTED',
        ]);
        $orderLicenses->items()->create([
            'item_description' => 'رسوم تراخيص',
            'quantity' => 1,
            'uom' => 'PCS',
            'unit_price' => 500,
            'line_total' => 500,
        ]);
        $receiptLicenses = $this->approveReceipt($orderLicenses, 1);

        $prExecution = PurchaseRequest::create([
            'request_number' => 'PR-EXE-TEST',
            'user_id' => $employee->id,
            'department_id' => $executionDept->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
            'priority' => 'NORMAL',
            'status' => 'APPROVED_BY_PROCUREMENT',
            'total_estimated_cost' => 800,
            'date_needed' => '2026-08-01',
        ]);
        $orderExecution = PurchaseOrder::create([
            'po_number' => 'PO-EXE-TEST',
            'purchase_request_id' => $prExecution->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $employee->id,
            'status' => 'ISSUED',
            'subtotal' => 800,
            'grand_total' => 800,
            'delivery_status' => 'NOT_STARTED',
        ]);
        $orderExecution->items()->create([
            'item_description' => 'أسمنت',
            'quantity' => 8,
            'uom' => 'BAG',
            'unit_price' => 100,
            'line_total' => 800,
        ]);
        $receiptExecution = $this->approveReceipt($orderExecution, 8);

        $service = app(SupplierInvoiceService::class);
        $receipts = $service->approvedReceipts(100, $licensesAccountant);
        $this->assertTrue($receipts->contains('id', $receiptLicenses->id));
        $this->assertFalse($receipts->contains('id', $receiptExecution->id));

        // Attempt to create invoice for Execution order as Ahmed (should be 403)
        $forbiddenRes = $this->actingAs($licensesAccountant, 'sanctum')->postJson('/api/v1/accounting/invoices', [
            'purchase_order_id' => $orderExecution->id,
            'purchase_receipt_id' => $receiptExecution->id,
            'invoice_number' => 'INV-EXE-FORBIDDEN',
            'amount' => 800,
        ]);
        $forbiddenRes->assertStatus(403);

        // Can create invoice for Licenses order
        $allowedRes = $this->actingAs($licensesAccountant, 'sanctum')->postJson('/api/v1/accounting/invoices', [
            'purchase_order_id' => $orderLicenses->id,
            'purchase_receipt_id' => $receiptLicenses->id,
            'invoice_number' => 'INV-LIC-ALLOWED',
            'amount' => 500,
        ]);
        $allowedRes->assertStatus(201);
    }

    public function test_buffet_accountant_only_sees_and_creates_invoices_for_buffet_department(): void
    {
        $buffetAccountant = $this->makeUser('shorouk-test@test', 'المهندسة شروق', 'buffet_accountant');
        $buffetDept = Department::firstOrCreate(['code' => 'BUFFET'], ['name' => 'البوفيه', 'is_active' => true]);
        $licensesDept = Department::firstOrCreate(['code' => 'LICENSES'], ['name' => 'التراخيص', 'is_active' => true]);

        $employee = $this->makeUser('emp-buf2@test', 'موظف بوفيه', 'employee');
        $prBuffet = PurchaseRequest::create([
            'request_number' => 'PR-BUF-TEST',
            'user_id' => $employee->id,
            'department_id' => $buffetDept->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
            'priority' => 'NORMAL',
            'status' => 'APPROVED_BY_PROCUREMENT',
            'total_estimated_cost' => 200,
            'date_needed' => '2026-08-01',
        ]);
        $orderBuffet = PurchaseOrder::create([
            'po_number' => 'PO-BUF-TEST',
            'purchase_request_id' => $prBuffet->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $employee->id,
            'status' => 'ISSUED',
            'subtotal' => 200,
            'grand_total' => 200,
            'delivery_status' => 'NOT_STARTED',
        ]);
        $orderBuffet->items()->create([
            'item_description' => 'مستلزمات مكتب وبوفيه',
            'quantity' => 2,
            'uom' => 'PCS',
            'unit_price' => 100,
            'line_total' => 200,
        ]);
        $receiptBuffet = $this->approveReceipt($orderBuffet, 2);

        $service = app(SupplierInvoiceService::class);
        $receipts = $service->approvedReceipts(100, $buffetAccountant);
        $this->assertTrue($receipts->contains('id', $receiptBuffet->id));

        // Allowed to create invoice for Buffet
        $allowedRes = $this->actingAs($buffetAccountant, 'sanctum')->postJson('/api/v1/accounting/invoices', [
            'purchase_order_id' => $orderBuffet->id,
            'purchase_receipt_id' => $receiptBuffet->id,
            'invoice_number' => 'INV-BUF-ALLOWED',
            'amount' => 200,
        ]);
        $allowedRes->assertStatus(201);
    }

    public function test_general_accountant_sees_all_departments_and_can_create_invoice_and_record_receipt(): void
    {
        $habiba = $this->makeUser('habiba@gmail.com', 'المهندسة حبيبة', 'general_accountant');
        $buffetDept = Department::firstOrCreate(['code' => 'BUFFET'], ['name' => 'البوفيه', 'is_active' => true]);
        $licensesDept = Department::firstOrCreate(['code' => 'LICENSES'], ['name' => 'التراخيص', 'is_active' => true]);
        $itDept = Department::firstOrCreate(['code' => 'IT'], ['name' => 'تكنولوجيا المعلومات', 'is_active' => true]);

        $employee = $this->makeUser('emp-all@test', 'موظف عام', 'employee');

        // 1. Order & Receipt for BUFFET
        $prBuffet = PurchaseRequest::create([
            'request_number' => 'PR-BUF-GEN',
            'user_id' => $employee->id,
            'department_id' => $buffetDept->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
            'priority' => 'NORMAL',
            'status' => 'APPROVED_BY_PROCUREMENT',
            'total_estimated_cost' => 150,
            'date_needed' => '2026-08-01',
        ]);
        $orderBuffet = PurchaseOrder::create([
            'po_number' => 'PO-BUF-GEN',
            'purchase_request_id' => $prBuffet->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $employee->id,
            'status' => 'ISSUED',
            'subtotal' => 150,
            'grand_total' => 150,
            'delivery_status' => 'NOT_STARTED',
        ]);
        $orderBuffet->items()->create([
            'item_description' => 'شاي وسكر',
            'quantity' => 1,
            'uom' => 'PCS',
            'unit_price' => 150,
            'line_total' => 150,
        ]);
        $receiptBuffet = $this->approveReceipt($orderBuffet, 1);

        // 2. Order & Receipt for LICENSES
        $prLicenses = PurchaseRequest::create([
            'request_number' => 'PR-LIC-GEN',
            'user_id' => $employee->id,
            'department_id' => $licensesDept->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
            'priority' => 'NORMAL',
            'status' => 'APPROVED_BY_PROCUREMENT',
            'total_estimated_cost' => 600,
            'date_needed' => '2026-08-01',
        ]);
        $orderLicenses = PurchaseOrder::create([
            'po_number' => 'PO-LIC-GEN',
            'purchase_request_id' => $prLicenses->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $employee->id,
            'status' => 'ISSUED',
            'subtotal' => 600,
            'grand_total' => 600,
            'delivery_status' => 'NOT_STARTED',
        ]);
        $orderLicenses->items()->create([
            'item_description' => 'تجديد تصريح',
            'quantity' => 1,
            'uom' => 'PCS',
            'unit_price' => 600,
            'line_total' => 600,
        ]);
        $receiptLicenses = $this->approveReceipt($orderLicenses, 1);

        // 3. Order & Receipt for IT
        $prIt = PurchaseRequest::create([
            'request_number' => 'PR-IT-GEN',
            'user_id' => $employee->id,
            'department_id' => $itDept->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
            'priority' => 'NORMAL',
            'status' => 'APPROVED_BY_PROCUREMENT',
            'total_estimated_cost' => 1200,
            'date_needed' => '2026-08-01',
        ]);
        $orderIt = PurchaseOrder::create([
            'po_number' => 'PO-IT-GEN',
            'purchase_request_id' => $prIt->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $employee->id,
            'status' => 'ISSUED',
            'subtotal' => 1200,
            'grand_total' => 1200,
            'delivery_status' => 'NOT_STARTED',
        ]);
        $orderIt->items()->create([
            'item_description' => 'راوتر شبكة',
            'quantity' => 1,
            'uom' => 'PCS',
            'unit_price' => 1200,
            'line_total' => 1200,
        ]);
        $receiptIt = $this->approveReceipt($orderIt, 1);

        $service = app(SupplierInvoiceService::class);
        $receipts = $service->approvedReceipts(100, $habiba);
        $this->assertTrue($receipts->contains('id', $receiptBuffet->id));
        $this->assertTrue($receipts->contains('id', $receiptLicenses->id));
        $this->assertTrue($receipts->contains('id', $receiptIt->id));

        // General Accountant can record invoices for any department
        $resBuffet = $this->actingAs($habiba, 'sanctum')->postJson('/api/v1/accounting/invoices', [
            'purchase_order_id' => $orderBuffet->id,
            'purchase_receipt_id' => $receiptBuffet->id,
            'invoice_number' => 'INV-GEN-BUF',
            'amount' => 150,
        ]);
        $resBuffet->assertStatus(201);

        $resLicenses = $this->actingAs($habiba, 'sanctum')->postJson('/api/v1/accounting/invoices', [
            'purchase_order_id' => $orderLicenses->id,
            'purchase_receipt_id' => $receiptLicenses->id,
            'invoice_number' => 'INV-GEN-LIC',
            'amount' => 600,
        ]);
        $resLicenses->assertStatus(201);

        // General Accountant can mark receipt as recorded
        $resRecorded = $this->actingAs($habiba, 'sanctum')->postJson("/api/v1/accounting/receipts/{$receiptIt->id}/mark-recorded", [
            'notes' => 'تم التسجيل في شيت الإكسيل بواسطة المهندسة حبيبة',
        ]);
        $resRecorded->assertStatus(200);
        $this->assertNotNull($receiptIt->fresh()->accountant_recorded_at);
        $this->assertSame($habiba->id, $receiptIt->fresh()->accountant_recorded_by_user_id);
    }

    public function test_unmapped_departments_route_notifications_to_general_accountant_fallback(): void
    {
        $habiba = $this->makeUser('habiba@gmail.com', 'المهندسة حبيبة', 'general_accountant');
        $service = app(SupplierInvoiceService::class);

        // 1. BUFFET routes to buffet accountant
        $buffetAccountant = $this->makeUser('shorouk-route@test', 'شروق', 'buffet_accountant');
        $accountantsBuf = $service->getAccountantsForDepartment('BUFFET');
        $this->assertTrue($accountantsBuf->contains('id', $buffetAccountant->id));

        // 2. LICENSES routes to licenses accountant
        $licensesAccountant = $this->makeUser('ahmed-route@test', 'أحمد', 'licenses_accountant');
        $accountantsLic = $service->getAccountantsForDepartment('LICENSES');
        $this->assertTrue($accountantsLic->contains('id', $licensesAccountant->id));

        // 3. Any unmapped department (e.g. IT, LEGAL, MARKETING, null) falls back to General Accountant (Habiba)
        $accountantsIt = $service->getAccountantsForDepartment('IT');
        $this->assertTrue($accountantsIt->contains('id', $habiba->id));

        $accountantsLegal = $service->getAccountantsForDepartment('LEGAL');
        $this->assertTrue($accountantsLegal->contains('id', $habiba->id));

        $accountantsUnknown = $service->getAccountantsForDepartment(null);
        $this->assertTrue($accountantsUnknown->contains('id', $habiba->id));
    }

    public function test_general_accountant_can_view_and_approve_direct_requests_for_any_department(): void
    {
        $habiba = $this->makeUser('habiba@gmail.com', 'المهندسة حبيبة', 'general_accountant');
        $itDept = Department::firstOrCreate(['code' => 'IT'], ['name' => 'تكنولوجيا المعلومات', 'is_active' => true]);
        $employee = $this->makeUser('emp-it@test', 'مهندس الشبكات', 'employee');

        $pr = PurchaseRequest::create([
            'request_number' => 'PR-IT-DIRECT-001',
            'user_id' => $employee->id,
            'department_id' => $itDept->id,
            'status' => 'PENDING_ACCOUNTING_APPROVAL',
            'procurement_route' => 'DIRECT',
            'direct_supplier_id' => $this->supplier->id,
            'total_estimated_cost' => 5000.00,
            'date_needed' => now()->addDays(3)->toDateString(),
        ]);
        $pr->items()->create([
            'item_description' => 'خادم سحابي محلي',
            'quantity' => 1,
            'uom' => 'PCS',
            'supplier_id' => $this->supplier->id,
            'estimated_unit_price' => 5000.00,
            'estimated_line_total' => 5000.00,
        ]);

        // General Accountant can view pending requests from IT
        $resIndex = $this->actingAs($habiba, 'sanctum')->getJson('/api/v1/accounting/purchase-requests/direct-approval');
        $resIndex->assertStatus(200);
        $resIndex->assertJsonFragment(['request_number' => 'PR-IT-DIRECT-001']);

        // General Accountant can approve request
        $resApprove = $this->actingAs($habiba, 'sanctum')->postJson("/api/v1/accounting/purchase-requests/{$pr->id}/direct-approve", [
            'comment' => 'معتمد من المحاسب العام المهندسة حبيبة',
        ]);
        $resApprove->assertStatus(200);
        $this->assertSame('APPROVED_BY_ACCOUNTING', $pr->fresh()->status);
    }

    private function makeUser(string $email, string $name, string $roleSlug): User
    {
        $user = User::firstOrCreate(
            ['email' => $email],
            [
                'department_id' => $this->department?->id,
                'name' => $name,
                'password' => Hash::make('Secret123!'),
                'is_active' => true,
            ]
        );
        $role = Role::where('slug', $roleSlug)->firstOrFail();
        if (! $user->roles()->where('roles.id', $role->id)->exists()) {
            $user->roles()->attach($role->id);
        }
        return $user->fresh(['roles.permissions']);
    }
}
