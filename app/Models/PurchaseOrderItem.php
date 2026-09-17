<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Models\Concerns\RecordsSystemEvents;

class PurchaseOrderItem extends Model
{
    use HasFactory, RecordsSystemEvents;

    protected $table = 'purchase_order_items';

    protected $fillable = [
        'purchase_order_id',
        'pr_item_id',
        'item_id',
        'item_description',
        'item_reference',
        'region',
        'quantity',
        'uom',
        'unit_price',
        'line_total',
        'is_supplementary',
        'supplement_batch',
        'specifications',
    ];

    protected function casts(): array
    {
        return [
            'is_supplementary' => 'boolean',
            'supplement_batch' => 'integer',
            'quantity' => 'decimal:2',
            'unit_price' => 'decimal:2',
            'line_total' => 'decimal:2',
        ];
    }

    public function purchaseOrder(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrder::class, 'purchase_order_id');
    }

    public function prItem(): BelongsTo
    {
        return $this->belongsTo(PurchaseRequestItem::class, 'pr_item_id');
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class, 'item_id');
    }
}
