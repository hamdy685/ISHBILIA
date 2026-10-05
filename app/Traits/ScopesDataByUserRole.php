<?php

namespace App\Traits;

use App\Scopes\DataIsolationScope;
use Illuminate\Database\Eloquent\Builder;

trait ScopesDataByUserRole
{
    /**
     * Boot the data isolation scope for the model.
     */
    public static function bootScopesDataByUserRole(): void
    {
        static::addGlobalScope(new DataIsolationScope());
    }

    /**
     * Local scope to bypass data isolation if explicitly required for system-level operations.
     */
    public function scopeWithoutDataIsolation(Builder $query): Builder
    {
        return $query->withoutGlobalScope(DataIsolationScope::class);
    }
}
