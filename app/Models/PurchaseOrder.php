<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use App\Models\Concerns\RecordsSystemEvents;

class PurchaseOrder extends Model
{
    use HasFactory, SoftDeletes, RecordsSystemEvents;

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
}
