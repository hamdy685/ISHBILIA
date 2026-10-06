<?php

namespace Tests\Feature\Api\V1;

use App\Models\Department;
use App\Models\PurchaseOrder;
use App\Models\PurchaseReceipt;
use App\Models\PurchaseRequest;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Validates Eng. Habiba's (General Accountant) central authority:
 * 1. 100% omni-project visibility across all departments and locations.
 * 2. Strict manual recording gate: `accountant_recorded_at` is updated ONLY via explicit manual request.
 * 3. Role boundary security: unauthorized roles are strictly forbidden (403).
 */
class GeneralAccountantHabibaPermissionsTest extends TestCase
{
    use RefreshDatabase;

    private Department $deptExecution;
    private Department $deptLicenses;
    private Department $deptBuffet;
    private Department $deptHeadOffice;

    private User $habibaByEmail;
    private User $habibaByRole;
    private User $licensesAccountant;
    private User $siteAccountant;
    private User $siteEngineer;
    private User $warehouseKeeper;
    private User $requester;

    private Supplier $supplier;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);

        // 1. Setup Multiple Company Departments
        $this->deptExecution = Department::create([
            'name' => 'إدارة التنفيذ والمشاريع',
            'code' => 'EXECUTION',
            'is_active' => true,
        ]);

        $this->deptLicenses = Department::create([
            'name' => 'قسم التراخيص الهندسية',
            'code' => 'LICENSES',
            'is_active' => true,
        ]);

        $this->deptBuffet = Department::create([
            'name' => 'قسم البوفيه والضيافة',
            'code' => 'BUFFET',
            'is_active' => true,
        ]);

        $this->deptHeadOffice = Department::create([
            'name' => 'المقر الرئيسي والإدارة',
            'code' => 'HEAD_OFFICE',
            'is_active' => true,
        ]);

        // 2. Setup Users
        // Eng. Habiba identified by email
        $this->habibaByEmail = $this->createUser('habiba@ashbiliya.com', 'المهندسة حبيبة (المحاسب العام)', 'accountant');
        // Eng. Habiba identified by role
        $this->habibaByRole = $this->createUser('habiba_role@test.com', 'م. حبيبة (دور المحاسب العام)', 'general_accountant');

        // Department-restricted accountants
        $this->licensesAccountant = $this->createUser('licenses_acct@test.com', 'محاسب التراخيص', 'licenses_accountant', $this->deptLicenses->id);
        $this->siteAccountant = $this->createUser('site_acct@test.com', 'محاسب المواقع والتنفيذ', 'site_accountant', $this->deptExecution->id);

        // Non-accountant operational roles
        $this->siteEngineer = $this->createUser('site_eng@test.com', 'مهندس الموقع', 'site_engineer', $this->deptExecution->id);
        $this->warehouseKeeper = $this->createUser('warehouse@test.com', 'أمين المخزن', 'warehouse_keeper', $this->deptExecution->id);
        $this->requester = $this->createUser('requester@test.com', 'موظف طلبات', 'employee', $this->deptExecution->id);

        $this->supplier = Supplier::create([
            'code' => 'SUP-HABIBA-001',
            'company_name' => 'مجموعة التوريدات الشاملة',
            'is_active' => true,
            'opening_balance' => 0,
        ]);
    }

    /**
     * Test that Eng. Habiba sees 100% of approved receipts across all departments,
     * while department accountants are strictly confined to their own departments.
     */
    public function test_habiba_has_omni_project_visibility_across_all_departments(): void
    {
        // Create an approved receipt in each department
        $receiptExecution = $this->createApprovedReceiptForDept($this->deptExecution, 'GRN-EXEC-001');
        $receiptLicenses = $this->createApprovedReceiptForDept($this->deptLicenses, 'GRN-LIC-001');
        $receiptBuffet = $this->createApprovedReceiptForDept($this->deptBuffet, 'GRN-BUF-001');
        $receiptHeadOffice = $this->createApprovedReceiptForDept($this->deptHeadOffice, 'GRN-HO-001');

        // ─────────────────────────────────────────────────────────────
        // 1. Verify Restricted Accountant Visibility (Licenses Accountant)
        // ─────────────────────────────────────────────────────────────
        $licensesResponse = $this->actingAs($this->licensesAccountant, 'sanctum')
            ->getJson('/api/v1/accounting/receipts/approved');

        $licensesResponse->assertStatus(200);
        $licensesData = $licensesResponse->json('data');
        $licensesIds = collect($licensesData)->pluck('id')->all();

        // Must ONLY see Licenses receipt
        $this->assertContains($receiptLicenses->id, $licensesIds);
        $this->assertNotContains($receiptExecution->id, $licensesIds);
        $this->assertNotContains($receiptBuffet->id, $licensesIds);
        $this->assertNotContains($receiptHeadOffice->id, $licensesIds);

        // ─────────────────────────────────────────────────────────────
        // 2. Verify Eng. Habiba (by email) Sees 100% of Receipts
        // ─────────────────────────────────────────────────────────────
        $habibaEmailResponse = $this->actingAs($this->habibaByEmail, 'sanctum')
            ->getJson('/api/v1/accounting/receipts/approved');

        $habibaEmailResponse->assertStatus(200);
        $habibaEmailData = $habibaEmailResponse->json('data');
        $habibaEmailIds = collect($habibaEmailData)->pluck('id')->all();

        $this->assertContains($receiptExecution->id, $habibaEmailIds);
        $this->assertContains($receiptLicenses->id, $habibaEmailIds);
        $this->assertContains($receiptBuffet->id, $habibaEmailIds);
        $this->assertContains($receiptHeadOffice->id, $habibaEmailIds);

        // ─────────────────────────────────────────────────────────────
        // 3. Verify Eng. Habiba (by role) Sees 100% of Receipts
        // ─────────────────────────────────────────────────────────────
        $habibaRoleResponse = $this->actingAs($this->habibaByRole, 'sanctum')
            ->getJson('/api/v1/accounting/receipts/approved');

        $habibaRoleResponse->assertStatus(200);
        $habibaRoleData = $habibaRoleResponse->json('data');
        $habibaRoleIds = collect($habibaRoleData)->pluck('id')->all();

        $this->assertContains($receiptExecution->id, $habibaRoleIds);
        $this->assertContains($receiptLicenses->id, $habibaRoleIds);
        $this->assertContains($receiptBuffet->id, $habibaRoleIds);
        $this->assertContains($receiptHeadOffice->id, $habibaRoleIds);
    }

    /**
     * Test that accountant_recorded_at is strictly NULL until explicitly called,
     * and that the recording endpoint properly sets accountant_recorded_at and accountant_recorded_by_user_id.
     */
    public function test_receipt_recording_requires_explicit_request_by_accountant(): void
    {
        $receipt = $this->createApprovedReceiptForDept($this->deptExecution, 'GRN-RECORD-001');

        // Initially, recording fields MUST be NULL
        $this->assertNull($receipt->accountant_recorded_at);
        $this->assertNull($receipt->accountant_recorded_by_user_id);
        $this->assertFalse($receipt->is_accountant_recorded);

        // Query pending filter: MUST include the receipt
        $pendingResp = $this->actingAs($this->habibaByEmail, 'sanctum')
            ->getJson('/api/v1/accounting/receipts/approved?status=pending');
        $pendingResp->assertStatus(200);
        $pendingIds = collect($pendingResp->json('data'))->pluck('id')->all();
        $this->assertContains($receipt->id, $pendingIds);

        // Query recorded filter: MUST NOT include the receipt yet
        $recordedRespBefore = $this->actingAs($this->habibaByEmail, 'sanctum')
            ->getJson('/api/v1/accounting/receipts/approved?status=recorded');
        $recordedRespBefore->assertStatus(200);
        $recordedIdsBefore = collect($recordedRespBefore->json('data'))->pluck('id')->all();
        $this->assertNotContains($receipt->id, $recordedIdsBefore);

        // Eng. Habiba triggers the manual recording action
        $markResponse = $this->actingAs($this->habibaByEmail, 'sanctum')
            ->postJson("/api/v1/accounting/receipts/{$receipt->id}/mark-recorded", [
                'notes' => 'تم استيفاء مستندات الفاتورة والتسجيل المالي بواسطة المهندسة حبيبة',
            ]);

        $markResponse->assertStatus(200);
        $markResponse->assertJsonPath('data.is_accountant_recorded', true);
        $markResponse->assertJsonPath('data.accountant_recorded_by.id', $this->habibaByEmail->id);

        $receipt->refresh();
        $this->assertNotNull($receipt->accountant_recorded_at);
        $this->assertSame($this->habibaByEmail->id, $receipt->accountant_recorded_by_user_id);
        $this->assertSame('تم استيفاء مستندات الفاتورة والتسجيل المالي بواسطة المهندسة حبيبة', $receipt->accountant_recording_notes);
        $this->assertTrue($receipt->is_accountant_recorded);

        // After recording: MUST appear in recorded filter
        $recordedRespAfter = $this->actingAs($this->habibaByEmail, 'sanctum')
            ->getJson('/api/v1/accounting/receipts/approved?status=recorded');
        $recordedRespAfter->assertStatus(200);
        $recordedIdsAfter = collect($recordedRespAfter->json('data'))->pluck('id')->all();
        $this->assertContains($receipt->id, $recordedIdsAfter);

        // After recording: MUST NO LONGER appear in pending filter
        $pendingRespAfter = $this->actingAs($this->habibaByEmail, 'sanctum')
            ->getJson('/api/v1/accounting/receipts/approved?status=pending');
        $pendingRespAfter->assertStatus(200);
        $pendingIdsAfter = collect($pendingRespAfter->json('data'))->pluck('id')->all();
        $this->assertNotContains($receipt->id, $pendingIdsAfter);
    }

    /**
     * Test that non-accountant roles cannot record receipts (Strict RBAC Protection).
     */
    public function test_non_accountant_roles_cannot_mark_receipt_as_recorded(): void
    {
        $receipt = $this->createApprovedReceiptForDept($this->deptExecution, 'GRN-RBAC-001');

        // Requester attempt -> 403 Forbidden
        $this->actingAs($this->requester, 'sanctum')
            ->postJson("/api/v1/accounting/receipts/{$receipt->id}/mark-recorded", ['notes' => 'محاولة غير مصرح بها'])
            ->assertStatus(403);

        // Site Engineer attempt -> 403 Forbidden
        $this->actingAs($this->siteEngineer, 'sanctum')
            ->postJson("/api/v1/accounting/receipts/{$receipt->id}/mark-recorded", ['notes' => 'محاولة غير مصرح بها'])
            ->assertStatus(403);

        // Warehouse Keeper attempt -> 403 Forbidden
        $this->actingAs($this->warehouseKeeper, 'sanctum')
            ->postJson("/api/v1/accounting/receipts/{$receipt->id}/mark-recorded", ['notes' => 'محاولة غير مصرح بها'])
            ->assertStatus(403);

        // Ensure receipt remained untouched
        $receipt->refresh();
        $this->assertNull($receipt->accountant_recorded_at);
        $this->assertNull($receipt->accountant_recorded_by_user_id);
    }

    private function createApprovedReceiptForDept(Department $dept, string $receiptNumber): PurchaseReceipt
    {
        $pr = PurchaseRequest::create([
            'request_number' => 'PR-' . $dept->code . '-' . rand(1000, 9999),
            'department_id' => $dept->id,
            'user_id' => $this->requester->id,
            'status' => 'APPROVED_BY_PROCUREMENT',
            'date_needed' => now()->toDateString(),
        ]);

        $po = PurchaseOrder::create([
            'po_number' => 'PO-' . $dept->code . '-' . rand(1000, 9999),
            'purchase_request_id' => $pr->id,
            'supplier_id' => $this->supplier->id,
            'status' => 'ISSUED',
            'created_by_user_id' => $this->requester->id,
            'grand_total' => 5000,
        ]);

        $poItem = $po->items()->create([
            'item_description' => 'بند توريد لمشروع ' . $dept->name,
            'quantity' => 10,
            'unit_price' => 500,
            'line_total' => 5000,
            'supplier_id' => $this->supplier->id,
        ]);

        $receipt = PurchaseReceipt::create([
            'receipt_number' => $receiptNumber,
            'purchase_order_id' => $po->id,
            'purchase_request_id' => $pr->id,
            'supplier_id' => $this->supplier->id,
            'warehouse_keeper_user_id' => $this->warehouseKeeper->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
            'site_engineer_approved_at' => now(),
            'site_engineer_notes' => 'معتمد هندسياً',
            'status' => 'APPROVED',
            'accountant_recorded_at' => null,
            'accountant_recorded_by_user_id' => null,
        ]);

        $receipt->items()->create([
            'purchase_order_item_id' => $poItem->id,
            'ordered_quantity' => 10,
            'received_quantity' => 10,
        ]);

        return $receipt;
    }

    private function createUser(string $email, string $name, string $roleSlug, ?int $departmentId = null): User
    {
        $user = User::create([
            'department_id' => $departmentId,
            'name' => $name,
            'email' => $email,
            'password' => Hash::make('Secret123!'),
            'is_active' => true,
        ]);

        $role = Role::where('slug', $roleSlug)->firstOrFail();
        $user->roles()->attach($role->id);

        return $user;
    }
}
