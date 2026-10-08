<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\PurchaseOrder;
use App\Models\PurchaseReceipt;
use App\Models\PurchaseRequest;
use App\Services\ProcurementPurchaseRequestService;
use App\Services\PurchaseReceiptService;
use App\Services\ReviewerPurchaseRequestService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardPendingTasksController extends Controller
{
    public function __construct(
        protected PurchaseReceiptService $receiptService,
        protected ReviewerPurchaseRequestService $reviewerService,
        protected ProcurementPurchaseRequestService $procurementService
    ) {}

    /**
     * Unified pending actions & tasks across all entities for the authenticated user.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $tasks = collect();

        // 1. Employee / Requester: Draft, Returned, or Rejected Purchase Requests
        $employeePrs = PurchaseRequest::withoutGlobalScope(\App\Scopes\DataIsolationScope::class)
            ->with(['department', 'items.item'])
            ->where('user_id', $user->id)
            ->whereIn('status', ['DRAFT', 'RETURNED', 'REJECTED'])
            ->orderByDesc('created_at')
            ->get();

        foreach ($employeePrs as $pr) {
            $isReturned = $pr->status === 'RETURNED';
            $isRejected = $pr->status === 'REJECTED';
            $tasks->push([
                'id' => "pr-{$pr->status}-{$pr->id}",
                'rawId' => $pr->id,
                'type' => 'PR',
                'code' => $pr->request_number,
                'title' => $pr->justification ?: ($pr->request_type === 'OFFICE_SUPPLIES' ? 'طلب مستلزمات مكتبية' : 'طلب مواد مشروعات'),
                'subtitle' => $isReturned ? 'طلب مُعاد إليك للتعديل' : ($isRejected ? 'طلب مرفوض يحتاج مراجعة أو تعديل' : 'مسودة لم تُرسل بعد'),
                'department' => $pr->department?->name,
                'amount' => $pr->total_estimated_cost ? (float) $pr->total_estimated_cost : null,
                'urgency' => ($isReturned || $isRejected) ? 'HIGH' : 'NORMAL',
                'reason' => $isReturned
                    ? 'تمت إعادة الطلب إليك للمراجعة والتعديل قبل إعادة الإرسال'
                    : ($isRejected ? ($pr->rejection_reason ?: 'تم رفض الطلب ويحتاج التعديل أو المراجعة') : 'مسودة لم تُرسل بعد للمراجعة والاعتماد'),
                'actionUrl' => "/employee/requests/{$pr->id}/edit",
                'actionLabel' => ($isReturned || $isRejected) ? 'تعديل وإعادة الإرسال' : 'فتح وتعديل المسودة',
                'stageBadge' => [
                    'text' => $isReturned ? 'طلب مُعاد' : ($isRejected ? 'طلب مرفوض' : 'مسودة طلب'),
                    'icon' => $isReturned ? '↩️' : ($isRejected ? '❌' : '✏️'),
                    'className' => $isReturned
                        ? 'bg-amber-950/80 text-amber-300 border-amber-800/60'
                        : ($isRejected ? 'bg-rose-950/80 text-rose-300 border-rose-800/60' : 'bg-slate-800 text-slate-300 border-slate-700'),
                ],
                'created_at' => $pr->created_at?->toISOString(),
                'timeAgo' => $pr->created_at?->format('Y-m-d H:i'),
                'request_type' => $pr->request_type,
                'date_needed' => $pr->date_needed,
                'priority' => $pr->priority,
                'parcel_number' => $pr->items->first()?->item_reference,
                'region' => $pr->items->first()?->region,
                'items_count' => $pr->items->count(),
                'items_list' => $pr->items->map(fn ($it) => [
                    'description' => $it->item_description ?: ($it->item?->name ?: 'صنف'),
                    'quantity' => (float) $it->quantity,
                    'uom' => $it->uom,
                    'parcel' => $it->item_reference,
                    'region' => $it->region,
                ])->values()->all(),
            ]);
        }

        // 2. Site Engineer / Technical Field Receiver: Pending Inspection Receipts
        // Sync direct site receipts for this user if assigned
        try {
            $this->receiptService->syncPendingDirectSiteReceiptsForEngineer($user);
        } catch (\Throwable) {}

        $assignedReceipts = PurchaseReceipt::withoutGlobalScope(\App\Scopes\DataIsolationScope::class)
            ->with([
                'supplier',
                'purchaseOrder.supplier',
                'purchaseOrder.purchaseRequest.department',
                'purchaseRequest.department',
                'items.purchaseOrderItem.item',
            ])
            ->where(function ($q) use ($user) {
                $q->where('site_engineer_user_id', $user->id)
                  ->orWhereHas('purchaseOrder.purchaseRequest', fn ($prQ) => $prQ->where('site_engineer_user_id', $user->id))
                  ->orWhereHas('purchaseRequest', fn ($prQ) => $prQ->where('site_engineer_user_id', $user->id));
            })
            ->whereIn('status', ['PENDING_SITE_ENGINEER', 'WAREHOUSE_RECEIPT_SUBMITTED'])
            ->orderByDesc('created_at')
            ->get();

        foreach ($assignedReceipts as $r) {
            $tasks->push([
                'id' => "receipt-{$r->id}",
                'rawId' => $r->id,
                'type' => 'RECEIPT',
                'code' => $r->receipt_number,
                'title' => $r->purchaseOrder?->items?->first()?->item_description ?: "إذن استلام {$r->receipt_number}",
                'subtitle' => $r->purchaseOrder ? "لأمر الشراء {$r->purchaseOrder->po_number}" : null,
                'department' => $r->purchaseRequest?->department?->name ?: $r->purchaseOrder?->purchaseRequest?->department?->name,
                'supplier' => $r->purchaseOrder?->supplier?->company_name ?: $r->supplier?->company_name,
                'urgency' => 'CRITICAL',
                'reason' => 'تم استلام المواد وبانتظار معاينتك وفحصك الميداني/الهندسي واعتماد الاستلام بالموقع',
                'actionUrl' => "/site-engineer?receipt_id={$r->id}",
                'actionLabel' => 'فحص واعتماد إذن الاستلام',
                'stageBadge' => [
                    'text' => 'إذن استلام مواد',
                    'icon' => '📦',
                    'className' => 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60',
                ],
                'created_at' => $r->created_at?->toISOString(),
                'timeAgo' => $r->created_at?->format('Y-m-d H:i'),
                'items_count' => $r->items->count(),
                'items_list' => $r->items->map(fn ($it) => [
                    'description' => $it->purchaseOrderItem?->item_description ?: ($it->purchaseOrderItem?->item?->name ?: 'بند استلام'),
                    'quantity' => (float) $it->received_quantity,
                    'uom' => $it->purchaseOrderItem?->uom,
                    'parcel' => $it->purchaseOrderItem?->item_reference,
                ])->values()->all(),
            ]);
        }

        // 3. Reviewer: Pending Purchase Requests & Quote Recommendations
        if ($user->hasRole('reviewer') || $user->hasPermission('purchase_request.review')) {
            $reviewablePrs = $this->reviewerService->getReviewableRequests($user);
            foreach ($reviewablePrs as $pr) {
                if (in_array($pr->status, ['SUBMITTED', 'UNDER_REVIEW'], true)) {
                    $tasks->push([
                        'id' => "pr-rev-{$pr->id}",
                        'rawId' => $pr->id,
                        'type' => 'PR',
                        'code' => $pr->request_number,
                        'title' => $pr->justification ?: ($pr->request_type === 'OFFICE_SUPPLIES' ? 'طلب مستلزمات مكتبية' : 'طلب مواد مشروعات'),
                        'subtitle' => 'طلب شراء جديد بانتظار المراجعة الفنية',
                        'department' => $pr->department?->name,
                        'requester' => $pr->requester?->name,
                        'urgency' => $pr->priority === 'HIGH' || $pr->priority === 'URGENT' ? 'CRITICAL' : 'HIGH',
                        'reason' => $pr->status === 'SUBMITTED' ? 'طلب جديد مقدم بانتظار مراجعتك واعتمادك الفني' : 'طلب قيد المراجعة الفنية',
                        'actionUrl' => "/reviewer/requests/{$pr->id}/review",
                        'actionLabel' => 'مراجعة وتعديل الطلب',
                        'stageBadge' => [
                            'text' => 'مراجعة فنية',
                            'icon' => '📋',
                            'className' => 'bg-cyan-950/80 text-cyan-300 border-cyan-800/60',
                        ],
                        'created_at' => $pr->created_at?->toISOString(),
                        'timeAgo' => $pr->created_at?->format('Y-m-d H:i'),
                        'request_type' => $pr->request_type,
                        'priority' => $pr->priority,
                        'items_count' => $pr->items->count(),
                        'items_list' => $pr->items->map(fn ($it) => [
                            'description' => $it->item_description ?: ($it->item?->name ?: 'صنف'),
                            'quantity' => (float) $it->quantity,
                            'uom' => $it->uom,
                            'parcel' => $it->item_reference,
                            'region' => $it->region,
                        ])->values()->all(),
                    ]);
                }
            }

            // Quotes pending recommendations
            try {
                $quotePrs = $this->procurementService->getPendingQuoteRequests(50, $user);
            } catch (\Throwable) {
                $quotePrs = collect();
            }
            foreach ($quotePrs as $q) {
                if ($q->status === 'PENDING_QUOTE_RECOMMENDATIONS') {
                    $tasks->push([
                        'id' => "quote-{$q->id}",
                        'rawId' => $q->id,
                        'type' => 'QUOTE',
                        'code' => $q->request_number,
                        'title' => $q->justification ?: 'عروض أسعار بانتظار الترشيح',
                        'subtitle' => 'عروض أسعار مسجلة من الموردين',
                        'department' => $q->department?->name,
                        'requester' => $q->requester?->name,
                        'amount' => $q->total_estimated_cost ? (float) $q->total_estimated_cost : null,
                        'urgency' => 'HIGH',
                        'reason' => 'عروض أسعار مسجلة بانتظار التوصية الفنية لاختيار العرض الأنسب',
                        'actionUrl' => "/reviewer/purchase-quotes?open={$q->id}",
                        'actionLabel' => 'البت وترشيح عروض الأسعار',
                        'created_at' => $q->created_at?->toISOString(),
                        'timeAgo' => $q->created_at?->format('Y-m-d H:i'),
                        'items_count' => $q->items->count(),
                    ]);
                }
            }
        }

        // 4. Procurement Manager: Actual POs & Returned POs
        if ($user->hasRole('procurement_manager') || $user->hasPermission('purchase_order.create')) {
            $pendingActualPos = PurchaseOrder::withoutGlobalScope(\App\Scopes\DataIsolationScope::class)
                ->with(['supplier', 'items'])
                ->where('status', 'PENDING_ACTUAL_PO')
                ->orderByDesc('updated_at')
                ->get();

            foreach ($pendingActualPos as $po) {
                $tasks->push([
                    'id' => "po-actual-{$po->id}",
                    'rawId' => $po->id,
                    'type' => 'PO',
                    'code' => $po->po_number,
                    'title' => "إذن الاستلام معتمد — مطلوب إصدار أمر الشراء الفعلي ({$po->supplier?->company_name})",
                    'subtitle' => 'الموقع أتم الاستلام — يرجى مطابقة الأسعار والكميات لإصدار الأمر الفعلي',
                    'department' => $po->department?->name,
                    'supplier' => $po->supplier?->company_name,
                    'amount' => (float) $po->grand_total,
                    'urgency' => 'CRITICAL',
                    'reason' => 'تم استلام البضاعة واعتماد إذن الاستلام بالموقع — بانتظار إصدار الأمر الفعلي للمالية.',
                    'actionUrl' => "/procurement/purchase-orders/{$po->id}/edit",
                    'actionLabel' => 'إصدار أمر الشراء الفعلي',
                    'created_at' => $po->created_at?->toISOString(),
                    'timeAgo' => $po->created_at?->format('Y-m-d H:i'),
                    'items_count' => $po->items->count(),
                ]);
            }

            $returnedPos = PurchaseOrder::withoutGlobalScope(\App\Scopes\DataIsolationScope::class)
                ->with(['supplier', 'items'])
                ->where('status', 'RETURNED_TO_PROCUREMENT')
                ->orderByDesc('updated_at')
                ->get();

            foreach ($returnedPos as $po) {
                $tasks->push([
                    'id' => "po-ret-{$po->id}",
                    'rawId' => $po->id,
                    'type' => 'PO',
                    'code' => $po->po_number,
                    'title' => "أمر شراء معاد — {$po->supplier?->company_name}",
                    'subtitle' => 'معاد من الإدارة أو الحسابات لإعادة التدقيق والمراجعة',
                    'department' => $po->department?->name,
                    'supplier' => $po->supplier?->company_name,
                    'amount' => (float) $po->grand_total,
                    'urgency' => 'CRITICAL',
                    'reason' => 'أمر شراء معاد يتطلب التعديل والمراجعة قبل إعادة الإرسال',
                    'actionUrl' => "/procurement/purchase-orders/{$po->id}/edit",
                    'actionLabel' => 'تعديل وإعادة إرسال الأمر',
                    'created_at' => $po->created_at?->toISOString(),
                    'timeAgo' => $po->created_at?->format('Y-m-d H:i'),
                    'items_count' => $po->items->count(),
                ]);
            }
        }

        // 5. Executive / General Manager
        if ($user->hasRole('general_manager') || $user->hasRole('execution_manager')) {
            $execPrs = PurchaseRequest::withoutGlobalScope(\App\Scopes\DataIsolationScope::class)
                ->with(['department', 'requester'])
                ->where('status', 'PENDING_EXECUTIVE_APPROVAL')
                ->orderByDesc('created_at')
                ->get();

            foreach ($execPrs as $pr) {
                $tasks->push([
                    'id' => "pr-exec-{$pr->id}",
                    'rawId' => $pr->id,
                    'type' => 'PR',
                    'code' => $pr->request_number,
                    'title' => $pr->justification ?: 'طلب شراء بانتظار الاعتماد التنفيذي',
                    'subtitle' => 'يتطلب قرارك التنفيذي النهائي',
                    'department' => $pr->department?->name,
                    'requester' => $pr->requester?->name,
                    'amount' => $pr->total_estimated_cost ? (float) $pr->total_estimated_cost : null,
                    'urgency' => 'CRITICAL',
                    'reason' => 'طلب شراء معتمد بانتظار قرارك التنفيذي النهائي',
                    'actionUrl' => "/general-manager/purchase-requests?open={$pr->id}",
                    'actionLabel' => 'اعتماد أو رفض الطلب',
                    'created_at' => $pr->created_at?->toISOString(),
                    'timeAgo' => $pr->created_at?->format('Y-m-d H:i'),
                    'items_count' => $pr->items->count(),
                ]);
            }

            $execQuotes = PurchaseRequest::withoutGlobalScope(\App\Scopes\DataIsolationScope::class)
                ->with(['department', 'requester'])
                ->where('status', 'PENDING_EXECUTIVE_QUOTE_DECISION')
                ->orderByDesc('created_at')
                ->get();

            foreach ($execQuotes as $pr) {
                $tasks->push([
                    'id' => "quote-exec-{$pr->id}",
                    'rawId' => $pr->id,
                    'type' => 'QUOTE',
                    'code' => $pr->request_number,
                    'title' => $pr->justification ?: 'عروض أسعار بانتظار الاعتماد التنفيذي',
                    'subtitle' => 'عروض أسعار موصى بها بانتظار الترسية',
                    'department' => $pr->department?->name,
                    'requester' => $pr->requester?->name,
                    'urgency' => 'CRITICAL',
                    'reason' => 'عروض أسعار موصى بها بانتظار اعتماد الترسية التنفيذية',
                    'actionUrl' => "/general-manager/purchase-quotes?open={$pr->id}",
                    'actionLabel' => 'البت والاعتماد التنفيذي',
                    'created_at' => $pr->created_at?->toISOString(),
                    'timeAgo' => $pr->created_at?->format('Y-m-d H:i'),
                ]);
            }
        }

        // Sort newest first & deduplicate by task id
        $sorted = $tasks->unique('id')->sortByDesc(fn ($t) => $t['created_at'] ?? '')->values();

        return response()->json([
            'count' => $sorted->count(),
            'data' => $sorted->all(),
        ]);
    }
}
