<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PurchaseReceiptItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'purchase_receipt_id',
        'purchase_order_item_id',
        'ordered_quantity',
        'received_quantity',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'ordered_quantity' => 'decimal:4',
            'received_quantity' => 'decimal:4',
        ];
    }

    public function getOrderedQuantityAttribute($value): ?string
    {
        return $value !== null ? \App\Support\DecimalHelper::formatCleanDecimal($value, 4) : null;
    }

    public function getReceivedQuantityAttribute($value): ?string
    {
        return $value !== null ? \App\Support\DecimalHelper::formatCleanDecimal($value, 4) : null;
    }

    public function receipt(): BelongsTo
    {
        return $this->belongsTo(PurchaseReceipt::class, 'purchase_receipt_id');
    }

    public function purchaseOrderItem(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrderItem::class, 'purchase_order_item_id');
    }

    public function item(): \Illuminate\Database\Eloquent\Relations\HasOneThrough
    {
        return $this->hasOneThrough(
            Item::class,
            PurchaseOrderItem::class,
            'id',
            'id',
            'purchase_order_item_id',
            'item_id'
        );
    }
}
