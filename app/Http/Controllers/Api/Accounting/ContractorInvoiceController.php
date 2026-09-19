<?php

namespace App\Http\Controllers\Api\Accounting;

use App\Http\Controllers\Controller;
use App\Models\Accounting\Account;
use App\Models\Accounting\ContractorInvoice;
use App\Models\Accounting\JournalEntry;
use App\Models\Accounting\JournalEntryLine;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ContractorInvoiceController extends Controller
{
    /**
     * Display a listing of contractor invoices.
     */
    public function index(Request $request): JsonResponse
    {
        $query = ContractorInvoice::with(['costCenter', 'journalEntry.lines.account']);

        if ($request->filled('status')) {
            $query->where('status', $request->query('status'));
        }

        if ($request->filled('cost_center_id')) {
            $query->where('cost_center_id', $request->integer('cost_center_id'));
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->query('search'));
            $query->where(function ($q) use ($search) {
                $q->where('contractor_name', 'like', "%{$search}%")
                    ->orWhere('invoice_number', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%");
            });
        }

        $invoices = $query->orderByDesc('date')->orderByDesc('id')->get();

        return response()->json([
            'data' => $invoices,
            'count' => $invoices->count(),
        ]);
    }

    /**
     * Store a newly created contractor invoice in storage.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'cost_center_id' => ['required', 'exists:cost_centers,id'],
            'contractor_name' => ['required', 'string', 'max:255'],
            'invoice_number' => ['required', 'string', 'max:100', 'unique:accounting_contractor_invoices,invoice_number'],
            'date' => ['required', 'date'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'description' => ['nullable', 'string', 'max:3000'],
            'status' => ['nullable', 'in:DRAFT,PENDING_APPROVAL'],
        ]);

        $invoice = ContractorInvoice::create([
            'cost_center_id' => $validated['cost_center_id'],
            'contractor_name' => $validated['contractor_name'],
            'invoice_number' => $validated['invoice_number'],
            'date' => $validated['date'],
            'amount' => $validated['amount'],
            'description' => $validated['description'] ?? null,
            'status' => $validated['status'] ?? 'DRAFT',
        ]);

        return response()->json([
            'data' => $invoice->load('costCenter'),
            'message' => 'تم إنشاء مستخلص المقاول بنجاح.',
        ], 201);
    }

    /**
     * Display the specified contractor invoice.
     */
    public function show(ContractorInvoice $contractorInvoice): JsonResponse
    {
        return response()->json([
            'data' => $contractorInvoice->load(['costCenter', 'journalEntry.lines.account']),
        ]);
    }

    /**
     * Update the specified contractor invoice in storage.
     */
    public function update(Request $request, ContractorInvoice $contractorInvoice): JsonResponse
    {
        if (in_array($contractorInvoice->status, ['APPROVED', 'PAID'], true)) {
            return response()->json([
                'message' => 'لا يمكن تعديل بيانات المستخلص بعد اعتماده أو سداده.',
            ], 422);
        }

        $validated = $request->validate([
            'cost_center_id' => ['sometimes', 'required', 'exists:cost_centers,id'],
            'contractor_name' => ['sometimes', 'required', 'string', 'max:255'],
            'invoice_number' => ['sometimes', 'required', 'string', 'max:100', 'unique:accounting_contractor_invoices,invoice_number,' . $contractorInvoice->id],
            'date' => ['sometimes', 'required', 'date'],
            'amount' => ['sometimes', 'required', 'numeric', 'gt:0'],
            'description' => ['nullable', 'string', 'max:3000'],
            'status' => ['sometimes', 'in:DRAFT,PENDING_APPROVAL'],
        ]);

        $contractorInvoice->update($validated);

        return response()->json([
            'data' => $contractorInvoice->load('costCenter'),
            'message' => 'تم تحديث بيانات المستخلص بنجاح.',
        ]);
    }

    /**
     * Remove the specified contractor invoice from storage.
     */
    public function destroy(ContractorInvoice $contractorInvoice): JsonResponse
    {
        if ($contractorInvoice->status !== 'DRAFT') {
            return response()->json([
                'message' => 'يمكن حذف المستخلصات في حالة المسودة (DRAFT) فقط.',
            ], 422);
        }

        $contractorInvoice->delete();

        return response()->json([
            'message' => 'تم حذف مستخلص المقاول بنجاح.',
        ]);
    }

    /**
     * Approve the contractor invoice and automatically generate a balanced Journal Entry.
     */
    public function approve(Request $request, ContractorInvoice $contractorInvoice): JsonResponse
    {
        if (in_array($contractorInvoice->status, ['APPROVED', 'PAID'], true)) {
            return response()->json([
                'message' => 'المستخلص معتمد بالفعل.',
            ], 422);
        }

        // Retrieve dynamic account codes from config/accounting.php
        $expenseCode = (string) config('accounting.contractor_expense_account_code', '512');
        $payableCode = (string) config('accounting.contractor_payable_account_code', '2113');

        $expenseAccount = Account::where('code', $expenseCode)->first();
        $payableAccount = Account::where('code', $payableCode)->first();

        // Graceful Error Handling: return 422 Unprocessable Entity if accounts are missing
        if (!$expenseAccount || !$payableAccount) {
            return response()->json([
                'message' => 'تعذر إنشاء القيد: حساب مصروفات المقاولين أو حساب دائنو المقاولين غير معرف في شجرة الحسابات. يرجى مراجعة الإعدادات المالية.',
                'missing_details' => [
                    'expense_code' => $expenseCode,
                    'expense_account_found' => (bool) $expenseAccount,
                    'payable_code' => $payableCode,
                    'payable_account_found' => (bool) $payableAccount,
                ],
            ], 422);
        }

        DB::transaction(function () use ($contractorInvoice, $expenseAccount, $payableAccount) {
            // 1. Create balanced Journal Entry with reference_number
            $descriptionText = "مستخلص مقاول: {$contractorInvoice->contractor_name} - رقم: {$contractorInvoice->invoice_number}";
            if ($contractorInvoice->description) {
                $descriptionText .= " - " . $contractorInvoice->description;
            }

            $journalEntry = JournalEntry::create([
                'date' => $contractorInvoice->date,
                'description' => $descriptionText,
                'reference_number' => $contractorInvoice->invoice_number,
                'status' => 'POSTED',
            ]);

            // 2. Debit Line: Project Operating Cost with Cost Center
            JournalEntryLine::create([
                'journal_entry_id' => $journalEntry->id,
                'account_id' => $expenseAccount->id,
                'cost_center_id' => $contractorInvoice->cost_center_id,
                'debit' => $contractorInvoice->amount,
                'credit' => 0,
                'description' => "تكلفة أعمال ومصنعيات - {$contractorInvoice->contractor_name}",
            ]);

            // 3. Credit Line: Contractors Payable
            JournalEntryLine::create([
                'journal_entry_id' => $journalEntry->id,
                'account_id' => $payableAccount->id,
                'cost_center_id' => null,
                'debit' => 0,
                'credit' => $contractorInvoice->amount,
                'description' => "استحقاق مستخلص مقاول - {$contractorInvoice->contractor_name}",
            ]);

            // 4. Update contractor invoice status and link journal entry
            $contractorInvoice->update([
                'status' => 'APPROVED',
                'journal_entry_id' => $journalEntry->id,
            ]);
        });

        return response()->json([
            'data' => $contractorInvoice->fresh(['costCenter', 'journalEntry.lines.account']),
            'message' => 'تم اعتماد المستخلص بنجاح وإنشاء قيد اليومية الآلي.',
        ]);
    }
}
