<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class WorkflowTransition extends Model
{
    use HasFactory;

    protected $table = 'workflow_transitions';

    protected $fillable = [
        'entity_type',
        'from_status',
        'to_status',
        'is_allowed',
        'requires_exception',
        'description',
    ];

    protected function casts(): array
    {
        return [
            'is_allowed' => 'boolean',
            'requires_exception' => 'boolean',
        ];
    }

    /**
     * Check if transition is valid and whether it requires an exception reason.
     */
    public static function checkTransition(string $entityType, string $fromStatus, string $toStatus): array
    {
        $transition = static::where('entity_type', $entityType)
            ->where('from_status', $fromStatus)
            ->where('to_status', $toStatus)
            ->first();

        if (! $transition) {
            return [
                'exists' => false,
                'is_allowed' => false,
                'requires_exception' => true,
                'message' => "الانتقال من الحالة ({$fromStatus}) إلى ({$toStatus}) غير مسجل في المسار النظامي. يتطلب تدخلاً إدارياً استثنائياً مع سبب إجباري.",
            ];
        }

        return [
            'exists' => true,
            'is_allowed' => $transition->is_allowed,
            'requires_exception' => $transition->requires_exception,
            'message' => $transition->description ?? '',
        ];
    }
}
