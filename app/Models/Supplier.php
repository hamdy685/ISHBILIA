<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use App\Models\Concerns\RecordsSystemEvents;

class Supplier extends Model
{
    use HasFactory, SoftDeletes, RecordsSystemEvents;

    protected $table = 'suppliers';

    protected $fillable = [
        'company_name',
        'contact_name',
        'email',
        'phone',
        'address',
        'payment_terms',
        'opening_balance',
        'opening_balance_notes',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'opening_balance' => 'decimal:2',
            'is_active' => 'boolean',
        ];
    }

    public function purchaseOrders(): HasMany
    {
        return $this->hasMany(PurchaseOrder::class, 'supplier_id');
    }

    public function invoices(): HasMany
    {
        return $this->hasMany(SupplierInvoice::class, 'supplier_id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(SupplierPayment::class, 'supplier_id');
    }

    public function balanceAccount(): \Illuminate\Database\Eloquent\Relations\HasOne
    {
        return $this->hasOne(SupplierBalance::class, 'supplier_id');
    }

    public function quotes(): HasMany
    {
        return $this->hasMany(PurchaseRequestQuote::class, 'supplier_id');
    }

    public const INTERNAL_WAREHOUSE_NAME = 'المخزن الداخلي';
    public const INTERNAL_WAREHOUSE_TAX_NUMBER = 'INTERNAL-WH-001';

    /**
     * Get or create the dedicated Virtual Supplier representing the Company's Internal Warehouse.
     */
    public static function getOrCreateInternalWarehouseSupplier(): self
    {
        return self::firstOrCreate(
            ['company_name' => self::INTERNAL_WAREHOUSE_NAME],
            [
                'tax_number' => self::INTERNAL_WAREHOUSE_TAX_NUMBER,
                'contact_name' => 'أمين المستودع الرئيسي',
                'phone' => '01000000000',
                'address' => 'مستودع الشركة الرئيسي - المقر المركزي',
                'payment_terms' => 'صرف مباشر من رصيد المخزن الداخلي',
                'opening_balance' => 0.00,
                'opening_balance_notes' => 'المورد الافتراضي لصرف واستلام المواد من رصيد المخزن الداخلي',
                'is_active' => true,
            ]
        );
    }

    public function isInternalWarehouse(): bool
    {
        return $this->company_name === self::INTERNAL_WAREHOUSE_NAME
            || $this->company_name === 'مخزن الشركة الرئيسي'
            || $this->tax_number === self::INTERNAL_WAREHOUSE_TAX_NUMBER;
    }

    public function approvedQuotes(): HasMany
    {
        return $this->hasMany(PurchaseRequestQuote::class, 'supplier_id')->where('status', 'SELECTED');
    }

    public function purchaseReceipts(): HasMany
    {
        return $this->hasMany(PurchaseReceipt::class, 'supplier_id');
    }
}
