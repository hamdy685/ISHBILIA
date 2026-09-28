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
                'purchaseReceipts.items.purchaseOrderItem',
                'purchaseReceipts.items.item',
                'supplierInvoices.landAllocations.parcel',
                'supplierInvoices.landAllocations.department',
                'supplierInvoices.purchaseReceipt.items.purchaseOrderItem',
                'supplierInvoices.createdBy',
            ])
            ->whereNotIn('status', ['REJECTED', 'PO_DRAFT'])
            ->when($allowedDepartmentCodes !== null, function ($q) use ($allowedDepartmentCodes) {
                $q->whereHas('purchaseRequest.department', function ($dq) use ($allowedDepartmentCodes) {
                    $dq->whereIn('code', $allowedDepartmentCodes);
                });
            });

        // التقارير المحاسبية للمشتريات تظهر حصرياً بعد تسجيل المحاسب للفاتورة في المرحلة النهائية
        if ($accountingFilter === 'PENDING') {
            // أوامر الشراء الصادرة التي لم يسجل لها المحاسب فاتورة بعد
            $ordersQuery->whereDoesntHave('supplierInvoices', function ($iq) {
                $iq->whereNotIn('status', ['VOIDED', 'CANCELLED']);
            });

            if ($startDate !== null && $endDate !== null) {
                $startDateStr = $startDate->toDateString();
                $endDateStr = $endDate->toDateString();
                $ordersQuery->where(function ($q) use ($startDateStr, $endDateStr) {
                    $q->whereDate('created_at', '>=', $startDateStr)
                        ->whereDate('created_at', '<=', $endDateStr);
                });
            }
        } else {
            // الافتراضي والرسمي: فقط الأوامر التي سجل لها المحاسب فاتورة مورد معتمدة
            $ordersQuery->whereHas('supplierInvoices', function ($iq) {
                $iq->whereNotIn('status', ['VOIDED', 'CANCELLED']);
            });

            // تصفية التاريخ بناءً على تاريخ الفاتورة المسجلة بالحسابات أو تاريخ استلام الموقع
            if ($startDate !== null && $endDate !== null) {
                $startDateStr = $startDate->toDateString();
                $endDateStr = $endDate->toDateString();

                $ordersQuery->whereHas('supplierInvoices', function ($iq) use ($startDateStr, $endDateStr) {
                    $iq->whereNotIn('status', ['VOIDED', 'CANCELLED'])
                        ->where(function ($dateQ) use ($startDateStr, $endDateStr) {
                            $dateQ->where(function ($sub) use ($startDateStr, $endDateStr) {
                                $sub->whereNotNull('invoice_date')
                                    ->whereDate('invoice_date', '>=', $startDateStr)
                                    ->whereDate('invoice_date', '<=', $endDateStr);
                            })->orWhere(function ($sub) use ($startDateStr, $endDateStr) {
                                $sub->whereNull('invoice_date')
                                    ->whereDate('created_at', '>=', $startDateStr)
                                    ->whereDate('created_at', '<=', $endDateStr);
                            });
                        });
                });
            }
        }

        $orders = $ordersQuery->orderByDesc('created_at')->get();

        // 4. Transform into the 12 exact report columns per item
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

            // في الوضع الافتراضي أو المعتمد: نضمن عدم ظهور أي أمر لم يسجل له المحاسب فاتورة
            if ($accountingFilter !== 'PENDING') {
                if ($activeInvoices->isEmpty()) {
                    continue; // استبعاد كامل لأي أمر في منتصف الدورة لم يسجل له فاتورة
                }

                foreach ($activeInvoices as $invoice) {
                    // التحقق من تاريخ الفاتورة ضمن الفترة المحددة
                    if ($startDate !== null && $endDate !== null) {
                        $invDateStr = $invoice->invoice_date?->toDateString() ?? $invoice->created_at?->toDateString();
                        if ($invDateStr && ($invDateStr < $startDateStr || $invDateStr > $endDateStr)) {
                            continue;
                        }
                    }

                    $receipt = $invoice->purchaseReceipt
                        ?? $order->purchaseReceipts->firstWhere('id', $invoice->purchase_receipt_id)
                        ?? $order->purchaseReceipts->where('status', 'APPROVED')->first()
                        ?? $order->purchaseReceipts->first();

                    // إذا كان إذن الاستلام يحتوي على بنود استلام معتمدة
                    if ($receipt && $receipt->items->isNotEmpty()) {
                        foreach ($receipt->items as $receiptItem) {
                            $poItem = $receiptItem->purchaseOrderItem;
                            $prItem = $poItem?->prItem;

                            $receivedQty = (float) $receiptItem->received_quantity;
                            $unitPrice = (float) ($poItem?->unit_price ?? 0);
                            $lineTotal = round($receivedQty * $unitPrice, 2);

                            $rowParcelRef = $poItem?->item_reference
                                ?: ($prItem?->item_reference ?: $defaultParcelRef);
                            $rowRegion = $poItem?->region
                                ?: ($prItem?->region ?: $defaultRegion);

                            $works = $poItem?->specifications
                                ?: ($prItem?->specifications ?: ($requestModel?->notes ?: '—'));

                            $deliveryDate = $receipt->received_at?->format('Y-m-d')
                                ?? $invoice->invoice_date?->format('Y-m-d')
                                ?? $order->actual_delivery_date?->format('Y-m-d')
                                ?? $order->created_at?->format('Y-m-d');

                            $reportRows[] = [
                                'id' => "INV-{$invoice->id}-REC-{$receiptItem->id}",
                                'invoice_id' => $invoice->id,
                                'receipt_id' => $receipt->id,
                                'purchase_order_id' => $order->id,
                                // 1. تاريخ التوريد
                                'delivery_date' => $deliveryDate,
                                'delivery_date_formatted' => $deliveryDate ? Carbon::parse($deliveryDate)->format('d/m/Y') : '—',
                                // 2. رقم أمر الشراء
                                'po_number' => $order->po_number,
                                'po_number_short' => preg_replace('/^PO-\d{4}-0*/', '', $order->po_number) ?: $order->po_number,
                                // 3. الصنف
                                'item_name' => $poItem?->item_description ?? ($receiptItem->item?->name ?? '—'),
                                // 4. الوحدة
                                'uom' => $poItem?->uom ?? '—',
                                // 5. الكمية (المستلمة المعتمدة لدى الحسابات)
                                'quantity' => $receivedQty,
                                // 6. سعر الوحدة
                                'unit_price' => $unitPrice,
                                // 7. سعر الكمية (الإجمالي)
                                'total_price' => $lineTotal,
                                // 8. أسم المورد
                                'supplier_name' => $order->supplier?->company_name ?? $order->supplier?->name ?? '—',
                                'supplier_id' => $order->supplier_id,
                                // 9. رقم القطعة
                                'parcel_reference' => $rowParcelRef ?: '—',
                                // 10. إسم المنطقة
                                'region' => $rowRegion ?: '—',
                                // 11. القسم
                                'department_id' => $deptId,
                                'department_name' => $deptName,
                                // 12. الاعمال
                                'works' => $works ?: '—',
                                // Extra metadata
                                'accounting_status' => 'VERIFIED',
                                'accounting_status_label' => 'مسقط ومسجل بالحسابات',
                                'invoice_number' => $invoice->invoice_number,
                                'matching_status' => $invoice->matching_status,
                                'accountant_name' => $invoice->createdBy?->name ?? 'الحسابات',
                                'order_status' => $order->status,
                                'created_at' => $order->created_at?->toIso8601String(),
                            ];
                        }
                    } elseif ($order->items->isNotEmpty()) {
                        // في حال عدم تفصيل بنود الاستلام، تفصيل بنود أمر الشراء المعتمدة مع الفاتورة
                        foreach ($order->items as $poItem) {
                            $prItem = $poItem->prItem;

                            $qty = (float) $poItem->quantity;
                            $unitPrice = (float) $poItem->unit_price;
                            $lineTotal = (float) ($poItem->line_total > 0 ? $poItem->line_total : round($qty * $unitPrice, 2));

                            $rowParcelRef = $poItem->item_reference
                                ?: ($prItem?->item_reference ?: $defaultParcelRef);
                            $rowRegion = $poItem->region
                                ?: ($prItem?->region ?: $defaultRegion);

                            $works = $poItem->specifications
                                ?: ($prItem?->specifications ?: ($requestModel?->notes ?: '—'));

                            $deliveryDate = $invoice->invoice_date?->format('Y-m-d')
                                ?? $order->actual_delivery_date?->format('Y-m-d')
                                ?? $order->created_at?->format('Y-m-d');

                            $reportRows[] = [
                                'id' => "INV-{$invoice->id}-ITEM-{$poItem->id}",
                                'invoice_id' => $invoice->id,
                                'receipt_id' => $receipt?->id,
                                'purchase_order_id' => $order->id,
                                'delivery_date' => $deliveryDate,
                                'delivery_date_formatted' => $deliveryDate ? Carbon::parse($deliveryDate)->format('d/m/Y') : '—',
                                'po_number' => $order->po_number,
                                'po_number_short' => preg_replace('/^PO-\d{4}-0*/', '', $order->po_number) ?: $order->po_number,
                                'item_name' => $poItem->item_description ?? '—',
                                'uom' => $poItem->uom ?? '—',
                                'quantity' => $qty,
                                'unit_price' => $unitPrice,
                                'total_price' => $lineTotal,
                                'supplier_name' => $order->supplier?->company_name ?? $order->supplier?->name ?? '—',
                                'supplier_id' => $order->supplier_id,
                                'parcel_reference' => $rowParcelRef ?: '—',
                                'region' => $rowRegion ?: '—',
                                'department_id' => $deptId,
                                'department_name' => $deptName,
                                'works' => $works ?: '—',
                                'accounting_status' => 'VERIFIED',
                                'accounting_status_label' => 'مسقط ومسجل بالحسابات',
                                'invoice_number' => $invoice->invoice_number,
                                'matching_status' => $invoice->matching_status,
                                'accountant_name' => $invoice->createdBy?->name ?? 'الحسابات',
                                'order_status' => $order->status,
                                'created_at' => $order->created_at?->toIso8601String(),
                            ];
                        }
                    } else {
                        // سطر مفرد يمثل الفاتورة المسجلة
                        $deliveryDate = $invoice->invoice_date?->format('Y-m-d') ?? $order->created_at?->format('Y-m-d');
                        $reportRows[] = [
                            'id' => "INV-{$invoice->id}",
                            'invoice_id' => $invoice->id,
                            'receipt_id' => $receipt?->id,
                            'purchase_order_id' => $order->id,
                            'delivery_date' => $deliveryDate,
                            'delivery_date_formatted' => $deliveryDate ? Carbon::parse($deliveryDate)->format('d/m/Y') : '—',
                            'po_number' => $order->po_number,
                            'po_number_short' => preg_replace('/^PO-\d{4}-0*/', '', $order->po_number) ?: $order->po_number,
                            'item_name' => 'فاتورة مشتريات مورد #' . $invoice->invoice_number,
                            'uom' => 'مقطوعية',
                            'quantity' => 1,
                            'unit_price' => (float) $invoice->amount,
                            'total_price' => (float) $invoice->amount,
                            'supplier_name' => $order->supplier?->company_name ?? $order->supplier?->name ?? '—',
                            'supplier_id' => $order->supplier_id,
                            'parcel_reference' => $defaultParcelRef,
                            'region' => $defaultRegion,
                            'department_id' => $deptId,
                            'department_name' => $deptName,
                            'works' => $requestModel?->notes ?: '—',
                            'accounting_status' => 'VERIFIED',
                            'accounting_status_label' => 'مسقط ومسجل بالحسابات',
                            'invoice_number' => $invoice->invoice_number,
                            'matching_status' => $invoice->matching_status,
                            'accountant_name' => $invoice->createdBy?->name ?? 'الحسابات',
                            'order_status' => $order->status,
                            'created_at' => $order->created_at?->toIso8601String(),
                        ];
                    }
                }
            } elseif ($accountingFilter === 'PENDING') {
                // تظهر فقط عند الاختيار الصريح لتبويب "بانتظار تسجيل الفاتورة"
                $latestReceipt = $order->purchaseReceipts->where('status', 'APPROVED')->first()
                    ?? $order->purchaseReceipts->first();

                foreach ($order->items as $poItem) {
                    $prItem = $poItem->prItem;

                    $qty = (float) $poItem->quantity;
                    $unitPrice = (float) $poItem->unit_price;
                    $lineTotal = (float) ($poItem->line_total > 0 ? $poItem->line_total : round($qty * $unitPrice, 2));

                    $rowParcelRef = $poItem->item_reference
                        ?: ($prItem?->item_reference ?: $defaultParcelRef);
                    $rowRegion = $poItem->region
                        ?: ($prItem?->region ?: $defaultRegion);

                    $works = $poItem->specifications
                        ?: ($prItem?->specifications ?: ($requestModel?->notes ?: '—'));

                    $deliveryDate = $order->actual_delivery_date?->format('Y-m-d')
                        ?? $order->delivery_date?->format('Y-m-d')
                        ?? $order->created_at?->format('Y-m-d');

                    $reportRows[] = [
                        'id' => "PO-{$order->id}-ITEM-{$poItem->id}",
                        'invoice_id' => null,
                        'receipt_id' => $latestReceipt?->id,
                        'purchase_order_id' => $order->id,
                        'delivery_date' => $deliveryDate,
                        'delivery_date_formatted' => $deliveryDate ? Carbon::parse($deliveryDate)->format('d/m/Y') : '—',
                        'po_number' => $order->po_number,
                        'po_number_short' => preg_replace('/^PO-\d{4}-0*/', '', $order->po_number) ?: $order->po_number,
                        'item_name' => $poItem->item_description ?? '—',
                        'uom' => $poItem->uom ?? '—',
                        'quantity' => $qty,
                        'unit_price' => $unitPrice,
                        'total_price' => $lineTotal,
                        'supplier_name' => $order->supplier?->company_name ?? $order->supplier?->name ?? '—',
                        'supplier_id' => $order->supplier_id,
                        'parcel_reference' => $rowParcelRef ?: '—',
                        'region' => $rowRegion ?: '—',
                        'department_id' => $deptId,
                        'department_name' => $deptName,
                        'works' => $works ?: '—',
                        'accounting_status' => 'PENDING',
                        'accounting_status_label' => 'صادر - بانتظار تسجيل الحسابات',
                        'invoice_number' => null,
                        'matching_status' => null,
                        'accountant_name' => null,
                        'order_status' => $order->status,
                        'created_at' => $order->created_at?->toIso8601String(),
                    ];
                }
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
