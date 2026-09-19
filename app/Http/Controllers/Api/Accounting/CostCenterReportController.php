<?php

namespace App\Http\Controllers\Api\Accounting;

use App\Http\Controllers\Controller;
use App\Models\Accounting\CostCenter;
use App\Models\Accounting\JournalEntryLine;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CostCenterReportController extends Controller
{
    /**
     * Get summary of project / cost center actual costs.
     */
    public function summary(Request $request): JsonResponse
    {
        // Aggregated costs subquery for speed and strict-mode safety
        $costAggregates = DB::table('journal_entry_lines')
            ->join('journal_entries', 'journal_entry_lines.journal_entry_id', '=', 'journal_entries.id')
            ->join('accounts', 'journal_entry_lines.account_id', '=', 'accounts.id')
            ->where('accounts.type', 'expense')
            ->where('journal_entries.status', 'POSTED')
            ->whereNotNull('journal_entry_lines.cost_center_id')
            ->select('journal_entry_lines.cost_center_id')
            ->selectRaw('COALESCE(SUM(journal_entry_lines.debit - journal_entry_lines.credit), 0) as total_cost')
            ->selectRaw('COUNT(journal_entry_lines.id) as movements_count')
            ->groupBy('journal_entry_lines.cost_center_id');

        $query = CostCenter::query()
            ->where('is_active', true)
            ->leftJoinSub($costAggregates, 'cost_aggregates', function ($join) {
                $join->on('cost_centers.id', '=', 'cost_aggregates.cost_center_id');
            })
            ->select('cost_centers.id', 'cost_centers.code', 'cost_centers.name', 'cost_centers.is_active')
            ->selectRaw('CAST(COALESCE(cost_aggregates.total_cost, 0) AS DECIMAL(15,2)) as total_cost')
            ->selectRaw('CAST(COALESCE(cost_aggregates.movements_count, 0) AS UNSIGNED) as movements_count');

        if ($request->filled('search')) {
            $search = trim((string) $request->query('search'));
            $query->where(function ($q) use ($search) {
                $q->where('cost_centers.code', 'like', "%{$search}%")
                    ->orWhere('cost_centers.name', 'like', "%{$search}%");
            });
        }

        $costCenters = $query->orderByDesc('total_cost')
            ->orderBy('cost_centers.code')
            ->get();

        $costCentersData = $costCenters->map(function ($cc) {
            return [
                'id' => (int) $cc->id,
                'code' => $cc->code,
                'name' => $cc->name,
                'is_active' => (bool) $cc->is_active,
                'total_cost' => (float) $cc->total_cost,
                'movements_count' => (int) $cc->movements_count,
            ];
        });

        $totalExpenditure = (float) $costCentersData->sum('total_cost');
        $activeProjectsCount = $costCentersData->count();
        $averageCost = $activeProjectsCount > 0 ? round($totalExpenditure / $activeProjectsCount, 2) : 0;
        $highestProject = $costCentersData->first();

        return response()->json([
            'success' => true,
            'data' => [
                'summary' => [
                    'total_projects' => $activeProjectsCount,
                    'total_expenditure' => $totalExpenditure,
                    'average_project_cost' => $averageCost,
                    'highest_project' => $highestProject && $highestProject['total_cost'] > 0 ? [
                        'id' => $highestProject['id'],
                        'code' => $highestProject['code'],
                        'name' => $highestProject['name'],
                        'total_cost' => $highestProject['total_cost'],
                    ] : null,
                ],
                'cost_centers' => $costCentersData,
            ],
        ]);
    }

    /**
     * Get detailed statement of movements for a specific cost center.
     */
    public function statement(Request $request, $id): JsonResponse
    {
        $costCenter = CostCenter::findOrFail($id);

        $query = JournalEntryLine::query()
            ->where('cost_center_id', $costCenter->id)
            ->whereHas('journalEntry', function ($q) {
                $q->where('status', 'POSTED');
            })
            ->with([
                'account:id,code,name,type',
                'journalEntry:id,date,reference_number,description,status',
            ]);

        if ($request->filled('from_date')) {
            $query->whereHas('journalEntry', function ($q) use ($request) {
                $q->whereDate('date', '>=', $request->query('from_date'));
            });
        }

        if ($request->filled('to_date')) {
            $query->whereHas('journalEntry', function ($q) use ($request) {
                $q->whereDate('date', '<=', $request->query('to_date'));
            });
        }

        // Join for consistent date and id ordering
        $lines = $query
            ->join('journal_entries', 'journal_entry_lines.journal_entry_id', '=', 'journal_entries.id')
            ->select('journal_entry_lines.*')
            ->orderByDesc('journal_entries.date')
            ->orderByDesc('journal_entry_lines.id')
            ->get();

        $movements = $lines->map(function ($line) {
            $debit = (float) $line->debit;
            $credit = (float) $line->credit;
            return [
                'id' => (int) $line->id,
                'journal_entry_id' => (int) $line->journal_entry_id,
                'date' => $line->journalEntry?->date ? $line->journalEntry->date->format('Y-m-d') : null,
                'reference_number' => $line->journalEntry?->reference_number,
                'entry_description' => $line->journalEntry?->description,
                'line_description' => $line->description ?: $line->journalEntry?->description,
                'account_id' => (int) $line->account_id,
                'account_code' => $line->account?->code,
                'account_name' => $line->account?->name,
                'account_type' => $line->account?->type,
                'debit' => $debit,
                'credit' => $credit,
                'net_amount' => round($debit - $credit, 2),
            ];
        });

        $totalDebit = (float) $movements->sum('debit');
        $totalCredit = (float) $movements->sum('credit');
        $netCost = round($totalDebit - $totalCredit, 2);

        return response()->json([
            'success' => true,
            'data' => [
                'cost_center' => [
                    'id' => (int) $costCenter->id,
                    'code' => $costCenter->code,
                    'name' => $costCenter->name,
                    'is_active' => (bool) $costCenter->is_active,
                ],
                'totals' => [
                    'total_debit' => $totalDebit,
                    'total_credit' => $totalCredit,
                    'net_cost' => $netCost,
                    'movements_count' => $movements->count(),
                ],
                'movements' => $movements,
            ],
        ]);
    }
}
