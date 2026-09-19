<?php

use App\Http\Controllers\Api\V1\AccountingPurchaseOrderController;
use App\Http\Controllers\Api\V1\AccountingPurchaseRequestController;
use App\Http\Controllers\Api\V1\SupplierInvoiceController;
use App\Http\Controllers\Api\V1\AdminController;
use App\Http\Controllers\Api\V1\AdminRequestTrackerController;
use App\Http\Controllers\Api\V1\AdminSystemMonitoringController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\GeneralManagerPurchaseOrderController;
use App\Http\Controllers\Api\V1\GeneralManagerPurchaseRequestController;
use App\Http\Controllers\Api\V1\HealthController;
use App\Http\Controllers\Api\V1\LandParcelController;
use App\Http\Controllers\Api\V1\ProcurementAnalyticsController;
use App\Http\Controllers\Api\V1\PurchaseQuoteController;
use App\Http\Controllers\Api\V1\PurchaseReceiptController;
use App\Http\Controllers\Api\V1\NotificationController;
use App\Http\Controllers\Api\V1\SystemEventController;
use App\Http\Controllers\Api\V1\ProcurementPurchaseOrderController;
use App\Http\Controllers\Api\V1\PurchaseRequestController;
use App\Http\Controllers\Api\V1\PurchaseRequestItemController;
use App\Http\Controllers\Api\V1\PurchaseRequestSupplementController;
use App\Http\Controllers\Api\V1\PurchasesReportController;
use App\Http\Controllers\Api\V1\ReviewerPurchaseRequestController;
use App\Http\Controllers\Api\Accounting\AccountController;
use App\Http\Controllers\Api\Accounting\CostCenterController;
use App\Http\Controllers\Api\Accounting\ContractorInvoiceController;
use App\Http\Controllers\Api\Accounting\PettyCashSettlementController;
use App\Http\Controllers\Api\Accounting\CostCenterReportController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes - V1
|--------------------------------------------------------------------------
|
| Base API route group for Al-Ashbiliya Procurement Management System.
|
*/

Route::get('/health', [HealthController::class, 'index']);


// Authentication & Authorization Routes
Route::prefix('auth')->group(function () {
    Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:10,1');
    Route::get('/demo-accounts', [AuthController::class, 'demoAccounts'])->middleware('throttle:30,1');

    Route::middleware('auth:sanctum')->group(function () {
        Route::get('/me', [AuthController::class, 'me']);
        Route::put('/password', [AuthController::class, 'changePassword']);
        Route::post('/logout', [AuthController::class, 'logout']);
        Route::get('/authorization-test', function () {
            return response()->json([
                'message' => 'Authorization test successful',
            ]);
        })->middleware('permission:system.users.manage');
    });
});

// Catalog Items Route
Route::middleware('auth:sanctum')->get('/catalog-items', [\App\Http\Controllers\Api\V1\CatalogItemController::class, 'index']);
Route::middleware('auth:sanctum')->get('/items/suggestions', [\App\Http\Controllers\Api\V1\CatalogItemController::class, 'suggestions']);
Route::middleware('auth:sanctum')->get('/reports/purchases', [PurchasesReportController::class, 'index'])
    ->middleware('permission:purchase_order.view|purchase_order.view_gm|purchase_order.view_accounting');

// Employee Purchase Request Routes
Route::middleware('auth:sanctum')->prefix('purchase-requests')->group(function () {
    Route::get('/', [PurchaseRequestController::class, 'index'])
        ->middleware('permission:purchase_request.view_own');

    Route::post('/', [PurchaseRequestController::class, 'store'])
        ->middleware('permission:purchase_request.create');

    Route::get('/department-options', [PurchaseRequestController::class, 'departmentOptions']);
    Route::get('/reviewer-options', [PurchaseRequestController::class, 'reviewerOptions']);
    Route::get('/site-engineer-options', [PurchaseRequestController::class, 'siteEngineerOptions']);
    Route::get('/eligible-for-supplement', [PurchaseRequestSupplementController::class, 'eligibleRequests']);
    Route::get('/{id}/supplements', [PurchaseRequestSupplementController::class, 'index'])->whereNumber('id');
    Route::post('/{id}/supplements', [PurchaseRequestSupplementController::class, 'store'])->whereNumber('id');
    Route::post('/supplements/{supplementId}/approve', [PurchaseRequestSupplementController::class, 'approveReviewer'])->whereNumber('supplementId');
    Route::post('/supplements/{supplementId}/process-procurement', [PurchaseRequestSupplementController::class, 'processProcurement'])->whereNumber('supplementId');

    Route::get('/{id}', [PurchaseRequestController::class, 'show'])
        ->whereNumber('id')
        ->middleware('permission:purchase_request.view_own');

    Route::put('/{id}', [PurchaseRequestController::class, 'update'])
        ->whereNumber('id')
        ->middleware('permission:purchase_request.edit_own');

    Route::delete('/{id}', [PurchaseRequestController::class, 'destroy'])
        ->whereNumber('id')
        ->middleware('permission:purchase_request.edit_own');

    Route::post('/{id}/submit', [PurchaseRequestController::class, 'submit'])
        ->whereNumber('id')
        ->middleware('permission:purchase_request.submit');

    Route::post('/{id}/attachments', [PurchaseRequestController::class, 'attachmentUpload'])
        ->whereNumber('id')
        ->middleware('permission:purchase_request.create');

    Route::delete('/{id}/attachments/{attachmentId}', [PurchaseRequestController::class, 'attachmentDelete'])
        ->whereNumber('id')
        ->whereNumber('attachmentId')
        ->middleware('permission:purchase_request.edit_own');

    Route::get('/{id}/attachments/{attachmentId}/download', [PurchaseRequestController::class, 'attachmentDownload'])
        ->whereNumber('id')
        ->whereNumber('attachmentId')
        ->middleware('permission:purchase_request.view_own');

    // Purchase Request Line Items Management (Emp in DRAFT, Reviewer during review, Procurement in active procurement states, Admin)
    Route::post('/{id}/items', [PurchaseRequestItemController::class, 'store'])
        ->whereNumber('id');

    Route::put('/{id}/items/{itemId}', [PurchaseRequestItemController::class, 'update'])
        ->whereNumber('id')
        ->whereNumber('itemId');

    Route::delete('/{id}/items/{itemId}', [PurchaseRequestItemController::class, 'destroy'])
        ->whereNumber('id')
        ->whereNumber('itemId');
});

// Reviewer Purchase Request Routes
Route::middleware('auth:sanctum')->prefix('reviewer/purchase-requests')->group(function () {
    Route::get('/', [ReviewerPurchaseRequestController::class, 'index'])
        ->middleware('permission:purchase_request.view_assigned');

    Route::get('/{id}', [ReviewerPurchaseRequestController::class, 'show'])
        ->whereNumber('id')
        ->middleware('permission:purchase_request.view_assigned');

    Route::post('/{id}/review', [ReviewerPurchaseRequestController::class, 'startReview'])
        ->whereNumber('id')
        ->middleware('permission:purchase_request.review');

    Route::put('/{id}', [ReviewerPurchaseRequestController::class, 'updateHeader'])
        ->whereNumber('id')
        ->middleware('permission:purchase_request.edit_during_review');

    Route::put('/{id}/items/{itemId}', [ReviewerPurchaseRequestController::class, 'updateItem'])
        ->whereNumber('id')
        ->whereNumber('itemId')
        ->middleware('permission:purchase_request.edit_during_review');

    Route::post('/{id}/items', [ReviewerPurchaseRequestController::class, 'addItem'])
        ->whereNumber('id')
        ->middleware('permission:purchase_request.edit_during_review');

    Route::delete('/{id}/items/{itemId}', [ReviewerPurchaseRequestController::class, 'deleteItem'])
        ->whereNumber('id')
        ->whereNumber('itemId')
        ->middleware('permission:purchase_request.edit_during_review');

    Route::post('/{id}/approve', [ReviewerPurchaseRequestController::class, 'approve'])
        ->whereNumber('id')
        ->middleware('permission:purchase_request.approve');

    Route::post('/{id}/reject', [ReviewerPurchaseRequestController::class, 'reject'])
        ->whereNumber('id')
        ->middleware('permission:purchase_request.reject');
});

// Procurement Manager Routes
Route::middleware('auth:sanctum')->prefix('procurement')->group(function () {

    // ── PR Approval Queue (PENDING_PROCUREMENT_APPROVAL) ──
    Route::get('/purchase-requests', [ProcurementPurchaseOrderController::class, 'indexApprovedPrs'])
        ->middleware('permission:purchase_request.view_approved');

    Route::get('/purchase-requests/quotes', [ProcurementPurchaseOrderController::class, 'indexPendingQuoteRequests'])
        ->middleware('permission:purchase_quote.view');

    Route::get('/purchase-requests/{id}', [ProcurementPurchaseOrderController::class, 'showApprovedPr'])
        ->middleware('permission:purchase_request.view_approved');

    Route::get('/purchase-requests/{id}/quotes', [PurchaseQuoteController::class, 'showForRequest'])
        ->middleware('permission:purchase_quote.view');

    Route::post('/purchase-requests/{id}/quotes', [PurchaseQuoteController::class, 'create'])
        ->middleware('permission:purchase_quote.create');

    Route::post('/purchase-requests/{id}/approve', [ProcurementPurchaseOrderController::class, 'approvePurchaseRequest'])
        ->middleware('permission:purchase_request.approve_procurement');

    Route::post('/purchase-requests/{id}/reject', [ProcurementPurchaseOrderController::class, 'rejectPurchaseRequest'])
        ->middleware('permission:purchase_request.approve_procurement');

    // ── PR Approved by Procurement (APPROVED_BY_PROCUREMENT — ready for PO creation) ──
    Route::get('/approved-purchase-requests', [ProcurementPurchaseOrderController::class, 'indexProcurementApprovedPrs'])
        ->middleware('permission:purchase_request.view_approved');

    // ── Department and site-engineer targets for direct purchase requests ──
    Route::get('/departments', [AdminController::class, 'indexDepartments'])
        ->middleware('permission:purchase_order.create');

    Route::get('/site-engineers', [PurchaseRequestController::class, 'siteEngineerOptions'])
        ->middleware('permission:purchase_order.create');

    // ── Suppliers ──
    Route::get('/suppliers', [ProcurementPurchaseOrderController::class, 'indexSuppliers'])
        ->middleware('permission:supplier.view');

    Route::get('/suppliers-manage', [\App\Http\Controllers\Api\V1\SupplierController::class, 'index'])
        ->middleware('permission:supplier.view');

    Route::get('/suppliers-manage/{id}', [\App\Http\Controllers\Api\V1\SupplierController::class, 'show'])
        ->middleware('permission:supplier.view');

    Route::post('/suppliers', [\App\Http\Controllers\Api\V1\SupplierController::class, 'store'])
        ->middleware('permission:supplier.create');

    Route::put('/suppliers/{id}', [\App\Http\Controllers\Api\V1\SupplierController::class, 'update'])
        ->middleware('permission:supplier.edit');

    Route::delete('/suppliers/{id}', [\App\Http\Controllers\Api\V1\SupplierController::class, 'destroy'])
        ->middleware('permission:supplier.edit');

    // ── Direct purchase request (legacy URL retained for existing clients) ──
    Route::post('/direct-purchase-request', [ProcurementPurchaseOrderController::class, 'storeDirectPo'])
        ->middleware('permission:purchase_order.create');
    Route::post('/direct-po', [ProcurementPurchaseOrderController::class, 'storeDirectPo'])
        ->middleware('permission:purchase_order.create');

    // ── Purchase Orders ──
    Route::get('/purchase-orders', [ProcurementPurchaseOrderController::class, 'indexPos'])
        ->middleware('permission:purchase_order.view');

    Route::get('/purchase-orders/{id}', [ProcurementPurchaseOrderController::class, 'showPo'])
        ->middleware('permission:purchase_order.view');

    Route::post('/purchase-orders', [ProcurementPurchaseOrderController::class, 'storePo'])
        ->middleware('permission:purchase_order.create');

    Route::put('/purchase-orders/{id}', [ProcurementPurchaseOrderController::class, 'updateHeader'])
        ->middleware('permission:purchase_order.edit');

    Route::put('/purchase-orders/{id}/items/{itemId}', [ProcurementPurchaseOrderController::class, 'updateItem'])
        ->middleware('permission:purchase_order.edit');

    Route::post('/purchase-orders/{id}/items', [ProcurementPurchaseOrderController::class, 'addItem'])
        ->middleware('permission:purchase_order.edit');

    Route::delete('/purchase-orders/{id}/items/{itemId}', [ProcurementPurchaseOrderController::class, 'deleteItem'])
        ->middleware('permission:purchase_order.edit');

    Route::post('/purchase-orders/{id}/submit', [ProcurementPurchaseOrderController::class, 'submitPoToAccounting'])
        ->middleware('permission:purchase_order.create');

    Route::put('/purchase-orders/{id}/delivery', [ProcurementPurchaseOrderController::class, 'updateDeliveryStatus'])
        ->middleware('permission:purchase_order.edit');

    Route::get('/analytics', [ProcurementAnalyticsController::class, 'index'])
        ->middleware('permission:purchase_order.view|purchase_order.view_gm|purchase_order.view_accounting');

    Route::get('/reports/purchases', [PurchasesReportController::class, 'index'])
        ->middleware('permission:purchase_order.view|purchase_order.view_gm|purchase_order.view_accounting');
});

// Accounting Financial Review Routes (View Only)
Route::middleware('auth:sanctum')->prefix('accounting/purchase-orders')->group(function () {
    Route::get('/', [AccountingPurchaseOrderController::class, 'index'])
        ->middleware('permission:purchase_order.view_accounting');

    Route::get('/{id}', [AccountingPurchaseOrderController::class, 'show'])
        ->middleware('permission:purchase_order.view_accounting');

    Route::post('/{id}/approve', [AccountingPurchaseOrderController::class, 'approve'])
        ->middleware('permission:purchase_order.view_accounting');

    Route::post('/{id}/return', [AccountingPurchaseOrderController::class, 'returnToProcurement'])
        ->middleware('permission:purchase_order.view_accounting');
});

// Supplier Invoices, Payments, and Supplier Accounts
Route::middleware('auth:sanctum')->prefix('accounting')->group(function () {
    Route::get('/purchase-requests/direct-approval', [AccountingPurchaseRequestController::class, 'index'])
        ->middleware('permission:purchase_request.accounting_view');
    Route::get('/purchase-requests/direct-suppliers', [AccountingPurchaseRequestController::class, 'suppliers'])
        ->middleware('permission:purchase_request.accounting_view');
    Route::post('/purchase-requests/{id}/direct-approve', [AccountingPurchaseRequestController::class, 'approve'])
        ->middleware('permission:purchase_request.accounting_approve');
    Route::post('/purchase-requests/{id}/direct-reject', [AccountingPurchaseRequestController::class, 'reject'])
        ->middleware('permission:purchase_request.accounting_reject');

    Route::get('/departments', [AdminController::class, 'indexDepartments'])
        ->middleware('permission:accounting.invoice.view');
    Route::get('/land-parcels', [LandParcelController::class, 'index'])
        ->middleware('permission:accounting.invoice.view|purchase_order.view_gm|purchase_request.create|purchase_request.edit_own|purchase_request.view_own|purchase_request.view_all|purchase_request.review');
    Route::post('/land-parcels', [LandParcelController::class, 'store'])
        ->middleware('permission:accounting.invoice.create');
    Route::get('/land-parcels/{landParcel}', [LandParcelController::class, 'show'])
        ->middleware('permission:accounting.invoice.view|purchase_order.view_gm');
    Route::post('/land-parcels/{landParcel}/fund', [LandParcelController::class, 'fund'])
        ->middleware('permission:accounting.invoice.create');

    Route::get('/receipts/approved', [SupplierInvoiceController::class, 'approvedReceipts'])
        ->middleware('permission:accounting.invoice.view');
    Route::get('/invoices', [SupplierInvoiceController::class, 'invoices'])
        ->middleware('permission:accounting.invoice.view');
    Route::post('/invoices', [SupplierInvoiceController::class, 'storeInvoice'])
        ->middleware('permission:accounting.invoice.create');
    Route::post('/invoices/{invoice}/match', [SupplierInvoiceController::class, 'match'])
        ->middleware('permission:accounting.invoice.match');
    Route::post('/invoices/{invoice}/payments', [SupplierInvoiceController::class, 'storePayment'])
        ->middleware('permission:accounting.payment.create');
    Route::post('/suppliers/{supplier}/payments', [SupplierInvoiceController::class, 'storeSupplierPayment'])
        ->middleware('permission:accounting.payment.create');
    Route::get('/suppliers/accounts', [SupplierInvoiceController::class, 'supplierAccounts'])
        ->middleware('permission:supplier.account.view');
    Route::get('/suppliers/{supplier}/account', [SupplierInvoiceController::class, 'supplierAccount'])
        ->middleware('permission:supplier.account.view');
    Route::post('/suppliers/{supplier}/opening-balance', [SupplierInvoiceController::class, 'setOpeningBalance'])
        ->middleware('permission:accounting.invoice.create');
});

// General Accounting Module (Isolated - Chart of Accounts & Cost Centers)
Route::middleware(['auth:sanctum', 'permission:accounting.invoice.view|purchase_order.view_accounting|system.users.manage'])
    ->prefix('accounting')
    ->group(function () {
        Route::get('/accounts', [AccountController::class, 'index']);
        Route::get('/accounts/{account}', [AccountController::class, 'show']);
        Route::get('/cost-centers', [CostCenterController::class, 'index']);
        Route::get('/cost-centers/{costCenter}', [CostCenterController::class, 'show']);

        // Contractor Invoices (مستخلصات المقاولين)
        Route::get('/contractor-invoices', [ContractorInvoiceController::class, 'index']);
        Route::post('/contractor-invoices', [ContractorInvoiceController::class, 'store']);
        Route::get('/contractor-invoices/{contractorInvoice}', [ContractorInvoiceController::class, 'show']);
        Route::put('/contractor-invoices/{contractorInvoice}', [ContractorInvoiceController::class, 'update']);
        Route::delete('/contractor-invoices/{contractorInvoice}', [ContractorInvoiceController::class, 'destroy']);
        Route::post('/contractor-invoices/{contractorInvoice}/approve', [ContractorInvoiceController::class, 'approve']);

        // Petty Cash Settlements (تسويات العهد والمصروفات النثرية)
        Route::get('/petty-cash-settlements', [PettyCashSettlementController::class, 'index']);
        Route::post('/petty-cash-settlements', [PettyCashSettlementController::class, 'store']);
        Route::get('/petty-cash-settlements/{pettyCashSettlement}', [PettyCashSettlementController::class, 'show']);
        Route::put('/petty-cash-settlements/{pettyCashSettlement}', [PettyCashSettlementController::class, 'update']);
        Route::delete('/petty-cash-settlements/{pettyCashSettlement}', [PettyCashSettlementController::class, 'destroy']);
        Route::post('/petty-cash-settlements/{pettyCashSettlement}/approve', [PettyCashSettlementController::class, 'approve']);

        // Cost Centers & Project Costs Reports (تقارير تكاليف المشاريع ومراكز التكلفة)
        Route::get('/reports/cost-centers', [CostCenterReportController::class, 'summary']);
        Route::get('/reports/cost-centers/{id}/statement', [CostCenterReportController::class, 'statement']);
    });

// General Manager / Executive Purchase Request Decision Routes
Route::middleware('auth:sanctum')->prefix('general-manager/purchase-requests')->group(function () {
    Route::get('/', [GeneralManagerPurchaseRequestController::class, 'index'])
        ->middleware('permission:purchase_request.view_gm');

    Route::get('/{id}', [GeneralManagerPurchaseRequestController::class, 'show'])
        ->middleware('permission:purchase_request.view_gm');

    Route::put('/{id}', [GeneralManagerPurchaseRequestController::class, 'update'])
        ->middleware('permission:purchase_request.edit_gm');

    Route::post('/{id}/approve', [GeneralManagerPurchaseRequestController::class, 'approve'])
        ->middleware('permission:purchase_request.approve_gm');

    Route::post('/{id}/reject', [GeneralManagerPurchaseRequestController::class, 'reject'])
        ->middleware('permission:purchase_request.reject_gm');
});

// General Manager — Purchase Order View Access
Route::middleware('auth:sanctum')->prefix('general-manager/purchase-orders')->group(function () {
    Route::get('/', [GeneralManagerPurchaseOrderController::class, 'index'])
        ->middleware('permission:purchase_order.view_gm');

    Route::get('/{id}', [GeneralManagerPurchaseOrderController::class, 'show'])
        ->middleware('permission:purchase_order.view_gm');

    Route::post('/{id}/approve', [GeneralManagerPurchaseOrderController::class, 'approve'])
        ->middleware('permission:purchase_order.view_gm');

    Route::post('/{id}/reject', [GeneralManagerPurchaseOrderController::class, 'reject'])
        ->middleware('permission:purchase_order.view_gm');

    Route::post('/{id}/return', [GeneralManagerPurchaseOrderController::class, 'returnToProcurement'])
        ->middleware('permission:purchase_order.view_gm');
});

// Purchase receipt routes: warehouse first, then assigned site engineer
Route::middleware('auth:sanctum')->prefix('purchase-receipts')->group(function () {
    Route::get('/warehouse-queue', [PurchaseReceiptController::class, 'warehouseQueue'])
        ->middleware('permission:purchase_receipt.view_assigned');
    Route::get('/assigned', [PurchaseReceiptController::class, 'indexAssigned'])
        ->middleware('permission:purchase_receipt.view_assigned');
    Route::get('/archive', [PurchaseReceiptController::class, 'archive'])
        ->middleware('permission:purchase_receipt.view_assigned');
    Route::get('/{id}', [PurchaseReceiptController::class, 'show'])
        ->middleware('permission:purchase_receipt.view_assigned');
    Route::post('/purchase-orders/{purchaseOrderId}', [PurchaseReceiptController::class, 'store'])
        ->middleware('permission:purchase_receipt.edit');
    Route::post('/purchase-orders/{purchaseOrderId}/confirm-office', [PurchaseReceiptController::class, 'confirmOfficeReceipt'])
        ->middleware('permission:purchase_receipt.edit');
    Route::put('/{id}', [PurchaseReceiptController::class, 'update'])
        ->middleware('permission:purchase_receipt.edit');
    Route::post('/{id}/approve', [PurchaseReceiptController::class, 'approve'])
        ->middleware('permission:purchase_receipt.approve');
});

// Receipt direct photo stream (authenticated & permission-checked)
Route::middleware(['auth:sanctum', 'permission:purchase_receipt.view_assigned|accounting.invoice.view'])->get('/purchase-receipts/{id}/photo', [PurchaseReceiptController::class, 'viewPhoto']);

// Quote direct file stream (authenticated & permission-checked)
Route::middleware(['auth:sanctum', 'permission:purchase_quote.view|purchase_request.view_own'])->get('/purchase-quotes/{id}/file', [PurchaseQuoteController::class, 'viewFile']);

Route::middleware('auth:sanctum')->prefix('purchase-quotes')->group(function () {
    Route::get('/suppliers/{id}/archive', [PurchaseQuoteController::class, 'supplierQuotes']);

    Route::post('/{id}/recommend', [PurchaseQuoteController::class, 'recommend'])
        ->middleware('permission:purchase_quote.recommend');

    Route::post('/{id}/decide', [PurchaseQuoteController::class, 'decide'])
        ->middleware('permission:purchase_quote.decide');
});

// System Activity Timeline Routes
Route::middleware('auth:sanctum')->prefix('activity')->group(function () {
    Route::get('/purchase-requests/{id}', [SystemEventController::class, 'purchaseRequest']);
    Route::get('/purchase-orders/{id}', [SystemEventController::class, 'purchaseOrder']);
    Route::get('/my-archive', [SystemEventController::class, 'myArchive']);
});

// In-App Notification System Routes
Route::middleware('auth:sanctum')->prefix('notifications')->group(function () {
    Route::get('/', [NotificationController::class, 'index']);
    Route::get('/unread-count', [NotificationController::class, 'unreadCount']);
    Route::get('/stream', [NotificationController::class, 'stream'])->middleware('throttle:30,1');
    Route::post('/{id}/read', [NotificationController::class, 'markAsRead']);
    Route::post('/read-all', [NotificationController::class, 'markAllAsRead']);
    Route::post('/device-token', [NotificationController::class, 'registerDeviceToken']);
    Route::delete('/device-token', [NotificationController::class, 'deleteDeviceToken']);
    Route::post('/test-push', [NotificationController::class, 'testPush']);
});

// Admin System Management Routes
Route::middleware(['auth:sanctum', 'permission:system.users.manage'])->prefix('admin')->group(function () {
    // Users
    Route::get('/users', [AdminController::class, 'indexUsers']);
    Route::post('/users', [AdminController::class, 'storeUser']);
    Route::put('/users/{id}', [AdminController::class, 'updateUser']);
    Route::delete('/users/{id}', [AdminController::class, 'destroyUser']);

    // Roles & Permissions
    Route::get('/roles', [AdminController::class, 'indexRoles']);
    Route::get('/permissions', [AdminController::class, 'indexPermissions']);
    Route::put('/roles/{id}/permissions', [AdminController::class, 'updateRolePermissions']);

    // Departments
    Route::get('/departments', [AdminController::class, 'indexDepartments']);
    Route::post('/departments', [AdminController::class, 'storeDepartment']);
    Route::put('/departments/{id}', [AdminController::class, 'updateDepartment']);
    Route::delete('/departments/{id}', [AdminController::class, 'destroyDepartment']);

    // Categories
    Route::get('/categories', [AdminController::class, 'indexCategories']);
    Route::post('/categories', [AdminController::class, 'storeCategory']);
    Route::put('/categories/{id}', [AdminController::class, 'updateCategory']);
    Route::delete('/categories/{id}', [AdminController::class, 'destroyCategory']);

    // Items
    Route::get('/items', [AdminController::class, 'indexItems']);
    Route::post('/items', [AdminController::class, 'storeItem']);
    Route::put('/items/{id}', [AdminController::class, 'updateItem']);
    Route::delete('/items/{id}', [AdminController::class, 'destroyItem']);
});

// Admin System Monitoring Routes
Route::middleware(['auth:sanctum', 'permission:system.monitor.view'])->prefix('admin/system')->group(function () {
    Route::get('/monitoring', [AdminSystemMonitoringController::class, 'index']);
    Route::get('/health', [AdminSystemMonitoringController::class, 'healthCheck']);
    Route::get('/alerts', [AdminSystemMonitoringController::class, 'alerts']);
    Route::get('/audit-log', [AdminSystemMonitoringController::class, 'auditLog']);
    Route::get('/security-events', [AdminSystemMonitoringController::class, 'securityEvents']);
    Route::get('/data-quality', [AdminSystemMonitoringController::class, 'dataQuality']);
});

// Admin Request Tracker — full procurement workflow visibility
Route::middleware(['auth:sanctum', 'permission:system.users.manage'])->prefix('admin/request-tracker')->group(function () {
    Route::get('', [AdminRequestTrackerController::class, 'index']);
    Route::get('/', [AdminRequestTrackerController::class, 'index']);
    Route::get('/stats', [AdminRequestTrackerController::class, 'stats']);
    Route::get('/{id}', [AdminRequestTrackerController::class, 'show'])->whereNumber('id');
    Route::post('/{id}/cancel', [AdminRequestTrackerController::class, 'cancel'])->whereNumber('id');
    Route::post('/{id}/archive', [AdminRequestTrackerController::class, 'archive'])->whereNumber('id');
    Route::post('/{id}/restore', [AdminRequestTrackerController::class, 'restore'])->whereNumber('id');
    Route::post('/{id}/note', [AdminRequestTrackerController::class, 'addNote'])->whereNumber('id');
});
