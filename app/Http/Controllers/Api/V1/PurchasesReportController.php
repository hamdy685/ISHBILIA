<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\PurchaseOrder;
use App\Models\SupplierInvoice;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PurchasesReportController extends Controller
{
    /**
     * Allowed roles for this specific report.
     */
    private const ALLOWED_ROLES = [
        'accountant',
        'site_accountant',
        'licenses_accountant',
        'buffet_accountant',
        'general_manager',
        'execution_manager',
        'procurement_manager',
        'admin',
    ];

    /**
     * Display the purchases report with the 12 accounting-verified columns.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        // 1. Authorize role: only Accountant, GM, Procurement Manager, and Admin
        $userRoles = $user->roles->flatMap(fn ($r) => [
            strtolower((string) ($r->name ?? '')),
            strtolower((string) ($r->slug ?? '')),
        ])->filter()->all();
        $isAllowed = ! empty(array_intersect($userRoles, self::ALLOWED_ROLES));

        if (! $isAllowed) {
            return response()->json([
                'message' => 'غير مصرح لك بالوصول لتقرير المشتريات المحاسبي. هذا التقرير مخصص للحسابات والمدير التنفيذي ومدير المشتريات فقط.',
            ], 403);
        }

        // 2. Parse Date / Period Filters
        $filterType = (string) $request->query('filter_type', 'monthly'); // 'daily' | 'monthly' | 'custom'
        $departmentId = $request->filled('department_id') && $request->query('department_id') !== 'ALL'
            ? (int) $request->query('department_id')
            : null;
        $accountingFilter = (string) $request->query('accounting_filter', 'VERIFIED_ONLY'); // 'VERIFIED_ONLY' | 'ALL' | 'PENDING'
        $dateBasis = (string) $request->query('date_basis', 'po_date'); // 'po_date' | 'delivery_date' | 'pr_date'
        if (! in_array($dateBasis, ['po_date', 'delivery_date', 'pr_date'], true)) {
            $dateBasis = 'po_date';
        }

        $startDate = null;
        $endDate = null;
        $dateLabel = '';

        if ($filterType === 'daily') {
            $date = $request->query('date', now()->toDateString());
            try {
                $parsed = Carbon::parse($date);
                $startDate = $parsed->copy()->startOfDay();
                $endDate = $parsed->copy()->endOfDay();
                $dateLabel = 'يوم ' . $parsed->translatedFormat('d F Y');
            } catch (\Throwable) {
                $startDate = now()->startOfDay();
                $endDate = now()->endOfDay();
                $dateLabel = 'اليوم';
            }
        } elseif ($filterType === 'monthly') {
            $month = (string) $request->query('month', now()->format('Y-m'));
            try {
                $parsed = Carbon::createFromFormat('Y-m', $month)->startOfMonth();
                $startDate = $parsed->copy()->startOfMonth();
                $endDate = $parsed->copy()->endOfMonth();
                $dateLabel = 'شهر ' . $parsed->format('m-Y');
            } catch (\Throwable) {
                $startDate = now()->startOfMonth();
                $endDate = now()->endOfMonth();
                $dateLabel = 'الشهر الحالي';
            }
        } elseif ($filterType === 'custom') {
            $fromDate = $request->query('from_date');
            $toDate = $request->query('to_date');
            if ($fromDate && $toDate) {
                try {
                    $startDate = Carbon::parse($fromDate)->startOfDay();
                    $endDate = Carbon::parse($toDate)->endOfDay();
                    $dateLabel = "من {$fromDate} إلى {$toDate}";
                } catch (\Throwable) {
                    $startDate = now()->subDays(30)->startOfDay();
                    $endDate = now()->endOfDay();
                    $dateLabel = 'آخر 30 يوم';
                }
            } else {
                $startDate = now()->subDays(30)->startOfDay();
                $endDate = now()->endOfDay();
                $dateLabel = 'آخر 30 يوم';
            }
        }

        // 3. Query all Purchase Orders in the period with items, receipts and supplier invoices
        $allowedDepartmentCodes = app(\App\Services\SupplierInvoiceService::class)->getAllowedDepartmentCodesForAccountant($user);

        $ordersQuery = PurchaseOrder::query()
            ->with([
                'supplier',
                'items.prItem',
                'purchaseRequest.department',
                'purchaseRequest.targetDepartment',
                'purchaseRequest.landParcel',
                'purchaseReceipts.items.purchaseOrderItem.item',
                'purchaseReceipts.items.purchaseOrderItem.prItem',
                'supplierInvoices.landAllocations.parcel',
                'supplierInvoices.landAllocations.department',
                'supplierInvoices.purchaseReceipt.items.purchaseOrderItem.item',
                'supplierInvoices.purchaseReceipt.items.purchaseOrderItem.prItem',
                'supplierInvoices.createdBy',
            ])
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

        // 3.1 فلترة الحالة المحاسبية (مسقط ومسجل / بانتظار الحسابات / الكل)
        if ($accountingFilter === 'PENDING') {
            // أوامر الشراء الصادرة التي لم يسجل لها المحاسب فاتورة بعد
            $ordersQuery->whereDoesntHave('supplierInvoices', function ($iq) {
                $iq->whereNotIn('status', ['VOIDED', 'CANCELLED']);
            });
        } elseif ($accountingFilter === 'VERIFIED_ONLY') {
            // الافتراضي والرسمي: فقط الأوامر التي سجل لها المحاسب فاتورة مورد معتمدة
            $ordersQuery->whereHas('supplierInvoices', function ($iq) {
                $iq->whereNotIn('status', ['VOIDED', 'CANCELLED']);
            });
        }

        // 3.2 فلترة التاريخ بناءً على اختيار المستخدم (أمر الشراء / تاريخ التوريد / طلب الشراء)
        if ($startDate !== null && $endDate !== null) {
            $startDateStr = $startDate->toDateString();
            $endDateStr = $endDate->toDateString();

            if ($dateBasis === 'po_date') {
                // تاريخ أمر الشراء (الافتراضي)
                $ordersQuery->whereDate('created_at', '>=', $startDateStr)
                    ->whereDate('created_at', '<=', $endDateStr);
            } elseif ($dateBasis === 'delivery_date') {
                // تاريخ التوريد / الاستلام الفعلي بالموقع
                $ordersQuery->where(function ($dq) use ($startDateStr, $endDateStr) {
                    $dq->whereHas('purchaseReceipts', function ($rq) use ($startDateStr, $endDateStr) {
                        $rq->whereDate('received_at', '>=', $startDateStr)
                            ->whereDate('received_at', '<=', $endDateStr);
                    })->orWhere(function ($oq) use ($startDateStr, $endDateStr) {
                        $oq->whereNotNull('delivery_date')
                            ->whereDate('delivery_date', '>=', $startDateStr)
                            ->whereDate('delivery_date', '<=', $endDateStr);
                    })->orWhere(function ($oq) use ($startDateStr, $endDateStr) {
                        $oq->whereNotNull('actual_delivery_date')
                            ->whereDate('actual_delivery_date', '>=', $startDateStr)
                            ->whereDate('actual_delivery_date', '<=', $endDateStr);
                    });
                });
            } elseif ($dateBasis === 'pr_date') {
                // تاريخ طلب الشراء الأساسي
                $ordersQuery->whereHas('purchaseRequest', function ($pq) use ($startDateStr, $endDateStr) {
                    $pq->whereDate('created_at', '>=', $startDateStr)
                        ->whereDate('created_at', '<=', $endDateStr);
                });
            }
        }

        $orders = $ordersQuery->orderByDesc('created_at')->get();

        // 4. Transform into the exact report columns per item based on Purchase Order
        $reportRows = [];

        foreach ($orders as $order) {
            $requestModel = $order->purchaseRequest;

            // Department resolution
            $defaultDept = $requestModel?->targetDepartment
                ?? $requestModel?->department;

            $deptId = $defaultDept?->id;
            $deptName = $defaultDept?->name ?? 'العام';

            if ($departmentId !== null && $deptId !== $departmentId) {
                continue;
            }

            // Land parcel & region resolution
            $defaultParcelRef = $requestModel?->parcel_reference
                ?? $requestModel?->landParcel?->parcel_reference
                ?? '—';

            $defaultRegion = $requestModel?->region
                ?? $requestModel?->landParcel?->region
                ?? '—';

            $activeInvoices = $order->supplierInvoices->filter(fn ($inv) => ! in_array($inv->status, ['VOIDED', 'CANCELLED'], true));

            if ($accountingFilter === 'VERIFIED_ONLY' && $activeInvoices->isEmpty()) {
                continue;
            }

            if ($accountingFilter === 'PENDING' && $activeInvoices->isNotEmpty()) {
                continue;
            }

            $primaryInvoice = $activeInvoices->first();
            $approvedReceipt = $order->purchaseReceipts->where('status', 'APPROVED')->first()
                ?? $order->purchaseReceipts->first();

            // Order dates
            $poDate = $order->created_at?->format('Y-m-d');
            $prDate = $requestModel?->created_at?->format('Y-m-d');
            $deliveryDate = $approvedReceipt?->received_at?->format('Y-m-d')
                ?? $primaryInvoice?->invoice_date?->format('Y-m-d')
                ?? $order->actual_delivery_date?->format('Y-m-d')
                ?? $order->delivery_date?->format('Y-m-d')
                ?? $order->created_at?->format('Y-m-d');

            $primaryDate = match ($dateBasis) {
                'delivery_date' => $deliveryDate,
                'pr_date' => $prDate ?? $poDate,
                default => $poDate,
            };

            // Purchase Order items - authoritative quantities & financial figures
            $poItems = $order->items;
            if ($poItems->isEmpty() && $requestModel && $requestModel->items->isNotEmpty()) {
                $poItems = $requestModel->items;
            }

            if ($poItems->isNotEmpty()) {
                foreach ($poItems as $poItem) {
                    $prItem = $poItem->prItem ?? (property_exists($poItem, 'prItem') ? null : $poItem);

                    // كميات أمر الشراء هي المعتمدة للحسابات
                    $poQty = (float) ($poItem->quantity ?? 1);
                    $unitPrice = (float) ($poItem->unit_price ?? $poItem->estimated_unit_price ?? 0);
                    $lineTotal = (float) ($poItem->line_total > 0 ? $poItem->line_total : round($poQty * $unitPrice, 2));

                    $rowParcelRef = $poItem->item_reference
                        ?: ($prItem?->item_reference ?: $defaultParcelRef);
                    $rowRegion = $poItem->region
                        ?: ($prItem?->region ?: $defaultRegion);

                    $works = $poItem->specifications
                        ?: ($prItem?->specifications ?: ($requestModel?->notes ?: '—'));

                    // الاستلام الفعلي بالموقع كمعلومة استرشادية فقط
                    $matchingReceiptItem = null;
                    if ($approvedReceipt && $approvedReceipt->items->isNotEmpty()) {
                        $matchingReceiptItem = $approvedReceipt->items->first(function ($ri) use ($poItem) {
                            return $ri->purchase_order_item_id == $poItem->id
                                || ($ri->purchaseOrderItem && $ri->purchaseOrderItem->item_description === $poItem->item_description);
                        });
                    }
                    $receivedQty = $matchingReceiptItem ? (float) $matchingReceiptItem->received_quantity : null;

                    $reportRows[] = [
                        'id' => "PO-{$order->id}-ITEM-{$poItem->id}",
                        'invoice_id' => $primaryInvoice?->id,
                        'receipt_id' => $approvedReceipt?->id,
                        'receipt_number' => $approvedReceipt?->receipt_number,
                        'photo_url' => $approvedReceipt?->photo_url,
                        'purchase_order_id' => $order->id,
                        'grand_total' => (float) $order->grand_total,
                        // التواريخ حسب الفلترة
                        'date_basis' => $dateBasis,
                        'primary_date' => $primaryDate,
                        'primary_date_formatted' => $primaryDate ? Carbon::parse($primaryDate)->format('d/m/Y') : '—',
                        'po_date' => $poDate,
                        'po_date_formatted' => $poDate ? Carbon::parse($poDate)->format('d/m/Y') : '—',
                        'pr_date' => $prDate,
                        'pr_date_formatted' => $prDate ? Carbon::parse($prDate)->format('d/m/Y') : '—',
                        'delivery_date' => $deliveryDate,
                        'delivery_date_formatted' => $deliveryDate ? Carbon::parse($deliveryDate)->format('d/m/Y') : '—',
                        // الأرقام المرجعية
                        'po_number' => $order->po_number,
                        'po_number_short' => preg_replace('/^PO-\d{4}-0*/', '', $order->po_number) ?: $order->po_number,
                        'pr_number' => $requestModel?->request_number,
                        // الصنف والوحدة
                        'item_name' => $poItem->item_description ?? ($poItem->item?->name ?? '—'),
                        'uom' => $poItem->uom ?? '—',
                        // كمية وأسعار أمر الشراء (الأساس المالي والمحاسبي)
                        'quantity' => $poQty,
                        'unit_price' => $unitPrice,
                        'total_price' => $lineTotal,
                        // بيانات الاستلام الفعلي بالموقع (بيان استرشادي للحسابات)
                        'received_quantity' => $receivedQty,
                        'receipt_status' => $approvedReceipt?->status,
                        // المورد والموقع
                        'supplier_name' => $order->supplier?->company_name ?? $order->supplier?->name ?? '—',
                        'supplier_id' => $order->supplier_id,
                        'parcel_reference' => $rowParcelRef ?: '—',
                        'region' => $rowRegion ?: '—',
                        'department_id' => $deptId,
                        'department_name' => $deptName,
                        'works' => $works ?: '—',
                        // الحالة المحاسبية
                        'accounting_status' => $primaryInvoice ? 'VERIFIED' : 'PENDING',
                        'accounting_status_label' => $primaryInvoice ? 'مسقط ومسجل بالحسابات' : 'صادر - بانتظار تسجيل الحسابات',
                        'invoice_number' => $primaryInvoice?->invoice_number,
                        'matching_status' => $primaryInvoice?->matching_status,
                        'accountant_name' => $primaryInvoice?->createdBy?->name ?? ($primaryInvoice ? 'الحسابات' : null),
                        'order_status' => $order->status,
                        'created_at' => $order->created_at?->toIso8601String(),
                    ];
                }
            } else {
                // حالة أمر بدون تفصيل بنود
                $reportRows[] = [
                    'id' => "PO-{$order->id}",
                    'invoice_id' => $primaryInvoice?->id,
                    'receipt_id' => $approvedReceipt?->id,
                    'receipt_number' => $approvedReceipt?->receipt_number,
                    'photo_url' => $approvedReceipt?->photo_url,
                    'purchase_order_id' => $order->id,
                    'grand_total' => (float) $order->grand_total,
                    'date_basis' => $dateBasis,
                    'primary_date' => $primaryDate,
                    'primary_date_formatted' => $primaryDate ? Carbon::parse($primaryDate)->format('d/m/Y') : '—',
                    'po_date' => $poDate,
                    'po_date_formatted' => $poDate ? Carbon::parse($poDate)->format('d/m/Y') : '—',
                    'pr_date' => $prDate,
                    'pr_date_formatted' => $prDate ? Carbon::parse($prDate)->format('d/m/Y') : '—',
                    'delivery_date' => $deliveryDate,
                    'delivery_date_formatted' => $deliveryDate ? Carbon::parse($deliveryDate)->format('d/m/Y') : '—',
                    'po_number' => $order->po_number,
                    'po_number_short' => preg_replace('/^PO-\d{4}-0*/', '', $order->po_number) ?: $order->po_number,
                    'pr_number' => $requestModel?->request_number,
                    'item_name' => 'أمر شراء #' . $order->po_number,
                    'uom' => 'إجمالي',
                    'quantity' => 1,
                    'unit_price' => (float) $order->grand_total,
                    'total_price' => (float) $order->grand_total,
                    'received_quantity' => null,
                    'supplier_name' => $order->supplier?->company_name ?? $order->supplier?->name ?? '—',
                    'supplier_id' => $order->supplier_id,
                    'parcel_reference' => $defaultParcelRef,
                    'region' => $defaultRegion,
                    'department_id' => $deptId,
                    'department_name' => $deptName,
                    'works' => $requestModel?->notes ?: '—',
                    'accounting_status' => $primaryInvoice ? 'VERIFIED' : 'PENDING',
                    'accounting_status_label' => $primaryInvoice ? 'مسقط ومسجل بالحسابات' : 'صادر - بانتظار تسجيل الحسابات',
                    'invoice_number' => $primaryInvoice?->invoice_number,
                    'matching_status' => $primaryInvoice?->matching_status,
                    'accountant_name' => $primaryInvoice?->createdBy?->name ?? null,
                    'order_status' => $order->status,
                    'created_at' => $order->created_at?->toIso8601String(),
                ];
            }
        }

        // 5. Calculate Summary Metrics
        $totalOrders = count(array_unique(array_column($reportRows, 'purchase_order_id')));
        $totalItemsCount = count($reportRows);
        $totalAmount = array_sum(array_column($reportRows, 'total_price'));
        $totalQuantity = array_sum(array_column($reportRows, 'quantity'));
        $uniqueSuppliers = count(array_unique(array_filter(array_column($reportRows, 'supplier_name'), fn ($s) => $s && $s !== '—')));
        $uniqueParcels = count(array_unique(array_filter(array_column($reportRows, 'parcel_reference'), fn ($p) => $p && $p !== '—')));
        $verifiedCount = count(array_filter($reportRows, fn ($r) => ($r['accounting_status'] ?? '') === 'VERIFIED'));

        // 6. Pagination calculation (Default 50 rows per page, supports per_page=ALL for full export)
        $page = max(1, (int) $request->query('page', 1));
        $perPageParam = $request->query('per_page');
        $isAll = $perPageParam === 'ALL' || $perPageParam === 'all' || (is_numeric($perPageParam) && (int) $perPageParam <= 0);
        $perPage = $isAll ? max(1, count($reportRows)) : (is_numeric($perPageParam) ? max(1, (int) $perPageParam) : 50);

        $totalRows = count($reportRows);
        $lastPage = $isAll ? 1 : max(1, (int) ceil($totalRows / $perPage));
        $slicedRows = $isAll ? $reportRows : array_values(array_slice($reportRows, ($page - 1) * $perPage, $perPage));

        // 7. List of available active departments for the filter dropdown
        $allDepartments = Department::query()
            ->orderBy('name')
            ->get(['id', 'name', 'code']);

        return response()->json([
            'filters' => [
                'filter_type' => $filterType,
                'date_basis' => $dateBasis,
                'date' => $request->query('date'),
                'month' => $request->query('month', now()->format('Y-m')),
                'from_date' => $request->query('from_date'),
                'to_date' => $request->query('to_date'),
                'department_id' => $departmentId,
                'accounting_filter' => $accountingFilter,
                'date_label' => $dateLabel,
            ],
            'pagination' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $totalRows,
                'last_page' => $lastPage,
                'from' => $totalRows > 0 ? (($page - 1) * $perPage + 1) : 0,
                'to' => min($page * $perPage, $totalRows),
            ],
            'metrics' => [
                'total_amount' => $totalAmount,
                'total_quantity' => $totalQuantity,
                'total_orders_count' => $totalOrders,
                'total_items_count' => $totalItemsCount,
                'suppliers_count' => $uniqueSuppliers,
                'parcels_count' => $uniqueParcels,
                'verified_items_count' => $verifiedCount,
            ],
            'departments' => $allDepartments,
            'rows' => $slicedRows,
        ]);
    }
}
