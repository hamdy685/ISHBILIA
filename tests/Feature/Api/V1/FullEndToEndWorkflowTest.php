<?php

namespace Tests\Feature\Api\V1;

use App\Models\ApprovalHistory;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\Department;
use App\Models\Item;
use App\Models\LandParcel;
use App\Models\Notification;
use App\Models\Permission;
use App\Models\PurchaseOrder;
use App\Models\PurchaseRequest;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use App\Services\PurchaseQuoteService;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FullEndToEndWorkflowTest extends TestCase
{
    use RefreshDatabase;

    protected User $employee;
    protected User $reviewer;
    protected User $procurementManager;
    protected User $accountant;
    protected User $generalManager;
    protected User $warehouseKeeper;
    protected User $siteEngineer;
    protected Department $department;
    protected Item $catalogItem;
    protected Supplier $activeSupplier;
    protected Supplier $supplierB;
    protected Supplier $supplierC;
    protected LandParcel $landParcel;
    protected LandParcel $directLandParcel;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);

        // 3. Create Department
        $this->department = Department::create([
            'code' => 'EXECUTION',
            'name' => 'التنفيذ',
            'is_active' => true,
        ]);
        $requesterDepartment = Department::create([
            'code' => 'REQ-DEPT',
            'name' => 'Requester Department',
            'is_active' => true,
        ]);

        $roleEmployee = Role::where('slug', 'employee')->first();
        $roleReviewer = Role::where('slug', 'reviewer')->first();
        $roleProcurement = Role::where('slug', 'procurement_manager')->first();
        $roleAccountant = Role::where('slug', 'accountant')->first();
        $roleGM = Role::where('slug', 'general_manager')->first();
        $roleWarehouse = Role::where('slug', 'warehouse_keeper')->first();
        $roleSiteEngineer = Role::where('slug', 'site_engineer')->first();

        // 4. Create Users
        $this->employee = User::create([
            'name' => 'Ahmad Employee',
            'email' => 'ahmad@ashbiliya.com',
            'password' => bcrypt('Password123!'),
            'department_id' => $this->department->id,
            'is_active' => true,
        ]);
        $this->employee->roles()->attach($roleEmployee);

        $this->reviewer = User::create([
            'name' => 'Sari Reviewer',
            'email' => 'sari@ashbiliya.com',
            'password' => bcrypt('Password123!'),
            'department_id' => $this->department->id,
            'is_active' => true,
        ]);
        $this->reviewer->roles()->attach($roleReviewer);
        $this->department->update(['manager_user_id' => $this->reviewer->id]);

        $this->procurementManager = User::create([
            'name' => 'Faisal Procurement',
            'email' => 'faisal@ashbiliya.com',
            'password' => bcrypt('Password123!'),
            'department_id' => $this->department->id,
            'is_active' => true,
        ]);
        $this->procurementManager->roles()->attach($roleProcurement);

        $this->accountant = User::create([
            'name' => 'Tariq Accountant',
            'email' => 'tariq@ashbiliya.com',
            'password' => bcrypt('Password123!'),
            'department_id' => $this->department->id,
            'is_active' => true,
        ]);
        $this->accountant->roles()->attach($roleAccountant);
        $roleSiteAccountant = Role::where('slug', 'site_accountant')->first();
        if ($roleSiteAccountant) {
            $this->accountant->roles()->attach($roleSiteAccountant);
        }

        $this->generalManager = User::create([
            'name' => 'Khaled GM',
            'email' => 'khaled@ashbiliya.com',
            'password' => bcrypt('Password123!'),
            'department_id' => $this->department->id,
            'is_active' => true,
        ]);
        $this->generalManager->roles()->attach($roleGM);

        $this->warehouseKeeper = User::create([
            'name' => 'Salama Warehouse Keeper',
            'email' => 'salama-e2e@ashbiliya.com',
            'password' => bcrypt('Password123!'),
            'department_id' => $this->department->id,
            'is_active' => true,
        ]);
        $this->warehouseKeeper->roles()->attach($roleWarehouse);

        $this->siteEngineer = User::create([
            'name' => 'Site Engineer E2E',
            'email' => 'site-e2e@ashbiliya.com',
            'password' => bcrypt('Password123!'),
            'department_id' => $this->department->id,
            'is_active' => true,
        ]);
        $this->siteEngineer->roles()->attach($roleSiteEngineer);
        $this->department->update(['site_engineer_user_id' => $this->siteEngineer->id]);

        // 5. Create Catalog Item & Supplier
        $category = Category::create(['code' => 'HARDWARE', 'name' => 'Hardware', 'is_active' => true]);
        $this->catalogItem = Item::create([
            'sku' => 'LAPTOP-PRO-16',
            'name' => 'High-Performance Workstation Laptop',
            'category_id' => $category->id,
            'uom' => 'PCS',
            'default_estimated_price' => 5000.00,
            'is_active' => true,
        ]);

        $this->activeSupplier = Supplier::create([
            'code' => 'SUP-TECH-01',
            'company_name' => 'Tech Solutions Ltd',
            'email' => 'sales@techsolutions.com',
            'phone' => '+966114445555',
            'is_active' => true,
        ]);
        $this->supplierB = Supplier::create([
            'code' => 'SUP-TECH-02',
            'company_name' => 'Tech Solutions Ltd B',
            'is_active' => true,
        ]);
        $this->supplierC = Supplier::create([
            'code' => 'SUP-TECH-03',
            'company_name' => 'Tech Solutions Ltd C',
            'is_active' => true,
        ]);
        $this->landParcel = LandParcel::create([
            'parcel_reference' => 'E2E-PART-001',
            'region' => 'المنطقة السابعة والعشرون',
            'opening_balance' => 50000,
            'funded_total' => 0,
            'expense_total' => 0,
            'balance' => 50000,
            'is_active' => true,
        ]);
        $this->directLandParcel = LandParcel::create([
            'parcel_reference' => 'DIRECT-PART-001',
            'region' => 'المنطقة السابعة والعشرون',
            'opening_balance' => 10000,
            'funded_total' => 0,
            'expense_total' => 0,
            'balance' => 10000,
            'is_active' => true,
        ]);
    }

    /**
     * Test complete end-to-end happy path workflow:
     */
    public function test_full_procurement_lifecycle_end_to_end_happy_path(): void
    {
        $siteEngineerOptionsResponse = $this->actingAs($this->employee, 'sanctum')
            ->getJson('/api/v1/purchase-requests/site-engineer-options');
        $siteEngineerOptionsResponse->assertStatus(200);
        $siteEngineerOptionIds = collect($siteEngineerOptionsResponse->json('site_engineers'))->pluck('id')->all();
        $this->assertContains($this->siteEngineer->id, $siteEngineerOptionIds);
        $this->assertNotContains($this->reviewer->id, $siteEngineerOptionIds);

        // -------------------------------------------------------------
        // STEP 1: Employee Creates & Submits Purchase Request
        // -------------------------------------------------------------
        $createPrPayload = [
            'target_department_id' => $this->department->id,
            'notes' => 'Urgent procurement for new team members.',
            'items' => [
                [
                    'item_id' => $this->catalogItem->id,
                    'item_description' => $this->catalogItem->name,
                    'item_reference' => 'E2E-PART-001',
                    'region' => 'المنطقة السابعة والعشرون',
                    'quantity' => 3,
                    'uom' => 'PCS',
                    'estimated_unit_price' => 5000.00,
                ],
            ],
        ];

        $prResponse = $this->actingAs($this->employee, 'sanctum')
            ->postJson('/api/v1/purchase-requests', $createPrPayload);

        $prResponse->assertStatus(201);
        $prId = $prResponse->json('data.id');

        // Submit PR
        $submitPrResponse = $this->actingAs($this->employee, 'sanctum')
            ->postJson("/api/v1/purchase-requests/{$prId}/submit");

        $submitPrResponse->assertStatus(200);
        $this->assertDatabaseHas('purchase_requests', [
            'id' => $prId,
            'status' => 'SUBMITTED',
        ]);

        // -------------------------------------------------------------
        // STEP 2: Reviewer Reviews & Approves Purchase Request
        // -------------------------------------------------------------
        $startReviewResponse = $this->actingAs($this->reviewer, 'sanctum')
            ->postJson("/api/v1/reviewer/purchase-requests/{$prId}/review");

        $startReviewResponse->assertStatus(200);

        // Reviewer approve -> PENDING_EXECUTIVE_APPROVAL
        $approvePrResponse = $this->actingAs($this->reviewer, 'sanctum')
            ->postJson("/api/v1/reviewer/purchase-requests/{$prId}/approve", [
                'comment' => 'Technical specifications and quantities verified.',
            ]);

        $approvePrResponse->assertStatus(200);
        $this->assertDatabaseHas('purchase_requests', [
            'id' => $prId,
            'status' => 'PENDING_EXECUTIVE_APPROVAL',
        ]);

        // -------------------------------------------------------------
        // STEP 2.5: Executive / General Manager Decision
        // -------------------------------------------------------------
        $executiveApproveResponse = $this->actingAs($this->generalManager, 'sanctum')
            ->postJson("/api/v1/general-manager/purchase-requests/{$prId}/approve", [
                'comment' => 'البيانات مناسبة وتمت الموافقة التنفيذية.',
            ]);

        $executiveApproveResponse->assertStatus(200)
            ->assertJsonPath('data.status', 'PENDING_PROCUREMENT_APPROVAL');

        // -------------------------------------------------------------
        // STEP 2.75: Procurement Manager Approves Purchase Request
        // -------------------------------------------------------------
        $procApproveResponse = $this->actingAs($this->procurementManager, 'sanctum')
            ->postJson("/api/v1/procurement/purchase-requests/{$prId}/approve", [
                'comment' => 'Procurement budget and vendor availability verified.',
            ]);

        $procApproveResponse->assertStatus(200)
            ->assertJsonPath('data.status', 'PENDING_QUOTE_RECOMMENDATIONS');

        $quotesResponse = $this->actingAs($this->procurementManager, 'sanctum')
            ->postJson("/api/v1/procurement/purchase-requests/{$prId}/quotes", [
                'quotes' => [
                    ['supplier_id' => $this->activeSupplier->id, 'total_amount' => 15000],
                    ['supplier_id' => $this->supplierB->id, 'total_amount' => 15500],
                    ['supplier_id' => $this->supplierC->id, 'total_amount' => 16000],
                ],
            ]);
        $quotesResponse->assertStatus(200)
            ->assertJsonPath('data.status', 'PENDING_QUOTE_RECOMMENDATIONS');
        $quoteIds = collect($quotesResponse->json('data.quotes'))->pluck('id')->values();

        $this->actingAs($this->accountant, 'sanctum')
            ->postJson("/api/v1/purchase-quotes/{$quoteIds[0]}/recommend", [
                'decision' => 'RECOMMEND',
                'comment' => 'ترشيح الحسابات.',
            ])->assertStatus(200);
        $this->actingAs($this->reviewer, 'sanctum')
            ->postJson("/api/v1/purchase-quotes/{$quoteIds[0]}/recommend", [
                'decision' => 'RECOMMEND',
                'comment' => 'ترشيح مدير القسم.',
            ])->assertStatus(200)
            ->assertJsonPath('data.status', 'PENDING_EXECUTIVE_QUOTE_DECISION');
        $this->actingAs($this->generalManager, 'sanctum')
            ->postJson("/api/v1/purchase-quotes/{$quoteIds[0]}/decide", [
                'decision' => 'SELECT',
                'comment' => 'اختيار العرض الأنسب.',
            ])->assertStatus(200)
            ->assertJsonPath('data.status', 'APPROVED_BY_PROCUREMENT');

        // -------------------------------------------------------------
        // STEP 3: Procurement Manager Creates & Submits PO to Accounting
        // -------------------------------------------------------------
        $prItemId = PurchaseRequest::findOrFail($prId)->items()->firstOrFail()->id;
        $createPoPayload = [
            'purchase_request_id' => $prId,
            'supplier_id' => $this->activeSupplier->id,
            'payment_terms' => 'Net 30 Days',
            'delivery_terms' => 'FOB Destination',
            'delivery_date' => now()->addDays(20)->format('Y-m-d'),
            'items' => [[
                'pr_item_id' => $prItemId,
                'item_id' => $this->catalogItem->id,
                'item_description' => $this->catalogItem->name,
                'item_reference' => 'E2E-PART-001',
                'region' => 'المنطقة السابعة والعشرون',
                'quantity' => 3,
                'uom' => 'PCS',
                'unit_price' => 5000,
            ]],
        ];

        $poResponse = $this->actingAs($this->procurementManager, 'sanctum')
            ->postJson('/api/v1/procurement/purchase-orders', $createPoPayload);

        $poResponse->assertStatus(201)
            ->assertJsonPath('data.status', 'ISSUED');
        $poId = $poResponse->json('data.id');

        $po = PurchaseOrder::with('items')->findOrFail($poId);
        $poItem = $po->items->firstOrFail();
        $warehouseReceiptResponse = $this->actingAs($this->warehouseKeeper, 'sanctum')
            ->postJson("/api/v1/purchase-receipts/purchase-orders/{$poId}", [
                'received_at' => now()->toDateString(),
                'warehouse_notes' => 'تم استلام الكمية كاملة في المخزن.',
                'items' => [[
                    'purchase_order_item_id' => $poItem->id,
                    'received_quantity' => (float) $poItem->quantity,
                ]],
            ]);

        $warehouseReceiptResponse->assertStatus(201)
            ->assertJsonPath('data.status', 'PENDING_SITE_ENGINEER');
        $receiptId = $warehouseReceiptResponse->json('data.id');

        $siteApprovalResponse = $this->actingAs($this->siteEngineer, 'sanctum')
            ->postJson("/api/v1/purchase-receipts/{$receiptId}/approve", [
                'site_engineer_notes' => 'تمت مراجعة الكمية واعتماد الاستلام بالموقع.',
            ]);

        $siteApprovalResponse->assertStatus(200)
            ->assertJsonPath('data.status', 'APPROVED');
        $this->assertDatabaseHas('purchase_receipts', ['id' => $receiptId, 'status' => 'APPROVED']);

        // -------------------------------------------------------------
        // STEP 6: Accounting Invoice -> Three-Way Match -> Full Payment
        // -------------------------------------------------------------
        $approvedReceiptsResponse = $this->actingAs($this->accountant, 'sanctum')
            ->getJson('/api/v1/accounting/receipts/approved');
        $approvedReceiptsResponse->assertStatus(200)
            ->assertJsonPath('data.0.id', $receiptId);

        $invoiceAmount = (float) $po->grand_total;
        $invoiceResponse = $this->actingAs($this->accountant, 'sanctum')
            ->postJson('/api/v1/accounting/invoices', [
                'purchase_order_id' => $poId,
                'purchase_receipt_id' => $receiptId,
                'invoice_number' => 'SUP-INV-E2E-001',
                'amount' => $invoiceAmount,
                'invoice_date' => now()->toDateString(),
                'land_allocations' => [['land_parcel_id' => $this->landParcel->id, 'amount' => $invoiceAmount]],
            ]);
        $invoiceResponse->assertStatus(201)
            ->assertJsonPath('data.matching_status', 'PENDING');
        $invoiceId = $invoiceResponse->json('data.id');

        $matchResponse = $this->actingAs($this->accountant, 'sanctum')
            ->postJson("/api/v1/accounting/invoices/{$invoiceId}/match");
        $matchResponse->assertStatus(200)
            ->assertJsonPath('data.matching_status', 'MATCHED');

        $paymentResponse = $this->actingAs($this->accountant, 'sanctum')
            ->postJson("/api/v1/accounting/invoices/{$invoiceId}/payments", [
                'amount' => $invoiceAmount,
                'payment_date' => now()->toDateString(),
                'payment_method' => 'BANK_TRANSFER',
                'reference_number' => 'E2E-PAY-001',
            ]);
        $paymentResponse->assertStatus(201)
            ->assertJsonPath('overpayment_warning', false)
            ->assertJsonPath('supplier_balance.balance', 0);

        $supplierAccountResponse = $this->actingAs($this->accountant, 'sanctum')
            ->getJson("/api/v1/accounting/suppliers/{$this->activeSupplier->id}/account");
        $supplierAccountResponse->assertStatus(200)
            ->assertJsonPath('data.summary.balance', 0)
            ->assertJsonPath('data.invoices.0.status', 'PAID');
    }

    public function test_procurement_can_route_request_without_quotes_to_accounting_and_back(): void
    {
        $request = PurchaseRequest::create([
            'request_number' => 'PR-DIRECT-E2E-' . uniqid(),
            'user_id' => $this->employee->id,
            'department_id' => $this->department->id,
            'reviewer_user_id' => $this->reviewer->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
            'priority' => 'NORMAL',
            'status' => 'PENDING_PROCUREMENT_APPROVAL',
            'date_needed' => now()->toDateString(),
        ]);
        $request->items()->create([
            'item_id' => $this->catalogItem->id,
            'item_description' => $this->catalogItem->name,
            'item_reference' => 'DIRECT-PART-001',
            'region' => 'المنطقة السابعة والعشرون',
            'quantity' => 1,
            'uom' => 'PCS',
            'estimated_unit_price' => 2500,
            'estimated_line_total' => 2500,
        ]);

        $directRouteResponse = $this->actingAs($this->procurementManager, 'sanctum')
            ->postJson("/api/v1/procurement/purchase-requests/{$request->id}/approve", [
                                'use_quotes' => false,
                'financial_data' => [
                    'supplier_id' => $this->activeSupplier->id,
                    'items' => [[
                        'pr_item_id' => $request->items()->firstOrFail()->id,
                        'quantity' => 1,
                        'unit_price' => 2500,
                    ]],
                ],
                'comment' => 'لا حاجة لعروض أسعار لهذا الطلب.',

            ]);
        $directRouteResponse->assertStatus(200)
            ->assertJsonPath('data.status', 'PENDING_EXECUTIVE_APPROVAL')
            ->assertJsonPath('data.direct_supplier_id', $this->activeSupplier->id)
            ->assertJsonPath('data.total_estimated_cost', '2500.00');

        $this->actingAs($this->generalManager, 'sanctum')
            ->postJson("/api/v1/general-manager/purchase-requests/{$request->id}/approve", [
                'comment' => 'معتمد تنفيذيًا للشراء المباشر.',
            ])
            ->assertStatus(200)
            ->assertJsonPath('data.status', 'PENDING_ACCOUNTING_APPROVAL');
        $this->assertDatabaseHas('purchase_requests', [
            'id' => $request->id,
            'procurement_route' => 'DIRECT',
            'direct_supplier_id' => $this->activeSupplier->id,
            'total_estimated_cost' => 2500.00,
        ]);
        $this->assertDatabaseHas('purchase_request_items', [
            'purchase_request_id' => $request->id,
            'estimated_unit_price' => 2500.00,
            'estimated_line_total' => 2500.00,
        ]);

        $accountingQueueResponse = $this->actingAs($this->accountant, 'sanctum')
            ->getJson('/api/v1/accounting/purchase-requests/direct-approval');
                $accountingQueueResponse->assertStatus(200)
            ->assertJsonFragment(['id' => $request->id]);

        $accountingSuppliersResponse = $this->actingAs($this->accountant, 'sanctum')
            ->getJson('/api/v1/accounting/purchase-requests/direct-suppliers');
        $accountingSuppliersResponse->assertStatus(200)
            ->assertJsonFragment(['id' => $this->activeSupplier->id, 'company_name' => $this->activeSupplier->company_name]);

        $accountingApproveResponse = $this->actingAs($this->accountant, 'sanctum')
            ->postJson("/api/v1/accounting/purchase-requests/{$request->id}/direct-approve", [
                'financial_data' => [
                    'supplier_id' => $this->activeSupplier->id,
                    'items' => [[
                        'pr_item_id' => $request->items()->firstOrFail()->id,
                        'quantity' => 2,
                        'unit_price' => 2600,
                    ]],
                    'notes' => 'عدّلت الحسابات السعر والكمية بعد مراجعة البيانات المالية.',
                ],
                'comment' => 'تمت الموافقة المالية بعد مراجعة وتعديل البيانات.',
            ]);
        $accountingApproveResponse->assertStatus(200)
            ->assertJsonPath('data.status', 'APPROVED_BY_ACCOUNTING')
            ->assertJsonPath('data.total_estimated_cost', '2500.00');
        $this->assertDatabaseHas('purchase_requests', [
            'id' => $request->id,
            'status' => 'APPROVED_BY_ACCOUNTING',
            'total_estimated_cost' => 2500.00,
        ]);
        $this->assertDatabaseHas('purchase_request_items', [
            'purchase_request_id' => $request->id,
            'quantity' => 1.00,
            'estimated_unit_price' => 2500.00,
            'estimated_line_total' => 2500.00,
        ]);

        $procurementQueueResponse = $this->actingAs($this->procurementManager, 'sanctum')
            ->getJson('/api/v1/procurement/approved-purchase-requests');
        $procurementQueueResponse->assertStatus(200)
            ->assertJsonFragment(['id' => $request->id, 'status' => 'APPROVED_BY_ACCOUNTING']);

        $prItemId = $request->items()->firstOrFail()->id;
        $poResponse = $this->actingAs($this->procurementManager, 'sanctum')
            ->postJson('/api/v1/procurement/purchase-orders', [
                'purchase_request_id' => $request->id,
                'supplier_id' => $this->activeSupplier->id,
                'payment_terms' => 'دفع حسب الاتفاق',
                'delivery_terms' => 'التسليم إلى الموقع',
                'delivery_date' => now()->toDateString(),
                'items' => [[
                    'pr_item_id' => $prItemId,
                    'item_id' => $this->catalogItem->id,
                    'item_description' => $this->catalogItem->name,
                    'item_reference' => 'DIRECT-PART-001',
                    'region' => 'المنطقة السابعة والعشرون',
                    'quantity' => 2,
                    'uom' => 'PCS',
                    'unit_price' => 2600,
                ]],
            ]);
        $poResponse->assertStatus(201)->assertJsonPath('data.status', 'ISSUED');
        $poId = $poResponse->json('data.id');

        $this->assertDatabaseHas('purchase_orders', [
            'id' => $poId,
            'status' => 'ISSUED',
        ]);

        // Verify Accountant Notification Created on PO Issue
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->accountant->id,
            'type' => 'purchase_order_issued_accounting',
        ]);

        // Verify GM Notification is not spammed when not requested by GM
        $this->assertDatabaseMissing('notifications', [
            'user_id' => $this->generalManager->id,
            'type' => 'purchase_order_issued_gm',
        ]);

        // -------------------------------------------------------------
        // STEP 4: General Manager Views Issued Purchase Order (Read-Only)
        // -------------------------------------------------------------
        $gmViewResponse = $this->actingAs($this->generalManager, 'sanctum')
            ->getJson("/api/v1/general-manager/purchase-orders/{$poId}");

        $gmViewResponse->assertStatus(200)
            ->assertJson([
                'data' => [
                    'id' => $poId,
                    'status' => 'ISSUED',
                ],
            ]);

        // -------------------------------------------------------------
        // STEP 5: Warehouse Receipt -> Site Engineer Approval
        // -------------------------------------------------------------
        $po = PurchaseOrder::with('items')->findOrFail($poId);
        $poItem = $po->items->firstOrFail();
        $receiptResponse = $this->actingAs($this->warehouseKeeper, 'sanctum')
            ->postJson("/api/v1/purchase-receipts/purchase-orders/{$poId}", [
                'received_at' => now()->toDateString(),
                'warehouse_notes' => 'تم استلام الطلب المباشر في المخزن.',
                'items' => [[
                    'purchase_order_item_id' => $poItem->id,
                    'received_quantity' => 2,
                ]],
            ]);
        $receiptResponse->assertStatus(201)->assertJsonPath('data.status', 'PENDING_SITE_ENGINEER');
        $receiptId = $receiptResponse->json('data.id');

        $siteApprovalResponse = $this->actingAs($this->siteEngineer, 'sanctum')
            ->postJson("/api/v1/purchase-receipts/{$receiptId}/approve", [
                'site_engineer_notes' => 'تمت مراجعة الاستلام بالموقع واعتماده.',
            ]);
        $siteApprovalResponse->assertStatus(200)->assertJsonPath('data.status', 'APPROVED');

        $invoiceResponse = $this->actingAs($this->accountant, 'sanctum')
            ->postJson('/api/v1/accounting/invoices', [
                'purchase_order_id' => $poId,
                'purchase_receipt_id' => $receiptId,
                'invoice_number' => 'DIRECT-INV-001',
                'amount' => 5200,
                'invoice_date' => now()->toDateString(),
                'land_allocations' => [['land_parcel_id' => $this->directLandParcel->id, 'amount' => 5200]],
            ]);
        $invoiceResponse->assertStatus(201);
        $this->assertDatabaseHas('purchase_requests', ['id' => $request->id, 'procurement_route' => 'DIRECT']);
        $this->assertDatabaseHas('purchase_orders', ['id' => $poId, 'status' => 'ISSUED']);
        $this->assertDatabaseHas('purchase_receipts', ['id' => $receiptId, 'status' => 'APPROVED']);
        $this->assertDatabaseHas('supplier_invoices', ['purchase_order_id' => $poId, 'purchase_receipt_id' => $receiptId]);
    }

    public function test_direct_route_requires_supplier_and_financial_data_before_accounting(): void
    {
        $request = PurchaseRequest::create([
            'request_number' => 'PR-DIRECT-VALIDATION-' . uniqid(),
            'user_id' => $this->employee->id,
            'department_id' => $this->department->id,
            'reviewer_user_id' => $this->reviewer->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
            'priority' => 'NORMAL',
            'status' => 'PENDING_PROCUREMENT_APPROVAL',
            'date_needed' => now()->toDateString(),
        ]);
        $request->items()->create([
            'item_id' => $this->catalogItem->id,
            'item_description' => $this->catalogItem->name,
            'item_reference' => 'DIRECT-VALIDATION-001',
            'region' => 'المنطقة السابعة والعشرون',
            'quantity' => 1,
            'uom' => 'PCS',
        ]);

        $response = $this->actingAs($this->procurementManager, 'sanctum')
            ->postJson("/api/v1/procurement/purchase-requests/{$request->id}/approve", [
                'use_quotes' => false,
            ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['financial_data.items']);
        $this->assertDatabaseHas('purchase_requests', [
            'id' => $request->id,
            'status' => 'PENDING_PROCUREMENT_APPROVAL',
            'procurement_route' => 'UNDECIDED',
        ]);
    }

    public function test_accounting_can_reject_direct_route_request(): void
    {
        $request = PurchaseRequest::create([
            'request_number' => 'PR-DIRECT-REJECT-' . uniqid(),
            'user_id' => $this->employee->id,
            'department_id' => $this->department->id,
            'reviewer_user_id' => $this->reviewer->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
            'priority' => 'NORMAL',
            'status' => 'PENDING_PROCUREMENT_APPROVAL',
            'date_needed' => now()->toDateString(),
        ]);
        $request->items()->create([
            'item_id' => $this->catalogItem->id,
            'item_description' => $this->catalogItem->name,
            'item_reference' => 'DIRECT-REJECT-001',
            'region' => 'المنطقة السابعة والعشرون',
            'quantity' => 1,
            'uom' => 'PCS',
            'estimated_unit_price' => 900,
            'estimated_line_total' => 900,
        ]);

        $this->actingAs($this->procurementManager, 'sanctum')
            ->postJson("/api/v1/procurement/purchase-requests/{$request->id}/approve", [
                'use_quotes' => false,
                'financial_data' => [
                    'supplier_id' => $this->activeSupplier->id,
                    'items' => [[
                        'pr_item_id' => $request->items()->firstOrFail()->id,
                        'quantity' => 1,
                        'unit_price' => 900,
                    ]],
                ],
            ])
            ->assertStatus(200)
            ->assertJsonPath('data.status', 'PENDING_EXECUTIVE_APPROVAL');

        $this->actingAs($this->generalManager, 'sanctum')
            ->postJson("/api/v1/general-manager/purchase-requests/{$request->id}/approve", [
                'comment' => 'معتمد تنفيذيًا للشراء المباشر.',
            ])
            ->assertStatus(200)
            ->assertJsonPath('data.status', 'PENDING_ACCOUNTING_APPROVAL');

        $rejectionResponse = $this->actingAs($this->accountant, 'sanctum')
            ->postJson("/api/v1/accounting/purchase-requests/{$request->id}/direct-reject", [
                'comment' => 'القيمة تحتاج مراجعة مالية إضافية.',
            ]);
        $rejectionResponse->assertStatus(200)
            ->assertJsonPath('data.status', 'REJECTED');
        $this->assertDatabaseHas('purchase_requests', [
            'id' => $request->id,
            'status' => 'REJECTED',
            'rejection_reason' => 'القيمة تحتاج مراجعة مالية إضافية.',
        ]);
    }
}
