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

            try {
                \Illuminate\Support\Facades\Artisan::call('migrate', ['--force' => true]);
                $info['migrate_output'] = \Illuminate\Support\Facades\Artisan::output();
            } catch (\Throwable $mErr) {
                $info['migrate_error'] = $mErr->getMessage();
            }

            $info['last_migration'] = DB::table('migrations')->orderBy('id', 'desc')->value('migration');
            $info['weighing_groups'] = DB::table('weighing_groups')->get(['id', 'group_number', 'purchase_order_id', 'status', 'total_ordered_weight']);
            $info['youssef'] = DB::table('users')->where('name', 'like', '%يوسف%')->get(['id', 'name', 'email']);
            $info['po_by_number_58'] = DB::table('purchase_orders')->where('po_number', 'PO-58')->orWhere('po_number', 'like', '%58%')->get(['id', 'po_number', 'purchase_request_id', 'status', 'delivery_status']);
            $info['po_by_number_70'] = DB::table('purchase_orders')->where('po_number', 'PO-70')->orWhere('po_number', 'like', '%70%')->get(['id', 'po_number', 'purchase_request_id', 'status', 'delivery_status']);
            $info['po_by_pr_51'] = DB::table('purchase_orders')->where('purchase_request_id', 51)->get(['id', 'po_number', 'purchase_request_id', 'status', 'delivery_status']);
            $info['po_by_pr_40'] = DB::table('purchase_orders')->where('purchase_request_id', 40)->get(['id', 'po_number', 'purchase_request_id', 'status', 'delivery_status']);
        } catch (Throwable $e) {
            $dbConnected = false;
            $info['error'] = $e->getMessage();
        }

        $httpStatus = $dbConnected ? 200 : 503;

        return response()->json([
            'status' => $dbConnected ? 'ok' : 'degraded',
            'system' => 'Al-Ashbiliya Procurement Management System API',
            'version' => 'v1',
            'timestamp' => now()->toIso8601String(),
            'database' => [
                'status' => $dbConnected ? 'connected' : 'disconnected',
            ],
            'diagnostics' => $info,
        ], $httpStatus);
    }
}
