<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Storage;

class PurchaseRequestQuote extends Model
{
    use HasFactory;

    protected $fillable = [
        'purchase_request_id',
        'supplier_id',
        'created_by_user_id',
        'total_amount',
        'unit_price',
        'currency',
        'notes',
        'file_path',
        'file_name',
        'file_size',
        'mime_type',
        'status',
        'selected_at',
    ];

    protected $appends = [
        'file_url',
    ];

    protected function casts(): array
    {
        return [
            'total_amount' => 'decimal:2',
            'unit_price' => 'decimal:4',
            'file_size' => 'integer',
            'selected_at' => 'datetime',
        ];
    }

    public function getUnitPriceAttribute($value): ?string
    {
        return $value !== null ? \App\Support\DecimalHelper::formatCleanDecimal($value, 4) : null;
    }

    protected function fileUrl(): Attribute
    {
        return Attribute::make(
            get: function (): ?string {
                if (! $this->file_path) {
                    return null;
                }

                if (filter_var($this->file_path, FILTER_VALIDATE_URL)) {
                    return $this->file_path;
                }

                return url("/api/v1/purchase-quotes/{$this->id}/file");
            }
        );
    }

    public function purchaseRequest(): BelongsTo
    {
        return $this->belongsTo(PurchaseRequest::class);
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    public function recommendations(): HasMany
    {
        return $this->hasMany(PurchaseRequestQuoteRecommendation::class);
    }
}
