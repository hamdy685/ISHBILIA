<?php

namespace App\Services;

use App\Models\Accounting\Account;
use App\Models\Accounting\CostCenter;
use App\Models\Accounting\JournalEntry;
use App\Models\Accounting\JournalEntryLine;
use App\Models\PurchaseOrder;
use App\Models\PurchaseReceipt;
use App\Models\Supplier;
use App\Models\SupplierBalance;
use App\Models\SupplierInvoice;
use App\Models\SupplierPayment;
use App\Models\User;
use App\Services\LandParcelService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class SupplierInvoiceService
{
    public const ACCOUNTANT_DEPARTMENT_MAPPINGS = [
        'site_accountant' => ['EXECUTION', 'FINISHING', 'BUILDINGS'],
        'licenses_accountant' => ['LICENSES'],
        'buffet_accountant' => ['BUFFET'],
    ];

    public const SITE_ACCOUNTANT_DEPARTMENT_CODES = ['EXECUTION', 'FINISHING', 'BUILDINGS'];

    public function getDepartmentAccountantRole(?User $user): ?string
    {
        if (! $user) {
            return null;
        }

        foreach (array_keys(self::ACCOUNTANT_DEPARTMENT_MAPPINGS) as $role) {
            if ($user->hasRole($role)) {
                return $role;
            }
        }

        return null;
    }

    public function isRestrictedDepartmentAccountant(?User $user): bool
    {
        if (! $user || $user->hasRole('admin')) {
            return false;
        }

        return $this->getDepartmentAccountantRole($user) !== null;
    }

    public function isRestrictedSiteAccountant(?User $user): bool
    {
        return $this->isRestrictedDepartmentAccountant($user);
    }

    public function getAllowedDepartmentCodesForAccountant(?User $user): ?array
    {
        if (! $user || $user->hasRole('admin')) {
            return null;
        }

        $role = $this->getDepartmentAccountantRole($user);
        if ($role && isset(self::ACCOUNTANT_DEPARTMENT_MAPPINGS[$role])) {
            return self::ACCOUNTANT_DEPARTMENT_MAPPINGS[$role];
        }

        return null;
    }

    public function approvedReceipts(int $limit = 100, ?User $user = null)
    {
        return PurchaseReceipt::with([
            'purchaseOrder.supplier',
            'purchaseOrder.createdBy',
            'purchaseOrder.accountingReviewer',
            'purchaseOrder.purchaseRequest.department',
            'purchaseOrder.purchaseRequest.requester',
            'purchaseOrder.purchaseRequest.assignedReviewer',
            'purchaseOrder.purchaseRequest.siteEngineer',
            'purchaseOrder.purchaseRequest.approvalHistory.actor',
            'purchaseOrder.items.item',
            'purchaseOrder.items.prItem',
            'purchaseOrder.approvalHistory.actor',
            'warehouseKeeper',
            'siteEngineer',
            'items.purchaseOrderItem.item',
            'items.purchaseOrderItem.prItem',
        ])
            ->where('status', 'APPROVED')
            ->whereDoesntHave('supplierInvoices', function ($query) {
                $query->whereIn('status', ['DRAFT', 'OPEN', 'PARTIALLY_PAID', 'PAID']);
            })
            ->when($this->getAllowedDepartmentCodesForAccountant($user), function ($query, $allowedCodes) {
                $query->whereHas('purchaseOrder.purchaseRequest.department', function ($dq) use ($allowedCodes) {
                    $dq->whereIn('code', $allowedCodes);
                });
            })
            ->orderByDesc('site_engineer_approved_at')
            ->limit($limit)
            ->get();
    }

    public function invoices(?int $supplierId = null, int $limit = 200, ?User $user = null)
    {
        return SupplierInvoice::with([
            'supplier',
            'purchaseOrder.purchaseRequest.department',
            'purchaseReceipt',
            'paymentAllocations.payment',
            'landAllocations.parcel',
            'journalEntry.lines.account',
        ])
            ->when($supplierId, fn ($query) => $query->where('supplier_id', $supplierId))
            ->when($this->getAllowedDepartmentCodesForAccountant($user), function ($query, $allowedCodes) {
                $query->whereHas('purchaseOrder.purchaseRequest.department', function ($dq) use ($allowedCodes) {
                    $dq->whereIn('code', $allowedCodes);
                });
            })
            ->orderByDesc('invoice_date')
            ->orderByDesc('id')
            ->limit($limit)
            ->get();
    }

    public function createInvoice(
        User $accountant,
        PurchaseOrder $purchaseOrder,
        PurchaseReceipt $receipt,
        float $amount,
        string $invoiceNumber,
        ?string $invoiceDate = null,
        ?string $dueDate = null,
        array $landAllocations = [],
        ?string $notes = null,
    ): SupplierInvoice {
        $receipt->loadMissing(['purchaseOrder', 'items.purchaseOrderItem']);
        $purchaseOrder->loadMissing('supplier');

        if ($receipt->purchase_order_id !== $purchaseOrder->id) {
            throw new \RuntimeException('إذن الاستلام غير مرتبط بأمر الشراء المحدد.');
        }
        if ($receipt->status !== 'APPROVED') {
            throw new \RuntimeException('لا يمكن تسجيل فاتورة قبل اعتماد إذن الاستلام من مهندس الموقع.');
        }

        $allowedCodes = $this->getAllowedDepartmentCodesForAccountant($accountant);
        if ($allowedCodes !== null) {
            $purchaseOrder->loadMissing('purchaseRequest.department');
            $deptCode = $purchaseOrder->purchaseRequest?->department?->code;
            if ($deptCode && ! in_array($deptCode, $allowedCodes, true)) {
                throw new \RuntimeException('غير مصرح لك بتسجيل فواتير لهذا القسم.');
            }
        }

        if ($amount <= 0) {
            throw ValidationException::withMessages(['amount' => ['قيمة الفاتورة يجب أن تكون أكبر من صفر.']]);
        }
        if (SupplierInvoice::where('purchase_receipt_id', $receipt->id)->exists()) {
            throw new \RuntimeException('تم تسجيل فاتورة لهذا إذن الاستلام بالفعل.');
        }

        $normalizedInvoiceNumber = trim($invoiceNumber);
        if ($normalizedInvoiceNumber === '') {
            throw ValidationException::withMessages(['invoice_number' => ['رقم الفاتورة مطلوب.']]);
        }
        if (SupplierInvoice::where('invoice_number', $normalizedInvoiceNumber)->exists()) {
            throw ValidationException::withMessages(['invoice_number' => ['رقم الفاتورة مستخدم من قبل. أدخل رقمًا مختلفًا أو راجع أرشيف فواتير المورد.']]);
        }

        return DB::transaction(function () use ($accountant, $purchaseOrder, $receipt, $amount, $normalizedInvoiceNumber, $invoiceDate, $dueDate, $landAllocations, $notes): SupplierInvoice {
            $invoice = SupplierInvoice::create([
                'supplier_id' => $purchaseOrder->supplier_id,
                'purchase_order_id' => $purchaseOrder->id,
                'purchase_receipt_id' => $receipt->id,
                'created_by_user_id' => $accountant->id,
                'invoice_number' => $normalizedInvoiceNumber,
                'amount' => round($amount, 2),
                'invoice_date' => $invoiceDate ?: now()->toDateString(),
                'due_date' => $dueDate,
                'status' => 'OPEN',
                'matching_status' => 'PENDING',
                'paid_amount' => 0,
                'outstanding_amount' => round($amount, 2),
                'notes' => $notes,
            ]);

            app(LandParcelService::class)->recordInvoiceAllocations($accountant, $invoice, $landAllocations);
            $this->refreshSupplierBalance($invoice->supplier_id);

            return $invoice->fresh(['supplier', 'purchaseOrder', 'purchaseReceipt', 'landAllocations.parcel']);
        });
    }

    public function matchThreeWay(User $accountant, SupplierInvoice $invoice): SupplierInvoice
    {
        $invoice->loadMissing([
            'purchaseOrder.supplier',
            'purchaseOrder.items',
            'purchaseReceipt.items.purchaseOrderItem',
        ]);

        if ($invoice->matching_status === 'MATCHED') {
            return $invoice;
        }
        if ($invoice->purchaseReceipt->status !== 'APPROVED') {
            throw new \RuntimeException('لا يمكن المطابقة قبل اعتماد إذن الاستلام.');
        }
        if ($invoice->purchaseReceipt->purchase_order_id !== $invoice->purchase_order_id) {
            throw new \RuntimeException('المستندات الثلاثة غير مرتبطة بنفس أمر الشراء.');
        }
        if ($invoice->supplier_id !== $invoice->purchaseOrder->supplier_id) {
            throw new \RuntimeException('المورد في الفاتورة لا يطابق المورد في أمر الشراء.');
        }

        $receivedValue = $this->calculateReceiptValue($invoice->purchaseReceipt);
        if (abs((float) $invoice->amount - $receivedValue) > 0.01) {
            throw ValidationException::withMessages([
                'matching' => [sprintf('فشل التحقق: مبلغ الفاتورة %.2f لا يساوي قيمة الاستلام %.2f ج.م.', $invoice->amount, $receivedValue)],
            ]);
        }

        $invoice->update([
            'matching_status' => 'MATCHED',
            'status' => ((float) $invoice->paid_amount > 0 && (float) $invoice->outstanding_amount <= 0) ? 'PAID' : 'OPEN',
            'matched_at' => now(),
            'matched_by_user_id' => $accountant->id,
            'matching_notes' => 'تمت مطابقة أمر الشراء وإذن الاستلام وفاتورة المورد.',
            'outstanding_amount' => max(0, round((float) $invoice->amount - (float) $invoice->paid_amount, 2)),
        ]);

        $this->refreshSupplierBalance($invoice->supplier_id);
        $this->generateSupplierInvoiceJournalEntry($invoice);

        return $invoice->fresh([
            'supplier',
            'purchaseOrder',
            'purchaseReceipt',
            'paymentAllocations.payment',
            'landAllocations.parcel',
            'journalEntry.lines.account',
        ]);
    }

    public function recordPayment(
        User $accountant,
        SupplierInvoice $invoice,
        float $amount,
        ?string $paymentDate = null,
        string $paymentMethod = 'BANK_TRANSFER',
        ?string $referenceNumber = null,
        ?string $notes = null,
    ): array {
        if ($invoice->matching_status !== 'MATCHED') {
            throw new \RuntimeException('لا يمكن تسجيل الدفع قبل إتمام المطابقة الثلاثية.');
        }

        return $this->recordSupplierPayment(
            $accountant,
            Supplier::findOrFail($invoice->supplier_id),
            $amount,
            $paymentDate,
            $paymentMethod,
            $referenceNumber,
            $notes,
        );
    }

    /**
     * Record a supplier-level payment and allocate it oldest-first across all matched debts.
     */
    public function recordSupplierPayment(
        User $accountant,
        Supplier $supplier,
        float $amount,
        ?string $paymentDate = null,
        string $paymentMethod = 'BANK_TRANSFER',
        ?string $referenceNumber = null,
        ?string $notes = null,
    ): array {
        if ($amount <= 0) {
            throw ValidationException::withMessages(['amount' => ['قيمة الدفعة يجب أن تكون أكبر من صفر.']]);
        }

        return DB::transaction(function () use ($accountant, $supplier, $amount, $paymentDate, $paymentMethod, $referenceNumber, $notes): array {
            $supplierId = $supplier->id;
            $remaining = round($amount, 2);

            $payment = SupplierPayment::create([
                'supplier_id' => $supplierId,
                'accountant_user_id' => $accountant->id,
                'payment_number' => 'PAY-' . now()->format('YmdHisv'),
                'amount' => round($amount, 2),
                'payment_date' => $paymentDate ?: now()->toDateString(),
                'payment_method' => $paymentMethod,
                'reference_number' => $referenceNumber,
                'allocated_amount' => 0,
                'overpayment_amount' => 0,
                'notes' => $notes,
            ]);

            $debts = SupplierInvoice::where('supplier_id', $supplierId)
                ->where('matching_status', 'MATCHED')
                ->where('outstanding_amount', '>', 0)
                ->orderBy('invoice_date')
                ->orderBy('id')
                ->lockForUpdate()
                ->get();

            foreach ($debts as $debt) {
                if ($remaining <= 0) {
                    break;
                }
                $allocation = round(min($remaining, (float) $debt->outstanding_amount), 2);
                if ($allocation <= 0) {
                    continue;
                }

                $payment->allocations()->create([
                    'supplier_invoice_id' => $debt->id,
                    'amount' => $allocation,
                ]);

                $paidAmount = round((float) $debt->paid_amount + $allocation, 2);
                $outstanding = max(0, round((float) $debt->amount - $paidAmount, 2));
                $debt->update([
                    'paid_amount' => $paidAmount,
                    'outstanding_amount' => $outstanding,
                    'status' => $outstanding <= 0 ? 'PAID' : 'PARTIALLY_PAID',
                ]);

                $remaining = round($remaining - $allocation, 2);
            }

            $allocated = round($amount - $remaining, 2);
            $payment->update([
                'allocated_amount' => $allocated,
                'overpayment_amount' => max(0, $remaining),
            ]);

            $this->refreshSupplierBalance($supplierId);
            $this->generateSupplierPaymentJournalEntry($payment);

            return [
                'payment' => $payment->fresh(['supplier', 'accountant', 'allocations.invoice.purchaseOrder', 'journalEntry.lines.account']),
                'supplier_balance' => $this->getSupplierBalance($supplierId),
                'overpayment_warning' => $remaining > 0,
                'message' => $remaining > 0
                    ? sprintf('تم تسجيل الدفعة مع تحذير: %.2f ج.م تجاوزت إجمالي المديونية الحالية.', $remaining)
                    : 'تم تسجيل الدفعة على حساب المورد وتوزيعها على أقدم مديونية أولًا.',
            ];
        });
    }

    public function supplierAccounts(int $limit = 200, ?User $user = null): array
    {
        $allowedCodes = $this->getAllowedDepartmentCodesForAccountant($user);

        return Supplier::query()
            ->where('is_active', true)
            ->when($allowedCodes !== null, function ($query) use ($allowedCodes) {
                $query->where(function ($sq) use ($allowedCodes) {
                    $sq->whereHas('purchaseOrders.purchaseRequest.department', function ($dq) use ($allowedCodes) {
                        $dq->whereIn('code', $allowedCodes);
                    })->orWhereHas('invoices.purchaseOrder.purchaseRequest.department', function ($dq) use ($allowedCodes) {
                        $dq->whereIn('code', $allowedCodes);
                    });
                });
            })
            ->orderBy('company_name')
            ->limit($limit)
            ->get()
            ->map(fn (Supplier $supplier) => $this->supplierSummary($supplier, $user))
            ->values()
            ->all();
    }

    public function supplierAccount(Supplier $supplier, ?User $user = null): array
    {
        $allowedCodes = $this->getAllowedDepartmentCodesForAccountant($user);

        $supplier->load([
            'purchaseOrders' => fn ($query) => $query
                ->when($allowedCodes !== null, function ($q) use ($allowedCodes) {
                    $q->whereHas('purchaseRequest.department', function ($dq) use ($allowedCodes) {
                        $dq->whereIn('code', $allowedCodes);
                    });
                })
                ->orderByDesc('created_at'),
            'invoices' => fn ($query) => $query
                ->when($allowedCodes !== null, function ($q) use ($allowedCodes) {
                    $q->whereHas('purchaseOrder.purchaseRequest.department', function ($dq) use ($allowedCodes) {
                        $dq->whereIn('code', $allowedCodes);
                    });
                })
                ->with(['purchaseOrder', 'purchaseReceipt', 'paymentAllocations.payment', 'landAllocations.parcel']),
            'payments' => fn ($query) => $query
                ->when($allowedCodes !== null, function ($q) use ($allowedCodes) {
                    $q->whereHas('allocations.invoice.purchaseOrder.purchaseRequest.department', function ($dq) use ($allowedCodes) {
                        $dq->whereIn('code', $allowedCodes);
                    });
                })
                ->orderByDesc('payment_date'),
            'balanceAccount',
        ]);

        return [
            'supplier' => $supplier,
            'summary' => $this->supplierSummary($supplier, $user),
            'invoices' => $supplier->invoices->sortByDesc('invoice_date')->values(),
            'payments' => $supplier->payments->sortByDesc('payment_date')->values(),
        ];
    }

    public function getSupplierBalance(int $supplierId): array
    {
        $balance = SupplierBalance::firstOrCreate(
            ['supplier_id' => $supplierId],
            ['total_invoiced' => 0, 'total_paid' => 0, 'balance' => 0]
        );

        return [
            'total_invoiced' => (float) $balance->total_invoiced,
            'total_paid' => (float) $balance->total_paid,
            'balance' => (float) $balance->balance,
            'is_overpaid' => (float) $balance->balance < 0,
            'last_activity_at' => $balance->last_activity_at,
        ];
    }

    public function setOpeningBalance(Supplier $supplier, float $openingBalance, ?string $notes = null): array
    {
        if ($openingBalance < 0) {
            throw ValidationException::withMessages(['opening_balance' => ['الرصيد الافتتاحي لا يمكن أن يكون سالباً.']]);
        }

        $supplier->update([
            'opening_balance' => round($openingBalance, 2),
            'opening_balance_notes' => $notes,
        ]);

        $this->refreshSupplierBalance($supplier->id);

        return $this->supplierAccount($supplier);
    }

    private function supplierSummary(Supplier $supplier, ?User $user = null): array
    {
        $allowedCodes = $this->getAllowedDepartmentCodesForAccountant($user);
        $isRestricted = $allowedCodes !== null;

        $openingBalance = $isRestricted ? 0 : (float) ($supplier->opening_balance ?? 0);

        $invoicesQuery = SupplierInvoice::where('supplier_id', $supplier->id)
            ->where('status', '!=', 'DRAFT')
            ->when($isRestricted, function ($q) use ($allowedCodes) {
                $q->whereHas('purchaseOrder.purchaseRequest.department', function ($dq) use ($allowedCodes) {
                    $dq->whereIn('code', $allowedCodes);
                });
            });

        $totalInvoiced = (float) (clone $invoicesQuery)->sum('amount');

        $paymentsQuery = SupplierPayment::where('supplier_id', $supplier->id)
            ->when($isRestricted, function ($q) use ($allowedCodes) {
                $q->whereHas('allocations.invoice.purchaseOrder.purchaseRequest.department', function ($dq) use ($allowedCodes) {
                    $dq->whereIn('code', $allowedCodes);
                });
            });

        $totalPaid = (float) $paymentsQuery->sum('amount');
        $balance = round($openingBalance + $totalInvoiced - $totalPaid, 2);

        $openInvoicesCount = (clone $invoicesQuery)->whereIn('status', ['OPEN', 'PARTIALLY_PAID'])->count();
        $invoicesCount = (clone $invoicesQuery)->count();
        $paymentsCount = (clone $paymentsQuery)->count();

        return [
            'supplier_id' => $supplier->id,
            'company_name' => $supplier->company_name,
            'code' => $supplier->code ?? null,
            'email' => $supplier->email,
            'phone' => $supplier->phone,
            'opening_balance' => $openingBalance,
            'opening_balance_notes' => $isRestricted ? null : $supplier->opening_balance_notes,
            'total_invoiced' => $totalInvoiced,
            'total_paid' => $totalPaid,
            'balance' => $balance,
            'is_overpaid' => $balance < 0,
            'open_invoices_count' => $openInvoicesCount,
            'invoices_count' => $invoicesCount,
            'payments_count' => $paymentsCount,
        ];
    }

    private function refreshSupplierBalance(int $supplierId): SupplierBalance
    {
        $supplier = Supplier::find($supplierId);
        $openingBalance = (float) ($supplier?->opening_balance ?? 0);
        $totalInvoiced = (float) SupplierInvoice::where('supplier_id', $supplierId)
            ->where('status', '!=', 'DRAFT')
            ->sum('amount');
        $totalPaid = (float) SupplierPayment::where('supplier_id', $supplierId)->sum('amount');
        $balance = round($openingBalance + $totalInvoiced - $totalPaid, 2);

        return SupplierBalance::updateOrCreate(
            ['supplier_id' => $supplierId],
            [
                'opening_balance' => $openingBalance,
                'total_invoiced' => $totalInvoiced,
                'total_paid' => $totalPaid,
                'balance' => $balance,
                'last_activity_at' => now(),
            ]
        );
    }

    private function calculateReceiptValue(PurchaseReceipt $receipt): float
    {
        return round($receipt->items->sum(function ($receiptItem): float {
            return (float) $receiptItem->received_quantity * (float) ($receiptItem->purchaseOrderItem?->unit_price ?? 0);
        }), 2);
    }

    /**
     * Intelligently resolve the most relevant Cost Center for a supplier invoice.
     */
    public function resolveCostCenterForInvoice(SupplierInvoice $invoice): ?int
    {
        // 1. Direct attribute on invoice if present
        if (!empty($invoice->cost_center_id)) {
            return (int) $invoice->cost_center_id;
        }

        // 2. Check land allocations
        $firstAllocation = $invoice->landAllocations()->with('parcel')->first();
        if ($firstAllocation && $firstAllocation->parcel) {
            $parcel = $firstAllocation->parcel;
            $matched = CostCenter::where('is_active', true)
                ->where(function ($q) use ($parcel) {
                    $q->where('name', 'like', "%{$parcel->parcel_reference}%")
                      ->orWhere('name', 'like', "%{$parcel->region}%")
                      ->orWhere('code', 'like', "%{$parcel->parcel_reference}%");
                })->first();
            if ($matched) {
                return $matched->id;
            }
        }

        // 3. Check purchase order -> purchase request
        $pr = $invoice->purchaseOrder?->purchaseRequest;
        if ($pr) {
            if (!empty($pr->parcel_reference)) {
                $matched = CostCenter::where('is_active', true)
                    ->where(function ($q) use ($pr) {
                        $q->where('name', 'like', "%{$pr->parcel_reference}%")
                          ->orWhere('name', 'like', "%{$pr->region}%")
                          ->orWhere('code', 'like', "%{$pr->parcel_reference}%");
                    })->first();
                if ($matched) {
                    return $matched->id;
                }
            }
        }

        // 4. Default cost center code from config
        $defaultCode = config('accounting.default_cost_center_code', 'CC-101');
        $defaultCc = CostCenter::where('code', $defaultCode)->where('is_active', true)->first();
        if ($defaultCc) {
            return $defaultCc->id;
        }

        // 5. Any active cost center
        return CostCenter::where('is_active', true)->value('id');
    }

    /**
     * Automatically generate a balanced Journal Entry when a supplier invoice is matched/approved.
     */
    public function generateSupplierInvoiceJournalEntry(SupplierInvoice $invoice): ?JournalEntry
    {
        if ($invoice->journal_entry_id) {
            return JournalEntry::find($invoice->journal_entry_id);
        }

        $expenseCode = (string) config('accounting.material_expense_account_code', '511');
        $payableCode = (string) config('accounting.supplier_payable_account_code', '2111');

        $expenseAccount = Account::where('code', $expenseCode)->first();
        $payableAccount = Account::where('code', $payableCode)->first();

        // If GL accounts are not set up in current environment, gracefully skip
        if (!$expenseAccount || !$payableAccount) {
            Log::info("Journal entry skipped for supplier invoice {$invoice->invoice_number}: Accounts {$expenseCode} or {$payableCode} not found in chart of accounts.");
            return null;
        }

        $costCenterId = $this->resolveCostCenterForInvoice($invoice);

        $invoice->loadMissing(['supplier', 'purchaseOrder']);
        $supplierName = $invoice->supplier?->company_name ?? 'مورد';
        $poNumber = $invoice->purchaseOrder?->po_number ?? '';

        $desc = "فاتورة مشتريات مورد: {$supplierName} - رقم: {$invoice->invoice_number}";
        if ($poNumber) {
            $desc .= " (أمر شراء {$poNumber})";
        }

        $journalEntry = JournalEntry::create([
            'date' => $invoice->invoice_date ?: now()->toDateString(),
            'description' => $desc,
            'reference_number' => $invoice->invoice_number,
            'status' => 'POSTED',
        ]);

        // Debit: Material Expense Account (charged to Cost Center)
        JournalEntryLine::create([
            'journal_entry_id' => $journalEntry->id,
            'account_id' => $expenseAccount->id,
            'cost_center_id' => $costCenterId,
            'debit' => $invoice->amount,
            'credit' => 0,
            'description' => "تكلفة مواد وخامات - مورد: {$supplierName} - فاتورة: {$invoice->invoice_number}",
        ]);

        // Credit: Supplier Payable Account
        JournalEntryLine::create([
            'journal_entry_id' => $journalEntry->id,
            'account_id' => $payableAccount->id,
            'cost_center_id' => null,
            'debit' => 0,
            'credit' => $invoice->amount,
            'description' => "استحقاق فاتورة مورد - {$supplierName} - فاتورة: {$invoice->invoice_number}",
        ]);

        $invoice->update(['journal_entry_id' => $journalEntry->id]);

        return $journalEntry;
    }

    /**
     * Automatically generate a balanced Journal Entry when a supplier payment is recorded.
     */
    public function generateSupplierPaymentJournalEntry(SupplierPayment $payment): ?JournalEntry
    {
        if ($payment->journal_entry_id) {
            return JournalEntry::find($payment->journal_entry_id);
        }

        $payableCode = (string) config('accounting.supplier_payable_account_code', '2111');
        $bankCode    = (string) config('accounting.bank_account_code', '1112');
        $cashCode    = (string) config('accounting.treasury_cash_account_code', '1111');

        $isCash = strtoupper((string) $payment->payment_method) === 'CASH';
        $creditAccountCode = $isCash ? $cashCode : $bankCode;

        $payableAccount = Account::where('code', $payableCode)->first();
        $creditAccount  = Account::where('code', $creditAccountCode)->first();

        if (!$payableAccount || !$creditAccount) {
            Log::info("Journal entry skipped for payment {$payment->payment_number}: Accounts {$payableCode} or {$creditAccountCode} not found in chart of accounts.");
            return null;
        }

        $payment->loadMissing('supplier');
        $supplierName = $payment->supplier?->company_name ?? 'مورد';

        $methodLabel = match (strtoupper((string) $payment->payment_method)) {
            'CASH' => 'نقدي من الخزينة',
            'BANK_TRANSFER' => 'تحويل بنكي',
            'CHEQUE' => 'شيك مصرفي',
            default => (string) $payment->payment_method,
        };

        $desc = "سداد دفعة للمورد: {$supplierName} - رقم السند: {$payment->payment_number} ({$methodLabel})";

        $journalEntry = JournalEntry::create([
            'date' => $payment->payment_date ?: now()->toDateString(),
            'description' => $desc,
            'reference_number' => $payment->reference_number ?: $payment->payment_number,
            'status' => 'POSTED',
        ]);

        // Debit: Supplier Payable (reduce liability)
        JournalEntryLine::create([
            'journal_entry_id' => $journalEntry->id,
            'account_id' => $payableAccount->id,
            'cost_center_id' => null,
            'debit' => $payment->amount,
            'credit' => 0,
            'description' => "سداد مديونية للمورد: {$supplierName} - سند: {$payment->payment_number}",
        ]);

        // Credit: Bank or Cash Treasury (reduce asset cash)
        JournalEntryLine::create([
            'journal_entry_id' => $journalEntry->id,
            'account_id' => $creditAccount->id,
            'cost_center_id' => null,
            'debit' => 0,
            'credit' => $payment->amount,
            'description' => "صرف دفعة للمورد {$supplierName} ({$methodLabel})",
        ]);

        $payment->update(['journal_entry_id' => $journalEntry->id]);

        return $journalEntry;
    }
}
