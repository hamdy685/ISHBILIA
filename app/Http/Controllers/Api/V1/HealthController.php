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
            $info['steel_groups'] = DB::table('weighing_groups')
                ->select(['id', 'group_number', 'purchase_order_id', 'status', 'total_ordered_weight', 'unit_price', 'total_amount'])
                ->get();
            $info['orders_sample'] = DB::table('purchase_orders')
                ->where('po_number', 'like', '%PO-99%')
                ->orWhere('po_number', 'like', '%PO-100%')
                ->orWhere('po_number', 'like', '%PO-105%')
                ->orWhere('po_number', 'like', '%PO-106%')
                ->orWhereIn('id', [99, 100, 105, 106])
                ->select(['id', 'po_number', 'status', 'grand_total'])
                ->get();
            if (file_exists(storage_path('logs/laravel.log'))) {
                $lines = @file(storage_path('logs/laravel.log'));
                if (is_array($lines)) {
                    $info['latest_log'] = array_slice($lines, -30);
                }
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
