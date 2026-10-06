<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\PurchaseOrder;
use App\Models\PurchaseReceipt;
use App\Models\Supplier;
use App\Models\SupplierInvoice;
use App\Services\SupplierInvoiceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SupplierInvoiceController extends Controller
{
    public function __construct(protected SupplierInvoiceService $service) {}

    public function approvedReceipts(Request $request): JsonResponse
    {
        $statusFilter = $request->query('status', 'pending');
        if ($request->boolean('recorded')) {
            $statusFilter = 'recorded';
        }

        return response()->json([
            'data' => $this->service->approvedReceipts(
                (int) $request->integer('limit', 100),
                $request->user(),
                $statusFilter
            ),
        ]);
    }

    public function markReceiptRecorded(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        $receipt = PurchaseReceipt::with('purchaseOrder')->findOrFail($id);

        $notes = $request->input('notes');

        $receipt->update([
            'accountant_recorded_at' => now(),
            'accountant_recorded_by_user_id' => $user->id,
            'accountant_recording_notes' => $notes,
        ]);

        app(\App\Services\SystemEventService::class)->recordAction(
            entity: $receipt,
            action: 'ACCOUNTANT_RECORDED',
            description: "تم تأكيد تسجيل إذن الاستلام {$receipt->receipt_number} في شيت الإكسيل الخارجي بواسطة المحاسب {$user->name}.",
            context: [
                'event_type' => 'purchase_receipt.accountant_recorded',
                'actor_user_id' => $user->id,
                'metadata' => [
                    'receipt_number' => $receipt->receipt_number,
                    'po_number' => $receipt->purchaseOrder?->po_number,
                    'recorded_at' => now()->toIso8601String(),
                    'notes' => $notes,
                ],
            ]
        );

        return response()->json([
            'message' => 'تم تأكيد تسجيل المعاملة في شيت الإكسيل بنجاح.',
            'data' => [
                'id' => $receipt->id,
                'receipt_number' => $receipt->receipt_number,
                'is_accountant_recorded' => true,
                'accountant_recorded_at' => $receipt->accountant_recorded_at?->toIso8601String(),
                'accountant_recorded_by' => [
                    'id' => $user->id,
                    'name' => $user->name,
                ],
            ],
        ]);
    }

    public function invoices(Request $request): JsonResponse
    {
        return response()->json([
            'data' => $this->service->invoices(
                $request->filled('supplier_id') ? (int) $request->input('supplier_id') : null,
                (int) $request->integer('limit', 200),
                $request->user()
            ),
        ]);
    }

    public function storeInvoice(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'purchase_order_id' => ['required', 'integer', 'exists:purchase_orders,id'],
            'purchase_receipt_id' => ['required', 'integer', 'exists:purchase_receipts,id'],
            'invoice_number' => ['nullable', 'string', 'max:100'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'invoice_date' => ['nullable', 'date'],
            'due_date' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'land_allocations' => ['nullable', 'array'],
            'land_allocations.*' => ['array'],
            'land_allocations.*.land_parcel_id' => ['required', 'integer', 'exists:land_parcels,id'],
            'land_allocations.*.department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'land_allocations.*.amount' => ['required', 'numeric', 'gt:0'],
            'land_allocations.*.notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $user = $request->user();

        // 1. Strict SOD: Procurement Manager, General Manager, Execution Manager must NEVER create invoices
        if ($user && $user->hasAnyRole(['procurement_manager', 'general_manager', 'execution_manager'])) {
            return response()->json([
                'message' => 'غير مصرح لك بتسجيل الفواتير المالية. هذا الإجراء مخصص للإدارة المالية ومحاسبي الأقسام فقط.',
            ], 403);
        }

        // 2. Permission check: must have accounting.invoice.create
        if ($user && ! $user->hasRole('admin') && ! $this->service->isGeneralAccountant($user) && ! $user->hasPermission('accounting.invoice.create')) {
            return response()->json([
                'message' => 'غير مصرح لك بتسجيل الفواتير المالية. هذا الإجراء مخصص للإدارة المالية ومحاسبي الأقسام فقط.',
            ], 403);
        }

        // 3. Financial Director restricted (assigned to department accountants)
        if ($user && $user->hasRole('accountant') && ! $user->hasRole('admin') && ! $this->service->isGeneralAccountant($user) && ! $this->service->isRestrictedDepartmentAccountant($user)) {
            return response()->json([
                'message' => 'غير مصرح للمدير المالي بتسجيل الفواتير؛ تسجيل الفواتير مسند لمحاسب القسم التابع له أمر الشراء فقط.',
            ], 403);
        }

        $po = PurchaseOrder::withoutGlobalScope(\App\Scopes\DataIsolationScope::class)
            ->with('purchaseRequest.department')
            ->findOrFail($validated['purchase_order_id']);

        // 4. Scoped department check
        $allowedCodes = $this->service->getAllowedDepartmentCodesForAccountant($request->user());
        if ($allowedCodes !== null) {
            $deptCode = $po->purchaseRequest?->department?->code;
            if (! in_array($deptCode, $allowedCodes, true)) {
                return response()->json(['message' => 'غير مصرح بتسجيل فواتير لأقسام خارج نطاق اختصاصك المحاسبي.'], 403);
            }
        }

        $receipt = PurchaseReceipt::withoutGlobalScope(\App\Scopes\DataIsolationScope::class)
            ->findOrFail($validated['purchase_receipt_id']);

        $invoice = $this->service->createInvoice(
            $request->user(),
            $po,
            $receipt,
            (float) $validated['amount'],
            $validated['invoice_number'] ?? null,
            $validated['invoice_date'] ?? null,
            $validated['due_date'] ?? null,
            $validated['land_allocations'] ?? [],
            $validated['notes'] ?? null,
        );

        return response()->json(['data' => $invoice, 'message' => 'تم تسجيل فاتورة المورد بنجاح.'], 201);
    }

    public function match(Request $request, SupplierInvoice $invoice): JsonResponse
    {
        $matched = $this->service->matchThreeWay($request->user(), $invoice);

        return response()->json([
            'data' => $matched,
            'message' => 'تمت المطابقة الثلاثية بنجاح: أمر الشراء + إذن الاستلام + الفاتورة.',
        ]);
    }

    public function storePayment(Request $request, SupplierInvoice $invoice): JsonResponse
    {
        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'gt:0'],
            'payment_date' => ['nullable', 'date'],
            'payment_method' => ['required', 'string', 'in:BANK_TRANSFER,CASH,CHEQUE'],
            'reference_number' => ['nullable', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $result = $this->service->recordPayment(
            $request->user(),
            $invoice,
            (float) $validated['amount'],
            $validated['payment_date'] ?? null,
            $validated['payment_method'],
            $validated['reference_number'] ?? null,
            $validated['notes'] ?? null,
        );

        return response()->json($result, 201);
    }

    public function storeSupplierPayment(Request $request, Supplier $supplier): JsonResponse
    {
        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'gt:0'],
            'payment_date' => ['nullable', 'date'],
            'payment_method' => ['required', 'string', 'in:BANK_TRANSFER,CASH,CHEQUE'],
            'reference_number' => ['nullable', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $result = $this->service->recordSupplierPayment(
            $request->user(),
            $supplier,
            (float) $validated['amount'],
            $validated['payment_date'] ?? null,
            $validated['payment_method'],
            $validated['reference_number'] ?? null,
            $validated['notes'] ?? null,
        );

        return response()->json($result, 201);
    }

    public function supplierAccounts(Request $request): JsonResponse
    {
        return response()->json([
            'data' => $this->service->supplierAccounts((int) $request->integer('limit', 200), $request->user()),
        ]);
    }

    public function supplierAccount(Request $request, Supplier $supplier): JsonResponse
    {
        $fromDate = $request->query('from_date');
        return response()->json([
            'data' => $this->service->supplierAccount($supplier, $request->user(), $fromDate ? (string) $fromDate : null),
        ]);
    }

    public function setOpeningBalance(Request $request, Supplier $supplier): JsonResponse
    {
        $validated = $request->validate([
            'opening_balance' => ['required', 'numeric', 'min:0'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $result = $this->service->setOpeningBalance(
            $supplier,
            (float) $validated['opening_balance'],
            $validated['notes'] ?? null
        );

        return response()->json([
            'message' => 'تم تحديث الرصيد الافتتاحي للمورد بنجاح.',
            'data' => $result,
        ]);
    }

    public function storeDirectPayment(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'invoice_id' => ['nullable', 'exists:supplier_invoices,id'],
            'supplier_id' => ['nullable', 'exists:suppliers,id'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'payment_date' => ['nullable', 'date'],
            'payment_method' => ['required', 'string', 'in:BANK_TRANSFER,CASH,CHEQUE'],
            'reference_number' => ['nullable', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        if (!empty($validated['invoice_id'])) {
            $invoice = SupplierInvoice::findOrFail($validated['invoice_id']);
            $result = $this->service->recordPayment(
                $request->user(),
                $invoice,
                (float) $validated['amount'],
                $validated['payment_date'] ?? null,
                $validated['payment_method'],
                $validated['reference_number'] ?? null,
                $validated['notes'] ?? null,
            );
            return response()->json($result, 201);
        }

        if (!empty($validated['supplier_id'])) {
            $supplier = Supplier::findOrFail($validated['supplier_id']);
            $result = $this->service->recordSupplierPayment(
                $request->user(),
                $supplier,
                (float) $validated['amount'],
                $validated['payment_date'] ?? null,
                $validated['payment_method'],
                $validated['reference_number'] ?? null,
                $validated['notes'] ?? null,
            );
            return response()->json($result, 201);
        }

        return response()->json(['message' => 'يجب تحديد الفاتورة أو المورد لتسجيل الدفعة.'], 422);
    }
}
