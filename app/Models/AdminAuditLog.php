<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use RuntimeException;

class AdminAuditLog extends Model
{
    use HasFactory;

    public const UPDATED_AT = null; // Logs are write-once, never updated

    protected $table = 'admin_audit_logs';

    protected $fillable = [
        'actor_user_id',
        'actor_name',
        'actor_role',
        'action',
        'entity_type',
        'entity_id',
        'entity_label',
        'from_status',
        'to_status',
        'reason',
        'old_values',
        'new_values',
        'metadata',
        'ip_address',
        'user_agent',
        'is_exceptional',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'old_values' => 'array',
            'new_values' => 'array',
            'metadata' => 'array',
            'is_exceptional' => 'boolean',
            'created_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        // Immutable protection: never allow updating or deleting an audit log
        static::updating(function () {
            throw new RuntimeException('سجل التدقيق الإداري غير قابل للتعديل قطعياً لحماية النزاهة التاريخية.');
        });

        static::deleting(function () {
            throw new RuntimeException('حظر سيادي: يمنع حذف أي سجل من سجلات الرقابة والتدقيق نهائياً.');
        });
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_user_id');
    }
}
