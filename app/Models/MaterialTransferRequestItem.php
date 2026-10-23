<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MaterialTransferRequestItem extends Model
{
    use HasFactory;

    protected $table = 'material_transfer_request_items';

    protected $fillable = [
        'material_transfer_request_id',
        'item_order',
        'item_description',
        'uom',
        'quantity',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'item_order' => 'integer',
            'quantity' => 'decimal:2',
        ];
    }

    public function request(): BelongsTo
    {
        return $this->belongsTo(MaterialTransferRequest::class, 'material_transfer_request_id');
    }
}
