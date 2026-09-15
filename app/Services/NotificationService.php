<?php

namespace App\Services;

use App\Jobs\SendNotificationsJob;
use App\Models\Notification;
use App\Models\PurchaseOrder;
use App\Models\PurchaseReceipt;
use App\Models\PurchaseRequest;
use App\Models\SupplierInvoice;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;

class NotificationService
{
    /**
     * Resolve users holding a specific permission, optionally filtered by department.
     */
    public function resolveUsersWithPermission(string $permissionSlug, ?int $departmentId = null): Collection
    {
        // The Admin role must never receive standard business/procurement workflow notifications
        $query = User::where('is_active', true)
            ->whereDoesntHave('roles', function ($q) {
                $q->where('slug', 'admin');
            });

        if ($departmentId !== null) {
            // First check departmental scope
            $deptUsers = (clone $query)->where('department_id', $departmentId)->get()
                ->filter(fn (User $u) => $u->hasPermission($permissionSlug));

            if ($deptUsers->isNotEmpty()) {
                return $deptUsers->values();
            }

            // Check if department has a designated manager with permission
            $dept = \App\Models\Department::find($departmentId);
            if ($dept?->manager_user_id) {
                $mgr = User::where('id', $dept->manager_user_id)->where('is_active', true)->first();
                if ($mgr && $mgr->hasPermission($permissionSlug)) {
                    return collect([$mgr]);
                }
            }

            // Mapped official reviewer for the department
            $emailMap = (array) config('procurement.default_department_reviewers', []);
            if ($dept?->code && isset($emailMap[$dept->code])) {
                $mappedUser = User::where('email', $emailMap[$dept->code])->where('is_active', true)->first();
                if ($mappedUser && $mappedUser->hasPermission($permissionSlug)) {
                    return collect([$mappedUser]);
                }
            }

            // Strict isolation: Do not leak notifications to unrelated departments
            return collect();
        }

        // Fallback to global active users with permission only when no specific department was requested
        return $query->get()
            ->filter(fn (User $u) => $u->hasPermission($permissionSlug))
            ->values();
    }

    /**
     * Create single notification for a recipient preventing duplicates.
     */
    private function isProcurementNotifiable(Model $notifiable): bool
    {
        return in_array(get_class($notifiable), [
            PurchaseRequest::class,
            PurchaseOrder::class,
            PurchaseReceipt::class,
            SupplierInvoice::class,
        ], true);
    }

    private function procurementNotifiableTypes(): array
    {
        return [
            PurchaseRequest::class,
            PurchaseOrder::class,
            PurchaseReceipt::class,
            SupplierInvoice::class,
        ];
    }

    /**
     * Format mandatory 4 core operational details (Parcel, Region, Item, Quantity) for notification messages.
     */
    public static function formatPrOperationalDetails(PurchaseRequest $pr): string
    {
        $items = $pr->relationLoaded('items') ? $pr->items : $pr->items()->get();
        $firstItem = $items->first();

        $parcel = $pr->parcel_reference ?: ($firstItem?->item_reference ?: '');
        $region = $pr->region ?: ($firstItem?->region ?: '');
        $itemDesc = $firstItem?->item_description ?: ($firstItem?->item?->name ?: '');
        $qty = $firstItem ? (float) $firstItem->quantity . ($firstItem->uom ? ' ' . $firstItem->uom : '') : '';
        $otherCount = $items->count() > 1 ? ' (+' . ($items->count() - 1) . ' أصناف أخرى)' : '';

        $parts = [];
        if ($parcel !== '') {
            $parts[] = "القطعة: {$parcel}";
        }
        if ($region !== '') {
            $parts[] = "المنطقة: {$region}";
        }
        if ($itemDesc !== '') {
            $parts[] = "الصنف: {$itemDesc}{$otherCount}";
        }
        if ($qty !== '') {
            $parts[] = "الكمية: {$qty}";
        }

        if (empty($parts)) {
            return '';
        }

        return ' • ' . implode(' | ', $parts);
    }

    public function createNotification(User|int $recipient, string $type, string $title, string $message, Model $notifiable): ?Notification
    {
        $userId = $recipient instanceof User ? $recipient->id : (int) $recipient;
        $user = $recipient instanceof User ? $recipient : User::find($userId);

        if (! $user) {
            return null;
        }

        // The Admin role must never receive standard procurement/workflow notifications.
        // Admin ONLY receives system errors/health/monitoring alerts.
        if ($user->hasRole('admin') && !str_starts_with($type, 'system_error') && !str_starts_with($type, 'system_issue') && !str_starts_with($type, 'system_alert')) {
            return null;
        }

        if (! $this->isProcurementNotifiable($notifiable)) {
            return null;
        }

        // Automatically ensure mandatory 4 operational data points are present in the notification message
        if ($notifiable instanceof PurchaseRequest && !str_contains($message, 'القطعة:') && !str_contains($message, 'الصنف:')) {
            $message .= self::formatPrOperationalDetails($notifiable);
        } elseif ($notifiable instanceof PurchaseOrder && !str_contains($message, 'القطعة:') && !str_contains($message, 'الصنف:')) {
            if ($notifiable->purchaseRequest) {
                $message .= self::formatPrOperationalDetails($notifiable->purchaseRequest);
            }
        } elseif ($notifiable instanceof PurchaseReceipt && !str_contains($message, 'القطعة:') && !str_contains($message, 'الصنف:')) {
            if ($notifiable->purchaseOrder?->purchaseRequest) {
                $message .= self::formatPrOperationalDetails($notifiable->purchaseOrder->purchaseRequest);
            }
        }

        $existing = Notification::where([
            'user_id' => $userId,
            'type' => $type,
            'notifiable_type' => get_class($notifiable),
            'notifiable_id' => $notifiable->getKey(),
        ])->first();

        if ($existing) {
            $existing->update([
                'title' => $title,
                'message' => $message,
                'read_at' => null,
                'created_at' => now(),
            ]);
            return $existing;
        }

        return Notification::create([
            'user_id' => $userId,
            'type' => $type,
            'notifiable_type' => get_class($notifiable),
            'notifiable_id' => $notifiable->getKey(),
            'title' => $title,
            'message' => $message,
            'read_at' => null,
        ]);
    }

    /**
     * Create notifications for multiple recipients.
     */
    public function notifyUsers(iterable $recipients, string $type, string $title, string $message, Model $notifiable): void
    {
        foreach ($recipients as $recipient) {
            $this->createNotification($recipient, $type, $title, $message, $notifiable);
        }
    }

    /**
     * Queue a notification for one recipient after the surrounding transaction commits.
     */
    public function queueNotification(User|int $recipient, string $type, string $title, string $message, Model $notifiable): void
    {
        $userId = $recipient instanceof User ? $recipient->id : (int) $recipient;

        // Persist notification to database immediately for instant realtime delivery
        $this->createNotification($userId, $type, $title, $message, $notifiable);

        SendNotificationsJob::dispatch([$userId], $type, $title, $message, $notifiable);
    }

    /**
     * Queue notifications for multiple recipients after the surrounding transaction commits.
     */
    public function queueUsers(iterable $recipients, string $type, string $title, string $message, Model $notifiable): void
    {
        $recipientIds = collect($recipients)
            ->map(fn (User|int $recipient): int => $recipient instanceof User ? $recipient->id : (int) $recipient)
            ->filter(fn (int $id): bool => $id > 0)
            ->unique()
            ->values()
            ->all();

        if ($recipientIds === []) {
            return;
        }

        // Persist notifications to database immediately for instant realtime delivery
        $this->notifyUsers($recipientIds, $type, $title, $message, $notifiable);

        SendNotificationsJob::dispatch($recipientIds, $type, $title, $message, $notifiable);
    }

    /**
     * Queue one Accounting notification that carries both the PO and its approved receipt.
     */
    public function queueAccountingWithPurchaseOrderAndReceipt(iterable $recipients, PurchaseOrder $purchaseOrder, PurchaseReceipt $purchaseReceipt): void
    {
        $recipientIds = collect($recipients)
            ->map(fn (User|int $recipient): int => $recipient instanceof User ? $recipient->id : (int) $recipient)
            ->filter(fn (int $id): bool => $id > 0)
            ->unique()
            ->values()
            ->all();

        if ($recipientIds === []) {
            return;
        }

        // Persist notification to database immediately for instant realtime delivery
        $this->notifyAccountingWithPurchaseOrderAndReceipt($recipientIds, $purchaseOrder, $purchaseReceipt);

        SendNotificationsJob::dispatch(
            $recipientIds,
            'purchase_order_and_receipt_ready_accounting',
            '',
            '',
            $purchaseOrder,
            $purchaseReceipt,
        );
    }

    /**
     * Send one Accounting notification that carries both the PO and its approved receipt.
     */
    public function notifyAccountingWithPurchaseOrderAndReceipt(iterable $recipients, PurchaseOrder $purchaseOrder, PurchaseReceipt $purchaseReceipt): void
    {
        foreach ($recipients as $recipient) {
            $userId = $recipient instanceof User ? $recipient->id : (int) $recipient;
            $user = $recipient instanceof User ? $recipient : User::find($userId);

            if (! $user || $user->hasRole('admin')) {
                continue;
            }

            $existing = Notification::where([
                'user_id' => $userId,
                'type' => 'purchase_order_and_receipt_ready_accounting',
                'notifiable_type' => PurchaseOrder::class,
                'notifiable_id' => $purchaseOrder->id,
            ])->first();

            if ($existing) {
                $existing->update([
                    'title' => 'أمر الشراء وإذن الاستلام جاهزان للحسابات',
                    'message' => "أمر الشراء {$purchaseOrder->po_number} وإذن الاستلام {$purchaseReceipt->receipt_number} مرتبطان بنفس العملية. افتح الرسالة لمراجعة المستندين واستكمال فاتورة المورد.",
                    'purchase_order_id' => $purchaseOrder->id,
                    'purchase_receipt_id' => $purchaseReceipt->id,
                    'read_at' => null,
                    'created_at' => now(),
                ]);
            } else {
                Notification::create([
                    'user_id' => $userId,
                    'type' => 'purchase_order_and_receipt_ready_accounting',
                    'notifiable_type' => PurchaseOrder::class,
                    'notifiable_id' => $purchaseOrder->id,
                    'purchase_order_id' => $purchaseOrder->id,
                    'purchase_receipt_id' => $purchaseReceipt->id,
                    'title' => 'أمر الشراء وإذن الاستلام جاهزان للحسابات',
                    'message' => "أمر الشراء {$purchaseOrder->po_number} وإذن الاستلام {$purchaseReceipt->receipt_number} مرتبطان بنفس العملية. افتح الرسالة لمراجعة المستندين واستكمال فاتورة المورد.",
                    'read_at' => null,
                ]);
            }
        }
    }

    /**
     * Get paginated notifications for user.
     */
    public function getUserNotifications(User $user, int $perPage = 15): LengthAwarePaginator
    {
        $query = Notification::where('user_id', $user->id);

        if ($user->hasRole('admin')) {
            return $query->where(function ($q) {
                $q->where('type', 'like', 'system_error%')
                  ->orWhere('type', 'like', 'system_issue%')
                  ->orWhere('type', 'like', 'system_alert%');
            })
            ->orderBy('created_at', 'desc')
            ->orderBy('id', 'desc')
            ->paginate($perPage);
        }

        return $query->whereIn('notifiable_type', $this->procurementNotifiableTypes())
            ->orderBy('created_at', 'desc')
            ->orderBy('id', 'desc')
            ->paginate($perPage);
    }

    /**
     * Get count of unread notifications for user.
     */
    public function getUnreadCount(User $user): int
    {
        $query = Notification::where('user_id', $user->id)->whereNull('read_at');

        if ($user->hasRole('admin')) {
            return $query->where(function ($q) {
                $q->where('type', 'like', 'system_error%')
                  ->orWhere('type', 'like', 'system_issue%')
                  ->orWhere('type', 'like', 'system_alert%');
            })->count();
        }

        return $query->whereIn('notifiable_type', $this->procurementNotifiableTypes())
            ->count();
    }

    /**
     * Mark single notification as read.
     */
    public function markAsRead(User $user, Notification $notification): Notification
    {
        if ($notification->user_id !== $user->id) {
            throw new AuthorizationException('This notification belongs to another user.');
        }

        if ($notification->read_at === null) {
            $notification->update(['read_at' => now()]);
        }

        return $notification;
    }

    /**
     * Mark all notifications belonging to user as read.
     */
    public function markAllAsRead(User $user): int
    {
        $query = Notification::where('user_id', $user->id)->whereNull('read_at');

        if ($user->hasRole('admin')) {
            return $query->where(function ($q) {
                $q->where('type', 'like', 'system_error%')
                  ->orWhere('type', 'like', 'system_issue%')
                  ->orWhere('type', 'like', 'system_alert%');
            })->update(['read_at' => now()]);
        }

        return $query->whereIn('notifiable_type', $this->procurementNotifiableTypes())
            ->update(['read_at' => now()]);
    }

    /**
     * Mark notifications for an entity as read for a specific user, or for all users when an action completes.
     */
    public function markEntityNotificationsAsRead(Model $notifiable, User|int|null $user = null, ?string $type = null): int
    {
        $query = Notification::where('notifiable_type', get_class($notifiable))
            ->where('notifiable_id', $notifiable->getKey())
            ->whereNull('read_at');

        if ($user !== null) {
            $userId = $user instanceof User ? $user->id : (int) $user;
            $query->where('user_id', $userId);
        }

        if ($type !== null) {
            $query->where('type', $type);
        }

        return $query->update(['read_at' => now()]);
    }
}

