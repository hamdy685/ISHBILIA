<?php

namespace App\Policies;

use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestItem;
use App\Models\User;

class PurchaseRequestItemPolicy
{
    /**
     * Active statuses in which procurement manager / procurement team can manage items.
     */
    public const PROCUREMENT_ACTIVE_STATUSES = [
        'PENDING_PROCUREMENT_APPROVAL',
        'PENDING_QUOTE_RECOMMENDATIONS',
        'APPROVED_BY_ACCOUNTING',
    ];

    /**
     * Determine whether the user has a procurement role.
     */
    protected function isProcurementRole(User $user): bool
    {
        return $user->hasRole('procurement') || $user->hasRole('procurement_manager');
    }

    /**
     * Determine whether the user can create an item on the given purchase request.
     */
    public function create(User $user, PurchaseRequest $request): bool
    {
        if ($user->hasRole('admin')) {
            return true;
        }

        // 1. Procurement role in active procurement statuses
        if ($this->isProcurementRole($user) && in_array($request->status, self::PROCUREMENT_ACTIVE_STATUSES, true)) {
            return true;
        }

        // 2. Requester in DRAFT status
        if ((int) $user->id === (int) $request->user_id && $request->status === 'DRAFT') {
            return true;
        }

        // 3. Department reviewer during review
        if ((int) $user->id === (int) $request->reviewer_user_id && in_array($request->status, ['SUBMITTED', 'UNDER_REVIEW'], true)) {
            return true;
        }

        return false;
    }

    /**
     * Determine whether the user can update the given purchase request item.
     */
    public function update(User $user, PurchaseRequestItem $item): bool
    {
        if ($user->hasRole('admin')) {
            return true;
        }

        $request = $item->relationLoaded('purchaseRequest')
            ? $item->purchaseRequest
            : PurchaseRequest::find($item->purchase_request_id);

        if (! $request) {
            return false;
        }

        // 1. Procurement role in active procurement statuses
        if ($this->isProcurementRole($user) && in_array($request->status, self::PROCUREMENT_ACTIVE_STATUSES, true)) {
            return true;
        }

        // 2. Requester in DRAFT status
        if ((int) $user->id === (int) $request->user_id && $request->status === 'DRAFT') {
            return true;
        }

        // 3. Department reviewer during review
        if ((int) $user->id === (int) $request->reviewer_user_id && in_array($request->status, ['SUBMITTED', 'UNDER_REVIEW'], true)) {
            return true;
        }

        return false;
    }

    /**
     * Determine whether the user can delete the given purchase request item.
     */
    public function delete(User $user, PurchaseRequestItem $item): bool
    {
        return $this->update($user, $item);
    }
}
