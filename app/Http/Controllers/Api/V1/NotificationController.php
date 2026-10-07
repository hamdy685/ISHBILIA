<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\NotificationResource;
use App\Models\Notification;
use App\Services\NotificationService;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Symfony\Component\HttpFoundation\StreamedResponse;

class NotificationController extends Controller
{
    public function __construct(private NotificationService $notificationService)
    {
    }

    public function index(Request $request): AnonymousResourceCollection
    {
        $perPage = (int) $request->query('per_page', 15);
        $notifications = $this->notificationService->getUserNotifications($request->user(), $perPage);
        return NotificationResource::collection($notifications);
    }

    public function unreadCount(Request $request): JsonResponse
    {
        $count = $this->notificationService->getUnreadCount($request->user());
        return response()->json([
            'unread_count' => $count,
            'count' => $count,
        ]);
    }

    /**
     * Stream new notifications to the authenticated browser without a page refresh.
     * The connection checks only the current user's rows and reconnects safely on the client.
     */
    public function stream(Request $request): StreamedResponse
    {
        $user = $request->user();
        $lastId = max(0, (int) $request->query('last_id', 0));
        $requestedSeconds = max(0, (int) $request->query('timeout', 20));
        // Keep SSE connection cycle at 20-30s max so it releases workers quickly and reconnects seamlessly
        $maxSeconds = min(30, max(1, $requestedSeconds));

        return response()->stream(function () use ($user, $lastId, $maxSeconds): void {
            $cursor = $lastId;
            $startedAt = microtime(true);

            echo ": connected\n\n";
            if (function_exists('ob_flush')) {
                @ob_flush();
            }
            flush();

            while (! connection_aborted() && (microtime(true) - $startedAt) < $maxSeconds) {
                $query = Notification::query()
                    ->where('user_id', $user->id)
                    ->where('id', '>', $cursor);

                if ($user->hasRole('admin')) {
                    $query->where(function ($q) {
                        $q->where('type', 'like', 'system_error%')
                          ->orWhere('type', 'like', 'system_issue%')
                          ->orWhere('type', 'like', 'system_alert%');
                    });
                } elseif ($this->notificationService->isExecutiveUser($user)) {
                    $this->notificationService->scopeExecutiveNotifications($query, $user);
                }

                $notifications = $query->orderBy('id')
                    ->limit(20)
                    ->get();

                foreach ($notifications as $notification) {
                    $payload = (new NotificationResource($notification))->resolve();
                    echo 'id: ' . $notification->id . "\n";
                    echo "event: notification\n";
                    echo 'data: ' . json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n\n";
                    $cursor = max($cursor, (int) $notification->id);
                }

                echo ": heartbeat\n\n";
                if (function_exists('ob_flush')) {
                    @ob_flush();
                }
                flush();
                usleep(1000000); // 1-second check interval
            }
        }, 200, [
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache, no-store, must-revalidate',
            'Connection' => 'keep-alive',
            'X-Accel-Buffering' => 'no',
        ]);
    }

    public function markAsRead(Request $request, string|int $id): JsonResponse
    {
        $notification = Notification::findOrFail((int) $id);
        if ($notification->user_id !== $request->user()->id) {
            return response()->json(['message' => 'هذا الإشعار لا يخص المستخدم الحالي.'], 403);
        }

        $notification->markAsRead();
        $unreadCount = $this->notificationService->getUnreadCount($request->user());

        return response()->json([
            'data' => (new NotificationResource($notification))->resolve(),
            'message' => 'تم تحديد الإشعار كمقروء.',
            'unread_count' => $unreadCount,
            'count' => $unreadCount,
        ]);
    }

    public function markAllAsRead(Request $request): JsonResponse
    {
        $this->notificationService->markAllAsRead($request->user());
        return response()->json([
            'message' => 'تم تحديد جميع الإشعارات كمقروءة.',
            'unread_count' => 0,
            'count' => 0,
        ]);
    }

    public function registerDeviceToken(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'token' => ['required', 'string'],
            'device_type' => ['nullable', 'string', 'max:50'],
        ]);

        $user = $request->user();
        $token = trim($validated['token']);
        $deviceType = $validated['device_type'] ?? 'web';

        $deviceToken = \App\Models\UserDeviceToken::updateOrCreate(
            [
                'user_id' => $user->id,
                'token' => $token,
            ],
            [
                'device_type' => $deviceType,
                'user_agent' => substr((string) $request->userAgent(), 0, 500),
                'last_used_at' => now(),
            ]
        );

        return response()->json([
            'message' => 'تم تسجيل رمز الجهاز بنجاح للإشعارات الفورية.',
            'device_token' => $deviceToken,
        ], 200);
    }

    public function deleteDeviceToken(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'token' => ['required', 'string'],
        ]);

        $request->user()->deviceTokens()
            ->where('token', trim($validated['token']))
            ->delete();

        return response()->json([
            'message' => 'تم إلغاء تفعيل الإشعارات الفورية على هذا الجهاز.',
        ]);
    }

    public function testPush(Request $request): JsonResponse
    {
        $user = $request->user();
        $tokens = $user->deviceTokens()->pluck('token')->all();

        if (empty($tokens)) {
            return response()->json([
                'success' => false,
                'message' => 'لم يتم العثور على أي أجهزة مسجلة لهذا الحساب. يرجى الضغط على زر تفعيل الإشعارات من متصفح الهاتف أولاً.',
                'device_count' => 0,
            ], 400);
        }

        /** @var \App\Services\FcmService $fcmService */
        $fcmService = app(\App\Services\FcmService::class);
        $result = $fcmService->sendToUser(
            $user,
            '🔔 إشعار تجريبي من نظام شركة اشبيلية',
            'تم إرسال هذا الإشعار بنجاح إلى شريط إشعارات جهازك!',
            ['url' => '/notifications']
        );

        return response()->json([
            'success' => true,
            'message' => 'تم إرسال الإشعار التجريبي عبر Google FCM بنجاح!',
            'device_count' => count($tokens),
            'result' => $result,
        ]);
    }
}

