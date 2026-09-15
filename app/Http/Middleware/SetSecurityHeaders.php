<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class SetSecurityHeaders
{
    /**
     * Apply baseline browser security headers and keep authenticated API
     * responses private even when an upstream CDN is configured.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
        $response->headers->set('X-Frame-Options', 'SAMEORIGIN');

        if ($request->is('api/*')) {
            $response->headers->set('Cache-Control', 'private, no-store, no-cache, max-age=0, must-revalidate');
            $response->headers->set('Pragma', 'no-cache');
        }

        if (app()->environment('production') && $request->isSecure() && config('app.hsts.enabled', true)) {
            $maxAge = max(0, (int) config('app.hsts.max_age', 31536000));
            $includeSubDomains = config('app.hsts.include_subdomains', true) ? '; includeSubDomains' : '';
            $preload = config('app.hsts.preload', false) ? '; preload' : '';
            $response->headers->set('Strict-Transport-Security', "max-age={$maxAge}{$includeSubDomains}{$preload}");
        }

        return $response;
    }
}

