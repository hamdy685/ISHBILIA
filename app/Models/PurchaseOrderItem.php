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
        'supplier_id',
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

    protected $appends = [
        'pr_item_quantity',
    ];

    public function getPrItemQuantityAttribute(): ?float
    {
        if ($this->relationLoaded('prItem') && $this->prItem) {
            return (float) $this->prItem->quantity;
        }
        return null;
    }

    protected static function booted(): void
    {
        static::saving(function (PurchaseOrderItem $item): void {
            if ($item->quantity !== null && $item->unit_price !== null) {
                $item->line_total = round((float) $item->quantity * (float) $item->unit_price, 2);
            }
        });
    }

    public function getFinalQuantityAttribute(): float
    {
        return (float) ($this->quantity ?? 0);
    }

    public function getFinalUnitPriceAttribute(): float
    {
        return (float) ($this->unit_price ?? 0);
    }

    public function getFinalLineTotalAttribute(): float
    {
        if ($this->line_total !== null && (float) $this->line_total > 0) {
            return (float) $this->line_total;
        }

        return round($this->final_quantity * $this->final_unit_price, 2);
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

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class, 'supplier_id');
    }

    public function receiptItems(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(PurchaseReceiptItem::class, 'purchase_order_item_id');
    }

    public function getActualQuantityAttribute(): float
    {
        if ($this->relationLoaded('receiptItems')) {
            $approved = $this->receiptItems->filter(fn ($ri) => $ri->receipt && in_array($ri->receipt->status, ['APPROVED', 'PENDING_SITE_ENGINEER', 'DELIVERED'], true));
            if ($approved->isNotEmpty() && (float) $approved->sum('received_quantity') > 0) {
                return (float) $approved->sum('received_quantity');
            }
        } elseif ($this->relationLoaded('purchaseOrder') && $this->purchaseOrder?->relationLoaded('receipts')) {
            $approvedSum = 0.0;
            $found = false;
            foreach ($this->purchaseOrder->receipts as $receipt) {
                if (in_array($receipt->status, ['APPROVED', 'PENDING_SITE_ENGINEER', 'DELIVERED'], true) && $receipt->relationLoaded('items')) {
                    $ri = $receipt->items->firstWhere('purchase_order_item_id', $this->id);
                    if ($ri && (float) $ri->received_quantity > 0) {
                        $approvedSum += (float) $ri->received_quantity;
                        $found = true;
                    }
                }
            }
            if ($found && $approvedSum > 0) {
                return $approvedSum;
            }
        } elseif ($this->exists) {
            $approvedSum = (float) \App\Models\PurchaseReceiptItem::query()
                ->where('purchase_order_item_id', $this->id)
                ->whereHas('receipt', fn ($q) => $q->whereIn('status', ['APPROVED', 'PENDING_SITE_ENGINEER', 'DELIVERED']))
                ->sum('received_quantity');
            if ($approvedSum > 0) {
                return $approvedSum;
            }
        }

        return (float) ($this->quantity ?? 0);
    }

    public function getActualLineTotalAttribute(): float
    {
        return round($this->actual_quantity * (float) ($this->unit_price ?? 0), 2);
    }
}

