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

            try {
                \Illuminate\Support\Facades\Artisan::call('migrate', ['--force' => true]);
                $info['artisan_migrate'] = trim(\Illuminate\Support\Facades\Artisan::output());
            } catch (Throwable $mEx) {
                $info['artisan_migrate_error'] = $mEx->getMessage();
            }

            $info['latest_migration'] = DB::table('migrations')->orderByDesc('id')->value('migration');
            $info['receipts_sample'] = DB::table('purchase_receipts')
                ->whereIn('id', [54, 56, 58, 59])
                ->select(['id', 'receipt_number', 'status', 'site_engineer_user_id', 'receiver_user_id'])
                ->get();
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
