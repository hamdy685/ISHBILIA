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
            $info['last_migration'] = DB::table('migrations')->orderBy('id', 'desc')->value('migration');
            $info['weighing_groups'] = DB::table('weighing_groups')->get(['id', 'group_number', 'purchase_order_id', 'status', 'total_ordered_weight']);
            $po58 = DB::table('purchase_orders')->where('po_number', 'like', '%58%')->orWhere('id', 58)->first(['id', 'po_number', 'status', 'delivery_status']);
            $po70 = DB::table('purchase_orders')->where('po_number', 'like', '%70%')->orWhere('id', 70)->first(['id', 'po_number', 'status', 'delivery_status']);
            $info['po58'] = $po58;
            $info['po70'] = $po70;
            $info['receipts_po58'] = DB::table('purchase_receipts')->where('purchase_order_id', $po58?->id ?? 58)->get(['id', 'receipt_number', 'purchase_order_id', 'status', 'site_engineer_user_id']);
            $info['receipts_po70'] = DB::table('purchase_receipts')->where('purchase_order_id', $po70?->id ?? 70)->get(['id', 'receipt_number', 'purchase_order_id', 'status', 'site_engineer_user_id']);
            $info['pending_receipts_all'] = DB::table('purchase_receipts')->where('status', 'PENDING_SITE_ENGINEER')->get(['id', 'receipt_number', 'purchase_order_id', 'status', 'site_engineer_user_id']);
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
