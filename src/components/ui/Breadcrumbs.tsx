import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const LABELS: Record<string, string> = {
  admin: 'إدارة النظام',
  accounting: 'الحسابات',
  'general-manager': 'المدير العام',
  procurement: 'المشتريات',
  reviewer: 'المراجعة',
  warehouse: 'المخزن',
  'site-engineer': 'مهندس الموقع',
  employee: 'الموظف',
  requests: 'طلبات الشراء',
  create: 'إنشاء',
  edit: 'تعديل',
  notifications: 'الإشعارات',
  'my-archive': 'الأرشيف',
  profile: 'الملف الشخصي',
  preferences: 'التفضيلات',
  help: 'المساعدة',
  'system-monitor': 'مراقبة النظام',
  'request-tracker': 'مركز متابعة الطلبات',
  users: 'المستخدمون',
  roles: 'الأدوار',
  permissions: 'الصلاحيات',
  departments: 'الأقسام',
  categories: 'التصنيفات',
  items: 'الأصناف',
  suppliers: 'الموردون',
  'purchase-orders': 'أوامر الشراء',
  'purchase-requests': 'طلبات الشراء',
  'purchase-quotes': 'عروض الأسعار',
  'supplier-payments': 'فواتير الموردين والمطابقة',
  'supplier-accounts': 'حسابات وصرف الموردين',
  reports: 'التقارير',
};

const getLabel = (segment: string): string => {
  if (LABELS[segment]) return LABELS[segment];
  if (/^\d+$/.test(segment)) return `السجل رقم ${segment}`;
  return segment.replace(/-/g, ' ');
};

export const Breadcrumbs: React.FC = () => {
  const location = useLocation();
  const { hasRole } = useAuth();
  const isDeptAccountant = hasRole('site_accountant') || hasRole('licenses_accountant') || hasRole('buffet_accountant');
  const segments = location.pathname.split('/').filter(Boolean);

  return (
    <nav aria-label="مسار الصفحة" className="flex min-w-0 items-center gap-1 text-[10px] font-semibold text-slate-500">
      <Link to="/" className="inline-flex shrink-0 items-center gap-1 rounded px-1 py-0.5 hover:bg-slate-800 hover:text-cyan-300">
        <span aria-hidden="true">⌂</span>
        <span>الرئيسية</span>
      </Link>
      {segments.map((segment, index) => {
        let path = `/${segments.slice(0, index + 1).join('/')}`;
        if (index === 0 && segment === 'accounting' && isDeptAccountant) {
          path = '/site-accountant';
        }
        const isCurrent = index === segments.length - 1;
        return (
          <React.Fragment key={path}>
            <span className="shrink-0 text-slate-700" aria-hidden="true">‹</span>
            {isCurrent ? (
              <span className="truncate text-slate-400" aria-current="page">{getLabel(segment)}</span>
            ) : (
              <Link to={path} className="truncate rounded px-1 py-0.5 hover:bg-slate-800 hover:text-cyan-300">{getLabel(segment)}</Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
};

export default Breadcrumbs;
