<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        apiPrefix: 'api/v1',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Cloudflare terminates the public TLS connection and forwards the
        // original scheme and client address to the Laravel origin.
        $middleware->trustProxies(
            at: env('TRUSTED_PROXIES', '*'),
            headers: Request::HEADER_X_FORWARDED_FOR
                | Request::HEADER_X_FORWARDED_HOST
                | Request::HEADER_X_FORWARDED_PORT
                | Request::HEADER_X_FORWARDED_PROTO
        );

        // API clients must receive JSON 401 responses, never a web login redirect.
        $middleware->redirectGuestsTo(static fn (Request $request) => $request->segment(1) === 'api' ? null : '/login');

        // Allow streaming PDF and photo files opened in browser with ?token=...
        $middleware->prepend(\App\Http\Middleware\AuthenticateFromQueryToken::class);

        $middleware->append(\App\Http\Middleware\SetSecurityHeaders::class);
        $middleware->append(\App\Http\Middleware\ApiRequestId::class);

        $middleware->alias([
            'permission' => \App\Http\Middleware\CheckPermission::class,
            'role' => \App\Http\Middleware\CheckRole::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        \Sentry\Laravel\Integration::handles($exceptions);

        // Treat every /api/* request as JSON even when a caller omits the Accept header.
        // This prevents unauthenticated API calls from falling through to a web login redirect.
        $isApiRequest = static fn (Request $request): bool => $request->is('api/*') || $request->segment(1) === 'api';
        $exceptions->shouldRenderJsonWhen($isApiRequest);

        $exceptions->render(function (\Illuminate\Auth\AuthenticationException $exception, Request $request) use ($isApiRequest) {
            if ($request->expectsJson() || $isApiRequest($request)) {
                return response()->json([
                    'message' => 'انتهت جلسة الدخول. سجّل الدخول مرة أخرى للمتابعة.',
                ], 401);
            }
        });

        $exceptions->render(function (\Illuminate\Validation\ValidationException $exception, Request $request) use ($isApiRequest) {
            if ($request->expectsJson() || $isApiRequest($request)) {
                return response()->json([
                    'message' => 'البيانات المدخلة تحتاج مراجعة. راجع الحقول الموضحة ثم أعد المحاولة.',
                    'errors' => $exception->errors(),
                ], 422);
            }
        });

        $exceptions->render(function (\Illuminate\Auth\Access\AuthorizationException $exception, Request $request) use ($isApiRequest) {
            if ($request->expectsJson() || $isApiRequest($request)) {
                return response()->json([
                    'message' => 'لا تملك الصلاحية المطلوبة لتنفيذ هذا الإجراء. إذا كان ذلك غير متوقع، تواصل مع مدير النظام.',
                ], 403);
            }
        });

        $exceptions->render(function (\Throwable $exception, Request $request) use ($isApiRequest) {
            if ($request->expectsJson() || $isApiRequest($request)) {
                if ($exception instanceof \Illuminate\Database\Eloquent\ModelNotFoundException) {
                    return response()->json([
                        'message' => 'العنصر المطلوب غير موجود أو لم يعد متاحًا. أعد تحميل الصفحة وتحقق من الرقم المستخدم.',
                    ], 404);
                }

                if ($exception instanceof \Symfony\Component\HttpKernel\Exception\HttpExceptionInterface) {
                    return response()->json([
                        'message' => $exception->getMessage() ?: 'حدث خطأ في الطلب.',
                    ], $exception->getStatusCode(), $exception->getHeaders());
                }

                return response()->json([
                    'message' => $exception->getMessage(),
                    'exception' => get_class($exception),
                    'file' => basename($exception->getFile()) . ':' . $exception->getLine(),
                ], 500);
            }
        });
    })->create();

