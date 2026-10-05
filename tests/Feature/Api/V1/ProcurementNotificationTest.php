<?php

namespace Tests\Feature\Api\V1;

use App\Models\Department;
use App\Models\Item;
use App\Models\LandParcel;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\PurchaseReceipt;
use App\Models\PurchaseReceiptItem;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestItem;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use App\Notifications\ProcurementWorkflowNotification;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * Class ProcurementNotificationTest
 *
 * Senior QA & Integration Automation Test Suite verifying that the notification
 * subsystem dispatches alerts and pushes to target stakeholders across all key lifecycle gates:
 * 1. Notification::fake() simulation.
 * 2. Scenario 1 (PR Submission): Notification dispatched to reviewer / department manager.
 * 3. Scenario 2 (PR Approval): Notification dispatched to executive / procurement manager.
 * 4. Scenario 3 (GRN Approval): Notification dispatched to site accountant for 3-way matching.
 */
class ProcurementNotificationTest extends TestCase
{
    use RefreshDatabase;

    private Department $dept;
    private User $siteEngineer;
    private User $reviewer;
    private User $executionManager;
    private User $procurementManager;
    private User $warehouseKeeper;
    private User $siteAccountant;
    private Supplier $supplier;
    private Item $catalogItem;
    private LandParcel $parcel;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);

        // Execution Department matching site accountant department mapping
        $this->dept = Department::create([
            'name' => 'إدارة المشروعات والتنفيذ',
            'code' => 'EXECUTION',
            'is_active' => true,
        ]);

        // Users & Roles
        $this->executionManager = $this->createUser('em@ashbiliya.com', 'م. طارق مدير التنفيذ', 'execution_manager', $this->dept->id);
        $this->reviewer = $this->createUser('rev@ashbiliya.com', 'م. ساري مراجع القسم', 'reviewer', $this->dept->id);
        $this->siteEngineer = $this->createUser('se@ashbiliya.com', 'م. عمرو مهندس الموقع', 'site_engineer', $this->dept->id);
        $this->siteEngineer->update(['manager_id' => $this->executionManager->id]);

        $this->procurementManager = $this->createUser('pm@ashbiliya.com', 'أ. كريم مدير المشتريات', 'procurement_manager');
        $this->warehouseKeeper = $this->createUser('wh@ashbiliya.com', 'أ. وحيد أمين المخزن', 'warehouse_keeper', $this->dept->id);
        $this->siteAccountant = $this->createUser('sa@ashbiliya.com', 'أ. سامح محاسب الموقع', 'site_accountant', $this->dept->id);

        $this->dept->update([
            'manager_user_id' => $this->reviewer->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
        ]);

        // Master Data
        $this->supplier = Supplier::create([
            'code' => 'SUP-NOTIF-001',
            'company_name' => 'شركة الأهرام للأسمنت والخرسانة',
            'contact_name' => 'الحاج ممدوح الشريف',
            'phone' => '01011223344',
            'is_active' => true,
            'opening_balance' => 0,
        ]);

        $this->catalogItem = Item::create([
            'sku' => 'SKU-NOTIF-CEMENT-01',
            'name' => 'أسمنت بورتلاندي 42.5',
            'uom' => 'TON',
            'is_active' => true,
        ]);

        $this->parcel = LandParcel::create([
            'parcel_reference' => 'PARCEL-NOTIF-777',
            'region' => 'حي الوطن - التجمع',
            'opening_balance' => 150000,
            'funded_total' => 0,
            'expense_total' => 0,
            'balance' => 150000,
            'is_active' => true,
        ]);
    }

    /**
     * Scenario 1: Site Engineer submits Purchase Request.
     *
     * Verification:
     * - Notification::fake() catches outgoing notification facade dispatches.
     * - Reviewer receives 'purchase_request_submitted' notification.
     * - Notification row is persisted in database notifications table.
     */
    public function test_notification_sent_when_site_engineer_submits_purchase_request(): void
    {
        Notification::fake();

        // 1. Site Engineer creates draft PR
        $createResponse = $this->actingAs($this->siteEngineer, 'sanctum')
            ->postJson('/api/v1/purchase-requests', [
                'department_id' => $this->dept->id,
                'target_department_id' => $this->dept->id,
                'parcel_reference' => 'PARCEL-NOTIF-777',
                'region' => 'حي الوطن - التجمع',
                'date_needed' => now()->addDays(5)->toDateString(),
                'priority' => 'HIGH',
                'notes' => 'طلب أسمنت صبة سقف الدور الأرضي',
                'items' => [
                    [
                        'item_id' => $this->catalogItem->id,
                        'item_description' => 'أسمنت بورتلاندي مقاوم للرطوبة',
                        'item_reference' => 'PARCEL-NOTIF-777',
                        'region' => 'حي الوطن - التجمع',
                        'quantity' => 20,
                        'uom' => 'TON',
                    ],
                ],
            ]);

        $createResponse->assertStatus(201);
        $prId = $createResponse->json('data.id');

        // 2. Site Engineer submits PR for review
        $submitResponse = $this->actingAs($this->siteEngineer, 'sanctum')
            ->postJson("/api/v1/purchase-requests/{$prId}/submit");

        $submitResponse->assertStatus(200);

        // 3. Assert notification via Notification::fake()
        Notification::assertSentTo(
            $this->reviewer,
            ProcurementWorkflowNotification::class,
            function (ProcurementWorkflowNotification $notification) {
                return $notification->type === 'purchase_request_submitted';
            }
        );

        // 4. Assert in-app database notification record
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->reviewer->id,
            'type' => 'purchase_request_submitted',
            'notifiable_id' => $prId,
            'notifiable_type' => PurchaseRequest::class,
        ]);
    }

    /**
     * Scenario 2: Manager / Reviewer approvals cascade notifications to next stage.
     *
     * Verification:
     * - When reviewer approves PR, an alert is dispatched to executive / execution manager.
     * - When execution manager approves PR, an alert is dispatched to procurement manager.
     * - Database records and Notification::fake() assertions verify all alerts.
     */
    public function test_notification_sent_when_manager_approves_purchase_request(): void
    {
        Notification::fake();

        // 1. Prepare submitted PR
        $pr = PurchaseRequest::create([
            'department_id' => $this->dept->id,
            'target_department_id' => $this->dept->id,
            'user_id' => $this->siteEngineer->id,
            'reviewer_user_id' => $this->reviewer->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
            'request_number' => 'PR-NOTIF-STAGE2',
            'parcel_reference' => 'PARCEL-NOTIF-777',
            'region' => 'حي الوطن - التجمع',
            'status' => 'SUBMITTED',
            'date_needed' => now()->addDays(4)->toDateString(),
            'notes' => 'طلب معتمد للمراجعة والاعتماد',
        ]);

        PurchaseRequestItem::create([
            'purchase_request_id' => $pr->id,
            'item_id' => $this->catalogItem->id,
            'item_description' => 'أسمنت بورتلاندي عادي',
            'item_reference' => 'PARCEL-NOTIF-777',
            'region' => 'حي الوطن - التجمع',
            'quantity' => 20,
            'uom' => 'TON',
        ]);

        // 2. Department Reviewer approves PR (SUBMITTED -> PENDING_EXECUTIVE_APPROVAL)
        $reviewerApproveResponse = $this->actingAs($this->reviewer, 'sanctum')
            ->postJson("/api/v1/reviewer/purchase-requests/{$pr->id}/approve", [
                'comment' => 'تمت المراجعة الهندسية واعتماد الكميات.',
                'site_engineer_user_id' => $this->siteEngineer->id,
            ]);

        $reviewerApproveResponse->assertStatus(200);

        // Assert notification dispatched to Execution Manager (Direct Manager of requester)
        Notification::assertSentTo(
            $this->executionManager,
            ProcurementWorkflowNotification::class,
            function (ProcurementWorkflowNotification $notification) {
                return $notification->type === 'purchase_request_pending_executive';
            }
        );

        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->executionManager->id,
            'type' => 'purchase_request_pending_executive',
            'notifiable_id' => $pr->id,
        ]);

        // 3. Execution Manager approves PR (PENDING_EXECUTIVE_APPROVAL -> PENDING_PROCUREMENT_APPROVAL)
        $emApproveResponse = $this->actingAs($this->executionManager, 'sanctum')
            ->postJson("/api/v1/general-manager/purchase-requests/{$pr->id}/approve", [
                'comment' => 'معتمد من مدير مشروعات التنفيذ ومطابق للجدول الزمني.',
            ]);

        $emApproveResponse->assertStatus(200);

        // Assert notification dispatched to Procurement Manager
        Notification::assertSentTo(
            $this->procurementManager,
            ProcurementWorkflowNotification::class,
            function (ProcurementWorkflowNotification $notification) {
                return $notification->type === 'purchase_request_pending_procurement';
            }
        );

        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->procurementManager->id,
            'type' => 'purchase_request_pending_procurement',
            'notifiable_id' => $pr->id,
        ]);
    }

    /**
     * Scenario 3: Goods Receipt Note (GRN) Approval notifies Site Accountant.
     *
     * Verification:
     * - When Site Engineer approves the goods receipt (GRN), an alert is dispatched
     *   to the assigned Site Accountant with linked PO and Receipt references
     *   signaling readiness for supplier invoice registration and 3-way matching.
     */
    public function test_notification_sent_to_site_accountant_when_grn_is_approved(): void
    {
        Notification::fake();

        // 1. Create approved PR and Issued PO
        $pr = PurchaseRequest::create([
            'department_id' => $this->dept->id,
            'target_department_id' => $this->dept->id,
            'user_id' => $this->siteEngineer->id,
            'reviewer_user_id' => $this->reviewer->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
            'request_number' => 'PR-NOTIF-STAGE3',
            'parcel_reference' => 'PARCEL-NOTIF-777',
            'region' => 'حي الوطن - التجمع',
            'status' => 'APPROVED_BY_PROCUREMENT',
            'date_needed' => now()->addDays(2)->toDateString(),
        ]);

        $po = PurchaseOrder::create([
            'purchase_request_id' => $pr->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $this->procurementManager->id,
            'po_number' => 'PO-NOTIF-GRN-001',
            'status' => 'ISSUED',
            'subtotal' => 30000,
            'grand_total' => 30000,
            'delivery_status' => 'IN_RECEIPT',
        ]);

        $poItem = PurchaseOrderItem::create([
            'purchase_order_id' => $po->id,
            'item_id' => $this->catalogItem->id,
            'item_description' => 'أسمنت بورتلاندي 42.5',
            'item_reference' => 'PARCEL-NOTIF-777',
            'region' => 'حي الوطن - التجمع',
            'quantity' => 15,
            'uom' => 'TON',
            'unit_price' => 2000,
            'line_total' => 30000,
        ]);

        // 2. Warehouse Keeper creates Goods Receipt (PENDING_SITE_ENGINEER)
        $receipt = PurchaseReceipt::create([
            'purchase_order_id' => $po->id,
            'purchase_request_id' => $pr->id,
            'supplier_id' => $this->supplier->id,
            'department_id' => $this->dept->id,
            'warehouse_keeper_user_id' => $this->warehouseKeeper->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
            'receipt_number' => 'GRN-NOTIF-001',
            'status' => 'PENDING_SITE_ENGINEER',
            'received_at' => now(),
        ]);

        PurchaseReceiptItem::create([
            'purchase_receipt_id' => $receipt->id,
            'purchase_order_item_id' => $poItem->id,
            'ordered_quantity' => 15,
            'received_quantity' => 15,
        ]);

        // 3. Site Engineer inspects and approves the GRN via API
        $approveReceiptResponse = $this->actingAs($this->siteEngineer, 'sanctum')
            ->postJson("/api/v1/purchase-receipts/{$receipt->id}/approve", [
                'site_engineer_notes' => 'تم فحص الشحنة ومطابقتها للمواصفات بالكود.',
            ]);

        $approveReceiptResponse->assertStatus(200);

        // 4. Assert Notification dispatched to Site Accountant
        Notification::assertSentTo(
            $this->siteAccountant,
            ProcurementWorkflowNotification::class,
            function (ProcurementWorkflowNotification $notification) use ($po) {
                return $notification->type === 'purchase_order_and_receipt_ready_accounting';
            }
        );

        // 5. Assert Database Notification Record
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->siteAccountant->id,
            'type' => 'purchase_order_and_receipt_ready_accounting',
            'purchase_order_id' => $po->id,
            'purchase_receipt_id' => $receipt->id,
        ]);
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
