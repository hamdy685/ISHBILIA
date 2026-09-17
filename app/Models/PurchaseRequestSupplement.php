<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Models\Concerns\RecordsSystemEvents;

class PurchaseRequestSupplement extends Model
{
    use HasFactory, RecordsSystemEvents;

    protected $table = 'purchase_request_supplements';

    protected $fillable = [
        'purchase_request_id',
        'batch_number',
        'requested_by_user_id',
        'reviewer_user_id',
        'reviewed_at',
        'procurement_user_id',
        'procurement_processed_at',
        'purchase_order_id',
        'supplier_id',
        'status',
        'notes',
        'rejection_reason',
    ];

    protected function casts(): array
    {
        return [
            'batch_number' => 'integer',
            'reviewed_at' => 'datetime',
            'procurement_processed_at' => 'datetime',
        ];
    }

    public function purchaseRequest(): BelongsTo
    {
        return $this->belongsTo(PurchaseRequest::class, 'purchase_request_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(PurchaseRequestItem::class, 'supplement_id');
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by_user_id');
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewer_user_id');
    }

    public function procurementManager(): BelongsTo
    {
        return $this->belongsTo(User::class, 'procurement_user_id');
    }

    public function purchaseOrder(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrder::class, 'purchase_order_id');
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class, 'supplier_id');
    }
}
