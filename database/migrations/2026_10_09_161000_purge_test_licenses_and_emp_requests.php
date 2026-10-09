<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Log;
use App\Models\PurchaseRequest;
use App\Models\PurchaseOrder;
use App\Models\PurchaseReceipt;
use App\Models\SupplierInvoice;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        try {
            // 1. Identify all target test purchase requests
            $targetPrs = PurchaseRequest::where(function ($q) {
                // By department
                $q->whereHas('department', function ($dq) {
                    $dq->where('code', 'LICENSES')->orWhere('name', 'like', '%تراخيص%');
                })
                ->orWhereHas('targetDepartment', function ($tdq) {
                    $tdq->where('code', 'LICENSES')->orWhere('name', 'like', '%تراخيص%');
                })
                // By requester
                ->orWhereHas('requester', function ($rq) {
                    $rq->where('email', 'like', '%emp%')
                       ->orWhere('name', 'like', '%emp%')
                       ->orWhere('name', 'like', '%صاصا%');
                })
                // Specific known test numbers if any
                ->orWhereIn('request_number', ['PR-7', 'PR-8', 'PR-9', 'PR-10', 'PR-11', 'PR-12', 'PR-13', 'PR-14', 'PR-15']);
            })
            // Safety guard: ensure we NEVER delete real project requests from other departments
            ->whereDoesntHave('department', function ($safeDept) {
                $safeDept->whereIn('code', ['EXECUTION', 'FINISHING', 'DEVELOPMENT', 'BUILDINGS']);
            })
            ->get();

            if ($targetPrs->isEmpty()) {
                return;
            }

            $prIds = $targetPrs->pluck('id')->all();
            $prNumbers = $targetPrs->pluck('request_number')->filter()->all();

            // 2. Identify linked Purchase Orders
            $poIds = PurchaseOrder::whereIn('purchase_request_id', $prIds)->pluck('id')->all();
            $poNumbers = PurchaseOrder::whereIn('id', $poIds)->pluck('po_number')->filter()->all();

            // 3. Identify linked Receipts
            $receiptIds = PurchaseReceipt::where(function ($rq) use ($prIds, $poIds) {
                if (! empty($poIds)) {
                    $rq->whereIn('purchase_order_id', $poIds);
                }
                if (! empty($prIds)) {
                    $rq->orWhereIn('purchase_request_id', $prIds);
                }
            })->pluck('id')->all();

            // 4. Identify linked Invoices
            $invoiceIds = [];
            if (Schema::hasTable('supplier_invoices')) {
                $invoiceIds = DB::table('supplier_invoices')
                    ->where(function ($iq) use ($poIds, $receiptIds) {
                        if (! empty($poIds)) {
                            $iq->whereIn('purchase_order_id', $poIds);
                        }
                        if (! empty($receiptIds)) {
                            $iq->orWhereIn('purchase_receipt_id', $receiptIds);
                        }
                    })
                    ->pluck('id')
                    ->all();
            }

            // Perform Cascade Purge inside transaction
            Schema::disableForeignKeyConstraints();

            DB::transaction(function () use ($prIds, $prNumbers, $poIds, $poNumbers, $receiptIds, $invoiceIds) {
                // A. Invoices & allocations
                if (! empty($invoiceIds)) {
                    if (Schema::hasTable('supplier_payment_allocations')) {
                        DB::table('supplier_payment_allocations')->whereIn('supplier_invoice_id', $invoiceIds)->delete();
                    }
                    if (Schema::hasTable('supplier_invoice_land_allocations')) {
                        DB::table('supplier_invoice_land_allocations')->whereIn('supplier_invoice_id', $invoiceIds)->delete();
                    }
                    if (Schema::hasTable('attachments')) {
                        DB::table('attachments')
                            ->where('attachable_type', SupplierInvoice::class)
                            ->whereIn('attachable_id', $invoiceIds)
                            ->delete();
                    }
                    DB::table('supplier_invoices')->whereIn('id', $invoiceIds)->delete();
                }

                // B. Receipts
                if (! empty($receiptIds)) {
                    if (Schema::hasTable('purchase_receipt_items')) {
                        DB::table('purchase_receipt_items')->whereIn('purchase_receipt_id', $receiptIds)->delete();
                    }
                    if (Schema::hasTable('attachments')) {
                        DB::table('attachments')
                            ->where('attachable_type', PurchaseReceipt::class)
                            ->whereIn('attachable_id', $receiptIds)
                            ->delete();
                    }
                    DB::table('purchase_receipts')->whereIn('id', $receiptIds)->delete();
                }

                // C. Purchase Orders
                if (! empty($poIds)) {
                    if (Schema::hasTable('purchase_order_items')) {
                        DB::table('purchase_order_items')->whereIn('purchase_order_id', $poIds)->delete();
                    }
                    if (Schema::hasTable('purchase_request_supplements')) {
                        DB::table('purchase_request_supplements')->whereIn('purchase_order_id', $poIds)->delete();
                    }
                    if (Schema::hasTable('approval_history')) {
                        DB::table('approval_history')
                            ->where('target_type', PurchaseOrder::class)
                            ->whereIn('target_id', $poIds)
                            ->delete();
                    }
                    if (Schema::hasTable('attachments')) {
                        DB::table('attachments')
                            ->where('attachable_type', PurchaseOrder::class)
                            ->whereIn('attachable_id', $poIds)
                            ->delete();
                    }
                    DB::table('purchase_orders')->whereIn('id', $poIds)->delete();
                }

                // D. Purchase Requests
                if (! empty($prIds)) {
                    if (Schema::hasTable('purchase_request_items')) {
                        DB::table('purchase_request_items')->whereIn('purchase_request_id', $prIds)->delete();
                    }
                    if (Schema::hasTable('purchase_request_supplements')) {
                        DB::table('purchase_request_supplements')->whereIn('purchase_request_id', $prIds)->delete();
                    }
                    if (Schema::hasTable('purchase_request_quotes')) {
                        DB::table('purchase_request_quotes')->whereIn('purchase_request_id', $prIds)->delete();
                    }
                    if (Schema::hasTable('approval_history')) {
                        DB::table('approval_history')
                            ->where('target_type', PurchaseRequest::class)
                            ->whereIn('target_id', $prIds)
                            ->delete();
                    }
                    if (Schema::hasTable('attachments')) {
                        DB::table('attachments')
                            ->where('attachable_type', PurchaseRequest::class)
                            ->whereIn('attachable_id', $prIds)
                            ->delete();
                    }
                    DB::table('purchase_requests')->whereIn('id', $prIds)->delete();
                }

                // E. Notifications
                if (Schema::hasTable('notifications')) {
                    $notifQuery = DB::table('notifications');
                    $notifQuery->where(function ($nq) use ($prIds, $poIds, $receiptIds, $prNumbers, $poNumbers) {
                        if (! empty($prIds)) {
                            $nq->where(function ($sub) use ($prIds) {
                                $sub->where('notifiable_type', PurchaseRequest::class)
                                    ->whereIn('notifiable_id', $prIds);
                            });
                        }
                        if (! empty($poIds)) {
                            $nq->orWhere(function ($sub) use ($poIds) {
                                $sub->where('notifiable_type', PurchaseOrder::class)
                                    ->whereIn('notifiable_id', $poIds);
                            })->orWhereIn('purchase_order_id', $poIds);
                        }
                        if (! empty($receiptIds)) {
                            $nq->orWhereIn('purchase_receipt_id', $receiptIds);
                        }
                        foreach ($prNumbers as $num) {
                            $nq->orWhere('title', 'like', "%{$num}%")
                               ->orWhere('message', 'like', "%{$num}%");
                        }
                        foreach ($poNumbers as $pnum) {
                            $nq->orWhere('title', 'like', "%{$pnum}%")
                               ->orWhere('message', 'like', "%{$pnum}%");
                        }
                    });
                    $notifQuery->delete();
                }

                // F. System Events
                if (Schema::hasTable('system_events')) {
                    DB::table('system_events')
                        ->where(function ($sq) use ($prIds, $poIds, $receiptIds) {
                            if (! empty($prIds)) {
                                $sq->where(function ($sub) use ($prIds) {
                                    $sub->where('entity_type', PurchaseRequest::class)
                                        ->whereIn('entity_id', $prIds);
                                });
                            }
                            if (! empty($poIds)) {
                                $sq->orWhere(function ($sub) use ($poIds) {
                                    $sub->where('entity_type', PurchaseOrder::class)
                                        ->whereIn('entity_id', $poIds);
                                });
                            }
                            if (! empty($receiptIds)) {
                                $sq->orWhere(function ($sub) use ($receiptIds) {
                                    $sub->where('entity_type', PurchaseReceipt::class)
                                        ->whereIn('entity_id', $receiptIds);
                                });
                            }
                        })
                        ->delete();
                }
            });

            Schema::enableForeignKeyConstraints();

            Log::info('Successfully purged test Licenses and emp requests from roots.', [
                'pr_ids' => $prIds,
                'po_ids' => $poIds,
            ]);
        } catch (\Throwable $e) {
            Schema::enableForeignKeyConstraints();
            Log::error('Purge test licenses migration error: ' . $e->getMessage());
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // No reversal for clean purge
    }
};
