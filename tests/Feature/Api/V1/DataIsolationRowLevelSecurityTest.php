<?php

namespace Tests\Feature\Api\V1;

use App\Models\Category;
use App\Models\Department;
use App\Models\Item;
use App\Models\PurchaseOrder;
use App\Models\PurchaseReceipt;
use App\Models\PurchaseRequest;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\SupplierInvoice;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class DataIsolationRowLevelSecurityTest extends TestCase
{
    use RefreshDatabase;

    private Department $executionDept;
    private Department $licensesDept;

    private User $admin;
    private User $generalManager;
    private User $executionManager;
    private User $siteEngineer1;
    private User $siteEngineer2;
    private User $procurementManager;
    private User $siteAccountant;

    private Supplier $supplier;
    private Item $item;

    private PurchaseRequest $prExecutionEngineer1;
    private PurchaseRequest $prExecutionEngineer2;
    private PurchaseRequest $prLicenses;

    private PurchaseOrder $poExecutionEngineer1;
    private PurchaseOrder $poLicenses;

    private PurchaseReceipt $receiptEngineer1;
    private PurchaseReceipt $receiptEngineer2;

    private SupplierInvoice $invoiceExecution;
    private SupplierInvoice $invoiceLicenses;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);

        // Departments
        $this->executionDept = Department::create(['name' => 'إدارة التنفيذ', 'code' => 'EXECUTION']);
        $this->licensesDept = Department::create(['name' => 'إدارة التراخيص', 'code' => 'LICENSES']);

        // Roles
        $adminRole = Role::where('slug', 'admin')->firstOrFail();
        $gmRole = Role::where('slug', 'general_manager')->firstOrFail();
        $emRole = Role::where('slug', 'execution_manager')->firstOrFail();
        $seRole = Role::where('slug', 'site_engineer')->firstOrFail();
        $pmRole = Role::where('slug', 'procurement_manager')->firstOrFail();
        $saRole = Role::where('slug', 'site_accountant')->firstOrFail();

        // Users
        $this->admin = User::create([
            'name' => 'Admin User',
            'email' => 'admin@test.com',
            'password' => Hash::make('password'),
            'is_active' => true,
        ]);
        $this->admin->roles()->attach($adminRole);

        $this->generalManager = User::create([
            'name' => 'General Manager',
            'email' => 'gm@test.com',
            'password' => Hash::make('password'),
            'is_active' => true,
        ]);
        $this->generalManager->roles()->attach($gmRole);

        $this->executionManager = User::create([
            'department_id' => $this->executionDept->id,
            'name' => 'Execution Manager',
            'email' => 'em@test.com',
            'password' => Hash::make('password'),
            'is_active' => true,
        ]);
        $this->executionManager->roles()->attach($emRole);

        $this->siteEngineer1 = User::create([
            'department_id' => $this->executionDept->id,
            'manager_id' => $this->executionManager->id,
            'name' => 'Site Engineer 1',
            'email' => 'se1@test.com',
            'password' => Hash::make('password'),
            'is_active' => true,
        ]);
        $this->siteEngineer1->roles()->attach($seRole);

        $this->siteEngineer2 = User::create([
            'department_id' => $this->executionDept->id,
            'manager_id' => $this->executionManager->id,
            'name' => 'Site Engineer 2',
            'email' => 'se2@test.com',
            'password' => Hash::make('password'),
            'is_active' => true,
        ]);
        $this->siteEngineer2->roles()->attach($seRole);

        $this->procurementManager = User::create([
            'name' => 'Procurement Manager',
            'email' => 'pm@test.com',
            'password' => Hash::make('password'),
            'is_active' => true,
        ]);
        $this->procurementManager->roles()->attach($pmRole);

        $this->siteAccountant = User::create([
            'name' => 'Site Accountant',
            'email' => 'sa@test.com',
            'password' => Hash::make('password'),
            'is_active' => true,
        ]);
        $this->siteAccountant->roles()->attach($saRole);

        // Catalog & Supplier
        $category = Category::create(['name' => 'Building Materials', 'code' => 'BUILDING_MAT']);
        $this->item = Item::create([
            'category_id' => $category->id,
            'sku' => 'SKU-CEM-01',
            'name' => 'Cement Ordinary',
            'uom' => 'BAG',
            'is_active' => true,
        ]);
        $this->supplier = Supplier::create([
            'company_name' => 'Al-Nasr Cement Co',
            'contact_name' => 'Mahmoud',
            'is_active' => true,
            'opening_balance' => 0,
        ]);

        // Purchase Requests
        $this->prExecutionEngineer1 = PurchaseRequest::create([
            'request_number' => 'PR-EXEC-001',
            'user_id' => $this->siteEngineer1->id,
            'department_id' => $this->executionDept->id,
            'site_engineer_user_id' => $this->siteEngineer1->id,
            'status' => 'PENDING_PROCUREMENT_APPROVAL',
            'total_estimated_cost' => 50000,
        ]);

        $this->prExecutionEngineer2 = PurchaseRequest::create([
            'request_number' => 'PR-EXEC-002',
            'user_id' => $this->siteEngineer2->id,
            'department_id' => $this->executionDept->id,
            'site_engineer_user_id' => $this->siteEngineer2->id,
            'status' => 'DRAFT',
            'total_estimated_cost' => 20000,
        ]);

        $this->prLicenses = PurchaseRequest::create([
            'request_number' => 'PR-LIC-001',
            'user_id' => $this->admin->id,
            'department_id' => $this->licensesDept->id,
            'status' => 'APPROVED_BY_ACCOUNTING',
            'total_estimated_cost' => 15000,
        ]);

        // Purchase Orders
        $this->poExecutionEngineer1 = PurchaseOrder::create([
            'po_number' => 'PO-EXEC-001',
            'purchase_request_id' => $this->prExecutionEngineer1->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $this->procurementManager->id,
            'status' => 'ISSUED',
            'finalized_at' => now(),
            'grand_total' => 50000,
        ]);

        $this->poLicenses = PurchaseOrder::create([
            'po_number' => 'PO-LIC-001',
            'purchase_request_id' => $this->prLicenses->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $this->procurementManager->id,
            'status' => 'ISSUED',
            'finalized_at' => now(),
            'grand_total' => 15000,
        ]);

        // Receipts
        $this->receiptEngineer1 = PurchaseReceipt::create([
            'purchase_order_id' => $this->poExecutionEngineer1->id,
            'purchase_request_id' => $this->prExecutionEngineer1->id,
            'site_engineer_user_id' => $this->siteEngineer1->id,
            'receipt_number' => 'GRN-001',
            'status' => 'APPROVED',
        ]);

        $this->receiptEngineer2 = PurchaseReceipt::create([
            'purchase_order_id' => $this->poExecutionEngineer1->id,
            'purchase_request_id' => $this->prExecutionEngineer2->id,
            'site_engineer_user_id' => $this->siteEngineer2->id,
            'receipt_number' => 'GRN-002',
            'status' => 'APPROVED',
        ]);

        $receiptLicenses = PurchaseReceipt::create([
            'purchase_order_id' => $this->poLicenses->id,
            'purchase_request_id' => $this->prLicenses->id,
            'site_engineer_user_id' => $this->admin->id,
            'receipt_number' => 'GRN-LIC-001',
            'status' => 'APPROVED',
        ]);

        // Invoices
        $this->invoiceExecution = SupplierInvoice::create([
            'supplier_id' => $this->supplier->id,
            'purchase_order_id' => $this->poExecutionEngineer1->id,
            'purchase_receipt_id' => $this->receiptEngineer1->id,
            'created_by_user_id' => $this->siteAccountant->id,
            'invoice_number' => 'INV-EXEC-001',
            'invoice_date' => now()->toDateString(),
            'amount' => 50000,
            'status' => 'APPROVED',
        ]);

        $this->invoiceLicenses = SupplierInvoice::create([
            'supplier_id' => $this->supplier->id,
            'purchase_order_id' => $this->poLicenses->id,
            'purchase_receipt_id' => $receiptLicenses->id,
            'created_by_user_id' => $this->admin->id,
            'invoice_number' => 'INV-LIC-001',
            'invoice_date' => now()->toDateString(),
            'amount' => 15000,
            'status' => 'APPROVED',
        ]);
    }

    public function test_admin_and_general_manager_can_see_all_records_without_isolation(): void
    {
        $this->actingAs($this->admin);
        $this->assertCount(3, PurchaseRequest::all());
        $this->assertCount(2, PurchaseOrder::all());
        $this->assertCount(3, PurchaseReceipt::all());
        $this->assertCount(2, SupplierInvoice::all());

        $this->actingAs($this->generalManager);
        $this->assertCount(3, PurchaseRequest::all());
        $this->assertCount(2, PurchaseOrder::all());
        $this->assertCount(3, PurchaseReceipt::all());
        $this->assertCount(2, SupplierInvoice::all());
    }

    public function test_site_engineer_is_strictly_isolated_to_own_requests_and_receipts(): void
    {
        $this->actingAs($this->siteEngineer1);

        $prs = PurchaseRequest::all();
        $this->assertCount(1, $prs);
        $this->assertSame($this->prExecutionEngineer1->id, $prs->first()->id);

        $receipts = PurchaseReceipt::all();
        $this->assertCount(1, $receipts);
        $this->assertSame($this->receiptEngineer1->id, $receipts->first()->id);

        $pos = PurchaseOrder::all();
        $this->assertCount(1, $pos);
        $this->assertSame($this->poExecutionEngineer1->id, $pos->first()->id);
    }

    public function test_site_engineer_cannot_directly_access_other_users_purchase_request_by_id(): void
    {
        // Site Engineer 1 tries to access PR created by Site Engineer 2
        $token = $this->siteEngineer1->createToken('test')->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/v1/purchase-requests/' . $this->prExecutionEngineer2->id);

        // Global scope filters it out -> findOrFail throws ModelNotFoundException -> 404
        $response->assertStatus(404);

        // Site Engineer 1 can access their own PR
        $ownResponse = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/v1/purchase-requests/' . $this->prExecutionEngineer1->id);

        $ownResponse->assertOk();
    }

    public function test_execution_manager_is_isolated_to_department_records(): void
    {
        $this->actingAs($this->executionManager);

        // Execution manager sees requests in EXECUTION department (SE1 and SE2), but NOT LICENSES
        $prs = PurchaseRequest::all();
        $this->assertCount(2, $prs);
        $prIds = $prs->pluck('id')->all();
        $this->assertContains($this->prExecutionEngineer1->id, $prIds);
        $this->assertContains($this->prExecutionEngineer2->id, $prIds);
        $this->assertNotContains($this->prLicenses->id, $prIds);

        // Orders: sees EXECUTION PO, but NOT LICENSES PO
        $pos = PurchaseOrder::all();
        $this->assertCount(1, $pos);
        $this->assertSame($this->poExecutionEngineer1->id, $pos->first()->id);

        // Invoices: sees EXECUTION invoice, but NOT LICENSES invoice
        $invoices = SupplierInvoice::all();
        $this->assertCount(1, $invoices);
        $this->assertSame($this->invoiceExecution->id, $invoices->first()->id);
    }

    public function test_procurement_manager_sees_forwarded_requests_and_all_orders(): void
    {
        $this->actingAs($this->procurementManager);

        // PR1 is in PENDING_PROCUREMENT_APPROVAL (forwarded to procurement)
        // PR Licenses is in APPROVED_BY_ACCOUNTING (reached procurement/accounting)
        // PR2 is DRAFT (should NOT be visible to procurement)
        $prs = PurchaseRequest::all();
        $this->assertCount(2, $prs);
        $prIds = $prs->pluck('id')->all();
        $this->assertContains($this->prExecutionEngineer1->id, $prIds);
        $this->assertContains($this->prLicenses->id, $prIds);
        $this->assertNotContains($this->prExecutionEngineer2->id, $prIds);

        // All purchase orders are visible to procurement manager
        $pos = PurchaseOrder::all();
        $this->assertCount(2, $pos);
    }

    public function test_site_accountant_is_isolated_to_accounting_scoped_departments(): void
    {
        $this->actingAs($this->siteAccountant);

        // Site accountant is restricted to EXECUTION, FINISHING, BUILDINGS
        // Sees PO for EXECUTION, but NOT PO for LICENSES
        $pos = PurchaseOrder::all();
        $this->assertCount(1, $pos);
        $this->assertSame($this->poExecutionEngineer1->id, $pos->first()->id);

        // Invoices: sees EXECUTION invoice, but NOT LICENSES invoice
        $invoices = SupplierInvoice::all();
        $this->assertCount(1, $invoices);
        $this->assertSame($this->invoiceExecution->id, $invoices->first()->id);
    }

    public function test_without_data_isolation_bypasses_scope_when_explicitly_requested(): void
    {
        $this->actingAs($this->siteEngineer1);

        // Normal query is isolated
        $this->assertCount(1, PurchaseRequest::all());

        // Bypassed query sees all
        $allPrs = PurchaseRequest::withoutDataIsolation()->get();
        $this->assertCount(3, $allPrs);
    }
}
