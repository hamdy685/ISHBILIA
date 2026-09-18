<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use App\Models\Concerns\RecordsSystemEvents;

class PurchaseRequest extends Model
{
    /**
     * The requester may edit until the departmental reviewer approves the request.
     */
    public const REQUESTER_EDITABLE_STATUSES = [
        'DRAFT',
        'SUBMITTED',
        'UNDER_REVIEW',
    ];

    public function isEditableByRequester(): bool
    {
        return in_array($this->status, self::REQUESTER_EDITABLE_STATUSES, true);
    }

    /**
     * The assigned reviewer may edit only while the request is awaiting the reviewer's decision.
     * Once the reviewer approves, the request is locked for the reviewer and requester.
     */
    public const REVIEWER_EDITABLE_STATUSES = [
        'SUBMITTED',
        'UNDER_REVIEW',
    ];

    public function isEditableByReviewer(): bool
    {
        return in_array($this->status, self::REVIEWER_EDITABLE_STATUSES, true);
    }

    use HasFactory, SoftDeletes, RecordsSystemEvents;

    protected $table = 'purchase_requests';

    protected $fillable = [
        'request_number',
        'request_type',
        'parcel_reference',
        'region',
        'land_parcel_id',
        'user_id',
        'department_id',
        'target_department_id',
        'reviewer_user_id',
        'site_engineer_user_id',
        'requires_warehouse_receipt',
        'selected_quote_id',
        'priority',
        'status',
        'procurement_route',
        'direct_supplier_id',
        'total_estimated_cost',
        'date_needed',
        'notes',
        'rejection_reason',
        'return_reason',
        'submitted_at',
    ];

    public function landParcel(): BelongsTo
    {
        return $this->belongsTo(LandParcel::class, 'land_parcel_id');
    }

    public function isOfficeRequest(): bool
    {
        return $this->request_type === 'OFFICE_SUPPLIES';
    }

    public function isProjectRequest(): bool
    {
        return ! $this->isOfficeRequest();
    }

    public function requiresWarehouseReceipt(): bool
    {
        if ($this->isOfficeRequest()) {
            return false;
        }

        return (bool) ($this->requires_warehouse_receipt ?? true);
    }

    public function isBuildingsDirectDelivery(): bool
    {
        // If reviewer explicitly configured warehouse receipt requirement, respect it
        if (! $this->requiresWarehouseReceipt()) {
            return true;
        }

        return false;
    }

    protected function casts(): array
    {
        return [
            'requires_warehouse_receipt' => 'boolean',
            'total_estimated_cost' => 'decimal:2',
            'date_needed' => 'date',

            'submitted_at' => 'datetime',
        ];
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class, 'department_id');
    }

    public function targetDepartment(): BelongsTo
    {
        return $this->belongsTo(Department::class, 'target_department_id');
    }

    public function assignedReviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewer_user_id');
    }

    public function siteEngineer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'site_engineer_user_id');
    }

    public function selectedQuote(): BelongsTo
    {
        return $this->belongsTo(PurchaseRequestQuote::class, 'selected_quote_id');
    }

    public function directSupplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class, 'direct_supplier_id');
    }

    public function quotes(): HasMany
    {
        return $this->hasMany(PurchaseRequestQuote::class, 'purchase_request_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(PurchaseRequestItem::class, 'purchase_request_id');
    }

    public function purchaseOrders(): HasMany
    {
        return $this->hasMany(PurchaseOrder::class, 'purchase_request_id');
    }

    public function supplements(): HasMany
    {
        return $this->hasMany(PurchaseRequestSupplement::class, 'purchase_request_id');
    }

    public function canAcceptSupplement(): bool
    {
        // Must be an approved/issued requisition
        $validStatuses = ['APPROVED_BY_REVIEWER', 'APPROVED_BY_GM', 'PO_ISSUED', 'ACCOUNTING_APPROVED'];
        if (! in_array($this->status, $validStatuses, true) && $this->purchaseOrders()->count() === 0) {
            return false;
        }

        return true;
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
