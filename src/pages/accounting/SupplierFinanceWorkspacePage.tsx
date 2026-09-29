import React from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { SupplierAccountsPage } from './SupplierAccountsPage';
import { SupplierPaymentsPage } from './SupplierPaymentsPage';

export const SupplierFinanceWorkspacePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const { hasRole } = useAuth();

  const isSiteAccountant = hasRole('site_accountant') && !hasRole('accountant') && !hasRole('admin');

  const isPaymentsTarget =
    location.pathname.includes('supplier-payments') ||
    searchParams.has('purchase_receipt_id') ||
    searchParams.has('receipt_id') ||
    searchParams.has('po') ||
    searchParams.has('payment_id') ||
    searchParams.get('tab') === 'invoicing' ||
    searchParams.get('tab') === 'payments';

  const defaultTab = (location.pathname.includes('supplier-accounts') || searchParams.has('supplier_id')) ? 'accounts' : 'payments';
  const rawTab = searchParams.get('tab');
  const currentTab = (rawTab === 'invoicing' || rawTab === 'payments' || isPaymentsTarget) && !searchParams.has('supplier_id')
    ? 'payments'
    : (rawTab || (searchParams.has('supplier_id') ? 'accounts' : defaultTab));

  const setTab = (tab: 'accounts' | 'payments') => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="space-y-4 animate-fade-in" dir="rtl">
      {/* Top Navigation Tabs Header (Hidden on print) */}
      <div className="print:hidden flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 p-2.5 rounded-2xl shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-1.5 p-1 bg-slate-950/80 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setTab('accounts')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${
              currentTab === 'accounts'
                ? 'bg-[#2a2111]/80 text-[#f0d695] border border-[#c7a45b]/50 shadow-md shadow-[#a47a2c]/10'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <span>🏦</span>
            <span>كشف وحسابات وصرف الموردين</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('payments')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${
              currentTab === 'payments'
                ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-700/50 shadow-md shadow-cyan-950/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <span>🧾</span>
            <span>فواتير الموردين والمطابقة</span>
          </button>
        </div>

        <div className="text-[11px] font-bold px-3 py-1 rounded-xl flex items-center gap-2">
          {isSiteAccountant ? (
            <span className="text-amber-300 bg-amber-950/50 border border-amber-800/50 px-2.5 py-0.5 rounded-lg">
              🏗️ قسم الحسابات: أقسام التنفيذ والتشطيبات والمباني
            </span>
          ) : (
            <span className="text-slate-400">
              💼 مساحة عمل المدير المالي
            </span>
          )}
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {currentTab === 'payments' ? (
          <SupplierPaymentsPage />
        ) : (
          <SupplierAccountsPage />
        )}
      </div>
    </div>
  );
};

export default SupplierFinanceWorkspacePage;
