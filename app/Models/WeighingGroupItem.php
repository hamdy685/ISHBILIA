<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Models\Concerns\RecordsSystemEvents;

class WeighingGroupItem extends Model
{
    use HasFactory, RecordsSystemEvents;

    protected $table = 'weighing_group_items';

    protected $fillable = [
        'weighing_group_id',
        'purchase_order_item_id',
        'item_description',
        'size_or_diameter',
        'ordered_weight',
        'received_weight',
        'uom',
        'unit_price',
        'line_total',
        'region',
        'land_plot_number',
        'purpose',
    ];

    protected function casts(): array
    {
        return [
            'ordered_weight'  => 'decimal:4',
            'received_weight' => 'decimal:4',
            'unit_price'      => 'decimal:4',
            'line_total'      => 'decimal:2',
        ];
    }

    public function getOrderedWeightAttribute($value): ?string
    {
        return $value !== null ? \App\Support\DecimalHelper::formatCleanDecimal($value, 4) : null;
    }

    public function getReceivedWeightAttribute($value): ?string
    {
        return $value !== null ? \App\Support\DecimalHelper::formatCleanDecimal($value, 4) : null;
    }

    public function getUnitPriceAttribute($value): ?string
    {
        return $value !== null ? \App\Support\DecimalHelper::formatCleanDecimal($value, 4) : null;
    }

    public function weighingGroup(): BelongsTo
    {
        return $this->belongsTo(WeighingGroup::class, 'weighing_group_id');
    }

    public function purchaseOrderItem(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrderItem::class, 'purchase_order_item_id');
    }
}
