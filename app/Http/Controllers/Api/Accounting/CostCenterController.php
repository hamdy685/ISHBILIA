<?php

namespace App\Http\Controllers\Api\Accounting;

use App\Http\Controllers\Controller;
use App\Models\Accounting\CostCenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CostCenterController extends Controller
{
    /**
     * Get active cost centers list with optional search and filters.
     *
     * @param Request $request
     * @return JsonResponse
     */
    public function index(Request $request): JsonResponse
    {
        $query = CostCenter::query();

        // Default to active cost centers only unless 'all' is explicitly requested
        if (!$request->boolean('all')) {
            $query->where('is_active', true);
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->query('search'));
            $query->where(function ($q) use ($search) {
                $q->where('code', 'like', "%{$search}%")
                    ->orWhere('name', 'like', "%{$search}%");
            });
        }

        $costCenters = $query->orderBy('code')->get();

        return response()->json([
            'data' => $costCenters,
            'count' => $costCenters->count(),
        ]);
    }

    /**
     * Display the specified cost center.
     */
    public function show(CostCenter $costCenter): JsonResponse
    {
        return response()->json([
            'data' => $costCenter,
        ]);
    }
}
