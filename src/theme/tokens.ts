export const themeTokens = {
  colors: {
    bg: {
      primary: '#0B1220',
      secondary: '#0F172A',
    },
    surface: {
      base: '#111827',
      card: '#172033',
      hover: '#1E293B',
    },
    primary: {
      DEFAULT: '#0EA5E9',
      dark: '#0284C7',
      light: '#38BDF8',
    },
    success: {
      DEFAULT: '#10B981',
      dark: '#059669',
    },
    warning: {
      DEFAULT: '#F59E0B',
      dark: '#D97706',
    },
    danger: {
      DEFAULT: '#EF4444',
      dark: '#DC2626',
    },
    text: {
      primary: '#F8FAFC',
      secondary: '#E2E8F0',
      tertiary: '#CBD5E1',
    },
    muted: {
      DEFAULT: '#94A3B8',
      dark: '#64748B',
    },
    border: {
      DEFAULT: '#243247',
      light: '#334155',
    },
  },
  typography: {
    fontFamily: "'Tajawal', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
};

export interface StatusConfig {
  labelAr: string;
  labelEn: string;
  badgeClass: string;
  dotClass: string;
}

export const statusConfigs: Record<string, StatusConfig> = {
  DRAFT: {
    labelAr: 'مسودة',
    labelEn: 'Draft',
    badgeClass: 'bg-slate-800/90 text-slate-300 border-slate-700/80',
    dotClass: 'bg-slate-400',
  },
  SUBMITTED: {
    labelAr: 'تم الإرسال',
    labelEn: 'Submitted',
    badgeClass: 'bg-blue-950/80 text-blue-300 border-blue-800/80',
    dotClass: 'bg-blue-400',
  },
  UNDER_REVIEW: {
    labelAr: 'قيد المراجعة',
    labelEn: 'Under Review',
    badgeClass: 'bg-indigo-950/80 text-indigo-300 border-indigo-800/80',
    dotClass: 'bg-indigo-400',
  },
  PENDING_EXECUTIVE_APPROVAL: {
    labelAr: 'بانتظار قرار المدير التنفيذي',
    labelEn: 'Pending Executive Approval',
    badgeClass: 'bg-violet-950/80 text-violet-300 border-violet-800/80',
    dotClass: 'bg-violet-400',
  },
  PENDING_ACCOUNTING_APPROVAL: {
    labelAr: 'بانتظار الموافقة المالية',
    labelEn: 'Pending Accounting Approval',
    badgeClass: 'bg-amber-950/80 text-amber-300 border-amber-800/80',
    dotClass: 'bg-amber-400',
  },
  PENDING_QUOTE_RECOMMENDATIONS: {
    labelAr: 'بانتظار ترشيح العروض',
    labelEn: 'Pending Quote Recommendations',
    badgeClass: 'bg-fuchsia-950/80 text-fuchsia-300 border-fuchsia-800/80',
    dotClass: 'bg-fuchsia-400',
  },
  PENDING_EXECUTIVE_QUOTE_DECISION: {
    labelAr: 'بانتظار قرار العروض',
    labelEn: 'Pending Executive Quote Decision',
    badgeClass: 'bg-purple-950/80 text-purple-300 border-purple-800/80',
    dotClass: 'bg-purple-400',
  },
  APPROVED_BY_REVIEWER: {
    labelAr: 'معتمد',
    labelEn: 'Approved',
    badgeClass: 'bg-cyan-950/80 text-cyan-300 border-cyan-800/80',
    dotClass: 'bg-cyan-400',
  },
  APPROVED: {
    labelAr: 'معتمد',
    labelEn: 'Approved',
    badgeClass: 'bg-cyan-950/80 text-cyan-300 border-cyan-800/80',
    dotClass: 'bg-cyan-400',
  },
  REJECTED: {
    labelAr: 'مرفوض',
    labelEn: 'Rejected',
    badgeClass: 'bg-rose-950/80 text-rose-300 border-rose-800/80',
    dotClass: 'bg-rose-400',
  },
  PENDING_PROCUREMENT_APPROVAL: {
    labelAr: 'بانتظار اعتماد المشتريات',
    labelEn: 'Pending Procurement',
    badgeClass: 'bg-cyan-950/80 text-cyan-300 border-cyan-800/80',
    dotClass: 'bg-cyan-400',
  },
  APPROVED_BY_PROCUREMENT: {
    labelAr: 'معتمد من المشتريات',
    labelEn: 'Approved by Procurement',
    badgeClass: 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80',
    dotClass: 'bg-emerald-400',
  },
  PO_DRAFT: {
    labelAr: 'امر شراء - مسودة',
    labelEn: 'PO Draft',
    badgeClass: 'bg-slate-800/90 text-slate-300 border-slate-700/80',
    dotClass: 'bg-slate-400',
  },
  PENDING_ACCOUNTING_REVIEW: {
    labelAr: 'في انتظار الحسابات',
    labelEn: 'Pending Accounting Review',
    badgeClass: 'bg-amber-950/80 text-amber-300 border-amber-800/80',
    dotClass: 'bg-amber-400',
  },
  PENDING_ACTUAL_PO: {
    labelAr: 'بانتظار أمر الشراء الفعلي',
    labelEn: 'Pending Actual PO',
    badgeClass: 'bg-gradient-to-r from-amber-950/90 to-orange-950/90 text-amber-200 border-amber-500/80 shadow-xs shadow-amber-950/50 font-bold',
    dotClass: 'bg-amber-400 animate-pulse',
  },
  RETURNED_TO_PROCUREMENT: {
    labelAr: 'معاد للمشتريات',
    labelEn: 'Returned to Procurement',
    badgeClass: 'bg-orange-950/80 text-orange-300 border-orange-800/80',
    dotClass: 'bg-orange-400',
  },
  APPROVED_BY_ACCOUNTING: {
    labelAr: 'معتمد من الحسابات',
    labelEn: 'Approved by Accounting',
    badgeClass: 'bg-sky-950/80 text-sky-300 border-sky-800/80',
    dotClass: 'bg-sky-400',
  },
  ISSUED: {
    labelAr: 'تم الإصدار',
    labelEn: 'Issued',
    badgeClass: 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80',
    dotClass: 'bg-emerald-400',
  },
  FINAL_APPROVED: {
    labelAr: 'معتمد نهائياً',
    labelEn: 'Final Approved',
    badgeClass: 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80',
    dotClass: 'bg-emerald-400',
  },
  CANCELLED: {
    labelAr: 'ملغي',
    labelEn: 'Cancelled',
    badgeClass: 'bg-gray-950/80 text-gray-400 border-gray-700/80',
    dotClass: 'bg-gray-500',
  },
};
