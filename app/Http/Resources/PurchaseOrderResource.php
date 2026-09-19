<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PurchaseOrderResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'po_number' => $this->po_number,
            'purchase_request_id' => $this->purchase_request_id,
            'selected_quote_id' => $this->selected_quote_id,
            'selected_quote' => $this->whenLoaded('selectedQuote', function () {
                return $this->selectedQuote ? [
                    'id' => $this->selectedQuote->id,
                    'supplier_id' => $this->selectedQuote->supplier_id,
                    'unit_price' => number_format((float) $this->selectedQuote->unit_price, 2, '.', ''),
                    'total_amount' => number_format((float) $this->selectedQuote->total_amount, 2, '.', ''),
                    'currency' => $this->selectedQuote->currency,
                    'status' => $this->selectedQuote->status,
                ] : null;
            }),
            'purchase_request' => new PurchaseRequestResource($this->whenLoaded('purchaseRequest')),
            'requested_by' => $this->when($this->relationLoaded('purchaseRequest') && $this->purchaseRequest?->relationLoaded('requester'), function () {
                return $this->purchaseRequest?->requester ? [
                    'id' => $this->purchaseRequest->requester->id,
                    'name' => $this->purchaseRequest->requester->name,
                    'email' => $this->purchaseRequest->requester->email,
                ] : null;
            }),
            'executive_approver' => $this->when($this->relationLoaded('purchaseRequest'), function () {
                $entry = $this->purchaseRequest?->relationLoaded('approvalHistory')
                    ? $this->purchaseRequest->approvalHistory->first(fn ($item) => in_array($item->action, ['APPROVED_BY_EXECUTIVE', 'EXECUTIVE_SELECTED_QUOTE'], true))
                    : null;
                return $entry?->actor ? ['id' => $entry->actor->id, 'name' => $entry->actor->name, 'email' => $entry->actor->email] : null;
            }),
            'department_approver' => $this->when($this->relationLoaded('purchaseRequest'), function () {
                $approvedEntry = $this->purchaseRequest?->relationLoaded('approvalHistory')
                    ? $this->purchaseRequest->approvalHistory->firstWhere('action', 'APPROVED_BY_REVIEWER')
                    : null;
                $approver = $approvedEntry?->actor
                    ?? ($this->purchaseRequest?->relationLoaded('assignedReviewer') ? $this->purchaseRequest->assignedReviewer : null);

                return $approver ? [
                    'id' => $approver->id,
                    'name' => $approver->name,
                    'email' => $approver->email,
                ] : null;
            }),
            'department' => $this->when($this->relationLoaded('purchaseRequest') && $this->purchaseRequest?->relationLoaded('department'), function () {
                return $this->purchaseRequest?->department ? [
                    'id' => $this->purchaseRequest->department->id,
                    'name' => $this->purchaseRequest->department->name,
                    'code' => $this->purchaseRequest->department->code,
                ] : null;
            }),
            'supplier_id' => $this->supplier_id,
            'supplier' => new SupplierResource($this->whenLoaded('supplier')),
            'created_by' => $this->whenLoaded('createdBy', function () {
                return [
                    'id' => $this->createdBy->id,
                    'name' => $this->createdBy->name,
                    'email' => $this->createdBy->email,
                ];
            }),
            'status'       => $this->status,
            'currency'     => 'EGP',
            'subtotal'     => number_format((float) $this->subtotal,    2, '.', ''),
            'grand_total'  => number_format((float) $this->grand_total, 2, '.', ''),
            'payment_terms'    => $this->payment_terms,
            'delivery_terms' => $this->delivery_terms,
            'delivery_date' => $this->delivery_date ? $this->delivery_date->format('Y-m-d') : null,
            'delivery_status' => $this->delivery_status ?? 'NOT_STARTED',
            'actual_delivery_date' => $this->actual_delivery_date ? $this->actual_delivery_date->format('Y-m-d') : null,
            'delivery_notes' => $this->delivery_notes,
            'budget_code' => $this->budget_code,
            'financial_notes' => $this->financial_notes,
            'notes' => $this->notes,
            'rejection_reason' => $this->rejection_reason,
            'created_at' => $this->created_at ? $this->created_at->toIso8601String() : null,
            'updated_at' => $this->updated_at ? $this->updated_at->toIso8601String() : null,
            'items' => PurchaseOrderItemResource::collection($this->whenLoaded('items')),
            'receipts' => $this->whenLoaded('receipts', function () {
                return $this->receipts->map(function ($receipt) {
                    return [
                        'id' => $receipt->id,
                        'receipt_number' => $receipt->receipt_number,
                        'receipt_type' => $receipt->receipt_type,
                        'status' => $receipt->status,
                        'received_at' => $receipt->received_at ? $receipt->received_at->format('Y-m-d') : null,
                        'warehouse_submitted_at' => $receipt->warehouse_submitted_at ? $receipt->warehouse_submitted_at->toIso8601String() : null,
                        'site_engineer_approved_at' => $receipt->site_engineer_approved_at ? $receipt->site_engineer_approved_at->toIso8601String() : null,
                        'warehouse_notes' => $receipt->warehouse_notes,
                        'site_engineer_notes' => $receipt->site_engineer_notes,
                        'receiver_notes' => $receipt->receiver_notes,
                        'photo_url' => $receipt->photo_url,
                        'photo_name' => $receipt->photo_name,
                        'warehouse_keeper' => $receipt->relationLoaded('warehouseKeeper') && $receipt->warehouseKeeper ? [
                            'id' => $receipt->warehouseKeeper->id,
                            'name' => $receipt->warehouseKeeper->name,
                        ] : null,
                        'site_engineer' => $receipt->relationLoaded('siteEngineer') && $receipt->siteEngineer ? [
                            'id' => $receipt->siteEngineer->id,
                            'name' => $receipt->siteEngineer->name,
                        ] : null,
                        'receiver' => $receipt->relationLoaded('receiver') && $receipt->receiver ? [
                            'id' => $receipt->receiver->id,
                            'name' => $receipt->receiver->name,
                        ] : null,
                        'items' => $receipt->relationLoaded('items') ? $receipt->items->map(function ($item) {
                            return [
                                'id' => $item->id,
                                'purchase_order_item_id' => $item->purchase_order_item_id,
                                'ordered_quantity' => (string) $item->ordered_quantity,
                                'received_quantity' => (string) $item->received_quantity,
                                'notes' => $item->notes,
                                'purchase_order_item' => $item->relationLoaded('purchaseOrderItem') && $item->purchaseOrderItem ? [
                                    'id' => $item->purchaseOrderItem->id,
                                    'item_description' => $item->purchaseOrderItem->item_description,
                                    'item_name' => $item->purchaseOrderItem->item_name,
                                    'uom' => $item->purchaseOrderItem->uom,
                                    'unit_price' => (string) $item->purchaseOrderItem->unit_price,
                                    'is_supplementary' => (bool) $item->purchaseOrderItem->is_supplementary,
                                    'supplement_batch' => $item->purchaseOrderItem->supplement_batch ? (int) $item->purchaseOrderItem->supplement_batch : null,
                                ] : null,
                            ];
                        }) : [],
                    ];
                });
            }),
        ];
    }
}
