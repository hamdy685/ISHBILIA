<?php

namespace App\Policies;

use App\Models\PurchaseOrder;
use App\Models\SupplierInvoice;
use App\Models\User;
use App\Services\SupplierInvoiceService;
use Illuminate\Auth\Access\HandlesAuthorization;
use Illuminate\Auth\Access\Response;

class SupplierInvoicePolicy
{
    use HandlesAuthorization;

    public function __construct(protected SupplierInvoiceService $invoiceService)
    {
    }

    /**
     * Determine whether the user can view any invoices.
     */
    public function viewAny(User $user): Response
    {
        if ($user->hasRole('admin') || $user->hasPermission('accounting.invoice.view')) {
            return Response::allow();
        }

        return Response::deny('غير مصرح لك باستعراض فواتير الموردين.');
    }

    /**
     * Determine whether the user can create an invoice.
     * Enforces strict Separation of Duties (SOD).
     */
    public function create(User $user, ?PurchaseOrder $purchaseOrder = null): Response
    {
        // 1. Strict SOD: Procurement Manager, General Manager, Execution Manager must NEVER create invoices
        if ($user->hasAnyRole(['procurement_manager', 'general_manager', 'execution_manager'])) {
            return Response::deny('غير مصرح لك بتسجيل الفواتير المالية. هذا الإجراء مخصص للإدارة المالية ومحاسبي الأقسام فقط.');
        }

        // 2. Admin is allowed
        if ($user->hasRole('admin')) {
            return Response::allow();
        }

        // 3. User must have accounting.invoice.create permission
        if (! $user->hasRole('admin') && ! $this->invoiceService->isGeneralAccountant($user) && ! $user->hasPermission('accounting.invoice.create')) {
            return Response::deny('غير مصرح لك بتسجيل الفواتير المالية. هذا الإجراء مخصص للإدارة المالية ومحاسبي الأقسام فقط.');
        }

        // 4. Financial Director cannot record department invoices directly (assigned to department accountants)
        if ($user->hasRole('accountant') && ! $this->invoiceService->isGeneralAccountant($user) && ! $this->invoiceService->isRestrictedDepartmentAccountant($user)) {
            return Response::deny('غير مصرح للمدير المالي بتسجيل الفواتير؛ تسجيل الفواتير مسند لمحاسب القسم التابع له أمر الشراء فقط.');
        }

        // 5. Scoped validation if a specific purchase order is provided
        if ($purchaseOrder !== null) {
            $allowedCodes = $this->invoiceService->getAllowedDepartmentCodesForAccountant($user);
            if ($allowedCodes !== null) {
                $purchaseOrder->loadMissing('purchaseRequest.department');
                $deptCode = $purchaseOrder->purchaseRequest?->department?->code;
                if (! $deptCode || ! in_array($deptCode, $allowedCodes, true)) {
                    return Response::deny('غير مصرح بتسجيل فواتير لأقسام خارج نطاق اختصاصك المحاسبي.');
                }
            }
        }

        return Response::allow();
    }

    /**
     * Determine whether the user can match an invoice.
     */
    public function match(User $user, SupplierInvoice $invoice): Response
    {
        if ($user->hasAnyRole(['procurement_manager', 'general_manager', 'execution_manager'])) {
            return Response::deny('غير مصرح لك بمطابقة الفواتير المالية.');
        }

        if ($user->hasRole('admin') || $user->hasPermission('accounting.invoice.match')) {
            return Response::allow();
        }

        return Response::deny('غير مصرح لك بإجراء المطابقة الثلاثية للفواتير.');
    }
}
