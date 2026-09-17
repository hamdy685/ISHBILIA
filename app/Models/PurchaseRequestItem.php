<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Models\Concerns\RecordsSystemEvents;

class PurchaseRequestItem extends Model
{
    use HasFactory, RecordsSystemEvents;

    protected $table = 'purchase_request_items';

    protected $fillable = [
        'purchase_request_id',
        'item_id',
        'supplier_id',
        'item_description',
        'item_reference',
        'region',
        'quantity',
        'uom',
        'estimated_unit_price',
        'estimated_line_total',
        'is_supplementary',
        'supplement_id',
        'supplement_batch',
        'specifications',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'is_supplementary' => 'boolean',
            'supplement_batch' => 'integer',
            'quantity' => 'decimal:2',
            'estimated_unit_price' => 'decimal:2',
            'estimated_line_total' => 'decimal:2',
        ];
    }

    public function purchaseRequest(): BelongsTo
    {
        return $this->belongsTo(PurchaseRequest::class, 'purchase_request_id');
    }

    public function supplement(): BelongsTo
    {
        return $this->belongsTo(PurchaseRequestSupplement::class, 'supplement_id');
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class, 'item_id');
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class, 'supplier_id');
    }

    public function purchaseOrderItems(): HasMany
    {
        return $this->hasMany(PurchaseOrderItem::class, 'pr_item_id');
    }
}
