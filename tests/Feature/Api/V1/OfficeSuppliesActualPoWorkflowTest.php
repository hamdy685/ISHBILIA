<?php

namespace Tests\Feature\Api\V1;

use App\Models\Department;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\PurchaseReceipt;
use App\Models\PurchaseRequest;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use App\Notifications\ProcurementWorkflowNotification;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class OfficeSuppliesActualPoWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private Department $deptOffice;
    private User $employee;
    private User $reviewer;
    private User $procurementManager;
    private User $generalAccountant;
    private Supplier $supplier;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);

        $this->deptOffice = Department::create([
            'name' => 'إدارة الموارد البشرية والشؤون الإدارية',
            'code' => 'HR',
            'is_active' => true,
        ]);

        $this->employee = $this->createUser('employee@test', 'موظف شؤون إدارية', 'employee', $this->deptOffice->id);
        $this->reviewer = $this->createUser('reviewer@test', 'مراجع إداري', 'reviewer', $this->deptOffice->id);
        $this->procurementManager = $this->createUser('procurement@test', 'مدير المشتريات م. أحمد', 'procurement_manager');
        $this->generalAccountant = $this->createUser('habiba@test', 'المحاسب العام م. حبيبة', 'general_accountant');

        $this->supplier = Supplier::create([
            'code' => 'SUP-OFFICE-001',
            'company_name' => 'شركة الفا للمستلزمات المكتبية',
            'contact_name' => 'أحمد سمير',
            'phone' => '01011122233',
            'is_active' => true,
            'opening_balance' => 0,
        ]);
    }

    public function test_office_supplies_receipt_routes_to_actual_po_before_accounting(): void
    {
        Notification::fake();

        // 1. Create an Office Supplies Purchase Request
        $pr = PurchaseRequest::create([
            'request_number' => 'PR-OFFICE-001',
            'user_id' => $this->employee->id,
            'department_id' => $this->deptOffice->id,
            'status' => 'PENDING_PROCUREMENT',
            'request_type' => 'OFFICE_SUPPLIES',
            'parcel_reference' => 'مقر الشركة',
            'region' => 'إداري / المقر الرئيسي',
            'total_estimated_cost' => 5000,
        ]);

        $prItem = $pr->items()->create([
            'item_description' => 'أوراق تصوير A4 وأحبار طابعات',
            'quantity' => 20,
            'uom' => 'BOX',
            'item_reference' => 'مقر الشركة',
            'region' => 'إداري / المقر الرئيسي',
        ]);

        // 2. Issue Initial PO
        $po = PurchaseOrder::create([
            'po_number' => 'PO-OFFICE-001',
            'purchase_request_id' => $pr->id,
            'department_id' => $this->deptOffice->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $this->procurementManager->id,
            'status' => 'ISSUED',
            'delivery_status' => 'PENDING',
            'subtotal' => 5000,
            'grand_total' => 5000,
        ]);

        $poItem = PurchaseOrderItem::create([
            'purchase_order_id' => $po->id,
            'pr_item_id' => $prItem->id,
            'item_description' => 'أوراق تصوير A4 وأحبار طابعات',
            'quantity' => 20,
            'unit_price' => 250,
            'line_total' => 5000,
            'uom' => 'BOX',
            'item_reference' => 'مقر الشركة',
            'region' => 'إداري / المقر الرئيسي',
        ]);

        // 3. Employee (Requester) confirms receipt of office supplies
        $confirmResponse = $this->actingAs($this->employee, 'sanctum')
            ->postJson("/api/v1/purchase-receipts/purchase-orders/{$po->id}/confirm-office", [
                'notes' => 'تم استلام كراتين الورق والأحبار في مقر الشركة ومطابقتها.',
                'items' => [
                    [
                        'purchase_order_item_id' => $poItem->id,
                        'received_quantity' => 20,
                        'notes' => 'مستلم بالكامل بحالة ممتازة',
                    ],
                ],
            ]);

        $confirmResponse->assertStatus(201);
        $confirmResponse->assertJsonPath('message', 'تم تأكيد استلام المستلزمات المكتبية بنجاح وإحالة الأمر لإدارة المشتريات لإصدار أمر الشراء الفعلي.');

        // Verify Receipt and PO states
        $po->refresh();
        $receipt = PurchaseReceipt::where('purchase_order_id', $po->id)->first();

        $this->assertNotNull($receipt);
        $this->assertSame('APPROVED', $receipt->status);
        $this->assertSame('REQUESTER_OFFICE', $receipt->receipt_type);
        $this->assertSame($this->employee->id, $receipt->receiver_user_id);

        // Crucial Check: PO moved to PENDING_ACTUAL_PO and DELIVERED
        $this->assertSame('PENDING_ACTUAL_PO', $po->status);
        $this->assertSame('DELIVERED', $po->delivery_status);
        $this->assertNull($po->finalized_at);

        // Assert Procurement Manager was notified to issue the Actual PO
        Notification::assertSentTo(
            $this->procurementManager,
            ProcurementWorkflowNotification::class,
            function (ProcurementWorkflowNotification $notification) use ($po) {
                return $notification->type === 'grn_approved_pending_actual_po'
                    && (int) $notification->notifiable?->id === (int) $po->id;
            }
        );

        // Assert Accounting was NOT notified
        Notification::assertNotSentTo(
            $this->generalAccountant,
            ProcurementWorkflowNotification::class
        );

        // Assert Accounting queue does NOT show this receipt while waiting for Actual PO
        $accountingQueue = $this->actingAs($this->generalAccountant, 'sanctum')
            ->getJson('/api/v1/accounting/receipts/approved');
        $accountingQueue->assertStatus(200);
        $receiptIds = collect($accountingQueue->json('data'))->pluck('id')->all();
        $this->assertNotContains($receipt->id, $receiptIds);

        // Assert accountant cannot record receipt while PO is PENDING_ACTUAL_PO
        $recordAttempt = $this->actingAs($this->generalAccountant, 'sanctum')
            ->postJson("/api/v1/accounting/receipts/{$receipt->id}/mark-recorded", [
                'notes' => 'محاولة تسجيل قبل الأمر الفعلي',
            ]);
        $recordAttempt->assertStatus(422);

        // 4. Procurement Manager finalizes the Actual PO
        $finalizeResponse = $this->actingAs($this->procurementManager, 'sanctum')
            ->postJson("/api/v1/procurement/purchase-orders/{$po->id}/finalize", [
                'items' => [
                    [
                        'id' => $poItem->id,
                        'pr_item_id' => $prItem->id,
                        'item_description' => 'أوراق تصوير A4 وأحبار طابعات (فعلي)',
                        'quantity' => 20,
                        'unit_price' => 250,
                        'uom' => 'BOX',
                        'item_reference' => 'مقر الشركة',
                        'region' => 'إداري / المقر الرئيسي',
                        'supplier_id' => $this->supplier->id,
                    ],
                ],
                'notes' => 'إصدار أمر الشراء الفعلي للمستلزمات المكتبية بعد استلام الموظف واعتماده.',
            ]);

        $finalizeResponse->assertStatus(200);

        $po->refresh();
        $this->assertSame('ISSUED', $po->status);
        $this->assertNotNull($po->finalized_at);
        $this->assertSame($this->procurementManager->id, $po->finalized_by_user_id);

        // 5. Assert Accounting is now able to see the receipt
        $accountingQueueAfter = $this->actingAs($this->generalAccountant, 'sanctum')
            ->getJson('/api/v1/accounting/receipts/approved');
        $accountingQueueAfter->assertStatus(200);
        $receiptIdsAfter = collect($accountingQueueAfter->json('data'))->pluck('id')->all();
        $this->assertContains($receipt->id, $receiptIdsAfter);

        // 6. General Accountant can now mark the receipt as recorded
        $recordResponse = $this->actingAs($this->generalAccountant, 'sanctum')
            ->postJson("/api/v1/accounting/receipts/{$receipt->id}/mark-recorded", [
                'notes' => 'تم استلام الفاتورة وترحيل القيد المحاسبي لأمر الشراء الفعلي.',
            ]);
        $recordResponse->assertStatus(200);

        $receipt->refresh();
        $this->assertNotNull($receipt->accountant_recorded_at);
        $this->assertSame($this->generalAccountant->id, $receipt->accountant_recorded_by_user_id);
    }

    private function createUser(string $email, string $name, string $roleSlug, ?int $departmentId = null): User
    {
        $user = User::create([
            'email' => $email,
            'name' => $name,
            'password' => Hash::make('password'),
            'department_id' => $departmentId,
            'is_active' => true,
        ]);

        $role = Role::where('slug', $roleSlug)->first();
        if ($role) {
            $user->roles()->syncWithoutDetaching([$role->id]);
        }

        return $user;
    }
}
