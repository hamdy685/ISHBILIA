<?php

namespace App\Http\Controllers\Api\Accounting;

use App\Http\Controllers\Controller;
use App\Models\Accounting\Account;
use App\Models\Accounting\JournalEntry;
use App\Models\Accounting\JournalEntryLine;
use App\Models\Accounting\PettyCashSettlement;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PettyCashSettlementController extends Controller
{
    /**
     * Display a listing of petty cash settlements.
     */
    public function index(Request $request): JsonResponse
    {
        $query = PettyCashSettlement::with(['costCenter', 'journalEntry.lines.account']);

        if ($request->filled('status')) {
            $query->where('status', $request->query('status'));
        }

        if ($request->filled('cost_center_id')) {
            $query->where('cost_center_id', $request->integer('cost_center_id'));
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->query('search'));
            $query->where(function ($q) use ($search) {
                $q->where('employee_name', 'like', "%{$search}%")
                    ->orWhere('settlement_number', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%");
            });
        }

        $settlements = $query->orderByDesc('date')->orderByDesc('id')->get();

        return response()->json([
            'data' => $settlements,
            'count' => $settlements->count(),
        ]);
    }

    /**
     * Store a newly created petty cash settlement in storage.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'cost_center_id' => ['required', 'exists:cost_centers,id'],
            'employee_name' => ['required', 'string', 'max:255'],
            'settlement_number' => ['required', 'string', 'max:100', 'unique:accounting_petty_cash_settlements,settlement_number'],
            'date' => ['required', 'date'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'description' => ['nullable', 'string', 'max:3000'],
            'status' => ['nullable', 'in:DRAFT,PENDING_APPROVAL'],
        ]);

        $settlement = PettyCashSettlement::create([
            'cost_center_id' => $validated['cost_center_id'],
            'employee_name' => $validated['employee_name'],
            'settlement_number' => $validated['settlement_number'],
            'date' => $validated['date'],
            'amount' => $validated['amount'],
            'description' => $validated['description'] ?? null,
            'status' => $validated['status'] ?? 'DRAFT',
        ]);

        return response()->json([
            'data' => $settlement->load('costCenter'),
            'message' => 'تم تسجيل تسوية العهدة بنجاح.',
        ], 201);
    }

    /**
     * Display the specified petty cash settlement.
     */
    public function show(PettyCashSettlement $pettyCashSettlement): JsonResponse
    {
        return response()->json([
            'data' => $pettyCashSettlement->load(['costCenter', 'journalEntry.lines.account']),
        ]);
    }

    /**
     * Update the specified petty cash settlement in storage.
     */
    public function update(Request $request, PettyCashSettlement $pettyCashSettlement): JsonResponse
    {
        if ($pettyCashSettlement->status === 'APPROVED') {
            return response()->json([
                'message' => 'لا يمكن تعديل بيانات تسوية العهدة بعد اعتمادها.',
            ], 422);
        }

        $validated = $request->validate([
            'cost_center_id' => ['sometimes', 'required', 'exists:cost_centers,id'],
            'employee_name' => ['sometimes', 'required', 'string', 'max:255'],
            'settlement_number' => ['sometimes', 'required', 'string', 'max:100', 'unique:accounting_petty_cash_settlements,settlement_number,' . $pettyCashSettlement->id],
            'date' => ['sometimes', 'required', 'date'],
            'amount' => ['sometimes', 'required', 'numeric', 'gt:0'],
            'description' => ['nullable', 'string', 'max:3000'],
            'status' => ['sometimes', 'in:DRAFT,PENDING_APPROVAL'],
        ]);

        $pettyCashSettlement->update($validated);

        return response()->json([
            'data' => $pettyCashSettlement->load('costCenter'),
            'message' => 'تم تحديث بيانات تسوية العهدة بنجاح.',
        ]);
    }

    /**
     * Remove the specified petty cash settlement from storage.
     */
    public function destroy(PettyCashSettlement $pettyCashSettlement): JsonResponse
    {
        if ($pettyCashSettlement->status !== 'DRAFT') {
            return response()->json([
                'message' => 'يمكن حذف تسويات العهد في حالة المسودة (DRAFT) فقط.',
            ], 422);
        }

        $pettyCashSettlement->delete();

        return response()->json([
            'message' => 'تم حذف تسوية العهدة بنجاح.',
        ]);
    }

    /**
     * Approve the petty cash settlement and automatically generate a balanced Journal Entry.
     */
    public function approve(Request $request, PettyCashSettlement $pettyCashSettlement): JsonResponse
    {
        if ($pettyCashSettlement->status === 'APPROVED') {
            return response()->json([
                'message' => 'تسوية العهدة معتمدة بالفعل.',
            ], 422);
        }

        // Retrieve dynamic account codes from config/accounting.php
        $expenseCode = (string) config('accounting.petty_cash_expense_account_code', '513');
        $assetCode = (string) config('accounting.petty_cash_asset_account_code', '112');

        $expenseAccount = Account::where('code', $expenseCode)->first();
        $assetAccount = Account::where('code', $assetCode)->first();

        // Graceful Error Handling: return 422 Unprocessable Entity if accounts are missing
        if (!$expenseAccount || !$assetAccount) {
            return response()->json([
                'message' => 'تعذر إنشاء القيد: حساب مصروفات العهد أو حساب صندوق العهدة غير معرف في شجرة الحسابات. يرجى مراجعة الإعدادات المالية.',
                'missing_details' => [
                    'expense_code' => $expenseCode,
                    'expense_account_found' => (bool) $expenseAccount,
                    'asset_code' => $assetCode,
                    'asset_account_found' => (bool) $assetAccount,
                ],
            ], 422);
        }

        DB::transaction(function () use ($pettyCashSettlement, $expenseAccount, $assetAccount) {
            // 1. Create balanced Journal Entry with reference_number
            $descriptionText = "تسوية عهدة ومصروفات نثرية: {$pettyCashSettlement->employee_name} - رقم: {$pettyCashSettlement->settlement_number}";
            if ($pettyCashSettlement->description) {
                $descriptionText .= " - " . $pettyCashSettlement->description;
            }

            $journalEntry = JournalEntry::create([
                'date' => $pettyCashSettlement->date,
                'description' => $descriptionText,
                'reference_number' => $pettyCashSettlement->settlement_number,
                'status' => 'POSTED',
            ]);

            // 2. Debit Line: Project Operating / Petty Cash Expense with Cost Center
            JournalEntryLine::create([
                'journal_entry_id' => $journalEntry->id,
                'account_id' => $expenseAccount->id,
                'cost_center_id' => $pettyCashSettlement->cost_center_id,
                'debit' => $pettyCashSettlement->amount,
                'credit' => 0,
                'description' => "مصروفات نثرية وتشغيلية - عهدة {$pettyCashSettlement->employee_name}",
            ]);

            // 3. Credit Line: Custody Asset / Petty Cash Box
            JournalEntryLine::create([
                'journal_entry_id' => $journalEntry->id,
                'account_id' => $assetAccount->id,
                'cost_center_id' => null,
                'debit' => 0,
                'credit' => $pettyCashSettlement->amount,
                'description' => "تخفيض عهدة الموظف {$pettyCashSettlement->employee_name}",
            ]);

            // 4. Update settlement status and link journal entry
            $pettyCashSettlement->update([
                'status' => 'APPROVED',
                'journal_entry_id' => $journalEntry->id,
            ]);
        });

        return response()->json([
            'data' => $pettyCashSettlement->fresh(['costCenter', 'journalEntry.lines.account']),
            'message' => 'تم اعتماد تسوية العهدة بنجاح وإنشاء قيد اليومية الآلي.',
        ]);
    }
}
