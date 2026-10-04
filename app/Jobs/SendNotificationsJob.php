<?php

namespace App\Jobs;

use App\Models\PurchaseOrder;
use App\Models\PurchaseReceipt;
use App\Services\NotificationService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class SendNotificationsJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /**
     * @param array<int> $recipientIds
     */
    public function __construct(
        public array $recipientIds,
        public string $type,
        public string $title,
        public string $message,
        public Model $notifiable,
        public ?PurchaseReceipt $purchaseReceipt = null,
    ) {
        // Queue notifications only after the surrounding transaction commits.
        $this->afterCommit();
    }

    public function handle(NotificationService $notificationService): void
    {
        if ($this->purchaseReceipt !== null) {
            if (! $this->notifiable instanceof PurchaseOrder) {
                throw new \LogicException('A purchase order is required when queueing a purchase-order and receipt notification.');
            }

            $notificationService->notifyAccountingWithPurchaseOrderAndReceipt(
                $this->recipientIds,
                $this->notifiable,
                $this->purchaseReceipt,
            );
        } else {
            $notificationService->notifyUsers(
                $this->recipientIds,
                $this->type,
                $this->title,
                $this->message,
                $this->notifiable,
            );
        }

        // Dispatch Web & Mobile FCM Push Notifications asynchronously with intelligent deep linking
        try {
            /** @var \App\Services\FcmService $fcmService */
            $fcmService = app(\App\Services\FcmService::class);

            $users = \App\Models\User::with('roles')
                ->whereIn('id', $this->recipientIds)
                ->get();

            foreach ($users as $user) {
                $targetUrl = $this->resolveTargetUrlForUser($user);
                $unreadCount = $user->notifications()->whereNull('read_at')->count();

                $fcmService->sendToUser(
                    $user,
                    $this->title,
                    $this->message,
                    [
                        'type' => $this->type,
                        'notifiable_type' => get_class($this->notifiable),
                        'notifiable_id' => $this->notifiable->getKey(),
                        'purchase_request_id' => $this->notifiable instanceof \App\Models\PurchaseRequest ? $this->notifiable->id : null,
                        'purchase_order_id' => $this->notifiable instanceof \App\Models\PurchaseOrder ? $this->notifiable->id : ($this->purchaseReceipt?->purchase_order_id ?? null),
                        'purchase_receipt_id' => $this->purchaseReceipt?->id ?? ($this->notifiable instanceof \App\Models\PurchaseReceipt ? $this->notifiable->id : null),
                        'url' => $targetUrl,
                        'unread_count' => (string) $unreadCount,
                    ]
                );
            }
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('SendNotificationsJob: FCM push delivery error', [
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Resolve the exact, role-tailored deep link URL for a recipient.
     */
    protected function resolveTargetUrlForUser(\App\Models\User $user): string
    {
        $id = $this->notifiable->getKey();

        if ($this->notifiable instanceof \App\Models\PurchaseRequest) {
            if (str_contains($this->type, 'quote')) {
                if ($user->hasRole('general_manager') || $user->hasRole('execution_manager')) {
                    return "/general-manager/purchase-quotes?open={$id}";
                }
                if ($user->hasRole('reviewer')) {
                    return "/reviewer/purchase-quotes?open={$id}";
                }
                if ($user->hasRole('accountant')) {
                    return "/accounting/purchase-quotes?open={$id}";
                }
                if ($user->hasRole('procurement_manager')) {
                    return "/procurement/purchase-orders/create?pr={$id}";
                }
            }
            if ($user->hasRole('reviewer')) {
                return "/reviewer/requests/{$id}";
            }
            if ($user->hasRole('general_manager') || $user->hasRole('execution_manager')) {
                return "/general-manager/purchase-requests?open={$id}";
            }
            if ($user->hasRole('accountant') && str_contains($this->type, 'accounting')) {
                return "/accounting/purchase-requests";
            }
            if ($user->hasRole('procurement_manager')) {
                return "/procurement/purchase-requests";
            }
            // Universal fallback accessible to all operational roles
            return "/requests/{$id}";
        }

        if ($this->notifiable instanceof \App\Models\PurchaseOrder) {
            if ($user->hasRole('warehouse_keeper') && ! $user->hasRole('site_engineer')) {
                return "/warehouse";
            }
            if ($user->hasRole('procurement_manager')) {
                return "/procurement/purchase-orders/{$id}";
            }
            if ($user->hasRole('general_manager') || $user->hasRole('execution_manager')) {
                return "/general-manager/purchase-orders/{$id}";
            }
            if ($user->hasRole('accountant')) {
                return "/accounting/purchase-orders/{$id}";
            }
            return "/procurement/purchase-orders/{$id}";
        }

        if ($this->notifiable instanceof \App\Models\PurchaseReceipt || $this->purchaseReceipt !== null) {
            $receiptId = $this->purchaseReceipt?->id ?? $id;
            if ($user->hasRole('accountant')) {
                return "/accounting/supplier-payments?purchase_receipt_id={$receiptId}";
            }
            if ($user->hasRole('warehouse_keeper') && ! $user->hasRole('site_engineer')) {
                return "/warehouse?receipt_id={$receiptId}";
            }
            return "/site-engineer?receipt_id={$receiptId}";
        }

        if ($this->notifiable instanceof \App\Models\SupplierInvoice) {
            return "/accounting/supplier-payments?invoice_id={$id}";
        }

        return "/notifications";
    }
}
