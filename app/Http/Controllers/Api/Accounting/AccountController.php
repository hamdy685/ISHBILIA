<?php

namespace App\Http\Controllers\Api\Accounting;

use App\Http\Controllers\Controller;
use App\Models\Accounting\Account;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AccountController extends Controller
{
    /**
     * Get chart of accounts tree structure or filtered list.
     *
     * @param Request $request
     * @return JsonResponse
     */
    public function index(Request $request): JsonResponse
    {
        $type = $request->query('type');
        $search = trim((string) $request->query('search'));
        $asFlat = $request->boolean('flat');

        // If client requests a flat list or searching across all levels
        if ($asFlat) {
            $query = Account::query();

            if (!empty($type) && $type !== 'all') {
                $query->where('type', $type);
            }

            if (!empty($search)) {
                $query->where(function ($q) use ($search) {
                    $q->where('code', 'like', "%{$search}%")
                        ->orWhere('name', 'like', "%{$search}%");
                });
            }

            $accounts = $query->orderBy('code')->get();

            return response()->json([
                'data' => $accounts,
                'count' => $accounts->count(),
            ]);
        }

        // Default: Hierarchical tree view (Root accounts with recursive sub-accounts)
        $query = Account::whereNull('parent_id')
            ->with([
                'children' => function ($q) {
                    $q->orderBy('code')->with([
                        'children' => function ($q2) {
                            $q2->orderBy('code')->with([
                                'children' => function ($q3) {
                                    $q3->orderBy('code');
                                },
                            ]);
                        },
                    ]);
                },
            ])
            ->orderBy('code');

        if (!empty($type) && $type !== 'all') {
            $query->where('type', $type);
        }

        $accounts = $query->get();

        return response()->json([
            'data' => $accounts,
            'count' => $accounts->count(),
        ]);
    }

    /**
     * Display the specified account.
     */
    public function show(Account $account): JsonResponse
    {
        $account->load(['parent', 'children' => function ($q) {
            $q->orderBy('code');
        }]);

        return response()->json([
            'data' => $account,
        ]);
    }
}
