<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\AdminAuditLog;
use App\Models\PurchaseOrder;
use App\Models\PurchaseReceipt;
use App\Models\PurchaseRequest;
use App\Models\SupplierInvoice;
use App\Models\User;
use App\Models\WorkflowDocumentAssignment;
use App\Models\WorkflowTransition;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Throwable;

class AdminWorkflowControlService
{
    public function __construct(
        protected NotificationService $notificationService
    ) {}

    /**
     * Preview the exact impact of an administrative operation before execution.
     */
    public function previewImpact(string $entityType, int $id, string $action, array $payload = []): array
    {
        $entityType = strtoupper($entityType);
        $doc = $this->resolveDocument($entityType, $id);

        if (! $doc) {
            throw ValidationException::withMessages([
                'id' => ["المستند المطلوب (#{$id}) من نوع {$entityType} غير موجود."],
            ]);
        }

        $impact = [
            'entity_type' => $entityType,
            'entity_id' => $id,
            'entity_label' => $this->resolveLabel($doc),
            'action' => $action,
            'current_status' => $doc->status ?? 'UNKNOWN',
            'proposed_status' => null,
            'current_owner' => null,
            'proposed_owner' => null,
            'is_financial_locked' => false,
            'financial_lock_reason' => null,
            'requires_confirm_text' => false,
            'transition_allowed' => true,
            'requires_exception' => false,
            'transition_message' => null,
            'linked_documents' => [],
            'affected_tasks_count' => 0,
            'warnings' => [],
        ];

        // Gather linked documents & financial lock
        if ($doc instanceof PurchaseRequest) {
            $impact['current_owner'] = $this->formatUser($doc->user);
            $pos = PurchaseOrder::where('purchase_request_id', $doc->id)->get();
            $receipts = PurchaseReceipt::where('purchase_request_id', $doc->id)->get();
            $invoices = SupplierInvoice::whereIn('purchase_order_id', $pos->pluck('id'))->get();

            $impact['linked_documents'] = [
                'purchase_orders' => $pos->pluck('po_number')->toArray(),
                'receipts' => $receipts->pluck('receipt_number')->toArray(),
                'invoices_count' => $invoices->count(),
            ];

            $paidInvoices = $invoices->filter(fn ($inv) => in_array($inv->status, ['VERIFIED', 'PAID'], true));
            if ($paidInvoices->isNotEmpty()) {
                $impact['is_financial_locked'] = true;
                $impact['financial_lock_reason'] = 'يوجد فواتير مسجلة أو مدفوعة مرتبطة بأمر الشراء لهذا الطلب. يمنع الإلغاء المباشر دون تسوية محاسبية.';
            }
        } elseif ($doc instanceof PurchaseOrder) {
            $impact['current_owner'] = $this->formatUser($doc->creator ?? $doc->purchaseRequest?->user);
            $receipts = PurchaseReceipt::where('purchase_order_id', $doc->id)->get();
            $invoices = SupplierInvoice::where('purchase_order_id', $doc->id)->get();

            $impact['linked_documents'] = [
                'purchase_request' => $doc->purchaseRequest?->request_number,
                'receipts' => $receipts->pluck('receipt_number')->toArray(),
                'invoices_count' => $invoices->count(),
            ];

            $paidInvoices = $invoices->filter(fn ($inv) => in_array($inv->status, ['VERIFIED', 'PAID'], true));
            if ($paidInvoices->isNotEmpty()) {
                $impact['is_financial_locked'] = true;
                $impact['financial_lock_reason'] = 'أمر الشراء مسجل مالياً بحسابات الموردين أو مدفوع. الإلغاء المباشر محظور.';
            }
        } elseif ($doc instanceof PurchaseReceipt) {
            $currentRecipientId = $doc->actual_receiver_user_id ?: ($doc->receiver_user_id ?: $doc->site_engineer_user_id);
            $impact['current_owner'] = $currentRecipientId ? $this->formatUser(User::find($currentRecipientId)) : null;

            if (! empty($doc->weighing_group_id)) {
                $impact['warnings'][] = 'إذن الاستلام هذا مرتبط بمجموعة وزنة حديد مجمعة (ميزان بسكول). سيتم الحفاظ على أوزان وأسعار الشحنة كاملة دون أي تفكيك.';
            }
        }

        // Action-specific validations
        if ($action === 'CANCEL') {
            $impact['proposed_status'] = 'CANCELLED';
            $impact['requires_confirm_text'] = true;

            $transCheck = WorkflowTransition::checkTransition($entityType, (string) $doc->status, 'CANCELLED');
            $impact['transition_allowed'] = $transCheck['is_allowed'];
            $impact['requires_exception'] = $transCheck['requires_exception'];
            $impact['transition_message'] = $transCheck['message'];

            if ($impact['is_financial_locked']) {
                $impact['warnings'][] = $impact['financial_lock_reason'];
            }
        } elseif ($action === 'REASSIGN_RECEIPT') {
            $newUserId = (int) ($payload['new_user_id'] ?? 0);
            $newUser = User::find($newUserId);
            $impact['proposed_owner'] = $newUser ? $this->formatUser($newUser) : null;
            $impact['requires_confirm_text'] = false;
        } elseif ($action === 'ROLLBACK') {
            $targetStatus = (string) ($payload['target_status'] ?? '');
            $impact['proposed_status'] = $targetStatus;
            $impact['requires_confirm_text'] = true;

            $transCheck = WorkflowTransition::checkTransition($entityType, (string) $doc->status, $targetStatus);
            $impact['transition_allowed'] = $transCheck['is_allowed'];
            $impact['requires_exception'] = $transCheck['requires_exception'];
            $impact['transition_message'] = $transCheck['message'];
        }

        return $impact;
    }

    /**
     * Safely cancel a document (PR or PO) without ANY physical record deletions.
     */
    public function cancelSafely(
        string $entityType,
        int $id,
        string $reason,
        ?User $adminUser = null,
        ?string $ip = null,
        ?string $userAgent = null
    ): array {
        $entityType = strtoupper($entityType);
        $adminUser = $adminUser ?: Auth::user();

        if (mb_strlen(trim($reason)) < 5) {
            throw ValidationException::withMessages([
                'reason' => ['سبب الإلغاء إلزامي ويجب ألا يقل عن 5 أحرف.'],
            ]);
        }

        return DB::transaction(function () use ($entityType, $id, $reason, $adminUser, $ip, $userAgent) {
            $doc = $this->resolveDocument($entityType, $id);
            if (! $doc) {
                throw ValidationException::withMessages([
                    'id' => ["المستند المطلوب (#{$id}) غير موجود."],
                ]);
            }

            // Check financial locks
            if ($doc instanceof PurchaseRequest) {
                $pos = PurchaseOrder::where('purchase_request_id', $doc->id)->get();
                $paidInvoices = SupplierInvoice::whereIn('purchase_order_id', $pos->pluck('id'))
                    ->whereIn('status', ['VERIFIED', 'PAID'])
                    ->exists();

                if ($paidInvoices) {
                    throw ValidationException::withMessages([
                        'error' => ['حظر مالي: لا يمكن إلغاء الطلب لوجود فواتير مسجلة أو مدفوعة في الحسابات. يرجى إنشاء تسوية محاسبية أولاً.'],
                    ]);
                }

                $oldState = [
                    'pr_status' => $doc->status,
                    'pos_count' => $pos->count(),
                ];

                // 1. Cancel PR
                $fromStatus = $doc->status;
                $doc->status = 'CANCELLED';
                $doc->save();

                // 2. Cancel / Void linked POs
                foreach ($pos as $po) {
                    if (! in_array($po->status, ['CANCELLED', 'VOIDED'], true)) {
                        $po->status = 'CANCELLED';
                        $po->save();
                    }
                }

                // 3. Cancel linked Receipts
                PurchaseReceipt::where('purchase_request_id', $doc->id)
                    ->whereNotIn('status', ['CANCELLED', 'APPROVED'])
                    ->update(['status' => 'CANCELLED']);

                $newState = [
                    'pr_status' => 'CANCELLED',
                    'pos_voided' => $pos->pluck('po_number')->toArray(),
                ];

                $this->logAdminAudit(
                    $adminUser,
                    'ADMIN_CANCEL_REQUEST',
                    'PURCHASE_REQUEST',
                    $doc->id,
                    $doc->request_number,
                    $fromStatus,
                    'CANCELLED',
                    $reason,
                    $oldState,
                    $newState,
                    ['ip' => $ip, 'user_agent' => $userAgent]
                );

                return [
                    'success' => true,
                    'message' => "تم إلغاء طلب الشراء {$doc->request_number} وإبطال أوامر الشراء المرتبطة به بأمان تام دون حذف أي سجلات.",
                    'document' => $doc,
                ];
            }

            if ($doc instanceof PurchaseOrder) {
                $paidInvoices = SupplierInvoice::where('purchase_order_id', $doc->id)
                    ->whereIn('status', ['VERIFIED', 'PAID'])
                    ->exists();

                if ($paidInvoices) {
                    throw ValidationException::withMessages([
                        'error' => ['حظر مالي: لا يمكن إلغاء أمر الشراء لوجود فواتير مسجلة أو مدفوعة في الحسابات.'],
                    ]);
                }

                $oldState = ['po_status' => $doc->status];
                $fromStatus = $doc->status;
                $doc->status = 'CANCELLED';
                $doc->save();

                // Cancel pending receipts
                PurchaseReceipt::where('purchase_order_id', $doc->id)
                    ->whereNotIn('status', ['CANCELLED', 'APPROVED'])
                    ->update(['status' => 'CANCELLED']);

                $newState = ['po_status' => 'CANCELLED'];

                $this->logAdminAudit(
                    $adminUser,
                    'ADMIN_CANCEL_ORDER',
                    'PURCHASE_ORDER',
                    $doc->id,
                    $doc->po_number,
                    $fromStatus,
                    'CANCELLED',
                    $reason,
                    $oldState,
                    $newState,
                    ['ip' => $ip, 'user_agent' => $userAgent]
                );

                return [
                    'success' => true,
                    'message' => "تم إلغاء أمر الشراء {$doc->po_number} بأمان دون حذف أي بيانات.",
                    'document' => $doc,
                ];
            }

            throw ValidationException::withMessages([
                'entity_type' => ['نوع المستند غير مدعوم للإلغاء المباشر.'],
            ]);
        });
    }

    /**
     * Safely reassign a purchase receipt's recipient without touching prices, quantities, plots, or suppliers.
     */
    public function reassignReceiptRecipient(
        int $receiptId,
        int $newUserId,
        string $reason,
        ?User $adminUser = null,
        ?string $ip = null,
        ?string $userAgent = null
    ): array {
        $adminUser = $adminUser ?: Auth::user();

        if (mb_strlen(trim($reason)) < 5) {
            throw ValidationException::withMessages([
                'reason' => ['سبب تغيير المستلم إلزامي ولا يقل عن 5 أحرف.'],
            ]);
        }

        $newUser = User::find($newUserId);
        if (! $newUser || ! ($newUser->is_active ?? true)) {
            throw ValidationException::withMessages([
                'new_user_id' => ['المستلم الجديد المحدد غير موجود أو غير نشط في النظام.'],
            ]);
        }

        return DB::transaction(function () use ($receiptId, $newUser, $reason, $adminUser, $ip, $userAgent) {
            /** @var PurchaseReceipt|null $receipt */
            $receipt = PurchaseReceipt::withoutGlobalScopes()->with(['purchaseOrder', 'purchaseRequest'])->find($receiptId);
            if (! $receipt) {
                throw ValidationException::withMessages([
                    'receipt_id' => ["إذن الاستلام رقم #{$receiptId} غير موجود."],
                ]);
            }

            $oldRecipientId = $receipt->actual_receiver_user_id ?: ($receipt->receiver_user_id ?: $receipt->site_engineer_user_id);
            $oldUser = $oldRecipientId ? User::find($oldRecipientId) : null;

            $oldValues = [
                'receiver_user_id' => $receipt->receiver_user_id,
                'actual_receiver_user_id' => $receipt->actual_receiver_user_id,
                'actual_receiver_name' => $receipt->actual_receiver_name,
                'site_engineer_user_id' => $receipt->site_engineer_user_id,
            ];

            // Reassign cleanly
            $receipt->actual_receiver_user_id = $newUser->id;
            $receipt->actual_receiver_name = $newUser->name;
            $receipt->receiver_user_id = $newUser->id;
            $receipt->site_engineer_user_id = $newUser->id;
            $receipt->save();

            $newValues = [
                'receiver_user_id' => $newUser->id,
                'actual_receiver_user_id' => $newUser->id,
                'actual_receiver_name' => $newUser->name,
                'site_engineer_user_id' => $newUser->id,
            ];

            // Notify new recipient
            try {
                $docNumber = $receipt->receipt_number ?: "REC-{$receipt->id}";
                $this->notificationService->createNotification(
                    $newUser,
                    'purchase_receipt_assigned',
                    "تم إسناد إذن استلام إليك إدارياً: {$docNumber}",
                    "قام مدير النظام بإسناد إذن الاستلام {$docNumber} إليك لفحصه واعتماده في الموقع. السبب: {$reason}",
                    $receipt
                );
            } catch (Throwable) {}

            $this->logAdminAudit(
                $adminUser,
                'ADMIN_REASSIGN_RECEIPT',
                'PURCHASE_RECEIPT',
                $receipt->id,
                $receipt->receipt_number,
                (string) $receipt->status,
                (string) $receipt->status,
                $reason,
                $oldValues,
                $newValues,
                [
                    'old_user' => $oldUser?->name,
                    'new_user' => $newUser->name,
                    'ip' => $ip,
                    'user_agent' => $userAgent,
                ]
            );

            return [
                'success' => true,
                'message' => "تم تغيير مستلم إذن الاستلام بنجاح إلى ({$newUser->name}) وإرسال إشعار فوري له.",
                'receipt' => $receipt,
            ];
        });
    }

    /**
     * Safely rollback a document to an earlier workflow stage with matrix validation.
     */
    public function rollbackWorkflow(
        string $entityType,
        int $id,
        string $targetStatus,
        string $reason,
        bool $isException = false,
        ?User $adminUser = null,
        ?string $ip = null,
        ?string $userAgent = null
    ): array {
        $entityType = strtoupper($entityType);
        $adminUser = $adminUser ?: Auth::user();

        if (mb_strlen(trim($reason)) < 10) {
            throw ValidationException::withMessages([
                'reason' => ['سبب إرجاع المسار إلزامي ويجب ألا يقل عن 10 أحرف لتوضيح المبرر الإداري.'],
            ]);
        }

        return DB::transaction(function () use ($entityType, $id, $targetStatus, $reason, $isException, $adminUser, $ip, $userAgent) {
            $doc = $this->resolveDocument($entityType, $id);
            if (! $doc) {
                throw ValidationException::withMessages([
                    'id' => ["المستند المطلوب (#{$id}) غير موجود."],
                ]);
            }

            $fromStatus = (string) $doc->status;
            $check = WorkflowTransition::checkTransition($entityType, $fromStatus, $targetStatus);

            if (! $check['is_allowed'] && ! $isException) {
                throw ValidationException::withMessages([
                    'transition' => [
                        "الانتقال من ({$fromStatus}) إلى ({$targetStatus}) غير مصرح به في المسار الطبيعي. " .
                        'إذا كان هذا تصحيحاً إدارياً استثنائياً، يرجى تفعيل خيار (إجراء إداري استثنائي) وكتابة مبرر وافٍ.',
                    ],
                ]);
            }

            $oldValues = ['status' => $fromStatus];
            $doc->status = $targetStatus;
            $doc->save();
            $newValues = ['status' => $targetStatus];

            $this->logAdminAudit(
                $adminUser,
                'ADMIN_WORKFLOW_ROLLBACK',
                $entityType,
                $doc->id,
                $this->resolveLabel($doc),
                $fromStatus,
                $targetStatus,
                $reason,
                $oldValues,
                $newValues,
                [
                    'is_exceptional' => $isException,
                    'ip' => $ip,
                    'user_agent' => $userAgent,
                ]
            );

            return [
                'success' => true,
                'message' => "تم إرجاع المسار للمستند بنجاح من ({$fromStatus}) إلى ({$targetStatus}).",
                'document' => $doc,
            ];
        });
    }

    /**
     * Assign multi-user role on a document: PRIMARY_ACTION_OWNER, PARALLEL_ACTION_OWNER, VIEW_ONLY_USER.
     */
    public function assignDocumentUser(
        string $entityType,
        int $id,
        int $userId,
        string $assignmentType,
        ?string $notes = null,
        ?User $adminUser = null,
        ?string $ip = null,
        ?string $userAgent = null
    ): array {
        $entityType = strtoupper($entityType);
        $adminUser = $adminUser ?: Auth::user();

        $allowedTypes = [
            WorkflowDocumentAssignment::TYPE_PRIMARY,
            WorkflowDocumentAssignment::TYPE_PARALLEL,
            WorkflowDocumentAssignment::TYPE_VIEW_ONLY,
        ];

        if (! in_array($assignmentType, $allowedTypes, true)) {
            throw ValidationException::withMessages([
                'assignment_type' => ['نوع الإسناد غير صالح.'],
            ]);
        }

        $targetUser = User::findOrFail($userId);

        $assignment = WorkflowDocumentAssignment::updateOrCreate(
            [
                'entity_type' => $entityType,
                'entity_id' => $id,
                'user_id' => $userId,
                'assignment_type' => $assignmentType,
            ],
            [
                'assigned_by_user_id' => $adminUser?->id,
                'notes' => $notes,
            ]
        );

        $this->logAdminAudit(
            $adminUser,
            'ADMIN_ASSIGN_USER',
            $entityType,
            $id,
            "{$entityType}-{$id}",
            null,
            null,
            "إسناد المستخدم {$targetUser->name} كـ {$assignmentType}. ملاحظات: {$notes}",
            null,
            ['assignment_type' => $assignmentType, 'user_id' => $userId],
            ['ip' => $ip, 'user_agent' => $userAgent]
        );

        return [
            'success' => true,
            'message' => "تم إسناد المستخدم ({$targetUser->name}) بنجاح كـ ({$assignmentType}).",
            'assignment' => $assignment,
        ];
    }

    /**
     * Safely forward a document to the next stage with validation against transitions matrix.
     */
    public function forwardWorkflow(
        string $entityType,
        int $id,
        string $targetStatus,
        string $reason,
        bool $isException = false,
        ?User $adminUser = null,
        ?string $ip = null,
        ?string $userAgent = null
    ): array {
        $entityType = strtoupper($entityType);
        $adminUser = $adminUser ?: Auth::user();

        if (mb_strlen(trim($reason)) < 5) {
            throw ValidationException::withMessages([
                'reason' => ['سبب تقديم المسار إلزامي ولا يقل عن 5 أحرف.'],
            ]);
        }

        return DB::transaction(function () use ($entityType, $id, $targetStatus, $reason, $isException, $adminUser, $ip, $userAgent) {
            $doc = $this->resolveDocument($entityType, $id);
            if (! $doc) {
                throw ValidationException::withMessages([
                    'id' => ["المستند المطلوب (#{$id}) غير موجود."],
                ]);
            }

            $fromStatus = (string) $doc->status;
            $check = WorkflowTransition::checkTransition($entityType, $fromStatus, $targetStatus);

            if (! $check['is_allowed'] && ! $isException) {
                throw ValidationException::withMessages([
                    'transition' => [
                        "الانتقال من ({$fromStatus}) إلى ({$targetStatus}) غير مسجل بالمسار العادي. " .
                        'يتطلب تفعيل خيار (إجراء إداري استثنائي) مع تبرير إداري وافٍ.',
                    ],
                ]);
            }

            $oldValues = ['status' => $fromStatus];
            $doc->status = $targetStatus;
            $doc->save();
            $newValues = ['status' => $targetStatus];

            $this->logAdminAudit(
                $adminUser,
                'ADMIN_WORKFLOW_FORWARDED',
                $entityType,
                $doc->id,
                $this->resolveLabel($doc),
                $fromStatus,
                $targetStatus,
                $reason,
                $oldValues,
                $newValues,
                [
                    'is_exceptional' => $isException,
                    'ip' => $ip,
                    'user_agent' => $userAgent,
                ]
            );

            return [
                'success' => true,
                'message' => "تم تقديم وتصعيد مسار المستند بنجاح من ({$fromStatus}) إلى ({$targetStatus}).",
                'document' => $doc,
            ];
        });
    }

    /**
     * Safely edit purchase request fields respecting lifecycle constraints.
     */
    public function editRequestSafely(
        int $prId,
        array $data,
        string $reason,
        ?User $adminUser = null,
        ?string $ip = null,
        ?string $userAgent = null
    ): array {
        $adminUser = $adminUser ?: Auth::user();

        if (mb_strlen(trim($reason)) < 5) {
            throw ValidationException::withMessages([
                'reason' => ['سبب تعديل الطلب إلزامي للتوثيق في سجل الرقابة والتدقيق.'],
            ]);
        }

        return DB::transaction(function () use ($prId, $data, $reason, $adminUser, $ip, $userAgent) {
            /** @var PurchaseRequest|null $pr */
            $pr = PurchaseRequest::withoutGlobalScopes()->with('items')->find($prId);
            if (! $pr) {
                throw ValidationException::withMessages([
                    'id' => ["طلب الشراء رقم #{$prId} غير موجود."],
                ]);
            }

            $fromStatus = (string) $pr->status;
            $isPostApproval = in_array($fromStatus, [
                'APPROVED_BY_EXECUTIVE',
                'APPROVED_BY_PROCUREMENT',
                'APPROVED_BY_ACCOUNTING',
            ], true);

            $oldValues = [
                'justification' => $pr->justification,
                'urgency' => $pr->urgency,
                'target_department_id' => $pr->target_department_id,
                'project_site' => $pr->project_site,
                'notes' => $pr->notes,
            ];

            // Updatable fields
            if (isset($data['justification'])) {
                $pr->justification = trim((string) $data['justification']);
            }
            if (isset($data['urgency'])) {
                $pr->urgency = (string) $data['urgency'];
            }
            if (isset($data['target_department_id'])) {
                $pr->target_department_id = $data['target_department_id'] ? (int) $data['target_department_id'] : null;
            }
            if (isset($data['project_site'])) {
                $pr->project_site = trim((string) $data['project_site']);
            }
            if (isset($data['notes'])) {
                $pr->notes = trim((string) $data['notes']);
            }

            // Append correction memo note if post-approval
            if ($isPostApproval) {
                $memoDate = now()->toDateTimeString();
                $adminName = $adminUser?->name ?? 'مدير النظام';
                $memoNote = "\n[مذكرة تصحيح إدارية - {$memoDate} بواسطة {$adminName}]: {$reason}";
                $pr->notes = ($pr->notes ? $pr->notes . "\n" : '') . $memoNote;
            }

            $pr->save();

            $newValues = [
                'justification' => $pr->justification,
                'urgency' => $pr->urgency,
                'target_department_id' => $pr->target_department_id,
                'project_site' => $pr->project_site,
                'notes' => $pr->notes,
            ];

            $this->logAdminAudit(
                $adminUser,
                'ADMIN_REQUEST_EDITED',
                'PURCHASE_REQUEST',
                $pr->id,
                $pr->request_number,
                $fromStatus,
                $fromStatus,
                $reason,
                $oldValues,
                $newValues,
                [
                    'is_post_approval' => $isPostApproval,
                    'ip' => $ip,
                    'user_agent' => $userAgent,
                ]
            );

            return [
                'success' => true,
                'message' => "تم حفظ تعديلات الطلب {$pr->request_number} بنجاح وتوثيق مذكرة التعديل في سجل الرقابة.",
                'request' => $pr,
            ];
        });
    }

    /**
     * Resend an existing workflow notification to recipient safely.
     */
    public function resendNotification(
        int $notificationId,
        string $reason,
        ?User $adminUser = null,
        ?string $ip = null,
        ?string $userAgent = null
    ): array {
        $adminUser = $adminUser ?: Auth::user();

        /** @var \App\Models\Notification|null $notif */
        $notif = \App\Models\Notification::find($notificationId);
        if (! $notif) {
            throw ValidationException::withMessages([
                'notification_id' => ["الإشعار المطلوب (#{$notificationId}) غير موجود."],
            ]);
        }

        $recipient = User::find($notif->user_id);
        if (! $recipient || ! ($recipient->is_active ?? true)) {
            throw ValidationException::withMessages([
                'user' => ['المستلم غير موجود أو غير نشط في النظام.'],
            ]);
        }

        // Clone and re-issue notification
        $newNotif = \App\Models\Notification::create([
            'user_id' => $recipient->id,
            'type' => $notif->type,
            'title' => "[إعادة إرسال إداري]: " . $notif->title,
            'message' => $notif->message . " (أُعيد إرساله إدارياً: {$reason})",
            'purchase_request_id' => $notif->purchase_request_id,
            'purchase_order_id' => $notif->purchase_order_id,
            'purchase_receipt_id' => $notif->purchase_receipt_id,
            'data' => $notif->data,
            'read_at' => null,
            'created_at' => now(),
        ]);

        $this->logAdminAudit(
            $adminUser,
            'ADMIN_NOTIFICATION_RESENT',
            'NOTIFICATION',
            $notificationId,
            "NOTIF-{$notificationId}",
            null,
            null,
            $reason,
            ['old_notif_id' => $notificationId],
            ['new_notif_id' => $newNotif->id, 'recipient' => $recipient->name],
            ['ip' => $ip, 'user_agent' => $userAgent]
        );

        return [
            'success' => true,
            'message' => "تمت إعادة إرسال الإشعار بنجاح إلى ({$recipient->name}).",
            'notification' => $newNotif,
        ];
    }

    /**
     * Record an immutable administrative audit log.
     */
    public function logAdminAudit(
        ?User $actor,
        string $action,
        string $entityType,
        ?int $entityId,
        ?string $entityLabel,
        ?string $fromStatus,
        ?string $toStatus,
        string $reason,
        ?array $oldValues = null,
        ?array $newValues = null,
        ?array $metadata = null
    ): AdminAuditLog {
        $actorRole = 'admin';
        if ($actor && method_exists($actor, 'roles')) {
            $actorRole = $actor->roles->pluck('name')->first() ?: 'admin';
        }

        $isExceptional = (bool) ($metadata['is_exceptional'] ?? false);
        $ip = $metadata['ip'] ?? request()?->ip();
        $userAgent = $metadata['user_agent'] ?? request()?->userAgent();

        return AdminAuditLog::create([
            'actor_user_id' => $actor?->id,
            'actor_name' => $actor?->name ?? 'مدير النظام',
            'actor_role' => $actorRole,
            'action' => $action,
            'entity_type' => $entityType,
            'entity_id' => $entityId,
            'entity_label' => $entityLabel,
            'from_status' => $fromStatus,
            'to_status' => $toStatus,
            'reason' => $reason,
            'old_values' => $oldValues,
            'new_values' => $newValues,
            'metadata' => $metadata,
            'ip_address' => $ip,
            'user_agent' => $userAgent ? substr($userAgent, 0, 255) : null,
            'is_exceptional' => $isExceptional,
        ]);
    }

    private function resolveDocument(string $entityType, int $id): mixed
    {
        return match ($entityType) {
            'PURCHASE_REQUEST' => PurchaseRequest::withoutGlobalScopes()->with(['user', 'department'])->find($id),
            'PURCHASE_ORDER' => PurchaseOrder::withoutGlobalScopes()->with(['creator', 'purchaseRequest', 'supplier'])->find($id),
            'PURCHASE_RECEIPT' => PurchaseReceipt::withoutGlobalScopes()->with(['supplier', 'purchaseOrder', 'purchaseRequest'])->find($id),
            default => null,
        };
    }

    private function resolveLabel(mixed $doc): string
    {
        if ($doc instanceof PurchaseRequest) {
            return $doc->request_number ?: "PR-{$doc->id}";
        }
        if ($doc instanceof PurchaseOrder) {
            return $doc->po_number ?: "PO-{$doc->id}";
        }
        if ($doc instanceof PurchaseReceipt) {
            return $doc->receipt_number ?: "REC-{$doc->id}";
        }
        return "#{$doc->id}";
    }

    private function formatUser(?User $user): ?array
    {
        if (! $user) {
            return null;
        }
        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->roles?->pluck('name')->first() ?? 'user',
        ];
    }
}
