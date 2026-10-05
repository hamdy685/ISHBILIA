<?php

use App\Models\ApprovalHistory;
use App\Models\PurchaseOrder;
use App\Models\PurchaseRequest;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        $orders = PurchaseOrder::with(['purchaseRequest', 'receipts'])
            ->whereNotIn('status', ['REJECTED', 'CANCELLED', 'VOIDED'])
            ->get();

        foreach ($orders as $po) {
            $pr = $po->purchaseRequest;
            if (! $pr) {
                continue;
            }

            // If PR is rejected or cancelled, keep it as is
            if (in_array($pr->status, ['REJECTED', 'CANCELLED'], true)) {
                continue;
            }

            $hasApprovedReceipt = $po->receipts->contains(fn ($r) => $r->status === 'APPROVED');
            $isActualPo = (bool) (
                $po->finalized_at !== null ||
                $po->status === 'FINAL_APPROVED' ||
                ($hasApprovedReceipt && in_array($po->status, ['APPROVED_BY_ACCOUNTING', 'FINAL_APPROVED'], true))
            );

            // Update PR status to ISSUED
            if ($pr->status !== 'ISSUED') {
                $pr->update(['status' => 'ISSUED']);
            }

            // Backfill approval history if missing
            $hasPoHistory = ApprovalHistory::where('target_type', PurchaseRequest::class)
                ->where('target_id', $pr->id)
                ->whereIn('action', ['PO_ISSUED', 'ACTUAL_PO_ISSUED', 'PO_APPROVED_BY_ACCOUNTING'])
                ->exists();

            if (! $hasPoHistory) {
                if ($isActualPo) {
                    ApprovalHistory::create([
                        'target_type'   => PurchaseRequest::class,
                        'target_id'     => $pr->id,
                        'actor_user_id' => $po->finalized_by_user_id ?? $po->created_by_user_id ?? $pr->user_id,
                        'action'        => 'ACTUAL_PO_ISSUED',
                        'from_state'    => 'APPROVED_BY_ACCOUNTING',
                        'to_state'      => 'ISSUED',
                        'comments'      => 'تم اعتماد أمر الشراء الفعلي رقم ' . $po->po_number,
                    ]);
                } else {
                    ApprovalHistory::create([
                        'target_type'   => PurchaseRequest::class,
                        'target_id'     => $pr->id,
                        'actor_user_id' => $po->created_by_user_id ?? $pr->user_id,
                        'action'        => 'PO_ISSUED',
                        'from_state'    => 'APPROVED_BY_ACCOUNTING',
                        'to_state'      => 'ISSUED',
                        'comments'      => 'تم إصدار أمر الشراء رقم ' . $po->po_number . ' للمورد.',
                    ]);
                }
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // No destructive reversal needed
    }
};
