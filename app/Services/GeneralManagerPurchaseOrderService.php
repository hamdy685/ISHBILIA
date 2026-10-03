<?php

namespace App\Services;

use App\Models\PurchaseOrder;
use App\Models\User;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

class GeneralManagerPurchaseOrderService
{
    public function getGmPurchaseOrders(int $perPage = 15, ?User $user = null)
    {
        $query = PurchaseOrder::with([
            'purchaseRequest.requester',
            'purchaseRequest.department',
            'supplier',
            'createdBy',
            'accountingReviewer',
            'items.item:id,name,sku',
        ])
            ->whereIn('status', ['ISSUED', 'APPROVED_BY_ACCOUNTING']);

        if ($user && $user->hasRole('execution_manager')) {
            $query->whereHas('purchaseRequest.requester', fn ($q) => $q->where('manager_id', $user->id));
        }

        return $query->orderBy('updated_at', 'desc')
            ->paginate($perPage);
    }

    public function getPoForGmView(int $id, ?User $user = null): PurchaseOrder
    {
        $po = PurchaseOrder::with([
            'purchaseRequest.requester',
            'purchaseRequest.department',
            'purchaseRequest.assignedReviewer',
            'purchaseRequest.approvalHistory.actor',
            'supplier',
            'createdBy',
            'accountingReviewer',
            'items.item',
            'approvalHistory.actor',
            'receipts.items.purchaseOrderItem',
            'receipts.warehouseKeeper',
            'receipts.siteEngineer',
            'receipts.receiver',
        ])->findOrFail($id);

        if ($user && $user->hasRole('execution_manager')) {
            if ((int) $po->purchaseRequest?->requester?->manager_id !== (int) $user->id) {
                throw new AccessDeniedHttpException('غير مصرح لك باستعراض أمر شراء لا يتبع موظفيك.');
            }
        }

        return $po;
    }
}
