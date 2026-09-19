<?php

namespace App\Models\Accounting;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CostCenter extends Model
{
    use HasFactory;

    protected $table = 'cost_centers';

    protected $fillable = [
        'code',
        'name',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    /**
     * Journal entry lines assigned to this cost center.
     */
    public function journalEntryLines(): HasMany
    {
        return $this->hasMany(JournalEntryLine::class, 'cost_center_id');
    }

    /**
     * Contractor invoices charged to this cost center.
     */
    public function contractorInvoices(): HasMany
    {
        return $this->hasMany(ContractorInvoice::class, 'cost_center_id');
    }

    /**
     * Petty cash settlements charged to this cost center.
     */
    public function pettyCashSettlements(): HasMany
    {
        return $this->hasMany(PettyCashSettlement::class, 'cost_center_id');
    }
}
