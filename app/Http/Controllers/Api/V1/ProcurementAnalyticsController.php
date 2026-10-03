<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\PurchaseOrder;
use App\Models\PurchaseRequest;
use App\Models\Supplier;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class ProcurementAnalyticsController extends Controller
{
    private const ORDER_STATUSES = [
        'PO_DRAFT',
        'PENDING_ACCOUNTING_REVIEW',
        'RETURNED_TO_PROCUREMENT',
        'ISSUED',
        'APPROVED_BY_ACCOUNTING',
        'FINAL_APPROVED',
        'REJECTED',
    ];

    public function index(Request $request): JsonResponse
    {
        $period = (string) $request->query('period', '90');
        $status = $request->query('status');

        [$startDate, $endDate, $dateLabel] = $this->resolveDateRange($request);

        $user = $request->user();
        $allowedDepartmentCodes = app(\App\Services\SupplierInvoiceService::class)->getAllowedDepartmentCodesForAccountant($user);

        $cacheKey = 'procurement:analytics:v5:' . ($user->hasRole('execution_manager') ? 'exec_mgr_' . $user->id . ':' : '') . ($allowedDepartmentCodes !== null ? 'dept_acc_' . ($user->id ?? 0) . ':' : '') . md5(json_encode($request->all()));

        if (Cache::has($cacheKey)) {
            return response()->json(Cache::get($cacheKey));
        }

        // الاستعلام الأساسي لتتبع مسار أوامر الشراء (Funnel)
        $basePurchaseOrderQuery = PurchaseOrder::query()
            ->select(['id', 'po_number', 'purchase_request_id', 'supplier_id', 'created_by_user_id', 'status', 'grand_total', 'delivery_status', 'delivery_date', 'actual_delivery_date', 'created_at', 'updated_at'])
            ->when($startDate !== null, fn ($query) => $query->where('created_at', '>=', $startDate))
            ->when($endDate !== null, fn ($query) => $query->where('created_at', '<=', $endDate))
            ->when($allowedDepartmentCodes !== null, function ($q) use ($allowedDepartmentCodes) {
                $q->whereHas('purchaseRequest.department', function ($dq) use ($allowedDepartmentCodes) {
                    $dq->whereIn('code', $allowedDepartmentCodes);
                });
            })
            ->when($user->hasRole('execution_manager'), function ($q) use ($user) {
                $q->whereHas('purchaseRequest.requester', function ($rq) use ($user) {
                    $rq->where('manager_id', $user->id);
                });
            });

        // استعلام المشتريات المعتمدة والمفوترة بالحسابات في المرحلة النهائية
        $invoicedPurchaseOrderQuery = PurchaseOrder::query()
            ->select(['id', 'po_number', 'purchase_request_id', 'supplier_id', 'created_by_user_id', 'status', 'grand_total', 'delivery_status', 'delivery_date', 'actual_delivery_date', 'created_at', 'updated_at'])
            ->whereHas('supplierInvoices', function ($q) use ($startDate, $endDate) {
                $q->whereNotIn('status', ['VOIDED', 'CANCELLED'])
                    ->when($startDate !== null, function ($sq) use ($startDate) {
                        $sq->where(function ($sub) use ($startDate) {
                            $sub->whereNotNull('invoice_date')->where('invoice_date', '>=', $startDate->toDateString())
                                ->orWhere(function ($fb) use ($startDate) {
                                    $fb->whereNull('invoice_date')->where('created_at', '>=', $startDate);
                                });
                        });
                    })
                    ->when($endDate !== null, function ($sq) use ($endDate) {
                        $sq->where(function ($sub) use ($endDate) {
                            $sub->whereNotNull('invoice_date')->where('invoice_date', '<=', $endDate->toDateString())
                                ->orWhere(function ($fb) use ($endDate) {
                                    $fb->whereNull('invoice_date')->where('created_at', '<=', $endDate);
                                });
                        });
                    });
            })
            ->whereNotIn('status', ['REJECTED', 'PO_DRAFT'])
            ->when($allowedDepartmentCodes !== null, function ($q) use ($allowedDepartmentCodes) {
                $q->whereHas('purchaseRequest.department', function ($dq) use ($allowedDepartmentCodes) {
                    $dq->whereIn('code', $allowedDepartmentCodes);
                });
            })
            ->when($user->hasRole('execution_manager'), function ($q) use ($user) {
                $q->whereHas('purchaseRequest.requester', function ($rq) use ($user) {
                    $rq->where('manager_id', $user->id);
                });
            });

        $filteredPurchaseOrderQuery = is_string($status) && in_array($status, self::ORDER_STATUSES, true)
            ? (clone $basePurchaseOrderQuery)->where('status', $status)
            : (clone $invoicedPurchaseOrderQuery);

        $filteredPurchaseOrders = $filteredPurchaseOrderQuery
            ->with(['purchaseRequest.department', 'supplier', 'createdBy.department', 'items', 'supplierInvoices'])
            ->orderByDesc('created_at')
            ->limit(500)
            ->get();

        $approvedRequestQuery = PurchaseRequest::query()
            ->with(['requester', 'department'])
            ->whereIn('status', ['PENDING_PROCUREMENT_APPROVAL', 'APPROVED_BY_PROCUREMENT'])
            ->whereDoesntHave('purchaseOrders', function ($query): void {
                $query->whereNotIn('status', ['REJECTED']);
            })
            ->when($startDate !== null, fn ($query) => $query->where('created_at', '>=', $startDate))
            ->when($endDate !== null, fn ($query) => $query->where('created_at', '<=', $endDate))
            ->when($allowedDepartmentCodes !== null, function ($q) use ($allowedDepartmentCodes) {
                $q->whereHas('department', function ($dq) use ($allowedDepartmentCodes) {
                    $dq->whereIn('code', $allowedDepartmentCodes);
                });
            });

        $approvedRequests = $approvedRequestQuery
            ->orderByDesc('updated_at')
            ->limit(10)
            ->get();

        $basePurchaseRequestQuery = PurchaseRequest::query()
            ->select(['id', 'status', 'created_at'])
            ->when($startDate !== null, fn ($query) => $query->where('created_at', '>=', $startDate))
            ->when($endDate !== null, fn ($query) => $query->where('created_at', '<=', $endDate));

        // حساب إجمالي المشتريات وقيمها المالية بناءً على الفواتير المعتمدة بالحسابات
        $invoicedOrderTotals = (clone $invoicedPurchaseOrderQuery)
            ->select([])
            ->selectRaw('COUNT(*) as purchase_orders_count, COALESCE(SUM(grand_total), 0) as total_value')
            ->first();

        $totalInvoicedAmount = (float) DB::table('supplier_invoices as si')
            ->join('purchase_orders as po', 'po.id', '=', 'si.purchase_order_id')
            ->leftJoin('purchase_requests as pr', 'pr.id', '=', 'po.purchase_request_id')
            ->leftJoin('departments as d', 'd.id', '=', 'pr.department_id')
            ->whereNotIn('si.status', ['VOIDED', 'CANCELLED'])
            ->whereNotIn('po.status', ['REJECTED', 'PO_DRAFT'])
            ->when($startDate !== null, function ($q) use ($startDate) {
                $q->where(function ($sub) use ($startDate) {
                    $sub->whereNotNull('si.invoice_date')->where('si.invoice_date', '>=', $startDate->toDateString())
                        ->orWhere(function ($fb) use ($startDate) {
                            $fb->whereNull('si.invoice_date')->where('si.created_at', '>=', $startDate);
                        });
                });
            })
            ->when($endDate !== null, function ($q) use ($endDate) {
                $q->where(function ($sub) use ($endDate) {
                    $sub->whereNotNull('si.invoice_date')->where('si.invoice_date', '<=', $endDate->toDateString())
                        ->orWhere(function ($fb) use ($endDate) {
                            $fb->whereNull('si.invoice_date')->where('si.created_at', '<=', $endDate);
                        });
                });
            })
            ->when($allowedDepartmentCodes !== null, fn ($q) => $q->whereIn('d.code', $allowedDepartmentCodes))
            ->sum('si.amount');

        $statusMetrics = (clone $basePurchaseOrderQuery)
            ->select('status')
            ->selectRaw('COUNT(*) as row_count, COALESCE(SUM(grand_total), 0) as total_value')
            ->groupBy('status')
            ->get();
        $statusBreakdown = $statusMetrics
            ->map(fn ($row) => [
                'status' => $row->status,
                'count' => (int) $row->row_count,
                'total_value' => number_format((float) $row->total_value, 2, '.', ''),
            ])
            ->sortBy(fn (array $item) => array_search($item['status'], self::ORDER_STATUSES, true))
            ->values();

        $requestStatusMetrics = (clone $basePurchaseRequestQuery)
            ->select('status')
            ->selectRaw('COUNT(*) as row_count')
            ->groupBy('status')
            ->get();
        $requestStatusBreakdown = $requestStatusMetrics
            ->map(fn ($row) => [
                'status' => $row->status,
                'count' => (int) $row->row_count,
            ])
            ->values();

        $deliveryMetrics = (clone $invoicedPurchaseOrderQuery)
            ->select('delivery_status')
            ->selectRaw('COUNT(*) as row_count, COALESCE(SUM(grand_total), 0) as total_value')
            ->groupBy('delivery_status')
            ->get();
        $deliveryBreakdown = $deliveryMetrics
            ->map(fn ($row) => [
                'status' => $row->delivery_status ?: 'COMPLETE',
                'count' => (int) $row->row_count,
                'total_value' => number_format((float) $row->total_value, 2, '.', ''),
            ])
            ->values();

        // توزيع المشتريات على الموردين يقتصر على المشتريات المعتمدة محاسبياً
        $supplierMetrics = (clone $invoicedPurchaseOrderQuery)
            ->select('supplier_id')
            ->selectRaw('COUNT(*) as row_count, COALESCE(SUM(grand_total), 0) as total_value')
            ->whereNotNull('supplier_id')
            ->groupBy('supplier_id')
            ->orderByDesc('total_value')
            ->limit(6)
            ->get();
        $supplierLookup = Supplier::query()
            ->whereIn('id', $supplierMetrics->pluck('supplier_id')->filter()->unique()->values())
            ->get(['id', 'company_name', 'is_active'])
            ->keyBy('id');
        $supplierBreakdown = $supplierMetrics
            ->map(function ($row) use ($supplierLookup) {
                $supplier = $supplierLookup->get($row->supplier_id);

                return [
                    'supplier_id' => $supplier?->id,
                    'company_name' => $supplier?->company_name,
                    'code' => $supplier?->code,
                    'is_active' => (bool) ($supplier?->is_active ?? false),
                    'count' => (int) $row->row_count,
                    'total_value' => number_format((float) $row->total_value, 2, '.', ''),
                ];
            })
            ->values();

        // توزيع المشتريات على الأقسام يقتصر على الفواتير المعتمدة محاسبياً
        $departmentMetrics = DB::table('supplier_invoices as si')
            ->join('purchase_orders as po', 'po.id', '=', 'si.purchase_order_id')
            ->leftJoin('purchase_requests as pr', 'pr.id', '=', 'po.purchase_request_id')
            ->leftJoin('departments as d', 'd.id', '=', 'pr.department_id')
            ->leftJoin('users as creator', 'creator.id', '=', 'po.created_by_user_id')
            ->whereNotIn('si.status', ['VOIDED', 'CANCELLED'])
            ->whereNotIn('po.status', ['REJECTED', 'PO_DRAFT'])
            ->when($startDate !== null, function ($q) use ($startDate) {
                $q->where(function ($sub) use ($startDate) {
                    $sub->whereNotNull('si.invoice_date')->where('si.invoice_date', '>=', $startDate->toDateString())
                        ->orWhere(function ($fb) use ($startDate) {
                            $fb->whereNull('si.invoice_date')->where('si.created_at', '>=', $startDate);
                        });
                });
            })
            ->when($endDate !== null, function ($q) use ($endDate) {
                $q->where(function ($sub) use ($endDate) {
                    $sub->whereNotNull('si.invoice_date')->where('si.invoice_date', '<=', $endDate->toDateString())
                        ->orWhere(function ($fb) use ($endDate) {
                            $fb->whereNull('si.invoice_date')->where('si.created_at', '<=', $endDate);
                        });
                });
            })
            ->when($allowedDepartmentCodes !== null, fn ($query) => $query->whereIn('d.code', $allowedDepartmentCodes))
            ->selectRaw('COALESCE(pr.department_id, creator.department_id, 0) as department_id, COUNT(DISTINCT po.id) as row_count, COALESCE(SUM(si.amount), 0) as total_value')
            ->groupByRaw('COALESCE(pr.department_id, creator.department_id, 0)')
            ->get();
        $departmentLookup = Department::query()
            ->whereIn('id', $departmentMetrics->pluck('department_id')->filter(fn ($id) => (int) $id > 0)->unique()->values())
            ->get(['id', 'name', 'code'])
            ->keyBy('id');
        $departmentBreakdown = $departmentMetrics
            ->map(function ($row) use ($departmentLookup) {
                $department = $departmentLookup->get($row->department_id);

                return [
                    'department_id' => $department?->id,
                    'name' => $department?->name ?? 'غير محدد',
                    'code' => $department?->code ?? 'N/A',
                    'count' => (int) $row->row_count,
                    'total_value' => number_format((float) $row->total_value, 2, '.', ''),
                ];
            })
            ->sortByDesc(fn (array $item) => (float) $item['total_value'])
            ->values();

        $deliveryStats = (clone $basePurchaseOrderQuery)
            ->select([])
            ->selectRaw("SUM(CASE WHEN delivery_status = 'COMPLETE' THEN 1 ELSE 0 END) as completed_count, SUM(CASE WHEN delivery_status = 'COMPLETE' AND delivery_date IS NOT NULL AND actual_delivery_date IS NOT NULL AND actual_delivery_date <= delivery_date THEN 1 ELSE 0 END) as on_time_count, SUM(CASE WHEN delivery_status = 'LATE' THEN 1 ELSE 0 END) as late_count, SUM(CASE WHEN delivery_status IS NULL OR delivery_status NOT IN ('COMPLETE', 'LATE') THEN 1 ELSE 0 END) as pending_count")
            ->first();
        $completedDeliveryCount = (int) ($deliveryStats?->completed_count ?? 0);
        $onTimeDeliveryCount = (int) ($deliveryStats?->on_time_count ?? 0);
        $onTimeDeliveryRate = $completedDeliveryCount > 0 ? ($onTimeDeliveryCount / $completedDeliveryCount) * 100 : 0;

        $driver = DB::connection()->getDriverName();
        $cycleHoursExpression = $driver === 'sqlite'
            ? '(julianday(po.created_at) - julianday(pr.submitted_at)) * 24'
            : 'TIMESTAMPDIFF(HOUR, pr.submitted_at, po.created_at)';
        $averagePoCycleDays = (float) (DB::table('purchase_orders as po')
            ->join('purchase_requests as pr', 'pr.id', '=', 'po.purchase_request_id')
            ->when($startDate !== null, fn ($query) => $query->where('po.created_at', '>=', $startDate))
            ->when($endDate !== null, fn ($query) => $query->where('po.created_at', '<=', $endDate))
            ->whereNotNull('pr.submitted_at')
            ->whereNotNull('po.created_at')
            ->selectRaw("AVG(CASE WHEN {$cycleHoursExpression} < 0 THEN 0 ELSE {$cycleHoursExpression} END) / 24 as average_cycle_days")
            ->value('average_cycle_days') ?? 0);

        // Use Eloquent boolean predicates instead of `is_active = 1`, which is
        // not valid for PostgreSQL boolean columns.
        $supplierCount = Supplier::query()->count();
        $activeSupplierCount = Supplier::query()->where('is_active', true)->count();
        $totalOrderCount = (int) ($invoicedOrderTotals?->purchase_orders_count ?? 0);
        $totalValue = $totalInvoicedAmount > 0 ? $totalInvoicedAmount : (float) ($invoicedOrderTotals?->total_value ?? 0);
        $orderCountByStatus = $statusMetrics->keyBy('status');
        $requestCountByStatus = $requestStatusMetrics->keyBy('status');
        $pendingProcurementCount = (int) ($requestCountByStatus->get('PENDING_PROCUREMENT_APPROVAL')?->row_count ?? 0);
        $draftCount = (int) ($orderCountByStatus->get('PO_DRAFT')?->row_count ?? 0);
        $pendingAccountingCount = (int) ($orderCountByStatus->get('PENDING_ACCOUNTING_REVIEW')?->row_count ?? 0);
        $returnedCount = (int) ($orderCountByStatus->get('RETURNED_TO_PROCUREMENT')?->row_count ?? 0);
        $accountingApprovedCount = (int) ($orderCountByStatus->get('APPROVED_BY_ACCOUNTING')?->row_count ?? 0);
        $purchaseRequestCount = (int) $requestStatusMetrics->sum('row_count');
        $approvedRequestCount = (int) ($requestCountByStatus->get('PENDING_PROCUREMENT_APPROVAL')?->row_count ?? 0)
            + (int) ($requestCountByStatus->get('APPROVED_BY_PROCUREMENT')?->row_count ?? 0);

        $payload = [
            'filters' => [
                'period' => $period,
                'status' => is_string($status) && in_array($status, self::ORDER_STATUSES, true) ? $status : null,
                'date_label' => $dateLabel,
                'start_date' => $startDate?->toIso8601String(),
                'end_date' => $endDate?->toIso8601String(),
            ],
            'metrics' => [
                'purchase_requests_count' => $purchaseRequestCount,
                'approved_requests_count' => $approvedRequestCount,
                'draft_request_count' => (int) ($requestCountByStatus->get('DRAFT')?->row_count ?? 0),
                'submitted_request_count' => (int) ($requestCountByStatus->get('SUBMITTED')?->row_count ?? 0),
                'under_review_request_count' => (int) ($requestCountByStatus->get('UNDER_REVIEW')?->row_count ?? 0),
                'rejected_request_count' => (int) ($requestCountByStatus->get('REJECTED')?->row_count ?? 0),
                'pending_procurement_count' => $pendingProcurementCount,

                'purchase_orders_count' => $totalOrderCount,
                'draft_count' => $draftCount,
                'pending_accounting_count' => $pendingAccountingCount,
                'returned_count' => $returnedCount,
                'accounting_approved_count' => $accountingApprovedCount,
                'completed_delivery_count' => $completedDeliveryCount,
                'late_delivery_count' => (int) ($deliveryStats?->late_count ?? 0),
                'on_time_delivery_count' => $onTimeDeliveryCount,
                'on_time_delivery_rate' => number_format($onTimeDeliveryRate, 2, '.', ''),
                'average_po_cycle_days' => number_format($averagePoCycleDays, 2, '.', ''),
                'pending_delivery_count' => (int) ($deliveryStats?->pending_count ?? 0),
                'supplier_count' => $supplierCount,

                'active_supplier_count' => $activeSupplierCount,
                'total_value' => number_format($totalValue, 2, '.', ''),
                'average_value' => number_format($totalOrderCount > 0 ? $totalValue / $totalOrderCount : 0, 2, '.', ''),
            ],
            'status_breakdown' => $statusBreakdown,
            'request_status_breakdown' => $requestStatusBreakdown,
            'delivery_breakdown' => $deliveryBreakdown,
            'supplier_breakdown' => $supplierBreakdown,
            'department_breakdown' => $departmentBreakdown,
            'recent_purchase_orders' => $filteredPurchaseOrders->map(function (PurchaseOrder $po) {
                $firstInvoice = $po->supplierInvoices->first();
                $displayTotal = $firstInvoice ? (float) $firstInvoice->amount : (float) $po->grand_total;

                return [
                    'id' => $po->id,
                    'po_number' => $po->po_number,
                    'status' => $po->status,
                    'grand_total' => number_format($displayTotal, 2, '.', ''),
                    'invoice_number' => $firstInvoice?->invoice_number,
                    'invoice_date' => $firstInvoice?->invoice_date?->format('Y-m-d'),
                    'accounting_status' => $firstInvoice !== null ? 'VERIFIED' : 'PENDING',
                    'supplier_name' => $po->supplier?->company_name ?? 'غير محدد',
                    'supplier_phone' => $po->supplier?->phone ?? null,
                    'payment_terms' => $po->supplier?->payment_terms ?? null,
                    'request_number' => $po->purchaseRequest?->request_number ?? 'مباشر',
                    'department_name' => $po->purchaseRequest?->department?->name ?? $po->createdBy?->department?->name ?? 'غير محدد',
                    'created_at' => $po->created_at?->toIso8601String(),
                    'updated_at' => $po->updated_at?->toIso8601String(),
                    'items' => $po->items->map(fn ($item) => [
                        'id' => $item->id,
                        'item_description' => $item->item_description,
                        'item_reference' => $item->item_reference,
                        'region' => $item->region,
                        'quantity' => (float) $item->quantity,
                        'uom' => $item->uom,
                        'unit_price' => number_format((float) ($item->unit_price ?? 0), 2, '.', ''),
                        'line_total' => number_format((float) ($item->line_total ?? $item->grand_total ?? 0), 2, '.', ''),
                        'grand_total' => number_format((float) ($item->line_total ?? $item->grand_total ?? 0), 2, '.', ''),
                    ])->values(),
                ];
            })->values(),
            'recent_purchase_requests' => $approvedRequests->map(function (PurchaseRequest $requestModel) {
                return [
                    'id' => $requestModel->id,
                    'request_number' => $requestModel->request_number,
                    'status' => $requestModel->status,
                    'requester_name' => $requestModel->requester?->name,
                    'department_name' => $requestModel->department?->name,
                    'updated_at' => $requestModel->updated_at?->toIso8601String(),
                ];
            })->values(),
        ];
        Cache::put($cacheKey, $payload, now()->addSeconds(10));
        return response()->json($payload);
    }

    /**
     * @return array{0: ?\Carbon\CarbonImmutable, 1: ?\Carbon\CarbonImmutable, 2: string}
     */
    private function resolveDateRange(Request $request): array
    {
        $period = (string) $request->query('period', '90');
        $date = $request->query('date');
        $fromDate = $request->query('from_date');
        $toDate = $request->query('to_date');
        $month = $request->query('month');
        $year = $request->query('year');

        if (!empty($date)) {
            try {
                $d = \Carbon\CarbonImmutable::parse($date);
                return [$d->startOfDay(), $d->endOfDay(), 'تقرير يومي: ' . $d->format('Y-m-d')];
            } catch (\Throwable) {}
        }

        if (!empty($fromDate) || !empty($toDate)) {
            $start = !empty($fromDate) ? \Carbon\CarbonImmutable::parse($fromDate)->startOfDay() : null;
            $end = !empty($toDate) ? \Carbon\CarbonImmutable::parse($toDate)->endOfDay() : null;
            return [$start, $end, 'فترة مخصصة'];
        }

        if (!empty($month)) {
            $y = !empty($year) ? (int) $year : (int) now()->year;
            $m = (int) $month;
            $d = \Carbon\CarbonImmutable::create($y, $m, 1);
            return [$d->startOfMonth(), $d->endOfMonth(), 'تقرير شهري: ' . $d->format('Y-m')];
        }

        if ($period === 'today' || $period === 'day' || $period === '1') {
            return [now()->startOfDay()->toImmutable(), now()->endOfDay()->toImmutable(), 'تقرير اليوم (' . now()->format('Y-m-d') . ')'];
        }

        if ($period === 'yesterday') {
            return [now()->subDay()->startOfDay()->toImmutable(), now()->subDay()->endOfDay()->toImmutable(), 'تقرير أمس (' . now()->subDay()->format('Y-m-d') . ')'];
        }

        if ($period === 'this_month' || $period === 'month') {
            return [now()->startOfMonth()->toImmutable(), now()->endOfMonth()->toImmutable(), 'تقرير الشهر الحالي (' . now()->format('Y-m') . ')'];
        }

        if ($period === 'last_month') {
            return [now()->subMonth()->startOfMonth()->toImmutable(), now()->subMonth()->endOfMonth()->toImmutable(), 'تقرير الشهر السابق (' . now()->subMonth()->format('Y-m') . ')'];
        }

        if ($period === 'all') {
            return [null, null, 'جميع الفترات'];
        }

        $days = max(1, (int) $period);
        return [now()->subDays($days)->startOfDay()->toImmutable(), now()->endOfDay()->toImmutable(), "آخر {$days} يوم"];
    }
}