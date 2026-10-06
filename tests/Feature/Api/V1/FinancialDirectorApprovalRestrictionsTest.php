<?php

namespace Tests\Feature\Api\V1;

use App\Models\Department;
use App\Models\PurchaseRequest;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FinancialDirectorApprovalRestrictionsTest extends TestCase
{
    use RefreshDatabase;

    protected User $accountant;
    protected User $generalManager;
    protected User $employee;
    protected Department $department;
    protected Supplier $supplierA;
    protected Supplier $supplierB;

    protected function setUp(): void
    {
        parent::setUp();

        $accountantRole = Role::firstOrCreate(['slug' => 'accountant'], ['name' => 'المدير المالي']);
        $gmRole = Role::firstOrCreate(['slug' => 'general_manager'], ['name' => 'المدير العام']);
        $employeeRole = Role::firstOrCreate(['slug' => 'employee'], ['name' => 'مهندس الموقع']);

        $accountantRole->permissions()->firstOrCreate(['slug' => 'purchase_request.accounting_view'], ['name' => 'عرض موافقات الحسابات']);
        $accountantRole->permissions()->firstOrCreate(['slug' => 'purchase_request.accounting_approve'], ['name' => 'اعتماد الحسابات المباشر']);
        $accountantRole->permissions()->firstOrCreate(['slug' => 'purchase_request.accounting_reject'], ['name' => 'رفض الحسابات المباشر']);

        $this->department = Department::create([
            'name' => 'إدارة التنفيذ',
            'code' => 'EXEC',
        ]);

        $this->accountant = User::create([
            'name' => 'حسن المدير المالي',
            'email' => 'hassan.accountant@example.com',
            'password' => bcrypt('password123'),
            'department_id' => $this->department->id,
            'is_active' => true,
        ]);
        $this->accountant->roles()->attach($accountantRole);

        $this->generalManager = User::create([
            'name' => 'المدير العام',
            'email' => 'gm@example.com',
            'password' => bcrypt('password123'),
            'department_id' => $this->department->id,
            'is_active' => true,
        ]);
        $this->generalManager->roles()->attach($gmRole);

        $this->employee = User::create([
            'name' => 'مهندس الموقع',
            'email' => 'eng.site@example.com',
            'password' => bcrypt('password123'),
            'department_id' => $this->department->id,
            'is_active' => true,
        ]);
        $this->employee->roles()->attach($employeeRole);

        $this->supplierA = Supplier::create([
            'company_name' => 'شركة التوريدات الأولى المعتمدة',
            'is_active' => true,
        ]);

        $this->supplierB = Supplier::create([
            'company_name' => 'شركة بديلة غير مصرح بها',
            'is_active' => true,
        ]);
    }

    public function test_financial_director_cannot_alter_prices_or_suppliers_during_approval(): void
    {
        $pr = PurchaseRequest::create([
            'request_number' => 'PR-2026-FIN-001',
            'user_id' => $this->employee->id,
            'department_id' => $this->department->id,
            'status' => 'PENDING_ACCOUNTING_APPROVAL',
            'procurement_route' => 'DIRECT',
            'direct_supplier_id' => $this->supplierA->id,
            'total_estimated_cost' => 25000.00,
            'date_needed' => now()->addDays(5)->toDateString(),
        ]);

        $item = $pr->items()->create([
            'item_description' => 'حديد تسليح 16 مم',
            'item_reference' => 'PARCEL-101',
            'region' => 'منطقة أ',
            'quantity' => 100,
            'uom' => 'TON',
            'supplier_id' => $this->supplierA->id,
            'estimated_unit_price' => 250.00,
            'estimated_line_total' => 25000.00,
        ]);

        // Financial Director approves but attempts to alter supplier, quantity, and unit price
        $response = $this->actingAs($this->accountant, 'sanctum')
            ->postJson("/api/v1/accounting/purchase-requests/{$pr->id}/direct-approve", [
                'financial_data' => [
                    'supplier_id' => $this->supplierB->id,
                    'items' => [
                        [
                            'pr_item_id' => $item->id,
                            'supplier_id' => $this->supplierB->id,
                            'quantity' => 200,
                            'unit_price' => 999.00,
                        ],
                    ],
                    'notes' => 'محاولة تعديل السعر والمورد من الحسابات',
                ],
                'comment' => 'معتمد من الإدارة المالية.',
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.status', 'APPROVED_BY_ACCOUNTING');

        // Verify status changed to APPROVED_BY_ACCOUNTING
        $this->assertDatabaseHas('purchase_requests', [
            'id' => $pr->id,
            'status' => 'APPROVED_BY_ACCOUNTING',
            'direct_supplier_id' => $this->supplierA->id, // MUST REMAIN SUPPLIER A
            'total_estimated_cost' => 25000.00, // MUST REMAIN 25000
        ]);

        // Verify items were untouched
        $this->assertDatabaseHas('purchase_request_items', [
            'id' => $item->id,
            'supplier_id' => $this->supplierA->id, // MUST REMAIN SUPPLIER A
            'quantity' => 100.00, // MUST REMAIN 100
            'estimated_unit_price' => 250.00, // MUST REMAIN 250
            'estimated_line_total' => 25000.00, // MUST REMAIN 25000
        ]);

        // Verify approval history was recorded
        $this->assertDatabaseHas('approval_history', [
            'target_type' => PurchaseRequest::class,
            'target_id' => $pr->id,
            'actor_user_id' => $this->accountant->id,
            'action' => 'ACCOUNTING_APPROVED_DIRECT',
            'from_state' => 'PENDING_ACCOUNTING_APPROVAL',
            'to_state' => 'APPROVED_BY_ACCOUNTING',
        ]);
    }

    public function test_financial_director_can_approve_with_only_comment(): void
    {
        $pr = PurchaseRequest::create([
            'request_number' => 'PR-2026-FIN-002',
            'user_id' => $this->employee->id,
            'department_id' => $this->department->id,
            'status' => 'PENDING_ACCOUNTING_APPROVAL',
            'procurement_route' => 'DIRECT',
            'direct_supplier_id' => $this->supplierA->id,
            'total_estimated_cost' => 12000.00,
        ]);

        $pr->items()->create([
            'item_description' => 'أسمنت مقاوم',
            'item_reference' => 'PARCEL-102',
            'region' => 'منطقة ب',
            'quantity' => 50,
            'uom' => 'BAG',
            'supplier_id' => $this->supplierA->id,
            'estimated_unit_price' => 240.00,
            'estimated_line_total' => 12000.00,
        ]);

        $response = $this->actingAs($this->accountant, 'sanctum')
            ->postJson("/api/v1/accounting/purchase-requests/{$pr->id}/direct-approve", [
                'comment' => 'تمت مراجعة الاعتماد المالي والبنود مطابقة للموازنة.',
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.status', 'APPROVED_BY_ACCOUNTING');

        $this->assertDatabaseHas('purchase_requests', [
            'id' => $pr->id,
            'status' => 'APPROVED_BY_ACCOUNTING',
            'total_estimated_cost' => 12000.00,
        ]);
    }

    public function test_financial_director_can_reject_with_comment(): void
    {
        $pr = PurchaseRequest::create([
            'request_number' => 'PR-2026-FIN-003',
            'user_id' => $this->employee->id,
            'department_id' => $this->department->id,
            'status' => 'PENDING_ACCOUNTING_APPROVAL',
            'procurement_route' => 'DIRECT',
            'direct_supplier_id' => $this->supplierA->id,
            'total_estimated_cost' => 50000.00,
        ]);

        $item = $pr->items()->create([
            'item_description' => 'أنابيب صرف',
            'item_reference' => 'PARCEL-103',
            'region' => 'منطقة ج',
            'quantity' => 20,
            'uom' => 'PCS',
            'supplier_id' => $this->supplierA->id,
            'estimated_unit_price' => 2500.00,
            'estimated_line_total' => 50000.00,
        ]);

        $response = $this->actingAs($this->accountant, 'sanctum')
            ->postJson("/api/v1/accounting/purchase-requests/{$pr->id}/direct-reject", [
                'comment' => 'تجاوز حد الموازنة المخصصة لهذا الشهر.',
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.status', 'REJECTED');

        $this->assertDatabaseHas('purchase_requests', [
            'id' => $pr->id,
            'status' => 'REJECTED',
            'rejection_reason' => 'تجاوز حد الموازنة المخصصة لهذا الشهر.',
        ]);

        // Items remain completely untouched
        $this->assertDatabaseHas('purchase_request_items', [
            'id' => $item->id,
            'quantity' => 20.00,
            'estimated_unit_price' => 2500.00,
        ]);
    }

    public function test_financial_director_is_forbidden_from_updating_request_details(): void
    {
        $pr = PurchaseRequest::create([
            'request_number' => 'PR-2026-FIN-004',
            'user_id' => $this->employee->id,
            'department_id' => $this->department->id,
            'status' => 'PENDING_EXECUTIVE_APPROVAL',
            'procurement_route' => 'DIRECT',
            'direct_supplier_id' => $this->supplierA->id,
            'total_estimated_cost' => 15000.00,
        ]);

        // Financial Director attempting to update request via GeneralManager endpoint
        $response = $this->actingAs($this->accountant, 'sanctum')
            ->putJson("/api/v1/general-manager/purchase-requests/{$pr->id}", [
                'notes' => 'محاولة تعديل غير مصرح بها',
            ]);

        $response->assertStatus(403);
    }
}
