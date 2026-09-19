<?php

namespace App\Models\Accounting;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PettyCashSettlement extends Model
{
    use HasFactory;

    protected $table = 'accounting_petty_cash_settlements';

    protected $fillable = [
        'cost_center_id',
        'employee_name',
        'settlement_number',
        'date',
        'amount',
        'description',
        'status',
        'journal_entry_id',
    ];

    protected $casts = [
        'date' => 'date',
        'amount' => 'decimal:2',
    ];

    /**
     * The cost center (land parcel / project) charged with this petty cash expense.
     */
    public function costCenter(): BelongsTo
    {
        return $this->belongsTo(CostCenter::class, 'cost_center_id');
    }

    /**
     * The balanced journal entry generated upon settlement approval.
     */
    public function journalEntry(): BelongsTo
    {
        return $this->belongsTo(JournalEntry::class, 'journal_entry_id');
    }
}
