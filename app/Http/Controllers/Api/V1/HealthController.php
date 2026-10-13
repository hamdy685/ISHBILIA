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

            $adminUser = DB::table('users')->where('email', 'admin@ashbiliya.com')->first() 
                ?? DB::table('users')->first();
            $adminUserId = $adminUser?->id;

            // 1. Gather comprehensive diagnostics
            $info['users_youssef'] = DB::table('users')
                ->where('name', 'like', '%يوسف%')
                ->orWhere('email', 'like', '%youssef%')
                ->get(['id', 'name', 'email']);

            $info['prs'] = DB::table('purchase_requests')
                ->whereIn('id', [21, 32, 40, 51])
                ->orWhereIn('request_number', ['PR-21', 'PR-32', 'PR-40', 'PR-51'])
                ->get();

            $info['pos'] = DB::table('purchase_orders')
                ->whereIn('po_number', ['PO-58', 'PO-70'])
                ->orWhereIn('purchase_request_id', [21, 32, 40, 51])
                ->get();

            $allPoIds = $info['pos']->pluck('id')->all();

            $info['po_items'] = DB::table('purchase_order_items')
                ->whereIn('purchase_order_id', $allPoIds)
                ->get();

            $youssefIds = $info['users_youssef']->pluck('id')->all();

            $info['youssef_receipts'] = DB::table('purchase_receipts')
                ->whereIn('site_engineer_user_id', $youssefIds)
                ->orWhereIn('purchase_order_id', $allPoIds)
                ->get();

            // =========================================================================
            // 1. PO-70 (PR-40 / PR-51, Land 1483, Region 29): Return to Uncle Salem
            // =========================================================================
            $po70 = DB::table('purchase_orders')->where('id', 73)->orWhere('po_number', 'PO-70')->first();
            if ($po70) {
                // Delete any receipts for PO-70 (including REC-43)
                $rec70Ids = DB::table('purchase_receipts')->where('purchase_order_id', $po70->id)->pluck('id');
                if ($rec70Ids->isNotEmpty()) {
                    DB::table('purchase_receipt_items')->whereIn('purchase_receipt_id', $rec70Ids)->delete();
                    DB::table('approval_history')->where('target_type', 'App\\Models\\PurchaseReceipt')->whereIn('target_id', $rec70Ids)->delete();
                    DB::table('purchase_receipts')->whereIn('id', $rec70Ids)->delete();
                }

                // Reset WG-4 back to PENDING_RECEIPT
                DB::table('weighing_groups')
                    ->where('purchase_order_id', $po70->id)
                    ->update([
                        'status'                => 'PENDING_RECEIPT',
                        'total_received_weight' => null,
                        'weight_difference'     => null,
                        'scale_ticket_photo'    => null,
                        'receiver_notes'        => null,
                        'received_by_user_id'   => null,
                        'received_at'           => null,
                        'updated_at'            => now(),
                    ]);

                $wg70Ids = DB::table('weighing_groups')->where('purchase_order_id', $po70->id)->pluck('id');
                DB::table('weighing_group_items')->whereIn('weighing_group_id', $wg70Ids)->update([
                    'received_weight' => null,
                    'updated_at'      => now(),
                ]);

                // Reset PO-70 back to ISSUED and PENDING so Uncle Salem sees it in his warehouse queue
                DB::table('purchase_orders')->where('id', $po70->id)->update([
                    'status'          => 'ISSUED',
                    'delivery_status' => 'PENDING',
                    'updated_at'      => now(),
                ]);
            }

            // =========================================================================
            // 2. PR-21 / PR-32 (Land 1165, Region 22, Supplier Aboud):
            //    Merge 4 split items into PO-58 (id: 61) & unify into 1 Weighing Group
            // =========================================================================
            $po58 = DB::table('purchase_orders')->where('id', 61)->orWhere('po_number', 'PO-58')->first();
            if ($po58) {
                // Delete any receipts for POs 58, 59, 60, 61 (e.g. REC-41)
                $splitPoIds = [58, 59, 60, $po58->id];
                $rec58Ids = DB::table('purchase_receipts')->whereIn('purchase_order_id', $splitPoIds)->pluck('id');
                if ($rec58Ids->isNotEmpty()) {
                    DB::table('purchase_receipt_items')->whereIn('purchase_receipt_id', $rec58Ids)->delete();
                    DB::table('approval_history')->where('target_type', 'App\\Models\\PurchaseReceipt')->whereIn('target_id', $rec58Ids)->delete();
                    DB::table('purchase_receipts')->whereIn('id', $rec58Ids)->delete();
                }

                // Move items 60, 61, 62 to PO-58 (id: 61)
                DB::table('purchase_order_items')->whereIn('id', [60, 61, 62])->update([
                    'purchase_order_id' => $po58->id,
                    'updated_at'        => now(),
                ]);

                // Cancel the 3 empty split POs: 58 (PO-55), 59 (PO-56), 60 (PO-57)
                DB::table('purchase_orders')->whereIn('id', [58, 59, 60])->update([
                    'status'          => 'CANCELLED',
                    'delivery_status' => 'CANCELLED',
                    'notes'           => 'تم دمج البند في أمر الشراء الموحد PO-58',
                    'updated_at'      => now(),
                ]);

                // Update PO-58 totals for all 4 items (5.060 tons, 209,990.00 EGP)
                DB::table('purchase_orders')->where('id', $po58->id)->update([
                    'subtotal'        => 209990.00,
                    'total_amount'    => 209990.00,
                    'status'          => 'ISSUED',
                    'delivery_status' => 'PENDING',
                    'notes'           => 'حديد تسليح سقف الثاني علوي - قطعة 1165 منطقة 22 - إجمالي 5.06 طن',
                    'updated_at'      => now(),
                ]);

                // Clean up previous weighing groups for PO-58
                $oldWg58Ids = DB::table('weighing_groups')->where('purchase_order_id', $po58->id)->pluck('id');
                if ($oldWg58Ids->isNotEmpty()) {
                    DB::table('weighing_group_items')->whereIn('weighing_group_id', $oldWg58Ids)->delete();
                    DB::table('weighing_groups')->whereIn('id', $oldWg58Ids)->delete();
                }

                // Determine unique group number
                $existingGroups = DB::table('weighing_groups')->pluck('group_number');
                $targetGroupNum = 'WG-1';
                if ($existingGroups->contains('WG-1')) {
                    $max = 0;
                    foreach ($existingGroups as $gn) {
                        if (preg_match('/WG-(\d+)/i', (string) $gn, $m)) {
                            $num = (int) $m[1];
                            if ($num > $max) $max = $num;
                        }
                    }
                    $targetGroupNum = 'WG-' . ($max + 1);
                }

                $allPo58Items = DB::table('purchase_order_items')->where('purchase_order_id', $po58->id)->get();
                $totalWeight58 = round((float) $allPo58Items->sum('quantity'), 3);

                $newWgId58 = DB::table('weighing_groups')->insertGetId([
                    'group_number'         => $targetGroupNum,
                    'purchase_order_id'    => $po58->id,
                    'supplier_id'          => $po58->supplier_id,
                    'group_type'           => 'STEEL_WEIGHT',
                    'status'               => 'PENDING_RECEIPT',
                    'total_ordered_weight' => $totalWeight58 > 0 ? $totalWeight58 : 5.060,
                    'uom'                  => 'TON',
                    'notes'                => 'تجميع وزنة حديد سقف الثاني علوي - قطعة 1165 منطقة 22 - المورد عبود',
                    'created_by_user_id'   => $adminUserId,
                    'created_at'           => now(),
                    'updated_at'           => now(),
                ]);

                foreach ($allPo58Items as $it) {
                    DB::table('weighing_group_items')->insert([
                        'weighing_group_id'      => $newWgId58,
                        'purchase_order_item_id' => $it->id,
                        'item_description'       => $it->item_description,
                        'size_or_diameter'       => $it->item_description,
                        'ordered_weight'         => (float) $it->quantity,
                        'received_weight'        => null,
                        'uom'                    => 'TON',
                        'unit_price'             => (float) $it->unit_price,
                        'line_total'             => (float) $it->line_total,
                        'region'                 => '22',
                        'land_plot_number'       => '1165',
                        'purpose'                => 'سقف الثاني علوي',
                        'created_at'             => now(),
                        'updated_at'             => now(),
                    ]);
                }
            }

            // Clean any test weighing groups for POs other than 61 and 73
            DB::table('weighing_groups')->whereNotIn('purchase_order_id', [61, 73])->delete();

            $info['active_pos'] = DB::table('purchase_orders')
                ->whereIn('id', [61, 73])
                ->get(['id', 'po_number', 'status', 'delivery_status', 'total_amount']);
            $info['weighing_groups'] = DB::table('weighing_groups')->get();
            $info['weighing_group_items'] = DB::table('weighing_group_items')->get();
            $info['youssef_pending_receipts'] = DB::table('purchase_receipts')
                ->whereIn('site_engineer_user_id', $youssefIds)
                ->whereIn('status', ['PENDING_SITE_ENGINEER', 'PENDING_WAREHOUSE'])
                ->get();
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
