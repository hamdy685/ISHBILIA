<?php

namespace App\Models\Accounting;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ContractorInvoice extends Model
{
    use HasFactory;

    protected $table = 'accounting_contractor_invoices';

    protected $fillable = [
        'cost_center_id',
        'contractor_name',
        'invoice_number',
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
     * The cost center (land parcel / project) this contractor invoice is charged to.
     */
    public function costCenter(): BelongsTo
    {
        return $this->belongsTo(CostCenter::class, 'cost_center_id');
    }

    /**
     * The journal entry generated upon approval.
     */
    public function journalEntry(): BelongsTo
    {
        return $this->belongsTo(JournalEntry::class, 'journal_entry_id');
    }
}
