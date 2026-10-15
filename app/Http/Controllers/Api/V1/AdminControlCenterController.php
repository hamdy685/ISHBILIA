<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AdminAuditLog;
use App\Models\Department;
use App\Models\PurchaseOrder;
use App\Models\PurchaseReceipt;
use App\Models\PurchaseRequest;
use App\Models\Supplier;
use App\Models\User;
use App\Models\WorkflowDocumentAssignment;
use App\Models\WorkflowTransition;
use App\Services\AdminWorkflowControlService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;
use Throwable;

class AdminControlCenterController extends Controller
{
    public function __construct(
        protected AdminWorkflowControlService $controlService
    ) {}

    /**
     * Universal multi-entity search across PR, PO, REC, Suppliers, Plots, etc.
     */
    public function search(Request $request): JsonResponse
    {
        try {
            $q = trim((string) $request->query('q', ''));
            $entityType = strtoupper((string) $request->query('entity_type', 'ALL'));
            $deptId = $request->filled('department_id') ? (int) $request->query('department_id') : null;
            $supplierId = $request->filled('supplier_id') ? (int) $request->query('supplier_id') : null;
            $status = $request->query('status');
            $dateFrom = $request->query('date_from');
            $dateTo = $request->query('date_to');
            $perPage = min(max((int) $request->query('per_page', 20), 5), 100);

            $results = collect();

            // 1. Search Purchase Requests
            if (in_array($entityType, ['ALL', 'PURCHASE_REQUEST'], true)) {
                $prQuery = PurchaseRequest::withoutGlobalScopes()
                    ->with(['department', 'user', 'assignedReviewer', 'items', 'purchaseOrders.receipts'])
                    ->when($q, function ($query, $term) {
                        $query->where(function ($sub) use ($term) {
                            $sub->where('request_number', 'like', "%{$term}%")
                                ->orWhere('justification', 'like', "%{$term}%")
                                ->orWhere('project_site', 'like', "%{$term}%")
                                ->orWhereHas('user', fn ($u) => $u->where('name', 'like', "%{$term}%"))
                                ->orWhereHas('department', fn ($d) => $d->where('name', 'like', "%{$term}%"));
                        });
                    })
                    ->when($deptId, fn ($query) => $query->where('department_id', $deptId))
                    ->when($status, fn ($query) => $query->where('status', $status))
                    ->when($dateFrom, fn ($query) => $query->whereDate('created_at', '>=', $dateFrom))
                    ->when($dateTo, fn ($query) => $query->whereDate('created_at', '<=', $dateTo))
                    ->orderByDesc('id')
                    ->limit($perPage)
                    ->get();

                foreach ($prQuery as $pr) {
                    $hasApprovedReceipt = $pr->purchaseOrders->flatMap->receipts->contains(fn ($r) => $r->status === 'APPROVED');
                    $hasPendingReceipt = $pr->purchaseOrders->flatMap->receipts->contains(fn ($r) => $r->status === 'PENDING_SITE_ENGINEER');
                    $hasPo = $pr->purchaseOrders->isNotEmpty();

                    $fulfillmentStatus = $hasApprovedReceipt
                        ? 'تم الاستلام بالموقع'
                        : ($hasPendingReceipt
                            ? 'بالموقع قيد الفحص'
                            : ($hasPo
                                ? 'أمر شراء قيد التوريد'
                                : 'قيد دورة الاعتماد'));

                    $pendingWith = match ($pr->status) {
                        'DRAFT' => $pr->user?->name ?: 'مقدم الطلب',
                        'SUBMITTED', 'UNDER_REVIEW' => $pr->assignedReviewer?->name ? "المراجع: {$pr->assignedReviewer->name}" : 'المراجع المختص',
                        'PENDING_EXECUTIVE_APPROVAL', 'PENDING_EXECUTIVE_QUOTE_DECISION' => 'المدير التنفيذي',
                        'PENDING_PROCUREMENT_APPROVAL', 'PENDING_QUOTE_RECOMMENDATIONS' => 'إدارة المشتريات',
                        'PENDING_ACCOUNTING_APPROVAL' => 'الحسابات المالية',
                        'APPROVED_BY_ACCOUNTING' => 'المشتريات (جاهز للتعميد)',
                        'ISSUED', 'PO_ISSUED' => 'المورد / قيد التوريد',
                        'REJECTED' => 'مرفوض نهائياً',
                        'CANCELLED' => 'ملغي',
                        default => '—',
                    };

                    $results->push([
                        'entity_type' => 'PURCHASE_REQUEST',
                        'id' => $pr->id,
                        'code' => $pr->request_number,
                        'title' => $pr->justification ?: 'طلب شراء بدون مبرر',
                        'status' => $pr->status,
                        'department' => $pr->department?->name,
                        'creator' => $pr->user?->name,
                        'amount' => (float) ($pr->total_estimated_cost ?? ($pr->items->sum('estimated_line_total') ?: 0)),
                        'date' => $pr->created_at?->format('Y-m-d H:i'),
                        'items_count' => $pr->items->count(),
                        'project_site' => $pr->project_site ?: ($pr->items->first()?->item_reference ?: '—'),
                        'pending_with' => $pendingWith,
                        'fulfillment_status' => $fulfillmentStatus,
                        'days_elapsed' => $pr->created_at ? (int) $pr->created_at->diffInDays(now()) : 0,
                    ]);
                }
            }

            // 2. Search Purchase Orders
            if (in_array($entityType, ['ALL', 'PURCHASE_ORDER'], true)) {
                $poQuery = PurchaseOrder::withoutGlobalScopes()
                    ->with(['supplier', 'purchaseRequest.department', 'purchaseRequest.assignedReviewer', 'items', 'receipts.siteEngineer'])
                    ->when($q, function ($query, $term) {
                        $query->where(function ($sub) use ($term) {
                            $sub->where('po_number', 'like', "%{$term}%")
                                ->orWhere('manual_po_number', 'like', "%{$term}%")
                                ->orWhereHas('supplier', fn ($s) => $s->where('company_name', 'like', "%{$term}%")->orWhere('contact_name', 'like', "%{$term}%"))
                                ->orWhereHas('purchaseRequest', fn ($pr) => $pr->where('request_number', 'like', "%{$term}%"));
                        });
                    })
                    ->when($supplierId, fn ($query) => $query->where('supplier_id', $supplierId))
                    ->when($deptId, fn ($query) => $query->whereHas('purchaseRequest', fn ($pr) => $pr->where('department_id', $deptId)))
                    ->when($status, fn ($query) => $query->where('status', $status))
                    ->when($dateFrom, fn ($query) => $query->whereDate('created_at', '>=', $dateFrom))
                    ->when($dateTo, fn ($query) => $query->whereDate('created_at', '<=', $dateTo))
                    ->orderByDesc('id')
                    ->limit($perPage)
                    ->get();

                foreach ($poQuery as $po) {
                    $pendingReceipt = $po->receipts->first(fn ($r) => $r->status === 'PENDING_SITE_ENGINEER');
                    $approvedReceipts = $po->receipts->filter(fn ($r) => $r->status === 'APPROVED');
                    $totalOrderedQty = (float) $po->items->sum('quantity');
                    $totalReceivedQty = (float) $po->items->sum('received_quantity');

                    if ($po->receipts->isEmpty()) {
                        $fulfillmentStatus = 'لم يتم التوريد (0%)';
                    } elseif ($pendingReceipt && $approvedReceipts->isEmpty()) {
                        $fulfillmentStatus = 'بالموقع قيد الفحص';
                    } elseif ($totalReceivedQty >= $totalOrderedQty && $totalOrderedQty > 0) {
                        $fulfillmentStatus = 'استلام تام (100%)';
                    } elseif ($totalReceivedQty > 0) {
                        $fulfillmentStatus = 'استلام جزئي';
                    } else {
                        $fulfillmentStatus = 'شحنة مسجلة بالموقع';
                    }

                    $pendingWith = match ($po->status) {
                        'DRAFT' => 'منشئ أمر الشراء',
                        'PENDING_ACCOUNTING_REVIEW' => 'الإدارة المالية / الحسابات',
                        'PENDING_ACTUAL_PO' => 'مهندس الموقع / بانتظار الأمر الفعلي',
                        'APPROVED_BY_ACCOUNTING', 'FINAL_APPROVED' => 'مكتمل ومعتمد ماليًا',
                        'CANCELLED', 'VOIDED' => 'ملغي بأمر إداري',
                        default => $pendingReceipt
                            ? ('مهندس الموقع: ' . ($pendingReceipt->actual_receiver_name ?: ($pendingReceipt->siteEngineer?->name ?: 'الموقع')))
                            : ($po->supplier?->company_name ? "المورد: {$po->supplier->company_name}" : 'المورد'),
                    };

                    $results->push([
                        'entity_type' => 'PURCHASE_ORDER',
                        'id' => $po->id,
                        'code' => $po->po_number,
                        'title' => "أمر شراء لمورد: " . ($po->supplier?->company_name ?? 'غير محدد'),
                        'status' => $po->status,
                        'department' => $po->purchaseRequest?->department?->name,
                        'supplier' => $po->supplier?->company_name,
                        'amount' => (float) ($po->grand_total ?? ($po->total_amount ?? 0)),
                        'date' => $po->created_at?->format('Y-m-d H:i'),
                        'items_count' => $po->items->count(),
                        'project_site' => $po->purchaseRequest?->project_site ?: ($po->items->first()?->item_reference ?: '—'),
                        'pending_with' => $pendingWith,
                        'fulfillment_status' => $fulfillmentStatus,
                        'days_elapsed' => $po->created_at ? (int) $po->created_at->diffInDays(now()) : 0,
                    ]);
                }
            }

            // 3. Search Purchase Receipts
            if (in_array($entityType, ['ALL', 'PURCHASE_RECEIPT'], true)) {
                $recQuery = PurchaseReceipt::withoutGlobalScopes()
                    ->with(['supplier', 'purchaseOrder.purchaseRequest', 'purchaseRequest.department', 'siteEngineer'])
                    ->when($q, function ($query, $term) {
                        $query->where(function ($sub) use ($term) {
                            $sub->where('receipt_number', 'like', "%{$term}%")
                                ->orWhere('actual_receiver_name', 'like', "%{$term}%")
                                ->orWhereHas('supplier', fn ($s) => $s->where('company_name', 'like', "%{$term}%"))
                                ->orWhereHas('purchaseOrder', fn ($po) => $po->where('po_number', 'like', "%{$term}%"));
                        });
                    })
                    ->when($supplierId, fn ($query) => $query->where('supplier_id', $supplierId))
                    ->when($status, fn ($query) => $query->where('status', $status))
                    ->when($dateFrom, fn ($query) => $query->whereDate('created_at', '>=', $dateFrom))
                    ->when($dateTo, fn ($query) => $query->whereDate('created_at', '<=', $dateTo))
                    ->orderByDesc('id')
                    ->limit($perPage)
                    ->get();

                foreach ($recQuery as $rec) {
                    $pendingWith = match ($rec->status) {
                        'PENDING_SITE_ENGINEER' => 'مهندس الموقع: ' . ($rec->actual_receiver_name ?: ($rec->siteEngineer?->name ?? 'الموقع')),
                        'APPROVED' => 'الإدارة المالية (للمطابقة والفوترة)',
                        'CANCELLED' => 'ملغي',
                        default => '—',
                    };

                    $fulfillmentStatus = match ($rec->status) {
                        'APPROVED' => 'مستلم ومطابق بالموقع',
                        'PENDING_SITE_ENGINEER' => 'بانتظار فحص مهندس الموقع',
                        default => 'إذن استلام مسجل',
                    };

                    $results->push([
                        'entity_type' => 'PURCHASE_RECEIPT',
                        'id' => $rec->id,
                        'code' => $rec->receipt_number,
                        'title' => "إذن استلام مواد: " . ($rec->receipt_number ?: "REC-{$rec->id}"),
                        'status' => $rec->status,
                        'department' => $rec->purchaseRequest?->department?->name,
                        'supplier' => $rec->supplier?->company_name,
                        'receiver' => $rec->actual_receiver_name ?: ($rec->siteEngineer?->name ?? 'غير محدد'),
                        'date' => $rec->created_at?->format('Y-m-d H:i'),
                        'weighing_group_id' => $rec->weighing_group_id,
                        'project_site' => $rec->purchaseRequest?->project_site ?: ($rec->purchaseOrder?->purchaseRequest?->project_site ?? '—'),
                        'pending_with' => $pendingWith,
                        'fulfillment_status' => $fulfillmentStatus,
                        'days_elapsed' => $rec->created_at ? (int) $rec->created_at->diffInDays(now()) : 0,
                    ]);
                }
            }

            $suppliers = Supplier::select('id', 'company_name', 'contact_name')->get()->map(function ($s) {
                return [
                    'id' => $s->id,
                    'company_name' => $s->company_name,
                    'name' => $s->company_name ?: ($s->contact_name ?: "مورد #{$s->id}"),
                ];
            });

            return response()->json([
                'success' => true,
                'count' => $results->count(),
                'data' => $results->sortByDesc('date')->values()->all(),
                'lookups' => [
                    'departments' => Department::select('id', 'name', 'code')->get(),
                    'suppliers' => $suppliers,
                ],
            ]);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('AdminControlCenter search failed: ' . $e->getMessage(), [
                'trace' => $e->getTraceAsString(),
            ]);
            return response()->json([
                'success' => false,
                'message' => 'تعذر إتمام البحث: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Get complete unified details for a document including full lifecycle, timeline, and transitions.
     */
    public function showDocument(string $type, int $id): JsonResponse
    {
        $type = strtoupper($type);

        $doc = match ($type) {
            'PURCHASE_REQUEST' => PurchaseRequest::withoutGlobalScopes()
                ->with(['department', 'targetDepartment', 'user', 'items.item', 'items.supplier', 'approvalHistories.actor', 'purchaseOrders', 'receipts'])
                ->find($id),
            'PURCHASE_ORDER' => PurchaseOrder::withoutGlobalScopes()
                ->with(['creator', 'supplier', 'purchaseRequest.department', 'items.item', 'receipts', 'invoices', 'approvalHistories.actor'])
                ->find($id),
            'PURCHASE_RECEIPT' => PurchaseReceipt::withoutGlobalScopes()
                ->with(['supplier', 'purchaseOrder.supplier', 'purchaseRequest.department', 'items.purchaseOrderItem', 'warehouseKeeper', 'siteEngineer', 'receiver'])
                ->find($id),
            default => null,
        };

        if (! $doc) {
            return response()->json([
                'success' => false,
                'message' => "المستند المطلوب (#{$id}) من نوع {$type} غير موجود.",
            ], 404);
        }

        // Available transitions
        $currentStatus = (string) $doc->status;
        $allowedTransitions = WorkflowTransition::where('entity_type', $type)
            ->where('from_status', $currentStatus)
            ->get();

        // Admin Audit History for this document
        $auditLogs = AdminAuditLog::where('entity_type', $type)
            ->where('entity_id', $id)
            ->orderByDesc('id')
            ->get();

        // Multi-user assignments
        $assignments = WorkflowDocumentAssignment::with('user')
            ->where('entity_type', $type)
            ->where('entity_id', $id)
            ->get();

        return response()->json([
            'success' => true,
            'entity_type' => $type,
            'id' => $id,
            'document' => $doc,
            'allowed_transitions' => $allowedTransitions,
            'assignments' => $assignments,
            'audit_history' => $auditLogs,
        ]);
    }

    /**
     * Dry run preview of action impact before execution.
     */
    public function previewImpact(Request $request): JsonResponse
    {
        $request->validate([
            'entity_type' => 'required|string',
            'entity_id' => 'required|integer',
            'action' => 'required|string',
        ]);

        try {
            $impact = $this->controlService->previewImpact(
                (string) $request->input('entity_type'),
                (int) $request->input('entity_id'),
                (string) $request->input('action'),
                (array) $request->input('payload', [])
            );

            return response()->json([
                'success' => true,
                'impact' => $impact,
            ]);
        } catch (ValidationException $ve) {
            return response()->json([
                'success' => false,
                'message' => collect($ve->errors())->flatten()->first() ?: 'تعذر التحقق من الأثر.',
                'errors' => $ve->errors(),
            ], 422);
        } catch (Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'حدث خطأ أثناء فحص الأثر: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Safely cancel a document (PR or PO).
     */
    public function cancelDocument(Request $request): JsonResponse
    {
        $request->validate([
            'entity_type' => 'required|string',
            'entity_id' => 'required|integer',
            'reason' => 'required|string|min:5',
        ]);

        try {
            $result = $this->controlService->cancelSafely(
                (string) $request->input('entity_type'),
                (int) $request->input('entity_id'),
                (string) $request->input('reason'),
                Auth::user(),
                $request->ip(),
                $request->userAgent()
            );

            return response()->json($result);
        } catch (ValidationException $ve) {
            return response()->json([
                'success' => false,
                'message' => collect($ve->errors())->flatten()->first() ?: 'خطأ في التحقق.',
                'errors' => $ve->errors(),
            ], 422);
        } catch (Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'تعذر تنفيذ الإلغاء: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Reassign receipt recipient without modifying financial or physical items.
     */
    public function reassignReceipt(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'new_user_id' => 'required|integer|exists:users,id',
            'reason' => 'required|string|min:5',
        ]);

        try {
            $result = $this->controlService->reassignReceiptRecipient(
                $id,
                (int) $request->input('new_user_id'),
                (string) $request->input('reason'),
                Auth::user(),
                $request->ip(),
                $request->userAgent()
            );

            return response()->json($result);
        } catch (ValidationException $ve) {
            return response()->json([
                'success' => false,
                'message' => collect($ve->errors())->flatten()->first() ?: 'خطأ في التحقق.',
                'errors' => $ve->errors(),
            ], 422);
        } catch (Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'تعذر تغيير المستلم: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Rollback a workflow to an earlier stage.
     */
    public function rollbackDocument(Request $request): JsonResponse
    {
        $request->validate([
            'entity_type' => 'required|string',
            'entity_id' => 'required|integer',
            'target_status' => 'required|string',
            'reason' => 'required|string|min:10',
            'is_exceptional' => 'nullable|boolean',
        ]);

        try {
            $result = $this->controlService->rollbackWorkflow(
                (string) $request->input('entity_type'),
                (int) $request->input('entity_id'),
                (string) $request->input('target_status'),
                (string) $request->input('reason'),
                (bool) $request->input('is_exceptional', false),
                Auth::user(),
                $request->ip(),
                $request->userAgent()
            );

            return response()->json($result);
        } catch (ValidationException $ve) {
            return response()->json([
                'success' => false,
                'message' => collect($ve->errors())->flatten()->first() ?: 'خطأ في التحقق.',
                'errors' => $ve->errors(),
            ], 422);
        } catch (Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'تعذر إرجاع المسار: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Forward a workflow to the next stage.
     */
    public function forwardDocument(Request $request): JsonResponse
    {
        $request->validate([
            'entity_type' => 'required|string',
            'entity_id' => 'required|integer',
            'target_status' => 'required|string',
            'reason' => 'required|string|min:5',
            'is_exceptional' => 'nullable|boolean',
        ]);

        try {
            $result = $this->controlService->forwardWorkflow(
                (string) $request->input('entity_type'),
                (int) $request->input('entity_id'),
                (string) $request->input('target_status'),
                (string) $request->input('reason'),
                (bool) $request->input('is_exceptional', false),
                Auth::user(),
                $request->ip(),
                $request->userAgent()
            );

            return response()->json($result);
        } catch (ValidationException $ve) {
            return response()->json([
                'success' => false,
                'message' => collect($ve->errors())->flatten()->first() ?: 'خطأ في التحقق.',
                'errors' => $ve->errors(),
            ], 422);
        } catch (Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'تعذر تقديم المسار: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Safely edit purchase request.
     */
    public function editRequest(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'reason' => 'required|string|min:5',
        ]);

        try {
            $result = $this->controlService->editRequestSafely(
                $id,
                $request->all(),
                (string) $request->input('reason'),
                Auth::user(),
                $request->ip(),
                $request->userAgent()
            );

            return response()->json($result);
        } catch (ValidationException $ve) {
            return response()->json([
                'success' => false,
                'message' => collect($ve->errors())->flatten()->first() ?: 'خطأ في التحقق.',
                'errors' => $ve->errors(),
            ], 422);
        } catch (Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'تعذر تعديل الطلب: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Manage multi-user assignment (PRIMARY, PARALLEL, VIEW_ONLY).
     */
    public function manageAssignment(Request $request): JsonResponse
    {
        $request->validate([
            'entity_type' => 'required|string',
            'entity_id' => 'required|integer',
            'user_id' => 'required|integer|exists:users,id',
            'assignment_type' => 'required|string|in:PRIMARY_ACTION_OWNER,PARALLEL_ACTION_OWNER,VIEW_ONLY_USER',
            'notes' => 'nullable|string',
        ]);

        try {
            $result = $this->controlService->assignDocumentUser(
                (string) $request->input('entity_type'),
                (int) $request->input('entity_id'),
                (int) $request->input('user_id'),
                (string) $request->input('assignment_type'),
                $request->input('notes'),
                Auth::user(),
                $request->ip(),
                $request->userAgent()
            );

            return response()->json($result);
        } catch (ValidationException $ve) {
            return response()->json([
                'success' => false,
                'message' => collect($ve->errors())->flatten()->first() ?: 'خطأ في التحقق.',
                'errors' => $ve->errors(),
            ], 422);
        } catch (Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'تعذر حفظ الإسناد: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Resend an existing notification.
     */
    public function resendNotification(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'reason' => 'required|string|min:5',
        ]);

        try {
            $result = $this->controlService->resendNotification(
                $id,
                (string) $request->input('reason'),
                Auth::user(),
                $request->ip(),
                $request->userAgent()
            );

            return response()->json($result);
        } catch (ValidationException $ve) {
            return response()->json([
                'success' => false,
                'message' => collect($ve->errors())->flatten()->first() ?: 'خطأ في التحقق.',
                'errors' => $ve->errors(),
            ], 422);
        } catch (Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'تعذر إعادة إرسال الإشعار: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Get immutable administrative audit log with flexible filtering.
     */
    public function getAuditLogs(Request $request): JsonResponse
    {
        $q = trim((string) $request->query('q', ''));
        $action = $request->query('action');
        $entityType = $request->query('entity_type');
        $actorId = $request->filled('actor_user_id') ? (int) $request->query('actor_user_id') : null;
        $dateFrom = $request->query('date_from');
        $dateTo = $request->query('date_to');
        $perPage = min(max((int) $request->query('per_page', 25), 5), 100);

        $query = AdminAuditLog::with('actor')
            ->when($q, function ($query, $term) {
                $query->where(function ($sub) use ($term) {
                    $sub->where('entity_label', 'like', "%{$term}%")
                        ->orWhere('reason', 'like', "%{$term}%")
                        ->orWhere('actor_name', 'like', "%{$term}%");
                });
            })
            ->when($action, fn ($query) => $query->where('action', $action))
            ->when($entityType, fn ($query) => $query->where('entity_type', $entityType))
            ->when($actorId, fn ($query) => $query->where('actor_user_id', $actorId))
            ->when($dateFrom, fn ($query) => $query->whereDate('created_at', '>=', $dateFrom))
            ->when($dateTo, fn ($query) => $query->whereDate('created_at', '<=', $dateTo))
            ->orderByDesc('id');

        $paginated = $query->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => $paginated->items(),
            'pagination' => [
                'current_page' => $paginated->currentPage(),
                'last_page' => $paginated->lastPage(),
                'total' => $paginated->total(),
                'per_page' => $paginated->perPage(),
            ],
        ]);
    }

    /**
     * Excel-like flexible report dataset endpoint.
     */
    public function getExcelReportsGrid(Request $request): JsonResponse
    {
        $deptId = $request->filled('department_id') ? (int) $request->query('department_id') : null;
        $supplierId = $request->filled('supplier_id') ? (int) $request->query('supplier_id') : null;
        $dateFrom = $request->query('date_from');
        $dateTo = $request->query('date_to');
        $search = trim((string) $request->query('search', ''));

        // Query Purchase Orders with full denormalized data
        $orders = PurchaseOrder::withoutGlobalScopes()
            ->with([
                'supplier',
                'purchaseRequest.department',
                'purchaseRequest.user',
                'items.item',
                'receipts.items',
                'invoices',
            ])
            ->when($deptId, fn ($q) => $q->whereHas('purchaseRequest', fn ($pr) => $pr->where('department_id', $deptId)))
            ->when($supplierId, fn ($q) => $q->where('supplier_id', $supplierId))
            ->when($dateFrom, fn ($q) => $q->whereDate('created_at', '>=', $dateFrom))
            ->when($dateTo, fn ($q) => $q->whereDate('created_at', '<=', $dateTo))
            ->when($search, function ($q, $term) {
                $q->where(function ($sub) use ($term) {
                    $sub->where('po_number', 'like', "%{$term}%")
                        ->orWhere('manual_po_number', 'like', "%{$term}%")
                        ->orWhereHas('supplier', fn ($s) => $s->where('company_name', 'like', "%{$term}%"))
                        ->orWhereHas('purchaseRequest', fn ($pr) => $pr->where('request_number', 'like', "%{$term}%"));
                });
            })
            ->orderByDesc('id')
            ->limit(500)
            ->get();

        $rows = [];
        $totalRequestedQty = 0;
        $totalReceivedQty = 0;
        $totalFinancialAmount = 0;

        foreach ($orders as $po) {
            $pr = $po->purchaseRequest;
            $receipt = $po->receipts->first();
            $invoice = $po->invoices->first();

            foreach ($po->items as $item) {
                $qtyRequested = (float) ($item->quantity ?? 0);
                $qtyReceived = (float) ($item->received_quantity ?? 0);
                $unitPrice = (float) ($item->unit_price ?? 0);
                $totalPrice = (float) ($item->total_price ?? ($qtyRequested * $unitPrice));

                $totalRequestedQty += $qtyRequested;
                $totalReceivedQty += $qtyReceived;
                $totalFinancialAmount += $totalPrice;

                $rows[] = [
                    'po_id' => $po->id,
                    'pr_id' => $pr?->id,
                    'receipt_id' => $receipt?->id,
                    'pr_number' => $pr?->request_number ?? '—',
                    'po_number' => $po->po_number,
                    'actual_po_number' => $po->manual_po_number ?: '—',
                    'receipt_number' => $receipt?->receipt_number ?: '—',
                    'department' => $pr?->department?->name ?? '—',
                    'supplier' => $po->supplier?->company_name ?? '—',
                    'item_name' => $item->item_description ?: ($item->item?->name ?? 'صنف غير محدد'),
                    'quantity_requested' => $qtyRequested,
                    'quantity_received' => $qtyReceived,
                    'uom' => $item->uom ?: 'وحدة',
                    'unit_price' => $unitPrice,
                    'total_price' => $totalPrice,
                    'parcel_reference' => $item->item_reference ?: ($pr?->project_site ?? '—'),
                    'region' => $item->region ?? '—',
                    'purpose' => $pr?->justification ?? '—',
                    'requester_name' => $pr?->user?->name ?? '—',
                    'actual_receiver' => $receipt?->actual_receiver_name ?: ($receipt?->siteEngineer?->name ?? '—'),
                    'po_status' => $po->status,
                    'receipt_status' => $receipt?->status ?? 'NOT_RECEIVED',
                    'invoice_status' => $invoice?->status ?? 'UNINVOICED',
                    'created_at' => $po->created_at?->format('Y-m-d'),
                ];
            }
        }

        return response()->json([
            'success' => true,
            'summary' => [
                'total_records' => count($rows),
                'total_requested_quantity' => $totalRequestedQty,
                'total_received_quantity' => $totalReceivedQty,
                'total_amount' => $totalFinancialAmount,
            ],
            'data' => $rows,
        ]);
    }
}
