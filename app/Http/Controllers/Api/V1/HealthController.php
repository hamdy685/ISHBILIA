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
            $info['latest_migration'] = DB::table('migrations')->orderByDesc('id')->value('migration');

            // Purge duplicate POs (PO-75 to PO-78) and receipts (REC-32 to REC-35)
            $poIds = [78, 79, 80, 81];
            $receiptIds = [63, 64, 65, 66];
            $prId = 47;

            DB::table('notifications')
                ->where(function ($q) use ($poIds, $receiptIds) {
                    $q->whereIn('purchase_order_id', $poIds)
                      ->orWhereIn('purchase_receipt_id', $receiptIds)
                      ->orWhere('data', 'like', '%PO-75%')
                      ->orWhere('data', 'like', '%PO-76%')
                      ->orWhere('data', 'like', '%PO-77%')
                      ->orWhere('data', 'like', '%PO-78%')
                      ->orWhere('data', 'like', '%REC-32%')
                      ->orWhere('data', 'like', '%REC-33%')
                      ->orWhere('data', 'like', '%REC-34%')
                      ->orWhere('data', 'like', '%REC-35%');
                })
                ->delete();

            DB::table('approval_history')
                ->where(function ($q) use ($poIds, $receiptIds, $prId) {
                    $q->where(function ($sq) use ($receiptIds) {
                        $sq->where('target_type', 'App\Models\PurchaseReceipt')
                           ->whereIn('target_id', $receiptIds);
                    })->orWhere(function ($sq) use ($poIds) {
                        $sq->where('target_type', 'App\Models\PurchaseOrder')
                           ->whereIn('target_id', $poIds);
                    })->orWhere(function ($sq) use ($prId) {
                        $sq->where('target_type', 'App\Models\PurchaseRequest')
                           ->where('target_id', $prId);
                    });
                })
                ->delete();

            DB::table('purchase_receipt_items')->whereIn('purchase_receipt_id', $receiptIds)->delete();
            DB::table('purchase_receipts')->whereIn('id', $receiptIds)->delete();
            DB::table('purchase_order_items')->whereIn('purchase_order_id', $poIds)->delete();
            DB::table('purchase_orders')->whereIn('id', $poIds)->delete();
            DB::table('purchase_request_items')->where('purchase_request_id', $prId)->delete();
            DB::table('purchase_requests')->where('id', $prId)->delete();

            $info['purged_duplicate_pos'] = true;
            $info['remaining_pos_count'] = DB::table('purchase_orders')->whereIn('id', $poIds)->count();
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
