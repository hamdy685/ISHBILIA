<?php

namespace App\Http\Resources;

use App\Models\PurchaseOrder;
use App\Models\PurchaseRequest;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class NotificationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $data = [
            'id' => $this->notifiable_id,
        ];

        if ($this->notifiable_type === PurchaseRequest::class) {
            $data['purchase_request_id'] = $this->notifiable_id;
            $pr = $this->relationLoaded('notifiable') ? $this->notifiable : PurchaseRequest::find($this->notifiable_id);
            if ($pr) {
                $firstItem = $pr->relationLoaded('items') ? $pr->items->first() : $pr->items()->first();
                $data['parcel_reference'] = $pr->parcel_reference ?: ($firstItem?->item_reference ?: null);
                $data['region'] = $pr->region ?: ($firstItem?->region ?: null);
                $data['item_description'] = $firstItem?->item_description ?: ($firstItem?->item?->name ?: null);
                $data['quantity'] = $firstItem ? (float) $firstItem->quantity . ($firstItem->uom ? ' ' . $firstItem->uom : '') : null;
            }
        } elseif ($this->notifiable_type === PurchaseOrder::class) {
            $data['purchase_order_id'] = $this->notifiable_id;
            $po = $this->relationLoaded('notifiable') ? $this->notifiable : PurchaseOrder::find($this->notifiable_id);
            if ($po) {
                $pr = $po->purchaseRequest;
                $firstItem = $po->relationLoaded('items') ? $po->items->first() : $po->items()->first();
                $data['parcel_reference'] = $pr?->parcel_reference ?: ($firstItem?->item_reference ?: null);
                $data['region'] = $pr?->region ?: ($firstItem?->region ?: null);
                $data['item_description'] = $firstItem?->item_description ?: ($firstItem?->item?->name ?: null);
                $data['quantity'] = $firstItem ? (float) $firstItem->quantity . ($firstItem->uom ? ' ' . $firstItem->uom : '') : null;
            }
        }

        if ($this->purchase_order_id) {
            $data['purchase_order_id'] = $this->purchase_order_id;
        }
        if ($this->purchase_receipt_id) {
            $data['purchase_receipt_id'] = $this->purchase_receipt_id;
        }

        $user = $request->user() ?: ($this->relationLoaded('user') ? $this->user : \App\Models\User::find($this->user_id));
        $targetUrl = null;

        if ($user) {
            $user->loadMissing('roles');
            $role = $user->roles->first()?->slug;

            if ($role === 'accountant') {
                if (str_contains($this->type, 'quote')) {
                    $targetUrl = "/accounting/purchase-quotes?open={$this->notifiable_id}";
                } elseif (in_array($this->type, ['purchase_order_and_receipt_ready_accounting', 'purchase_order_and_receipt_approved_info'], true) || $this->purchase_receipt_id || $this->notifiable_type === PurchaseOrder::class || $this->purchase_order_id) {
                    $poId = $this->purchase_order_id ?: ($this->notifiable_type === PurchaseOrder::class ? $this->notifiable_id : null);
                    if ($poId) {
                        $targetUrl = "/accounting/purchase-orders/{$poId}" . ($this->purchase_receipt_id ? "?receipt_id={$this->purchase_receipt_id}" : '');
                    } else {
                        $targetUrl = '/accounting/purchase-orders';
                    }
                } elseif ($this->notifiable_type === PurchaseRequest::class) {
                    $targetUrl = "/accounting/purchase-requests?open={$this->notifiable_id}";
                }
            } elseif (in_array($role, ['general_accountant', 'site_accountant', 'licenses_accountant', 'buffet_accountant'], true)) {
                if ($this->purchase_receipt_id) {
                    $targetUrl = "/accounting/supplier-payments?purchase_receipt_id={$this->purchase_receipt_id}&action=create_invoice";
                } elseif ($this->type === 'purchase_order_and_receipt_ready_accounting' || $this->notifiable_type === PurchaseOrder::class || $this->purchase_order_id) {
                    $poId = $this->purchase_order_id ?: ($this->notifiable_type === PurchaseOrder::class ? $this->notifiable_id : null);
                    if ($poId) {
                        $targetUrl = "/accounting/purchase-orders/{$poId}";
                    } else {
                        $targetUrl = "/accounting/supplier-payments";
                    }
                } elseif ($this->notifiable_type === PurchaseRequest::class) {
                    $targetUrl = "/requests/{$this->notifiable_id}";
                } else {
                    $targetUrl = "/accounting/supplier-finance";
                }
            } elseif ($role === 'general_manager' || $role === 'execution_manager') {
                if (str_contains($this->type, 'quote')) {
                    $targetUrl = "/general-manager/purchase-quotes?open={$this->notifiable_id}";
                } elseif ($this->notifiable_type === PurchaseOrder::class || $this->purchase_order_id) {
                    $poId = $this->notifiable_type === PurchaseOrder::class ? $this->notifiable_id : $this->purchase_order_id;
                    $targetUrl = "/general-manager/purchase-orders/{$poId}";
                } elseif ($this->notifiable_type === PurchaseRequest::class) {
                    $targetUrl = "/general-manager/purchase-requests?open={$this->notifiable_id}";
                }
            } elseif ($role === 'procurement_manager') {
                if (str_contains($this->type, 'quote_decision') || $this->type === 'purchase_quote_decision_complete') {
                    $targetUrl = "/procurement/purchase-orders/create?pr={$this->notifiable_id}";
                } elseif ($this->type === 'purchase_request_pending_procurement') {
                    $targetUrl = "/procurement/purchase-requests";
                } elseif ($this->type === 'grn_approved_pending_actual_po') {
                    $poId = $this->purchase_order_id ?: ($this->notifiable_type === PurchaseOrder::class ? $this->notifiable_id : null);
                    $targetUrl = $poId ? "/procurement/purchase-orders/{$poId}/edit" : "/procurement?tab=actual-pos";
                } elseif ($this->notifiable_type === PurchaseOrder::class || $this->purchase_order_id) {
                    $poId = $this->notifiable_type === PurchaseOrder::class ? $this->notifiable_id : $this->purchase_order_id;
                    $targetUrl = "/procurement/purchase-orders/{$poId}";
                } elseif ($this->notifiable_type === PurchaseRequest::class) {
                    $targetUrl = "/procurement/purchase-orders/create?pr={$this->notifiable_id}";
                }
            } elseif ($role === 'reviewer') {
                if (str_contains($this->type, 'quote')) {
                    $targetUrl = "/reviewer/purchase-quotes?open={$this->notifiable_id}";
                } elseif ($this->notifiable_type === PurchaseRequest::class && $this->notifiable_id) {
                    $targetUrl = "/reviewer/requests/{$this->notifiable_id}/review";
                }
            } elseif ($role === 'warehouse_keeper') {
                $targetUrl = $this->purchase_receipt_id
                    ? "/warehouse?receipt_id={$this->purchase_receipt_id}"
                    : '/warehouse';
            } elseif ($role === 'site_engineer') {
                $targetUrl = $this->purchase_receipt_id
                    ? "/site-engineer?receipt_id={$this->purchase_receipt_id}"
                    : '/site-engineer';
            }
        }

        // Fallback default target URL if still null
        if (! $targetUrl) {
            if ($this->notifiable_type === PurchaseRequest::class && $this->notifiable_id) {
                $targetUrl = "/requests/{$this->notifiable_id}";
            } elseif ($this->purchase_receipt_id) {
                $targetUrl = "/site-engineer?receipt_id={$this->purchase_receipt_id}";
            } elseif ($this->notifiable_type === PurchaseOrder::class && $this->notifiable_id) {
                $targetUrl = "/requests";
            }
        }

        return [
            'id' => $this->id,
            'type' => $this->type,
            'title' => $this->title,
            'message' => $this->message,
            'notifiable_type' => $this->notifiable_type,
            'notifiable_id' => $this->notifiable_id,
            'purchase_order_id' => $this->purchase_order_id,
            'purchase_receipt_id' => $this->purchase_receipt_id,
            'data' => $data,
            'target_url' => $targetUrl,
            'action_url' => $targetUrl,
            'read_at' => $this->read_at ? $this->read_at->toIso8601String() : null,
            'created_at' => $this->created_at ? $this->created_at->toIso8601String() : null,
        ];
    }
}
