<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WorkflowDocumentAssignment extends Model
{
    use HasFactory;

    protected $table = 'workflow_document_assignments';

    public const TYPE_PRIMARY = 'PRIMARY_ACTION_OWNER';
    public const TYPE_PARALLEL = 'PARALLEL_ACTION_OWNER';
    public const TYPE_VIEW_ONLY = 'VIEW_ONLY_USER';

    protected $fillable = [
        'entity_type',
        'entity_id',
        'user_id',
        'assignment_type',
        'assigned_by_user_id',
        'notes',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function assignedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_by_user_id');
    }
}
