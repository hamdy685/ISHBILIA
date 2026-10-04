<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class CheckRole
{
    /**
     * Handle an incoming request for role-based access.
     */
    public function handle(Request $request, Closure $next, string $role): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json([
                'message' => 'انتهت جلسة الدخول. يرجى تسجيل الدخول مرة أخرى.',
            ], 401);
        }

        $roles = array_filter(array_map('trim', explode('|', $role)));

        // Admin has superuser access to all roles
        if ($user->hasRole('admin') || $user->hasAnyRole($roles)) {
            return $next($request);
        }

        return response()->json([
            'message' => 'عفواً، لا تملك الدور المطلوب لإتمام هذا الإجراء.',
        ], 403);
    }
}
