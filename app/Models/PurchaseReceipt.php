<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PurchaseReceipt extends Model
{
    use HasFactory;

    protected $fillable = [
        'purchase_order_id',
        'purchase_request_id',
        'warehouse_keeper_user_id',
        'site_engineer_user_id',
        'receiver_user_id',
        'receipt_number',
        'receipt_type',
        'status',
        'received_at',
        'warehouse_submitted_at',
        'site_engineer_approved_at',
        'receiver_approved_at',
        'warehouse_notes',
        'photo_path',
        'photo_name',
        'photo_size',
        'photo_mime_type',
        'site_engineer_notes',
        'receiver_notes',
        'rejection_reason',
    ];

    protected $appends = [
        'photo_url',
    ];

    public function getPhotoUrlAttribute(): ?string
    {
        if (! $this->photo_path) {
            return null;
        }
        if (filter_var($this->photo_path, FILTER_VALIDATE_URL)) {
            return $this->photo_path;
        }
        $r2Url = config('filesystems.disks.r2.url');
        if ($r2Url) {
            return rtrim($r2Url, '/') . '/' . ltrim($this->photo_path, '/');
        }
        return "/api/v1/purchase-receipts/{$this->id}/photo";
    }

    protected function casts(): array
    {
        return [
            'received_at' => 'date',
            'warehouse_submitted_at' => 'datetime',
            'site_engineer_approved_at' => 'datetime',
            'receiver_approved_at' => 'datetime',
        ];
    }

    public function purchaseOrder(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrder::class);
    }

    public function purchaseRequest(): BelongsTo
    {
        return $this->belongsTo(PurchaseRequest::class);
    }

    public function warehouseKeeper(): BelongsTo
    {
        return $this->belongsTo(User::class, 'warehouse_keeper_user_id');
    }

    public function siteEngineer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'site_engineer_user_id');
    }

    public function receiver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'receiver_user_id');
    }

    public function isOfficeReceipt(): bool
    {
        return $this->receipt_type === 'REQUESTER_OFFICE';
    }

    public function isBuildingsDirectReceipt(): bool
    {
        return $this->receipt_type === 'SITE_DIRECT';
    }

    public function items(): HasMany
    {
        return $this->hasMany(PurchaseReceiptItem::class);
    }

    public function supplierInvoices(): HasMany
    {
        return $this->hasMany(SupplierInvoice::class, 'purchase_receipt_id');
    }
}
