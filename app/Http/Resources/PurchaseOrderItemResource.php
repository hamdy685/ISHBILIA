<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PurchaseOrderItemResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'               => $this->id,
            'purchase_order_id'=> $this->purchase_order_id,
            'pr_item_id'       => $this->pr_item_id,
            'item_id'          => $this->item_id,
            'item_name'        => $this->relationLoaded('item') ? ($this->item?->name ?? $this->item_description) : $this->item_description,
            'item'             => $this->whenLoaded('item', function () {
                return [
                    'id'   => $this->item->id,
                    'name' => $this->item->name,
                    'sku'  => $this->item->sku,
                ];
            }),
            'item_description' => $this->item_description,
            'item_reference'   => $this->item_reference,
            'region'           => $this->region,
            'quantity'         => number_format((float) $this->quantity,   2, '.', ''),
            'uom'              => $this->uom,
            'pr_item_quantity' => $this->whenLoaded('prItem', function () {
                return $this->prItem ? number_format((float) $this->prItem->quantity, 2, '.', '') : null;
            }, function () {
                return $this->pr_item_id && $this->relationLoaded('prItem') && $this->prItem ? number_format((float) $this->prItem->quantity, 2, '.', '') : null;
            }),
            'unit_price'       => number_format((float) $this->unit_price,  2, '.', ''),
            'line_total'       => number_format((float) $this->line_total,  2, '.', ''),
            'specifications'   => $this->specifications,
            'is_supplementary' => (bool) $this->is_supplementary,
            'supplement_batch' => $this->supplement_batch ? (int) $this->supplement_batch : null,
        ];
    }
}
