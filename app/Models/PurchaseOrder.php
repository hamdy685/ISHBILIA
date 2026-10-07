<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use App\Models\Concerns\RecordsSystemEvents;
use App\Traits\ScopesDataByUserRole;

class PurchaseOrder extends Model
{
    use HasFactory, SoftDeletes, RecordsSystemEvents, ScopesDataByUserRole;

    protected static function booted(): void
    {
        static::creating(function (PurchaseOrder $model) {
            if (empty($model->po_number)) {
                $model->po_number = app(\App\Services\PurchaseOrderService::class)->generatePoNumber();
            }
        });
    }

    protected $table = 'purchase_orders';

    protected $fillable = [
        'po_number',
        'manual_po_number',
        'purchase_request_id',
        'manual_pr_number',
        'selected_quote_id',
        'supplier_id',
        'created_by_user_id',
        'status',
        'subtotal',
        'grand_total',
        'payment_terms',
        'delivery_terms',
        'delivery_date',
        'delivery_status',
        'actual_delivery_date',
        'delivery_notes',
        'budget_code',
        'financial_notes',
        'reviewed_by_accounting_user_id',
        'reviewed_at_accounting',
        'notes',
        'rejection_reason',
        // Actual PO finalisation fields
        'finalized_by_user_id',
        'finalized_at',
        'finalization_notes',
    ];

    protected function casts(): array
    {
        return [
            'subtotal' => 'decimal:2',
            'grand_total' => 'decimal:2',
            'delivery_date' => 'date',
            'actual_delivery_date' => 'date',
            'reviewed_at_accounting' => 'datetime',
            'finalized_at' => 'datetime',
        ];
    }

    public function purchaseRequest(): BelongsTo
    {
        return $this->belongsTo(PurchaseRequest::class, 'purchase_request_id');
    }

    public function requiresWarehouseReceipt(): bool
    {
        $this->loadMissing('purchaseRequest');

        return $this->purchaseRequest?->requiresWarehouseReceipt() ?? true;
    }

    public function isBuildingsDirectDelivery(): bool
    {
        $this->loadMissing([
            'purchaseRequest.department',
            'purchaseRequest.targetDepartment',
            'purchaseRequest.assignedReviewer.department',
        ]);

        return $this->purchaseRequest?->isBuildingsDirectDelivery() ?? false;
    }

    public function selectedQuote(): BelongsTo
    {
        return $this->belongsTo(PurchaseRequestQuote::class, 'selected_quote_id');
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class, 'supplier_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    public function accountingReviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by_accounting_user_id');
    }

    public function finalizedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'finalized_by_user_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(PurchaseOrderItem::class, 'purchase_order_id');
    }

    public function receipts(): HasMany
    {
        return $this->hasMany(PurchaseReceipt::class, 'purchase_order_id');
    }

    public function purchaseReceipts(): HasMany
    {
        return $this->receipts();
    }

    public function supplierInvoices(): HasMany
    {
        return $this->hasMany(SupplierInvoice::class, 'purchase_order_id');
    }

    public function approvalHistory(): MorphMany
    {
        return $this->morphMany(ApprovalHistory::class, 'target');
    }

    public function attachments(): MorphMany
    {
        return $this->morphMany(Attachment::class, 'attachable');
    }

    public function systemEvents(): HasMany
    {
        return $this->hasMany(SystemEvent::class, 'entity_id')
            ->where('entity_type', self::class)
            ->orderByDesc('occurred_at');
    }

    /**
     * Scope to filter only Actual Purchase Orders (excluding preliminary/unfinalized orders).
     * Strictly requires finalized_at IS NOT NULL, or formal final approval, or valid supplier invoices.
     */
    public function scopeActualPo($query)
    {
        return $query->where(function ($q) {
            $q->whereNotNull('finalized_at')
              ->orWhereIn('status', ['APPROVED_BY_ACCOUNTING', 'FINAL_APPROVED'])
              ->orWhereHas('receipts', fn ($rq) => $rq->whereIn('status', ['APPROVED', 'PENDING_SITE_ENGINEER', 'DELIVERED']))
              ->orWhereHas('supplierInvoices', fn ($iq) => $iq->whereNotIn('status', ['VOIDED', 'CANCELLED']));
        })->whereNotIn('status', ['PO_DRAFT', 'PENDING_ACTUAL_PO', 'REJECTED', 'CANCELLED', 'VOIDED']);
    }

    /**
     * Scope to filter orders that are strictly finalized (whereNotNull('finalized_at')).
     */
    public function scopeFinalizedActual($query)
    {
        return $query->whereNotNull('finalized_at')
            ->whereNotIn('status', ['PO_DRAFT', 'PENDING_ACTUAL_PO', 'REJECTED', 'CANCELLED', 'VOIDED']);
    }

    /**
     * Check if this purchase order is an Actual PO.
     */
    /**
     * Check if this purchase order is an Actual PO.
     */
    public function isActualPo(): bool
    {
        if (in_array($this->status, ['PO_DRAFT', 'PENDING_ACTUAL_PO', 'REJECTED', 'CANCELLED', 'VOIDED'], true)) {
            return false;
        }

        return ! is_null($this->finalized_at)
            || in_array($this->status, ['APPROVED_BY_ACCOUNTING', 'FINAL_APPROVED'], true)
            || $this->supplierInvoices()->whereNotIn('status', ['VOIDED', 'CANCELLED'])->exists();
    }

    /**
     * Check if this purchase order represents an internal stock withdrawal / warehouse movement.
     */
    public function isInternalWarehouse(): bool
    {
        return $this->supplier?->isInternalWarehouse()
            || ($this->supplier_id && $this->supplier_id === Supplier::getOrCreateInternalWarehouseSupplier()->id);
    }
}
