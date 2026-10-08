<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

use App\Traits\ScopesDataByUserRole;

class PurchaseReceipt extends Model
{
    use HasFactory, ScopesDataByUserRole;

    protected static function booted(): void
    {
        static::creating(function (PurchaseReceipt $model) {
            if (empty($model->receipt_number)) {
                $model->receipt_number = app(\App\Services\PurchaseReceiptService::class)->generateUniqueReceiptNumber();
            }
        });
    }

    protected $fillable = [
        'purchase_order_id',
        'purchase_request_id',
        'supplier_id',
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
        'accountant_recorded_at',
        'accountant_recorded_by_user_id',
        'accountant_recording_notes',
    ];

    protected $appends = [
        'photo_url',
        'supplier_name',
        'is_internal_warehouse',
        'is_accountant_recorded',
        'warehouse_approval',
        'site_engineer_approval',
    ];

    public function getWarehouseApprovalAttribute(): array
    {
        $requiresWarehouse = $this->purchaseOrder?->requiresWarehouseReceipt()
            ?? $this->purchaseRequest?->requiresWarehouseReceipt()
            ?? (! is_null($this->warehouse_keeper_user_id));

        $isBypassed = (! $requiresWarehouse) || in_array($this->receipt_type, ['SITE_DIRECT', 'REQUESTER_OFFICE'], true);

        if ($isBypassed) {
            return [
                'status' => 'AUTO_APPROVED',
                'is_bypassed' => true,
                'approved' => true,
                'approved_at' => $this->warehouse_submitted_at?->toIso8601String() ?: $this->created_at?->toIso8601String(),
                'notes' => 'تم التخطي التلقائي / لا يوجد مخزن',
                'actor' => null,
            ];
        }

        if ($this->warehouse_submitted_at) {
            return [
                'status' => 'APPROVED',
                'is_bypassed' => false,
                'approved' => true,
                'approved_at' => $this->warehouse_submitted_at?->toIso8601String(),
                'notes' => $this->warehouse_notes,
                'actor' => $this->warehouseKeeper ? [
                    'id' => $this->warehouseKeeper->id,
                    'name' => $this->warehouseKeeper->name,
                    'email' => $this->warehouseKeeper->email,
                ] : null,
            ];
        }

        return [
            'status' => 'PENDING',
            'is_bypassed' => false,
            'approved' => false,
            'approved_at' => null,
            'notes' => null,
            'actor' => null,
        ];
    }

    public function getSiteEngineerApprovalAttribute(): array
    {
        $isApproved = ($this->status === 'APPROVED') || ! is_null($this->site_engineer_approved_at);

        if ($isApproved) {
            return [
                'status' => 'APPROVED',
                'approved' => true,
                'approved_at' => $this->site_engineer_approved_at?->toIso8601String(),
                'notes' => $this->site_engineer_notes,
                'actor' => $this->siteEngineer ? [
                    'id' => $this->siteEngineer->id,
                    'name' => $this->siteEngineer->name,
                    'email' => $this->siteEngineer->email,
                ] : null,
            ];
        }

        if ($this->status === 'PENDING_SITE_ENGINEER') {
            return [
                'status' => 'PENDING',
                'approved' => false,
                'approved_at' => null,
                'notes' => null,
                'actor' => $this->siteEngineer ? [
                    'id' => $this->siteEngineer->id,
                    'name' => $this->siteEngineer->name,
                    'email' => $this->siteEngineer->email,
                ] : null,
            ];
        }

        return [
            'status' => 'WAITING_WAREHOUSE',
            'approved' => false,
            'approved_at' => null,
            'notes' => null,
            'actor' => null,
        ];
    }

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
            'accountant_recorded_at' => 'datetime',
        ];
    }

    public function accountantRecordedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'accountant_recorded_by_user_id');
    }

    public function getIsAccountantRecordedAttribute(): bool
    {
        return ! is_null($this->accountant_recorded_at);
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

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class, 'supplier_id');
    }

    public function getSupplierNameAttribute(): string
    {
        return $this->supplier?->company_name
            ?: $this->purchaseOrder?->supplier?->company_name
            ?: Supplier::INTERNAL_WAREHOUSE_NAME;
    }

    public function getIsInternalWarehouseAttribute(): bool
    {
        return $this->isInternalWarehouse();
    }

    public function isInternalWarehouse(): bool
    {
        return $this->supplier?->isInternalWarehouse()
            || $this->purchaseOrder?->isInternalWarehouse()
            || ($this->supplier_id && $this->supplier_id === Supplier::getOrCreateInternalWarehouseSupplier()->id);
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
