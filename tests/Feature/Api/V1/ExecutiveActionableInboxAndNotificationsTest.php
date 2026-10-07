<?php

namespace Tests\Feature\Api\V1;

use App\Models\Category;
use App\Models\Department;
use App\Models\Item;
use App\Models\Notification;
use App\Models\PurchaseOrder;
use App\Models\PurchaseRequest;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use App\Services\NotificationService;
use App\Services\PurchaseQuoteService;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ExecutiveActionableInboxAndNotificationsTest extends TestCase
{
    use RefreshDatabase;

    private User $gmUser;           // المهندس محمد عبدالكريم (general_manager)
    private User $executionManager; // المهندس كريم (execution_manager)
    private User $executionEngineer;// مهندس يتبع المهندس كريم
    private User $itEngineer;       // مهندس يتبع قسماً آخر (IT/Site)
    private User $reviewer;
    private User $procurementOfficer;
    private User $financialDirector;
    private Department $executionDept;
    private Department $itDept;
    private Supplier $supplierA;
    private Supplier $supplierB;
    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);

        $gmRole = Role::where('slug', 'general_manager')->firstOrFail();
        $emRole = Role::where('slug', 'execution_manager')->firstOrFail();
        $empRole = Role::where('slug', 'employee')->firstOrFail();
        $revRole = Role::where('slug', 'reviewer')->firstOrFail();
        $procRole = Role::where('slug', 'procurement_manager')->firstOrFail();
        $accRole = Role::where('slug', 'accountant')->firstOrFail();

        $this->executionDept = Department::create(['name' => 'إدارة التنفيذ والمشروعات', 'code' => 'EXECUTION']);
        $this->itDept = Department::create(['name' => 'إدارة تكنولوجيا المعلومات', 'code' => 'IT']);

        // 1. المهندس محمد عبدالكريم (المدير العام التنفيذي)
        $this->gmUser = User::create([
            'name' => 'المهندس محمد عبدالكريم',
            'email' => 'mohamed-gm@ashbiliya.com',
            'password' => Hash::make('password123'),
            'is_active' => true,
            'department_id' => $this->executionDept->id,
        ]);
        $this->gmUser->roles()->attach($gmRole->id);

        // 2. المهندس كريم (مدير مشروعات التنفيذ)
        $this->executionManager = User::create([
            'name' => 'المهندس كريم',
            'email' => 'karim@ashbiliya.com',
            'password' => Hash::make('password123'),
            'is_active' => true,
            'department_id' => $this->executionDept->id,
        ]);
        $this->executionManager->roles()->attach($emRole->id);

        // 3. مهندس كامل - يتبع المهندس كريم مباشرة
        $this->executionEngineer = User::create([
            'name' => 'المهندس كامل',
            'email' => 'kamel@ashbiliya.com',
            'password' => Hash::make('password123'),
            'manager_id' => $this->executionManager->id,
            'is_active' => true,
            'department_id' => $this->executionDept->id,
        ]);
        $this->executionEngineer->roles()->attach($empRole->id);

        // 4. مهندس عمرو - يتبع قسماً مستقلاً لا يتبع كريم
        $this->itEngineer = User::create([
            'name' => 'مهندس تكنولوجيا المعلومات',
            'email' => 'amr-it@ashbiliya.com',
            'password' => Hash::make('password123'),
            'manager_id' => null,
            'is_active' => true,
            'department_id' => $this->itDept->id,
        ]);
        $this->itEngineer->roles()->attach($empRole->id);

        // مراجع، مشتريات، وحسابات
        $this->reviewer = User::create([
            'name' => 'مراجع القسم',
            'email' => 'reviewer@ashbiliya.com',
            'password' => Hash::make('password123'),
            'is_active' => true,
            'department_id' => $this->itDept->id,
        ]);
        $this->reviewer->roles()->attach($revRole->id);

        $this->procurementOfficer = User::create([
            'name' => 'مسؤول المشتريات',
            'email' => 'procurement@ashbiliya.com',
            'password' => Hash::make('password123'),
            'is_active' => true,
            'department_id' => $this->itDept->id,
        ]);
        $this->procurementOfficer->roles()->attach($procRole->id);

        $this->financialDirector = User::create([
            'name' => 'المدير المالي',
            'email' => 'finance@ashbiliya.com',
            'password' => Hash::make('password123'),
            'is_active' => true,
            'department_id' => $this->itDept->id,
        ]);
        $this->financialDirector->roles()->attach($accRole->id);

        $this->supplierA = Supplier::create([
            'company_name' => 'مورد الشرق لمواد البناء',
            'contact_name' => 'أحمد حسن',
            'is_active' => true,
        ]);
        $this->supplierB = Supplier::create([
            'company_name' => 'مورد النيل للصلب',
            'contact_name' => 'محمود علي',
            'is_active' => true,
        ]);

        $category = Category::create(['name' => 'حديد وصلب', 'code' => 'STEEL', 'is_active' => true]);
        $this->item = Item::create([
            'sku' => 'STEEL-01',
            'name' => 'حديد تسليح 12 مم',
            'category_id' => $category->id,
            'uom' => 'TON',
            'is_active' => true,
        ]);
    }

    private function createPr(User $requester, Department $dept, string $status = 'PENDING_EXECUTIVE_APPROVAL'): PurchaseRequest
    {
        $pr = PurchaseRequest::create([
            'request_number' => 'PR-' . uniqid(),
            'user_id' => $requester->id,
            'department_id' => $dept->id,
            'status' => $status,
            'priority' => 'HIGH',
            'total_estimated_cost' => 50000,
            'date_needed' => now()->addDays(5)->toDateString(),
            'justification' => 'طلب مواد توريد للمشروع',
        ]);

        $pr->items()->create([
            'item_id' => $this->item->id,
            'item_description' => $this->item->name,
            'item_reference' => 'PARCEL-100',
            'region' => 'منطقة أ',
            'quantity' => 10,
            'uom' => 'TON',
            'estimated_unit_price' => 5000,
            'estimated_line_total' => 50000,
        ]);

        return $pr->fresh(['items.item', 'requester', 'department']);
    }

    /**
     * Pillar 1: Zero Informational Notifications for Executives.
     * Informational notification types (e.g., PO issued, general status updates, receipts) must be strictly blocked.
     */
    public function test_executives_never_receive_informational_notifications(): void
    {
        $pr = $this->createPr($this->itEngineer, $this->itDept, 'ISSUED');
        $po = PurchaseOrder::create([
            'po_number' => 'PO-' . uniqid(),
            'purchase_request_id' => $pr->id,
            'supplier_id' => $this->supplierA->id,
            'status' => 'ISSUED',
            'grand_total' => 50000,
            'currency' => 'EGP',
            'created_by_user_id' => $this->procurementOfficer->id,
        ]);

        $notifService = app(NotificationService::class);

        // Attempt sending informational PO notification to GM
        $resultGm = $notifService->createNotification(
            $this->gmUser,
            'purchase_order_issued_requester',
            'تم إصدار أمر الشراء',
            'تم إصدار أمر الشراء للاطلاع',
            $po
        );
        $this->assertNull($resultGm, 'General Manager must not receive informational PO issuance notification');

        // Attempt sending informational PO notification to Execution Manager
        $resultEm = $notifService->createNotification(
            $this->executionManager,
            'purchase_order_issued_requester',
            'تم إصدار أمر الشراء',
            'تم إصدار أمر الشراء للاطلاع',
            $po
        );
        $this->assertNull($resultEm, 'Execution Manager must not receive informational PO issuance notification');

        // Verify nothing was persisted in database for either executive
        $this->assertDatabaseMissing('notifications', ['user_id' => $this->gmUser->id]);
        $this->assertDatabaseMissing('notifications', ['user_id' => $this->executionManager->id]);
    }

    /**
     * Pillar 2: Actionable Notifications Permitted ONLY when PR is in corresponding pending state.
     */
    public function test_actionable_notifications_blocked_if_pr_is_not_pending_executive_decision(): void
    {
        $notifService = app(NotificationService::class);

        // 1. PR is already APPROVED_BY_EXECUTIVE - not pending
        $prApproved = $this->createPr($this->itEngineer, $this->itDept, 'PENDING_PROCUREMENT_APPROVAL');
        $notif = $notifService->createNotification(
            $this->gmUser,
            'purchase_request_pending_executive',
            'طلب شراء بانتظار الاعتماد',
            'طلب الشراء يحتاج قرارك',
            $prApproved
        );
        $this->assertNull($notif, 'Notification must be blocked if PR is not in PENDING_EXECUTIVE_APPROVAL');

        // 2. PR is in PENDING_EXECUTIVE_APPROVAL - valid actionable state
        $prPending = $this->createPr($this->itEngineer, $this->itDept, 'PENDING_EXECUTIVE_APPROVAL');
        $notifValid = $notifService->createNotification(
            $this->gmUser,
            'purchase_request_pending_executive',
            'طلب شراء بانتظار الاعتماد',
            'طلب الشراء يحتاج قرارك',
            $prPending
        );
        $this->assertNotNull($notifValid, 'Notification must be created when PR is in PENDING_EXECUTIVE_APPROVAL');
        $this->assertDatabaseHas('notifications', ['id' => $notifValid->id, 'user_id' => $this->gmUser->id]);
    }

    /**
     * Pillar 3: Role & Team Isolation between Eng. Mohamed (GM) and Eng. Karim (Execution Manager).
     */
    public function test_team_isolation_between_mohamed_and_karim(): void
    {
        $notifService = app(NotificationService::class);

        // Case A: Request from Eng. Kamel (subordinate to Eng. Karim)
        $prKarimSubordinate = $this->createPr($this->executionEngineer, $this->executionDept, 'PENDING_EXECUTIVE_APPROVAL');

        // Mohmed (GM) must NOT receive notification for Karim's subordinate
        $gmResult = $notifService->createNotification(
            $this->gmUser,
            'purchase_request_pending_executive',
            'طلب شراء بانتظار الاعتماد',
            'طلب الشراء يحتاج قرارك',
            $prKarimSubordinate
        );
        $this->assertNull($gmResult, 'Mohamed (GM) must not receive notification for Karim subordinate request');

        // Karim (Execution Manager) DOES receive notification for his subordinate
        $karimResult = $notifService->createNotification(
            $this->executionManager,
            'purchase_request_pending_executive',
            'طلب شراء بانتظار الاعتماد',
            'طلب الشراء يحتاج قرارك',
            $prKarimSubordinate
        );
        $this->assertNotNull($karimResult, 'Karim must receive notification for his subordinate request');

        // Case B: Request from IT Dept (does not belong to Karim)
        $prItDept = $this->createPr($this->itEngineer, $this->itDept, 'PENDING_EXECUTIVE_APPROVAL');

        // Karim must NOT receive notification for IT request
        $karimItResult = $notifService->createNotification(
            $this->executionManager,
            'purchase_request_pending_executive',
            'طلب شراء بانتظار الاعتماد',
            'طلب الشراء يحتاج قرارك',
            $prItDept
        );
        $this->assertNull($karimItResult, 'Karim must not receive notification for non-execution request');

        // Mohamed (GM) DOES receive notification for IT request
        $gmItResult = $notifService->createNotification(
            $this->gmUser,
            'purchase_request_pending_executive',
            'طلب شراء بانتظار الاعتماد',
            'طلب الشراء يحتاج قرارك',
            $prItDept
        );
        $this->assertNotNull($gmItResult, 'Mohamed must receive notification for non-execution request');
    }

    /**
     * Pillar 4: Immediate disappearance of notifications and task items once decision is made.
     */
    public function test_notifications_and_tasks_disappear_immediately_when_decision_taken(): void
    {
        $pr = $this->createPr($this->itEngineer, $this->itDept, 'PENDING_EXECUTIVE_APPROVAL');

        $notifService = app(NotificationService::class);
        $notifService->createNotification(
            $this->gmUser,
            'purchase_request_pending_executive',
            'طلب شراء بانتظار الاعتماد',
            'طلب الشراء يحتاج قرارك',
            $pr
        );

        // Before decision: notification exists in getUserNotifications and unreadCount = 1
        $this->actingAs($this->gmUser, 'sanctum');

        $responsePending = $this->getJson('/api/v1/general-manager/purchase-requests');
        $responsePending->assertOk();
        $this->assertCount(1, $responsePending->json('data'));

        $notifResponseBefore = $this->getJson('/api/v1/notifications');
        $notifResponseBefore->assertOk();
        $this->assertCount(1, $notifResponseBefore->json('data'));

        $unreadResponseBefore = $this->getJson('/api/v1/notifications/unread-count');
        $unreadResponseBefore->assertOk();
        $this->assertEquals(1, $unreadResponseBefore->json('unread_count'));

        // Action: GM approves the request
        $approveResponse = $this->postJson("/api/v1/general-manager/purchase-requests/{$pr->id}/approve", [
            'comment' => 'معتمد تنفيذيًا من المهندس محمد',
        ]);
        $approveResponse->assertOk();

        // After decision: PR has transitioned to PENDING_PROCUREMENT_APPROVAL
        $pr->refresh();
        $this->assertEquals('PENDING_PROCUREMENT_APPROVAL', $pr->status);

        // Immediately disappears from executive pending requests list
        $responseAfter = $this->getJson('/api/v1/general-manager/purchase-requests');
        $responseAfter->assertOk();
        $this->assertCount(0, $responseAfter->json('data'), 'Request must vanish from GM pending requests queue');

        // Immediately vanishes from GM notifications inbox
        $notifResponseAfter = $this->getJson('/api/v1/notifications');
        $notifResponseAfter->assertOk();
        $this->assertCount(0, $notifResponseAfter->json('data'), 'Notification must vanish from GM inbox once decision is taken');

        // Unread count is reset to 0
        $unreadResponseAfter = $this->getJson('/api/v1/notifications/unread-count');
        $unreadResponseAfter->assertOk();
        $this->assertEquals(0, $unreadResponseAfter->json('unread_count'), 'Unread count must be 0 after decision');
    }

    /**
     * Pillar 5: Executive Quote Decision Auto-Resolution for Execution Manager.
     */
    public function test_execution_manager_quote_decision_workflow_and_resolution(): void
    {
        $this->executionDept->update(['manager_user_id' => $this->reviewer->id]);
        $pr = $this->createPr($this->executionEngineer, $this->executionDept, 'PENDING_QUOTE_RECOMMENDATIONS');

        $quoteService = app(PurchaseQuoteService::class);
        $quoteService->createQuotes($this->procurementOfficer, $pr, [
            ['supplier_id' => $this->supplierA->id, 'unit_price' => 5000, 'total_amount' => 50000],
            ['supplier_id' => $this->supplierB->id, 'unit_price' => 4800, 'total_amount' => 48000],
        ]);

        $pr->refresh();
        $quoteB = $pr->quotes->where('supplier_id', $this->supplierB->id)->first();

        // 1. Financial Director recommends
        $quoteService->recommend($this->financialDirector, $quoteB, 'RECOMMEND', 'الأفضل مالياً');

        // 2. Department reviewer recommends
        $quoteService->recommend($this->reviewer, $quoteB, 'RECOMMEND', 'المطابقة الفنية معتمدة');

        $pr->refresh();
        $this->assertEquals(PurchaseQuoteService::EXECUTIVE_DECISION_PENDING, $pr->status);

        // Notification must exist for Karim (Execution Manager)
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->executionManager->id,
            'type' => 'purchase_quote_recommendations_ready',
        ]);

        $this->actingAs($this->executionManager, 'sanctum');

        // Karim sees 1 pending quote request
        $quoteQueueResponse = $this->getJson('/api/v1/procurement/purchase-requests/quotes');
        $quoteQueueResponse->assertOk();
        $this->assertCount(1, $quoteQueueResponse->json('data'));

        // Karim sees 1 notification and unread count = 1
        $notifResponse = $this->getJson('/api/v1/notifications');
        $notifResponse->assertOk();
        $this->assertCount(1, $notifResponse->json('data'));

        // Karim makes the executive decision
        $decisionResponse = $this->postJson("/api/v1/purchase-quotes/{$quoteB->id}/decide", [
            'decision' => 'SELECT',
            'comment' => 'اعتماد الترسية على شركة النيل للصلب - المهندس كريم',
        ]);
        $decisionResponse->assertOk();

        // After decision:
        $pr->refresh();
        $this->assertEquals('APPROVED_BY_PROCUREMENT', $pr->status);

        // Instantly vanishes from pending quotes queue
        $quoteQueueAfter = $this->getJson('/api/v1/procurement/purchase-requests/quotes');
        $quoteQueueAfter->assertOk();
        $this->assertCount(0, $quoteQueueAfter->json('data'));

        // Instantly vanishes from Karim's notifications and unread count = 0
        $notifResponseAfter = $this->getJson('/api/v1/notifications');
        $notifResponseAfter->assertOk();
        $this->assertCount(0, $notifResponseAfter->json('data'));

        $unreadResponseAfter = $this->getJson('/api/v1/notifications/unread-count');
        $unreadResponseAfter->assertOk();
        $this->assertEquals(0, $unreadResponseAfter->json('unread_count'));
    }
}
