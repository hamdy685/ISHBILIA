<?php

namespace App\Services;

use App\Models\LandParcel;
use App\Models\LandParcelTransaction;
use App\Models\SupplierInvoice;
use App\Models\SupplierInvoiceLandAllocation;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class LandParcelService
{
    public function list(int $limit = 200): Collection
    {
        return LandParcel::query()
            ->where('is_active', true)
            ->orderBy('parcel_reference')
            ->orderBy('region')
            ->limit(min(max($limit, 1), 500))
            ->get();
    }

    public function createParcel(User $accountant, array $data): LandParcel
    {
        $parcelReference = trim((string) ($data['parcel_reference'] ?? ''));
        $region = trim((string) ($data['region'] ?? ''));
        $openingBalance = round((float) ($data['opening_balance'] ?? 0), 2);
        if ($parcelReference === '' || $region === '') {
            throw ValidationException::withMessages(['parcel_reference' => ['رقم قطعة الأرض والمنطقة مطلوبان.']]);
        }
        if ($openingBalance < 0) {
            throw ValidationException::withMessages(['opening_balance' => ['الرصيد الافتتاحي لا يمكن أن يكون سالبًا.']]);
        }
        if (LandParcel::where('parcel_reference', $parcelReference)->where('region', $region)->exists()) {
            throw ValidationException::withMessages(['parcel_reference' => ['حساب قطعة الأرض موجود بالفعل بنفس الرقم والمنطقة.']]);
        }

        return DB::transaction(function () use ($accountant, $parcelReference, $region, $openingBalance, $data): LandParcel {
            $parcel = LandParcel::create([
                'parcel_reference' => $parcelReference,
                'region' => $region,
                'opening_balance' => $openingBalance,
                'funded_total' => 0,
                'expense_total' => 0,
                'balance' => $openingBalance,
                'is_active' => true,
                'notes' => $data['notes'] ?? null,
            ]);

            if ($openingBalance > 0) {
                LandParcelTransaction::create([
                    'land_parcel_id' => $parcel->id,
                    'created_by_user_id' => $accountant->id,
                    'transaction_type' => 'OPENING_BALANCE',
                    'amount' => $openingBalance,
                    'balance_after' => $openingBalance,
                    'transaction_date' => $data['transaction_date'] ?? now()->toDateString(),
                    'reference_number' => $data['reference_number'] ?? null,
                    'notes' => $data['notes'] ?? 'رصيد افتتاحي ممول من العميل.',
                ]);
            }

            return $parcel->fresh(['transactions.createdBy']);
        });
    }

    public function addCustomerFunding(User $accountant, LandParcel $parcel, float $amount, ?string $date = null, ?string $referenceNumber = null, ?string $notes = null): LandParcel
    {
        if ($amount <= 0) {
            throw ValidationException::withMessages(['amount' => ['مبلغ تمويل العميل يجب أن يكون أكبر من صفر.']]);
        }

        return DB::transaction(function () use ($accountant, $parcel, $amount, $date, $referenceNumber, $notes): LandParcel {
            $lockedParcel = LandParcel::query()->lockForUpdate()->findOrFail($parcel->id);
            $newBalance = round((float) $lockedParcel->balance + $amount, 2);
            $lockedParcel->update([
                'funded_total' => round((float) $lockedParcel->funded_total + $amount, 2),
                'balance' => $newBalance,
            ]);
            LandParcelTransaction::create([
                'land_parcel_id' => $lockedParcel->id,
                'created_by_user_id' => $accountant->id,
                'transaction_type' => 'CUSTOMER_FUNDING',
                'amount' => round($amount, 2),
                'balance_after' => $newBalance,
                'transaction_date' => $date ?: now()->toDateString(),
                'reference_number' => $referenceNumber,
                'notes' => $notes,
            ]);

            return $lockedParcel->fresh(['transactions.createdBy']);
        });
    }

    public function getParcelAccount(LandParcel $parcel): array
    {
        $allocations = $parcel->invoiceAllocations()
            ->with(['invoice.supplier', 'invoice.purchaseOrder', 'department', 'createdBy'])
            ->orderByDesc('created_at')
            ->get();

        $departmentBreakdown = $allocations->groupBy(function ($allocation) {
            return $allocation->department ? $allocation->department->name : 'مصروفات عامة غير مصنفة';
        })->map(function ($items, $deptName) {
            return [
                'department_name' => $deptName,
                'total_amount' => round($items->sum('amount'), 2),
                'invoices_count' => $items->count(),
            ];
        })->values();

        $orderIds = $allocations->pluck('invoice.purchase_order_id')->filter()->unique();

        $materials = \App\Models\PurchaseOrderItem::query()
            ->where(function ($q) use ($parcel, $orderIds) {
                $q->where('item_reference', $parcel->parcel_reference);
                if ($orderIds->isNotEmpty()) {
                    $q->orWhereIn('purchase_order_id', $orderIds);
                }
            })
            ->with([
                'purchaseOrder:id,po_number,supplier_id,created_at',
                'purchaseOrder.supplier:id,company_name',
            ])
            ->get()
            ->map(function ($poItem) {
                $receivedQty = (float) \App\Models\PurchaseReceiptItem::where('purchase_order_item_id', $poItem->id)->sum('received_quantity');
                return [
                    'id' => $poItem->id,
                    'item_name' => $poItem->item_description,
                    'item_reference' => $poItem->item_reference,
                    'region' => $poItem->region,
                    'ordered_quantity' => (float) $poItem->quantity,
                    'received_quantity' => $receivedQty > 0 ? $receivedQty : (float) $poItem->quantity,
                    'uom' => $poItem->uom,
                    'unit_price' => (float) $poItem->unit_price,
                    'total_price' => (float) $poItem->line_total,
                    'specifications' => $poItem->specifications,
                    'po_number' => $poItem->purchaseOrder?->po_number,
                    'supplier_name' => $poItem->purchaseOrder?->supplier?->company_name,
                    'date' => $poItem->purchaseOrder?->created_at?->format('Y-m-d') ?? $poItem->created_at?->format('Y-m-d'),
                ];
            })->values();

        return [
            'parcel' => $parcel->load(['transactions.createdBy', 'invoiceAllocations.invoice.supplier', 'invoiceAllocations.department']),
            'summary' => [
                'opening_balance' => (float) $parcel->opening_balance,
                'funded_total' => (float) $parcel->funded_total,
                'expense_total' => (float) $parcel->expense_total,
                'balance' => (float) $parcel->balance,
                'is_negative' => (float) $parcel->balance < 0,
            ],
            'department_breakdown' => $departmentBreakdown,
            'materials' => $materials,
            'transactions' => $parcel->transactions()->with('createdBy')->orderByDesc('transaction_date')->orderByDesc('id')->get(),
            'invoice_allocations' => $allocations,
        ];
    }

    public function recordInvoiceAllocations(User $accountant, SupplierInvoice $invoice, array $allocations): void
    {
        if (count($allocations) === 0) {
            return;
        }

        $normalized = collect($allocations)->map(function (array $allocation): array {
            return [
                'land_parcel_id' => (int) ($allocation['land_parcel_id'] ?? 0),
                'department_id' => ! empty($allocation['department_id']) ? (int) $allocation['department_id'] : null,
                'amount' => round((float) ($allocation['amount'] ?? 0), 2),
                'notes' => $allocation['notes'] ?? null,
            ];
        });
        if ($normalized->contains(fn (array $allocation): bool => $allocation['land_parcel_id'] <= 0 || $allocation['amount'] <= 0)) {
            throw ValidationException::withMessages(['land_allocations' => ['قيمة كل توزيع يجب أن تكون أكبر من صفر مع اختيار قطعة صحيحة.']]);
        }

        // Allow dynamic allocation: parcel expenses can be more, less, or independent of invoice total

        foreach ($normalized as $allocation) {
            $parcel = LandParcel::query()->lockForUpdate()->find($allocation['land_parcel_id']);
            if (! $parcel || ! $parcel->is_active) {
                throw ValidationException::withMessages(['land_allocations' => ['إحدى قطع الأراضي المختارة غير موجودة أو غير نشطة.']]);
            }
            $newBalance = round((float) $parcel->balance - $allocation['amount'], 2);
            $parcel->update([
                'expense_total' => round((float) $parcel->expense_total + $allocation['amount'], 2),
                'balance' => $newBalance,
            ]);
            $invoiceAllocation = SupplierInvoiceLandAllocation::create([
                'supplier_invoice_id' => $invoice->id,
                'land_parcel_id' => $parcel->id,
                'department_id' => $allocation['department_id'],
                'created_by_user_id' => $accountant->id,
                'amount' => $allocation['amount'],
                'notes' => $allocation['notes'],
            ]);
            LandParcelTransaction::create([
                'land_parcel_id' => $parcel->id,
                'created_by_user_id' => $accountant->id,
                'transaction_type' => 'INVOICE_EXPENSE',
                'amount' => -$allocation['amount'],
                'balance_after' => $newBalance,
                'transaction_date' => $invoice->invoice_date ?: now()->toDateString(),
                'source_type' => SupplierInvoiceLandAllocation::class,
                'source_id' => $invoiceAllocation->id,
                'reference_number' => $invoice->invoice_number,
                'notes' => $allocation['notes'] ?: "مصروف من فاتورة المورد {$invoice->invoice_number}.",
            ]);
        }
    }

    public function deleteParcel(LandParcel $parcel): bool
    {
        if ($parcel->invoiceAllocations()->exists()) {
            throw ValidationException::withMessages([
                'parcel' => ['لا يمكن حذف قطعة الأرض لوجود فواتير مصروفات مرحلة عليها.'],
            ]);
        }

        return DB::transaction(function () use ($parcel): bool {
            $parcel->transactions()->delete();
            return (bool) $parcel->delete();
        });
    }

    public function wipeAllParcels(): int
    {
        return DB::transaction(function (): int {
            DB::table('supplier_invoice_land_allocations')->delete();
            DB::table('land_parcel_transactions')->delete();
            return DB::table('land_parcels')->delete();
        });
    }
}

