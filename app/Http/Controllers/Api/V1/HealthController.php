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

            // Automatically run migrations if any are pending
            try {
                \Illuminate\Support\Facades\Artisan::call('migrate', ['--force' => true]);
                $info['migration_output'] = \Illuminate\Support\Facades\Artisan::output();
            } catch (Throwable $mE) {
                $info['migration_error'] = $mE->getMessage();
            }

            // 1. Search for Hatem user(s)
            $hatemUsers = DB::table('users')
                ->where('name', 'like', '%حاتم%')
                ->orWhere('name', 'like', '%hatem%')
                ->orWhere('email', 'like', '%hatem%')
                ->get();

            $info['hatem_candidates'] = $hatemUsers->map(function ($u) {
                $roles = DB::table('role_user')
                    ->join('roles', 'roles.id', '=', 'role_user.role_id')
                    ->where('role_user.user_id', $u->id)
                    ->get(['roles.id', 'roles.slug', 'roles.name']);

                $department = $u->department_id ? DB::table('departments')->where('id', $u->department_id)->first(['id', 'name', 'code']) : null;

                return [
                    'id' => $u->id,
                    'name' => $u->name,
                    'email' => $u->email,
                    'is_active' => (bool) $u->is_active,
                    'phone' => $u->phone ?? null,
                    'department' => $department,
                    'roles' => $roles,
                ];
            });

            // 2. Search Land Parcels
            $info['land_parcels'] = DB::table('land_parcels')
                ->whereIn('parcel_reference', ['1518', '1483'])
                ->get();

            // 3. Search PRs with parcel_reference 1518 or 1483 or items referencing them
            $prIds = DB::table('purchase_requests')
                ->whereIn('parcel_reference', ['1518', '1483'])
                ->pluck('id')
                ->merge(
                    DB::table('purchase_request_items')
                        ->whereIn('item_reference', ['1518', '1483'])
                        ->pluck('purchase_request_id')
                )->unique()->values();

            $info['purchase_requests'] = DB::table('purchase_requests')
                ->whereIn('id', $prIds)
                ->get(['id', 'request_number', 'parcel_reference', 'status', 'department_id', 'user_id', 'site_engineer_user_id', 'total_estimated_cost']);

            // 4. Search POs related to these PRs or directly with parcel_reference or items
            $poIds = DB::table('purchase_orders')
                ->whereIn('purchase_request_id', $prIds)
                ->orWhereIn('parcel_reference', ['1518', '1483'])
                ->pluck('id')
                ->merge(
                    DB::table('purchase_order_items')
                        ->whereIn('item_reference', ['1518', '1483'])
                        ->pluck('purchase_order_id')
                )
                ->merge(
                    DB::table('weighing_group_items')
                        ->whereIn('land_plot_number', ['1518', '1483'])
                        ->join('weighing_groups', 'weighing_groups.id', '=', 'weighing_group_items.weighing_group_id')
                        ->pluck('weighing_groups.purchase_order_id')
                )
                ->unique()
                ->values();

            $pos = DB::table('purchase_orders')
                ->whereIn('id', $poIds)
                ->get();

            $info['purchase_orders'] = $pos->map(function ($po) {
                $items = DB::table('purchase_order_items')->where('purchase_order_id', $po->id)->get();
                return [
                    'id' => $po->id,
                    'po_number' => $po->po_number,
                    'purchase_request_id' => $po->purchase_request_id,
                    'supplier_id' => $po->supplier_id,
                    'status' => $po->status,
                    'delivery_status' => $po->delivery_status,
                    'grand_total' => $po->grand_total,
                    'finalized_at' => $po->finalized_at,
                    'finalized_by_user_id' => $po->finalized_by_user_id,
                    'finalization_notes' => $po->finalization_notes,
                    'items' => $items,
                ];
            });

            // 5. Search Receipts related to these POs or PRs
            $receipts = DB::table('purchase_receipts')
                ->whereIn('purchase_order_id', $poIds)
                ->orWhereIn('purchase_request_id', $prIds)
                ->get();

            $info['purchase_receipts'] = $receipts->map(function ($r) {
                $items = DB::table('purchase_receipt_items')->where('purchase_receipt_id', $r->id)->get();
                $supplier = DB::table('suppliers')->where('id', $r->supplier_id)->first(['id', 'company_name']);
                return [
                    'id' => $r->id,
                    'receipt_number' => $r->receipt_number,
                    'purchase_order_id' => $r->purchase_order_id,
                    'purchase_request_id' => $r->purchase_request_id,
                    'supplier' => $supplier,
                    'status' => $r->status,
                    'receipt_type' => $r->receipt_type,
                    'site_engineer_user_id' => $r->site_engineer_user_id,
                    'receiver_user_id' => $r->receiver_user_id,
                    'actual_receiver_user_id' => $r->actual_receiver_user_id,
                    'warehouse_keeper_user_id' => $r->warehouse_keeper_user_id,
                    'received_at' => $r->received_at,
                    'site_engineer_approved_at' => $r->site_engineer_approved_at,
                    'site_engineer_notes' => $r->site_engineer_notes,
                    'accountant_recorded_at' => $r->accountant_recorded_at,
                    'accountant_recorded_by_user_id' => $r->accountant_recorded_by_user_id,
                    'accountant_recording_notes' => $r->accountant_recording_notes,
                    'items' => $items,
                ];
            });

            // 6. Search Weighing Groups
            $info['weighing_groups'] = DB::table('weighing_groups')
                ->whereIn('purchase_order_id', $poIds)
                ->get()
                ->map(function ($wg) {
                    $items = DB::table('weighing_group_items')->where('weighing_group_id', $wg->id)->get();
                    return [
                        'id' => $wg->id,
                        'group_number' => $wg->group_number,
                        'purchase_order_id' => $wg->purchase_order_id,
                        'status' => $wg->status,
                        'total_ordered_weight' => $wg->total_ordered_weight,
                        'items' => $items,
                    ];
                });

            // 7. Search Invoices
            $receiptIds = $receipts->pluck('id')->values();
            $info['supplier_invoices'] = DB::table('supplier_invoices')
                ->whereIn('purchase_receipt_id', $receiptIds)
                ->orWhereIn('purchase_order_id', $poIds)
                ->get();

        } catch (Throwable $e) {
            $dbConnected = false;
            $info['error'] = $e->getMessage() . ' on line ' . $e->getLine();
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
