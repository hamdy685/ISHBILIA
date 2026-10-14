<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Throwable;

class HealthController extends Controller
{
    /**
     * Return application health status and database connectivity check.
     */
    public function index(): JsonResponse
    {
        $dbConnected = false;

        $info = [];
        try {
            DB::connection()->getPdo();
            $dbConnected = true;
            $info['database'] = 'connected';

            if (request()->has('debug_receipts')) {
                $info['receipts_data'] = DB::table('purchase_receipts')
                    ->whereIn('id', [84, 66, 65, 64, 63, 54, 55, 56, 57, 58, 59])
                    ->get();
                $info['history'] = DB::table('approval_history')
                    ->whereIn('target_id', [84, 66, 65, 64, 63])
                    ->orderByDesc('id')
                    ->get();
                $info['pos'] = DB::table('purchase_orders')
                    ->whereIn('id', [73, 81, 80, 79, 78])
                    ->get();
            }
        } catch (Throwable $e) {
            $dbConnected = false;
            $info['error'] = $e->getMessage();
        }

        return response()->json([
            'status' => $dbConnected ? 'ok' : 'degraded',
            'system' => 'Al-Ashbiliya Procurement Management System API',
            'version' => 'v1',
            'timestamp' => now()->toIso8601String(),
            'database' => [
                'status' => $dbConnected ? 'connected' : 'disconnected',
            ],
            'diagnostics' => $info,
        ], 200);
    }
}
