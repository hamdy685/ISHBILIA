export interface StatusBadgeConfig {
  label: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  icon?: string;
}

/**
 * Universal Arabic translator and badge styler for all document statuses across PR, PO, Receipts, and Invoices.
 */
export const getWorkflowStatusBadge = (status: string | null | undefined): StatusBadgeConfig => {
  if (!status) {
    return {
      label: 'غير محدد',
      bgClass: 'bg-slate-950/60',
      textClass: 'text-slate-400',
      borderClass: 'border-slate-800',
    };
  }

  const s = status.toUpperCase().trim();

  switch (s) {
    // ── Approved / Confirmed ──
    case 'APPROVED':
    case 'FINAL_APPROVED':
      return {
        label: 'معتمد ومطابق',
        bgClass: 'bg-emerald-950/70',
        textClass: 'text-emerald-300',
        borderClass: 'border-emerald-600/50',
        icon: '✓',
      };

    case 'APPROVED_BY_ACCOUNTING':
    case 'ACCOUNTING_APPROVED':
      return {
        label: 'معتمد ماليًا',
        bgClass: 'bg-teal-950/70',
        textClass: 'text-teal-300',
        borderClass: 'border-teal-600/50',
        icon: '💰',
      };

    case 'APPROVED_BY_REVIEWER':
      return {
        label: 'معتمد من المراجع',
        bgClass: 'bg-cyan-950/70',
        textClass: 'text-cyan-300',
        borderClass: 'border-cyan-600/50',
        icon: '✓',
      };

    case 'APPROVED_BY_PROCUREMENT':
      return {
        label: 'معتمد من المشتريات',
        bgClass: 'bg-indigo-950/70',
        textClass: 'text-indigo-300',
        borderClass: 'border-indigo-600/50',
        icon: '✓',
      };

    case 'APPROVED_BY_GM':
      return {
        label: 'معتمد من المدير العام',
        bgClass: 'bg-purple-950/70',
        textClass: 'text-purple-300',
        borderClass: 'border-purple-600/50',
        icon: '👑',
      };

    case 'COMPLETED':
      return {
        label: 'مكتمل بالكامل',
        bgClass: 'bg-emerald-950/80',
        textClass: 'text-emerald-200',
        borderClass: 'border-emerald-500/60',
        icon: '✓',
      };

    // ── In Progress / Review / Pending ──
    case 'PENDING_SITE_ENGINEER':
      return {
        label: 'بانتظار مهندس الموقع',
        bgClass: 'bg-amber-950/70',
        textClass: 'text-amber-300',
        borderClass: 'border-amber-600/60',
        icon: '⏳',
      };

    case 'WAREHOUSE_RECEIPT_SUBMITTED':
    case 'SUBMITTED_BY_WAREHOUSE':
      return {
        label: 'تم تسليم المخزن',
        bgClass: 'bg-purple-950/70',
        textClass: 'text-purple-300',
        borderClass: 'border-purple-600/50',
        icon: '📦',
      };

    case 'PENDING_ACCOUNTING_REVIEW':
    case 'PENDING_ACCOUNTING_APPROVAL':
      return {
        label: 'بانتظار مراجعة الحسابات',
        bgClass: 'bg-yellow-950/70',
        textClass: 'text-yellow-300',
        borderClass: 'border-yellow-600/50',
        icon: '⏳',
      };

    case 'PENDING_EXECUTIVE_APPROVAL':
      return {
        label: 'بانتظار المدير التنفيذي',
        bgClass: 'bg-amber-950/70',
        textClass: 'text-amber-300',
        borderClass: 'border-amber-600/50',
        icon: '⏳',
      };

    case 'PENDING_PROCUREMENT_APPROVAL':
      return {
        label: 'بانتظار المشتريات',
        bgClass: 'bg-sky-950/70',
        textClass: 'text-sky-300',
        borderClass: 'border-sky-600/50',
        icon: '⏳',
      };

    case 'PENDING_QUOTE_RECOMMENDATIONS':
      return {
        label: 'بانتظار عروض الأسعار',
        bgClass: 'bg-yellow-950/70',
        textClass: 'text-yellow-300',
        borderClass: 'border-yellow-600/50',
        icon: '📑',
      };

    case 'PENDING_EXECUTIVE_QUOTE_DECISION':
      return {
        label: 'بانتظار قرار العروض',
        bgClass: 'bg-amber-950/70',
        textClass: 'text-amber-300',
        borderClass: 'border-amber-600/50',
        icon: '⚖️',
      };

    case 'PENDING_ACTUAL_PO':
      return {
        label: 'بالموقع - بانتظار الأمر الفعلي',
        bgClass: 'bg-amber-950/70',
        textClass: 'text-amber-300',
        borderClass: 'border-amber-600/50',
        icon: '🏗️',
      };

    case 'ACTUAL_PO_ISSUED':
      return {
        label: 'أمر شراء فعلي معتمد',
        bgClass: 'bg-emerald-950/70',
        textClass: 'text-emerald-300',
        borderClass: 'border-emerald-600/50',
        icon: '📑',
      };

    case 'GRN_PENDING':
      return {
        label: 'بانتظار فحص الاستلام',
        bgClass: 'bg-yellow-950/70',
        textClass: 'text-yellow-300',
        borderClass: 'border-yellow-600/50',
        icon: '🔍',
      };

    case 'ISSUED':
    case 'PO_ISSUED':
      return {
        label: 'أمر شراء صادر',
        bgClass: 'bg-blue-950/70',
        textClass: 'text-blue-300',
        borderClass: 'border-blue-600/50',
        icon: '📤',
      };

    case 'PARTIALLY_RECEIVED':
      return {
        label: 'استلام جزئي',
        bgClass: 'bg-orange-950/70',
        textClass: 'text-orange-300',
        borderClass: 'border-orange-600/50',
        icon: '📦',
      };

    case 'RECEIVED':
      return {
        label: 'تم الاستلام',
        bgClass: 'bg-emerald-950/70',
        textClass: 'text-emerald-300',
        borderClass: 'border-emerald-600/50',
        icon: '✓',
      };

    case 'UNDER_REVIEW':
      return {
        label: 'قيد المراجعة',
        bgClass: 'bg-sky-950/70',
        textClass: 'text-sky-300',
        borderClass: 'border-sky-600/50',
        icon: '🔍',
      };

    case 'SUBMITTED':
      return {
        label: 'تم الإرسال',
        bgClass: 'bg-slate-900',
        textClass: 'text-slate-300',
        borderClass: 'border-slate-700',
        icon: '📨',
      };

    case 'DRAFT':
      return {
        label: 'مسودة',
        bgClass: 'bg-slate-950',
        textClass: 'text-slate-400',
        borderClass: 'border-slate-800',
        icon: '📝',
      };

    case 'PENDING':
      return {
        label: 'قيد الانتظار',
        bgClass: 'bg-slate-900',
        textClass: 'text-slate-300',
        borderClass: 'border-slate-700',
        icon: '⏳',
      };

    // ── Rejected / Cancelled / Voided ──
    case 'REJECTED':
      return {
        label: 'مرفوض',
        bgClass: 'bg-red-950/70',
        textClass: 'text-red-300',
        borderClass: 'border-red-700/60',
        icon: '✕',
      };

    case 'CANCELLED':
      return {
        label: 'ملغي بأمر إداري',
        bgClass: 'bg-rose-950/70',
        textClass: 'text-rose-300',
        borderClass: 'border-rose-700/60',
        icon: '🚫',
      };

    case 'VOIDED':
      return {
        label: 'ملغي / باطل',
        bgClass: 'bg-rose-950/70',
        textClass: 'text-rose-300',
        borderClass: 'border-rose-700/60',
        icon: '🚫',
      };

    // ── Invoices ──
    case 'UNINVOICED':
      return {
        label: 'بدون فاتورة',
        bgClass: 'bg-slate-950',
        textClass: 'text-slate-400',
        borderClass: 'border-slate-800',
      };

    case 'INVOICED':
      return {
        label: 'تم الفوترة',
        bgClass: 'bg-teal-950/70',
        textClass: 'text-teal-300',
        borderClass: 'border-teal-700/60',
        icon: '🧾',
      };

    case 'PAID':
      return {
        label: 'مدفوعة',
        bgClass: 'bg-emerald-950/70',
        textClass: 'text-emerald-300',
        borderClass: 'border-emerald-700/60',
        icon: '✓',
      };

    case 'PARTIALLY_PAID':
      return {
        label: 'مدفوعة جزئياً',
        bgClass: 'bg-amber-950/70',
        textClass: 'text-amber-300',
        borderClass: 'border-amber-700/60',
      };

    default:
      return {
        label: s.replace(/_/g, ' '),
        bgClass: 'bg-slate-950',
        textClass: 'text-slate-300',
        borderClass: 'border-slate-700',
      };
  }
};

/**
 * Returns just the plain Arabic label for CSV export or text display.
 */
export const getWorkflowStatusLabel = (status: string | null | undefined): string => {
  return getWorkflowStatusBadge(status).label;
};
