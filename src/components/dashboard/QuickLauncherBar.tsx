import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getPrimaryRoleSlug } from '../../routes/roleRouting';

export interface QuickShortcutItem {
  id: string;
  label: string;
  icon: string;
  to: string;
  badge?: string | number;
  variant?: 'primary' | 'emerald' | 'amber' | 'indigo' | 'rose' | 'slate';
  description?: string;
  onClick?: () => void;
}

interface QuickLauncherBarProps {
  title?: string;
  shortcuts?: QuickShortcutItem[];
  className?: string;
}

const VARIANT_STYLES: Record<string, { bg: string; border: string; text: string; hoverBg: string; shadow: string }> = {
  primary: {
    bg: 'bg-cyan-950/40',
    border: 'border-cyan-500/40',
    text: 'text-cyan-300',
    hoverBg: 'hover:bg-cyan-900/50 hover:border-cyan-400',
    shadow: 'hover:shadow-cyan-950/50',
  },
  emerald: {
    bg: 'bg-emerald-950/40',
    border: 'border-emerald-500/40',
    text: 'text-emerald-300',
    hoverBg: 'hover:bg-emerald-900/50 hover:border-emerald-400',
    shadow: 'hover:shadow-emerald-950/50',
  },
  amber: {
    bg: 'bg-amber-950/40',
    border: 'border-amber-500/40',
    text: 'text-amber-300',
    hoverBg: 'hover:bg-amber-900/50 hover:border-amber-400',
    shadow: 'hover:shadow-amber-950/50',
  },
  indigo: {
    bg: 'bg-indigo-950/40',
    border: 'border-indigo-500/40',
    text: 'text-indigo-300',
    hoverBg: 'hover:bg-indigo-900/50 hover:border-indigo-400',
    shadow: 'hover:shadow-indigo-950/50',
  },
  rose: {
    bg: 'bg-rose-950/40',
    border: 'border-rose-500/40',
    text: 'text-rose-300',
    hoverBg: 'hover:bg-rose-900/50 hover:border-rose-400',
    shadow: 'hover:shadow-rose-950/50',
  },
  slate: {
    bg: 'bg-slate-900/60',
    border: 'border-slate-800',
    text: 'text-slate-200',
    hoverBg: 'hover:bg-slate-850 hover:border-slate-700',
    shadow: 'hover:shadow-slate-900/40',
  },
};

export const QuickLauncherBar: React.FC<QuickLauncherBarProps> = ({
  title = 'اختصارات الوصول السريع',
  shortcuts,
  className = '',
}) => {
  const { user, hasRole, hasPermission } = useAuth();
  const primaryRole = getPrimaryRoleSlug(user);

  // Derive role-specific shortcuts if not provided explicitly
  const resolvedShortcuts: QuickShortcutItem[] = React.useMemo(() => {
    if (shortcuts && shortcuts.length > 0) return shortcuts;

    const items: QuickShortcutItem[] = [];

    // Employee Shortcuts
    if (hasRole('employee') && !hasRole('general_manager') && !hasRole('reviewer') && !hasRole('procurement_manager') && !hasRole('accountant')) {
      if (hasPermission('purchase_request.create')) {
        items.push({
          id: 'emp-create',
          label: 'إنشاء طلب شراء جديد',
          icon: '➕',
          to: '/employee/requests/create',
          variant: 'primary',
          description: 'بدء طلب شراء مستلزمات أو مواد مشروع',
        });
        items.push({
          id: 'emp-favorites',
          label: 'الطلبات المفضلة',
          icon: '⭐',
          to: '/requests/favorites',
          variant: 'amber',
          description: 'استخدام القوالب والطلبات المحفوظة مسبقاً',
        });
      }
      items.push(
        { id: 'emp-list', label: 'متابعة طلباتي الحالية', icon: '📋', to: '/employee/requests', variant: 'slate' },
        { id: 'emp-archive', label: 'أرشيف الإجراءات', icon: '🗄️', to: '/my-archive', variant: 'slate' }
      );
      return items;
    }

    // Reviewer Shortcuts
    if (hasRole('reviewer')) {
      items.push(
        { id: 'rev-reqs', label: 'مراجعة طلبات القسم', icon: '⚡', to: '/reviewer/requests', variant: 'primary' },
        { id: 'rev-quotes', label: 'ترشيح عروض الأسعار', icon: '⚖️', to: '/reviewer/purchase-quotes', variant: 'amber' },
        { id: 'rev-receipts', label: 'أذونات الاستلام بالموقع', icon: '🚚', to: '/site-engineer', variant: 'emerald' },
        { id: 'rev-archive', label: 'سجل المراجعات', icon: '🗄️', to: '/my-archive', variant: 'slate' }
      );
      return items;
    }

    // Procurement Manager Shortcuts
    if (hasRole('procurement_manager')) {
      items.push(
        { id: 'proc-queue', label: 'طابور الطلبات المعتمدة', icon: '⚡', to: '/procurement/purchase-requests', variant: 'primary' },
        { id: 'proc-approved-quotes', label: 'الأسعار المعتمدة للتعميد', icon: '⚖️', to: '/procurement/purchase-requests?tab=approved-quotes', variant: 'emerald' },
        { id: 'proc-pos', label: 'أرشيف أوامر الشراء', icon: '📑', to: '/procurement/purchase-orders', variant: 'slate' },
        { id: 'proc-suppliers', label: 'إدارة الموردين', icon: '🏢', to: '/procurement/suppliers', variant: 'amber' },
        { id: 'proc-reports', label: 'التقارير والتحليلات', icon: '📊', to: '/procurement/reports', variant: 'indigo' }
      );
      return items;
    }

    // Financial Director (Accountant) Shortcuts
    if (hasRole('accountant') && !hasRole('site_accountant') && !hasRole('licenses_accountant') && !hasRole('buffet_accountant')) {
      items.push(
        { id: 'acc-prs', label: 'اعتماد الطلبات المباشرة', icon: '⚡', to: '/accounting/purchase-requests', variant: 'primary' },
        { id: 'acc-quotes', label: 'الرأي المالي للعروض', icon: '⚖️', to: '/accounting/purchase-quotes', variant: 'amber' },
        { id: 'acc-pos', label: 'أوامر الشراء للحسابات', icon: '📑', to: '/accounting/purchase-orders', variant: 'slate' },
        { id: 'acc-suppliers', label: 'كشوف حسابات الموردين', icon: '🏦', to: '/accounting/supplier-accounts', variant: 'emerald' },
        { id: 'acc-reports', label: 'التقارير المالية', icon: '📊', to: '/accounting/reports', variant: 'indigo' }
      );
      return items;
    }

    // Department Accountant (Site / Licenses / Buffet) Shortcuts
    if (hasRole('site_accountant') || hasRole('licenses_accountant') || hasRole('buffet_accountant')) {
      items.push(
        { id: 'siteacc-invoice', label: 'فواتير ودفعات الموردين', icon: '🧾', to: '/accounting/supplier-payments', variant: 'primary' },
        { id: 'siteacc-accounts', label: 'كشف حساب مورد وسداد', icon: '🏦', to: '/accounting/supplier-accounts', variant: 'emerald' },
        { id: 'siteacc-pos', label: 'أوامر الشراء المرتبطة', icon: '📑', to: '/accounting/purchase-orders', variant: 'slate' },
        { id: 'siteacc-archive', label: 'أرشيف إجراءاتي', icon: '🗄️', to: '/my-archive', variant: 'slate' }
      );
      return items;
    }

    // General Manager Shortcuts
    if (hasRole('general_manager')) {
      items.push(
        { id: 'gm-prs', label: 'قرارات طلبات الشراء', icon: '🛡️', to: '/general-manager/purchase-requests', variant: 'primary' },
        { id: 'gm-quotes', label: 'البت والترسية التنفيذية', icon: '⚖️', to: '/general-manager/purchase-quotes', variant: 'amber' },
        { id: 'gm-pos', label: 'اعتماد أوامر الشراء', icon: '📑', to: '/general-manager/purchase-orders', variant: 'emerald' },
        { id: 'gm-reports', label: 'التقارير والتحليلات التنفيذية', icon: '📊', to: '/general-manager/reports', variant: 'indigo' }
      );
      return items;
    }

    // Warehouse Keeper Shortcuts
    if (hasRole('warehouse_keeper') && !hasRole('site_engineer')) {
      items.push(
        { id: 'wh-receipts', label: 'مهام استلام وفحص المستودع', icon: '📦', to: '/warehouse', variant: 'amber' },
        { id: 'wh-site', label: 'استلامات محالة للموقع', icon: '🚚', to: '/site-engineer', variant: 'slate' },
        { id: 'wh-archive', label: 'أرشيف أذونات الاستلام', icon: '🗄️', to: '/my-archive', variant: 'slate' }
      );
      return items;
    }

    // Site Engineer Shortcuts
    if (hasRole('site_engineer')) {
      items.push(
        { id: 'se-receipts', label: 'فحص واعتماد استلام الموقع', icon: '🚚', to: '/site-engineer', variant: 'emerald' },
        { id: 'se-requests', label: 'طلبات مشروعات الموقع', icon: '📋', to: '/employee/requests', variant: 'slate' },
        { id: 'se-archive', label: 'أرشيف الاستلامات الهندسية', icon: '🗄️', to: '/my-archive', variant: 'slate' }
      );
      return items;
    }

    // Admin Shortcuts
    if (hasRole('admin')) {
      items.push(
        { id: 'adm-users', label: 'إدارة المستخدمين', icon: '👥', to: '/admin/users', variant: 'primary' },
        { id: 'adm-roles', label: 'الأدوار والصلاحيات', icon: '🛡️', to: '/admin/roles', variant: 'amber' },
        { id: 'adm-depts', label: 'الأقسام والتصنيفات', icon: '🏢', to: '/admin/departments', variant: 'indigo' },
        { id: 'adm-monitor', label: 'مراقبة النظام System Monitor', icon: '📡', to: '/admin/system-monitor', variant: 'rose' }
      );
      return items;
    }

    // Default Fallback
    return [
      { id: 'default-reqs', label: 'طلبات الشراء', icon: '📋', to: '/requests', variant: 'primary' },
      { id: 'default-archive', label: 'أرشيف الإجراءات', icon: '🗄️', to: '/my-archive', variant: 'slate' },
    ];
  }, [shortcuts, user, hasRole, hasPermission, primaryRole]);

  if (resolvedShortcuts.length === 0) return null;

  return (
    <div className={`space-y-2.5 ${className}`} dir="rtl">
      <div className="flex items-center justify-between text-xs font-bold text-slate-400">
        <span className="flex items-center gap-1.5">
          <span>⚡</span>
          <span>{title}</span>
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
        {resolvedShortcuts.map((item) => {
          const style = VARIANT_STYLES[item.variant || 'slate'] || VARIANT_STYLES.slate;
          return (
            <Link
              key={item.id}
              to={item.to}
              onClick={item.onClick}
              className={`group relative flex items-center gap-2.5 rounded-xl border p-2.5 sm:p-3 transition-all duration-150 active:scale-[0.98] ${style.bg} ${style.border} ${style.hoverBg} ${style.shadow} hover:shadow-md cursor-pointer`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-950/60 text-lg border border-slate-800/80 group-hover:scale-105 transition-transform">
                {item.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className={`truncate text-xs font-bold ${style.text} group-hover:text-white transition-colors`}>
                    {item.label}
                  </span>
                  {item.badge !== undefined && (
                    <span className="shrink-0 rounded-full bg-cyan-500/20 px-1.5 py-0.2 text-[10px] font-black text-cyan-300 border border-cyan-500/40">
                      {item.badge}
                    </span>
                  )}
                </div>
                {item.description && (
                  <p className="truncate text-[10px] text-slate-400 mt-0.5 hidden sm:block">
                    {item.description}
                  </p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default QuickLauncherBar;
