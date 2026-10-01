<?php

namespace Tests\Feature\Api\V1;

use App\Models\Department;
use App\Models\Notification;
use App\Models\PurchaseOrder;
use App\Models\PurchaseRequest;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use App\Services\AccountingPurchaseOrderService;
use App\Services\GeneralManagerPurchaseOrderService;
use App\Services\PurchaseOrderService;
use App\Services\PurchaseQuoteService;
use App\Services\PurchaseRequestService;
use App\Services\ReviewerPurchaseRequestService;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class NotificationTest extends TestCase
{
    use RefreshDatabase;

    private Department $dept;
    private User $employee;
    private User $reviewer;
    private User $siteEngineer;
    private User $procurementManager;
    private User $accountant;
    private User $gmUser;
    private Supplier $supplier;
    private Supplier $supplierB;
    private Supplier $supplierC;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);

        $this->dept = Department::create([
            'name' => 'IT Operations',
            'code' => 'DEPT-IT',
        ]);

        $empRole = Role::where('slug', 'employee')->first();
        $revRole = Role::where('slug', 'reviewer')->first();
        $siteEngineerRole = Role::where('slug', 'site_engineer')->first();
        $procRole = Role::where('slug', 'procurement_manager')->first();
        $accRole = Role::where('slug', 'accountant')->first();
        $gmRole = Role::where('slug', 'general_manager')->first();

        $this->employee = User::create([
            'department_id' => $this->dept->id,
            'name' => 'Ali Employee',
            'email' => 'ali@ashbiliya.com',
            'password' => Hash::make('Secret123!'),
            'is_active' => true,
        ]);
        $this->employee->roles()->attach($empRole->id);

        $this->reviewer = User::create([
            'department_id' => $this->dept->id,
            'name' => 'Rashid Reviewer',
            'email' => 'rashid@ashbiliya.com',
            'password' => Hash::make('Secret123!'),
            'is_active' => true,
        ]);
        $this->reviewer->roles()->attach($revRole->id);

        $this->siteEngineer = User::create([
            'department_id' => $this->dept->id,
            'name' => 'Site Engineer Fixture',
            'email' => 'site-engineer-notification@ashbiliya.com',
            'password' => Hash::make('Secret123!'),
            'is_active' => true,
        ]);
        $this->siteEngineer->roles()->attach($siteEngineerRole->id);
        $this->dept->update([
            'manager_user_id' => $this->reviewer->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
        ]);

        $this->procurementManager = User::create([
            'department_id' => $this->dept->id,
            'name' => 'Tariq Procurement',
            'email' => 'tariq@ashbiliya.com',
            'password' => Hash::make('Secret123!'),
            'is_active' => true,
        ]);
        $this->procurementManager->roles()->attach($procRole->id);

        $this->accountant = User::create([
            'department_id' => $this->dept->id,
            'name' => 'Fahad Accountant',
            'email' => 'fahad@ashbiliya.com',
            'password' => Hash::make('Secret123!'),
            'is_active' => true,
        ]);
        $this->accountant->roles()->attach($accRole->id);

        $this->gmUser = User::create([
            'department_id' => $this->dept->id,
            'name' => 'Dr. Sultan GM',
            'email' => 'sultan@ashbiliya.com',
            'password' => Hash::make('Secret123!'),
            'is_active' => true,
        ]);
        $this->gmUser->roles()->attach($gmRole->id);

        $this->supplier = Supplier::create([
            'code' => 'SUP-001',
            'company_name' => 'Al-Falak Technology Corp',
            'email' => 'info@alfalak.com',
            'is_active' => true,
        ]);
        $this->supplierB = Supplier::create([
            'code' => 'SUP-002',
            'company_name' => 'Al-Falak Technology Corp B',
            'is_active' => true,
        ]);
        $this->supplierC = Supplier::create([
            'code' => 'SUP-003',
            'company_name' => 'Al-Falak Technology Corp C',
            'is_active' => true,
        ]);
    }

    public function test_authenticated_user_can_list_own_notifications(): void
    {
        Notification::create([
            'user_id' => $this->employee->id,
            'type' => 'purchase_request_rejected',
            'title' => 'Purchase Request Rejected',
            'message' => 'Your request was rejected.',
            'notifiable_type' => PurchaseRequest::class,
            'notifiable_id' => 1,
        ]);

        $token = $this->employee->createToken('test_token')->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/v1/notifications');

        $response->assertStatus(200);
        $this->assertCount(1, $response->json('data'));
        $this->assertEquals('purchase_request_rejected', $response->json('data.0.type'));
    }

    public function test_user_cannot_see_another_users_notifications(): void
    {
        Notification::create([
            'user_id' => $this->reviewer->id,
            'type' => 'purchase_request_submitted',
            'title' => 'New Request',
            'message' => 'Needs review.',
            'notifiable_type' => PurchaseRequest::class,
            'notifiable_id' => 1,
        ]);

        $token = $this->employee->createToken('test_token')->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/v1/notifications');

        $response->assertStatus(200);
        $this->assertCount(0, $response->json('data'));
    }

    public function test_unauthenticated_user_receives_401(): void
    {
        $this->getJson('/api/v1/notifications')->assertStatus(401);
        $this->getJson('/api/v1/notifications/unread-count')->assertStatus(401);
        $this->postJson('/api/v1/notifications/1/read')->assertStatus(401);
        $this->postJson('/api/v1/notifications/read-all')->assertStatus(401);
    }

    public function test_unread_count_is_correct(): void
    {
        Notification::create([
            'user_id' => $this->employee->id,
            'type' => 'type_1',
            'title' => 'Title 1',
            'message' => 'Msg 1',
            'notifiable_type' => PurchaseRequest::class,
            'notifiable_id' => 1,
        ]);

        Notification::create([
            'user_id' => $this->employee->id,
            'type' => 'type_2',
            'title' => 'Title 2',
            'message' => 'Msg 2',
            'read_at' => now(),
        ]);

        $token = $this->employee->createToken('test_token')->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/v1/notifications/unread-count');

        $response->assertStatus(200)
            ->assertJson(['unread_count' => 1, 'count' => 1]);
    }

    public function test_user_can_mark_own_notification_as_read(): void
    {
        $notif = Notification::create([
            'user_id' => $this->employee->id,
            'type' => 'type_1',
            'title' => 'Title 1',
            'message' => 'Msg 1',
            'notifiable_type' => PurchaseRequest::class,
            'notifiable_id' => 1,
        ]);

        $token = $this->employee->createToken('test_token')->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/v1/notifications/' . $notif->id . '/read');

        $response->assertStatus(200);
        $this->assertNotNull($notif->fresh()->read_at);
    }

    public function test_already_read_notification_remains_safely_readable_idempotent(): void
    {
        $initialReadAt = now()->subMinutes(10);
        $notif = Notification::create([
            'user_id' => $this->employee->id,
            'type' => 'type_1',
            'title' => 'Title 1',
            'message' => 'Msg 1',
            'read_at' => $initialReadAt,
        ]);

        $token = $this->employee->createToken('test_token')->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/v1/notifications/' . $notif->id . '/read');

        $response->assertStatus(200);
        $this->assertNotNull($notif->fresh()->read_at);
    }

    public function test_empty_notification_list_works_correctly(): void
    {
        $token = $this->employee->createToken('test_token')->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/v1/notifications');

        $response->assertStatus(200)
            ->assertJson(['data' => []]);
    }

    public function test_user_cannot_mark_another_users_notification_as_read(): void
    {
        $notif = Notification::create([
            'user_id' => $this->reviewer->id,
            'type' => 'type_1',
            'title' => 'Title 1',
            'message' => 'Msg 1',
            'notifiable_type' => PurchaseRequest::class,
            'notifiable_id' => 1,
        ]);

        $token = $this->employee->createToken('test_token')->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/v1/notifications/' . $notif->id . '/read');

        $response->assertStatus(403);
    }

    public function test_mark_all_as_read_only_affects_current_user(): void
    {
        $empNotif = Notification::create([
            'user_id' => $this->employee->id,
            'type' => 'type_1',
            'title' => 'Title 1',
            'message' => 'Msg 1',
            'notifiable_type' => PurchaseRequest::class,
            'notifiable_id' => 1,
        ]);

        $revNotif = Notification::create([
            'user_id' => $this->reviewer->id,
            'type' => 'type_2',
            'title' => 'Title 2',
            'message' => 'Msg 2',
            'notifiable_type' => PurchaseRequest::class,
            'notifiable_id' => 1,
        ]);

        $token = $this->employee->createToken('test_token')->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/v1/notifications/read-all');

        $response->assertStatus(200);
        $this->assertNotNull($empNotif->fresh()->read_at);
        $this->assertNull($revNotif->fresh()->read_at);
    }

    public function test_mark_as_read_endpoint_returns_updated_unread_count(): void
    {
        $notif1 = Notification::create([
            'user_id' => $this->employee->id,
            'type' => 'type_1',
            'title' => 'Title 1',
            'message' => 'Msg 1',
            'notifiable_type' => PurchaseRequest::class,
            'notifiable_id' => 1,
        ]);
        $notif2 = Notification::create([
            'user_id' => $this->employee->id,
            'type' => 'type_2',
            'title' => 'Title 2',
            'message' => 'Msg 2',
            'notifiable_type' => PurchaseRequest::class,
            'notifiable_id' => 2,
        ]);

        $token = $this->employee->createToken('test_token')->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/v1/notifications/' . $notif1->id . '/mark-as-read');

        $response->assertStatus(200)
            ->assertJson([
                'unread_count' => 1,
                'count' => 1,
            ]);

        $this->assertNotNull($notif1->fresh()->read_at);
        $this->assertNull($notif2->fresh()->read_at);
    }

    public function test_mark_all_as_read_endpoint_clears_all_and_returns_zero_count(): void
    {
        Notification::create([
            'user_id' => $this->employee->id,
            'type' => 'type_1',
            'title' => 'Title 1',
            'message' => 'Msg 1',
        ]);
        Notification::create([
            'user_id' => $this->employee->id,
            'type' => 'type_2',
            'title' => 'Title 2',
            'message' => 'Msg 2',
        ]);

        $token = $this->employee->createToken('test_token')->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/v1/notifications/mark-all-as-read');

        $response->assertStatus(200)
            ->assertJson([
                'unread_count' => 0,
                'count' => 0,
            ]);

        $this->assertEquals(0, Notification::where('user_id', $this->employee->id)->whereNull('read_at')->count());
    }

    public function test_full_workflow_end_to_end_notifications(): void
    {
        // 1. Employee creates and submits PR
        $pr = PurchaseRequest::create([
            'request_number' => 'PR-2026-9999',
            'user_id' => $this->employee->id,
            'department_id' => $this->dept->id,
            'target_department_id' => $this->dept->id,
            'reviewer_user_id' => $this->reviewer->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
            'title' => 'Notification Test Requisition',
            'status' => 'DRAFT',
            'total_estimated_cost' => 1000.00,
        ]);
        $pr->items()->create([
            'item_description' => 'Monitor 27 Inch',
            'item_reference' => 'NOTIF-PR-001',
            'region' => 'المنطقة السابعة والعشرون',
            'quantity' => 1,
            'estimated_unit_price' => 1000.00,
            'estimated_line_total' => 1000.00,
        ]);

        app(PurchaseRequestService::class)->submitRequest($this->employee, $pr);

        // Event 1: Reviewer should receive notification
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->reviewer->id,
            'type' => 'purchase_request_submitted',
        ]);

        // 2. Reviewer approves PR
        $pr->refresh();
        app(ReviewerPurchaseRequestService::class)->approveRequest($this->reviewer, $pr, 'Looks good');

        // Event 2: Executive / General Manager AND Employee should receive notifications
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->employee->id,
            'type' => 'purchase_request_approved',
        ]);

        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->gmUser->id,
            'type' => 'purchase_request_pending_executive',
        ]);

        // 2.5 Executive approves, then Procurement Manager receives the request
        $pr->refresh();
        app(\App\Services\GeneralManagerPurchaseRequestService::class)->approveRequest($this->gmUser, $pr, 'Executive approved');
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->procurementManager->id,
            'type' => 'purchase_request_pending_procurement',
        ]);

        $pr->refresh();
        app(\App\Services\ProcurementPurchaseRequestService::class)->approvePurchaseRequest($this->procurementManager, $pr, 'Procurement approved');
        $pr->refresh();
        app(PurchaseQuoteService::class)->createThreeQuotes($this->procurementManager, $pr, [
            ['supplier_id' => $this->supplier->id, 'total_amount' => 1000],
            ['supplier_id' => $this->supplierB->id, 'total_amount' => 1010],
            ['supplier_id' => $this->supplierC->id, 'total_amount' => 1020],
        ]);
        $pr->refresh();
        $quotes = $pr->quotes()->get();
        app(PurchaseQuoteService::class)->recommend($this->accountant, $quotes[0], 'RECOMMEND', 'ترشيح الحسابات.');
        app(PurchaseQuoteService::class)->recommend($this->reviewer, $quotes[0], 'RECOMMEND', 'ترشيح القسم.');
        $pr->refresh();
        app(PurchaseQuoteService::class)->decide($this->gmUser, $pr->quotes()->first(), 'SELECT', 'تم اختيار العرض.');

        // 3. Procurement Manager creates PO & submits to Accounting
        $pr->refresh();
        $po = app(PurchaseOrderService::class)->createPoFromPr($this->procurementManager, $pr->id, $this->supplier->id);
        app(PurchaseOrderService::class)->submitToAccounting($this->procurementManager, $po);

        // Event 4: Financial Director is excluded from PO issue notifications (deferred until receipt / invoice)
        $this->assertDatabaseMissing('notifications', [
            'user_id' => $this->accountant->id,
            'type' => 'purchase_order_issued_accounting',
        ]);

        $this->assertDatabaseMissing('notifications', [
            'user_id' => $this->gmUser->id,
            'type' => 'purchase_order_issued_gm',
        ]);
    }

    public function test_employee_receives_notification_on_reviewer_approval(): void
    {
        $pr = PurchaseRequest::create([
            'request_number' => 'PR-2026-0001',
            'user_id' => $this->employee->id,
            'department_id' => $this->dept->id,
            'target_department_id' => $this->dept->id,
            'reviewer_user_id' => $this->reviewer->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
            'title' => 'Approval Notification Test',
            'status' => 'SUBMITTED',
            'total_estimated_cost' => 500.00,
        ]);
        $pr->items()->create([
            'item_description' => 'Office Desk',
            'item_reference' => 'NOTIF-PR-002',
            'region' => 'المنطقة السابعة والعشرون',
            'quantity' => 1,
            'estimated_unit_price' => 500.00,
            'estimated_line_total' => 500.00,
        ]);

        app(ReviewerPurchaseRequestService::class)->approveRequest($this->reviewer, $pr, 'Approved cleanly');

        // Verify Employee notification
        $empNotification = Notification::where('user_id', $this->employee->id)
            ->where('type', 'purchase_request_approved')
            ->first();

        $this->assertNotNull($empNotification);
        $this->assertEquals(PurchaseRequest::class, $empNotification->notifiable_type);
        $this->assertEquals($pr->id, $empNotification->notifiable_id);
        $this->assertStringContainsString('PR-2026-0001', $empNotification->message);
        $this->assertEquals('تم اعتماد طلب الشراء', $empNotification->title);

        // Verify Executive / General Manager receives the next-stage notification
        $executiveNotification = Notification::where('user_id', $this->gmUser->id)
            ->where('type', 'purchase_request_pending_executive')
            ->first();

        $this->assertNotNull($executiveNotification);
    }

    public function test_employee_receives_notification_with_reason_on_reviewer_rejection(): void
    {
        $pr = PurchaseRequest::create([
            'request_number' => 'PR-2026-0002',
            'user_id' => $this->employee->id,
            'department_id' => $this->dept->id,
            'target_department_id' => $this->dept->id,
            'reviewer_user_id' => $this->reviewer->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
            'title' => 'Rejection Notification Test',
            'status' => 'SUBMITTED',
            'total_estimated_cost' => 800.00,
        ]);
        $pr->items()->create([
            'item_description' => 'Ergonomic Chair',
            'item_reference' => 'NOTIF-PR-004',
            'region' => 'المنطقة السابعة والعشرون',
            'quantity' => 1,
            'estimated_unit_price' => 800.00,
            'estimated_line_total' => 800.00,
        ]);

        $rejectionReason = 'Please clarify technical specifications for the chair.';
        app(ReviewerPurchaseRequestService::class)->rejectRequest($this->reviewer, $pr, $rejectionReason);

        // Verify Employee notification contains actual reason
        $empNotification = Notification::where('user_id', $this->employee->id)
            ->where('type', 'purchase_request_rejected')
            ->first();

        $this->assertNotNull($empNotification);
        $this->assertEquals(PurchaseRequest::class, $empNotification->notifiable_type);
        $this->assertEquals($pr->id, $empNotification->notifiable_id);
        $this->assertStringContainsString('PR-2026-0002', $empNotification->message);
        $this->assertStringContainsString($rejectionReason, $empNotification->message);
    }

    public function test_another_employee_does_not_receive_decision_notification(): void
    {
        $otherEmployee = User::create([
            'department_id' => $this->dept->id,
            'name' => 'Other Employee',
            'email' => 'other@ashbiliya.com',
            'password' => Hash::make('Secret123!'),
            'is_active' => true,
        ]);

        $pr = PurchaseRequest::create([
            'request_number' => 'PR-2026-0003',
            'user_id' => $this->employee->id,
            'department_id' => $this->dept->id,
            'target_department_id' => $this->dept->id,
            'reviewer_user_id' => $this->reviewer->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
            'title' => 'Isolation Notification Test',
            'status' => 'SUBMITTED',
            'total_estimated_cost' => 300.00,
        ]);
        $pr->items()->create([
            'item_description' => 'Keyboard',
            'item_reference' => 'NOTIF-PR-003',
            'region' => 'المنطقة السابعة والعشرون',
            'quantity' => 1,
            'estimated_unit_price' => 300.00,
            'estimated_line_total' => 300.00,
        ]);

        app(ReviewerPurchaseRequestService::class)->approveRequest($this->reviewer, $pr, 'Approved');

        // Other employee should NOT receive notification
        $otherNotifCount = Notification::where('user_id', $otherEmployee->id)->count();
        $this->assertEquals(0, $otherNotifCount);
    }
}
