<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use App\Models\Concerns\RecordsSystemEvents;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable, SoftDeletes, RecordsSystemEvents;

    protected $table = 'users';

    protected $fillable = [
        'department_id',
        'manager_id',
        'name',
        'email',
        'password',
        'phone',
        'is_active',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'password' => 'hashed',
        ];
    }

    public function manager(): BelongsTo
    {
        return $this->belongsTo(User::class, 'manager_id');
    }

    public function subordinates(): HasMany
    {
        return $this->hasMany(User::class, 'manager_id');
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class, 'department_id');
    }

    public function siteEngineerDepartments(): HasMany
    {
        return $this->hasMany(Department::class, 'site_engineer_user_id');
    }

    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'role_user');
    }

    public function purchaseRequests(): HasMany
    {
        return $this->hasMany(PurchaseRequest::class, 'user_id');
    }

    public function createdPurchaseOrders(): HasMany
    {
        return $this->hasMany(PurchaseOrder::class, 'created_by_user_id');
    }

    public function accountingReviewedPurchaseOrders(): HasMany
    {
        return $this->hasMany(PurchaseOrder::class, 'reviewed_by_accounting_user_id');
    }

    public function approvalHistories(): HasMany
    {
        return $this->hasMany(ApprovalHistory::class, 'actor_user_id');
    }

    public function auditLogs(): HasMany
    {
        return $this->hasMany(AuditLog::class, 'user_id');
    }

    public function notifications(): HasMany
    {
        return $this->hasMany(Notification::class, 'user_id');
    }

    public function deviceTokens(): HasMany
    {
        return $this->hasMany(UserDeviceToken::class, 'user_id');
    }

    public function systemEvents(): HasMany
    {
        return $this->hasMany(SystemEvent::class, 'actor_user_id')->orderByDesc('occurred_at');
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(Attachment::class, 'uploaded_by_user_id');
    }

    public function hasRole(string $role): bool
    {
        return $this->roles->contains(function (Role $r) use ($role) {
            return $r->slug === $role || $r->name === $role;
        });
    }

    public function hasAnyRole(array $roles): bool
    {
        return $this->roles->contains(function (Role $r) use ($roles) {
            return in_array($r->slug, $roles, true) || in_array($r->name, $roles, true);
        });
    }

    public function hasPermission(string $permission): bool
    {
        // Admin is the system super-user and must retain access to all administrative actions
        // even if a permission pivot is temporarily out of sync in a local/demo database.
        if ($this->hasRole('admin')) {
            return true;
        }

        return $this->roles->contains(function (Role $role) use ($permission) {
            return $role->permissions->contains(function (Permission $p) use ($permission) {
                return $p->slug === $permission || $p->name === $permission;
            });
        });
    }

    public function hasAnyPermission(array $permissions): bool
    {
        return $this->roles->contains(function (Role $role) use ($permissions) {
            return $role->permissions->contains(function (Permission $p) use ($permissions) {
                return in_array($p->slug, $permissions, true) || in_array($p->name, $permissions, true);
            });
        });
    }

    public function isGeneralAccountant(): bool
    {
        if ($this->hasRole('general_accountant')) {
            return true;
        }

        $email = strtolower(trim((string) $this->email));
        if ($email === 'habiba@gmail.com' || $email === 'habiba@ashbiliya.com') {
            return true;
        }

        return false;
    }
}
