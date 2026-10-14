<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Models\Concerns\RecordsSystemEvents;

class WeighingGroup extends Model
{
    use HasFactory, RecordsSystemEvents;

    protected $table = 'weighing_groups';

    protected $fillable = [
        'group_number',
        'purchase_order_id',
        'supplier_id',
        'group_type',
        'status',
        'total_ordered_weight',
        'total_received_weight',
        'weight_difference',
        'uom',
        'unit_price',
        'total_amount',
        'scale_ticket_photo',
        'notes',
        'receiver_notes',
        'created_by_user_id',
        'received_by_user_id',
        'received_at',
    ];

    protected function casts(): array
    {
        return [
            'total_ordered_weight'  => 'decimal:3',
            'total_received_weight' => 'decimal:3',
            'weight_difference'     => 'decimal:3',
            'unit_price'            => 'decimal:2',
            'total_amount'          => 'decimal:2',
            'received_at'           => 'datetime',
        ];
    }

    public function purchaseOrder(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrder::class, 'purchase_order_id');
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class, 'supplier_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    public function receivedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'received_by_user_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(WeighingGroupItem::class, 'weighing_group_id');
    }

    public function receipts(): HasMany
    {
        return $this->hasMany(PurchaseReceipt::class, 'weighing_group_id');
    }
}
