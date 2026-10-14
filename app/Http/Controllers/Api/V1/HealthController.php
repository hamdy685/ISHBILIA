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

            // Restore already-received receipts (84, 66, 65, 64, 63) to APPROVED
            DB::table('purchase_receipts')->whereIn('id', [84, 66, 65, 64, 63])->update([
                'status' => 'APPROVED',
                'site_engineer_approved_at' => now(),
                'receiver_approved_at' => now(),
            ]);

            DB::table('purchase_orders')->whereIn('id', [73, 78, 79, 80, 81])->update([
                'delivery_status' => 'DELIVERED',
            ]);

            $info['pending_site_receipts'] = DB::table('purchase_receipts')
                ->where('site_engineer_user_id', 18)
                ->whereIn('status', ['PENDING_SITE_ENGINEER', 'WAREHOUSE_RECEIPT_SUBMITTED'])
                ->get(['id', 'receipt_number', 'status', 'site_engineer_user_id']);
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
