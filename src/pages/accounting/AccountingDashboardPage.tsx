import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAccountingPurchaseOrdersApi, getAccountingPurchaseOrderApi, approveAccountingPurchaseOrderApi } from '../../api/accounting';
import { getDirectAccountingPurchaseRequestsApi, approveDirectAccountingPurchaseRequestApi } from '../../api/accountingPurchaseRequests';
import { getSupplierAccountsApi, SupplierAccountSummary } from '../../api/supplierFinance';
import { getPendingQuoteRequestsApi } from '../../api/purchaseQuotes';
import { PurchaseOrder } from '../../types/purchaseOrder';
import { PurchaseRequest } from '../../types/purchaseRequest';
import { Button } from '../../components/ui/Button';
import { KpiCard, KpiPill, KpiPillsBar } from '../../components/ui/Card';
import { CurrencyDisplay } from '../../components/ui/CurrencyDisplay';
import PurchaseOrderPrintModal from '../../components/procurement/PurchaseOrderPrintModal';
import { DashboardBars, DashboardDonut } from '../../components/ui/DashboardCharts';
import ActionRequiredInbox, { ActionInboxItem } from '../../components/dashboard/ActionRequiredInbox';
import QuickLauncherBar from '../../components/dashboard/QuickLauncherBar';
import { formatCleanNumber } from '../../utils/numberFormat';
import { formatDateTime24h } from '../../utils/dateTime';

import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';

export const AccountingDashboardPage: React.FC = () => {
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [directPrs, setDirectPrs] = useState<PurchaseRequest[]>([]);
  const [quoteRequests, setQuoteRequests] = useState<PurchaseRequest[]>([]);
  const [accounts, setAccounts] = useState<SupplierAccountSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPo, setSelectedPo] = useState<PurchaseOrder | null>(null);
  const [openingPoId, setOpeningPoId] = useState<number | null>(null);

  const openPurchaseOrder = async (po: PurchaseOrder) => {
    setOpeningPoId(po.id);
    try {
      const fullPo = await getAccountingPurchaseOrderApi(po.id);
      setSelectedPo(fullPo);
    } catch {
      setSelectedPo(po);
    } finally {
      setOpeningPoId(null);
    }
  };

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [posData, directData, accountsData, quotesData] = await Promise.all([
        getAccountingPurchaseOrdersApi().catch(() => []),
        getDirectAccountingPurchaseRequestsApi().catch(() => []),
        getSupplierAccountsApi().catch(() => []),
        getPendingQuoteRequestsApi().catch(() => []),
      ]);
      setPos(posData);
      setDirectPrs(directData);
      setAccounts(accountsData);
      setQuoteRequests(quotesData);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void loadData(false);
  }, []);

  useRealtimeRefresh(() => { void loadData(true); });

  if (loading) {
    return <div className="text-cyan-400 animate-pulse text-xs p-6" dir="rtl">جاري تحميل بيانات لوحة المحاسبة...</div>;
  }

  const isActualPo = (p: any) =>
    Boolean(p.finalized_at) ||
    ['APPROVED_BY_ACCOUNTING', 'FINAL_APPROVED'].includes(p.status) ||
    (p.status === 'ISSUED' && Boolean(p.finalized_at));

  const pendingReviewPos = pos.filter(x => x.status === 'PENDING_ACCOUNTING_REVIEW');
  const issuedPos = pos.filter(x => x.status === 'ISSUED');
  const actualPos = pos.filter(isActualPo);
  const totalActualPoEgp = actualPos.reduce((acc, x) => acc + Number(x.grand_total || 0), 0);
  const upcomingDeliveriesCount = pos.filter(x => x.delivery_status === 'NOT_STARTED' || x.delivery_status === 'PARTIAL').length;
  const overdueOrIndebtedAccounts = accounts.filter(a => a.balance > 0);
  const totalAccountingTasks = directPrs.length + pendingReviewPos.length;

  const deliverySegments = [
    { label: 'تم الإصدار', value: issuedPos.length, color: '#22c55e' },
    { label: 'قيد التوريد', value: upcomingDeliveriesCount, color: '#f59e0b' },
    { label: 'مكتملة', value: pos.filter(x => x.delivery_status === 'COMPLETE').length, color: '#06b6d4' },
    { label: 'متأخرة', value: pos.filter(x => x.delivery_status === 'LATE').length, color: '#f43f5e' },
  ];
  // القسم spend breakdown (Actual POs only to prevent inflated numbers)
  const deptSpendMap = actualPos.reduce((acc: Record<string, number>, p) => {
    const deptName = p.purchase_request?.department?.name || 'عام';
    acc[deptName] = (acc[deptName] || 0) + Number(p.grand_total || 0);
    return acc;
  }, {});

  // المورد spend breakdown (Actual POs only)
  const supplierSpendMap = actualPos.reduce((acc: Record<string, number>, p) => {
    const supName = p.supplier?.company_name || 'غير محدد';
    acc[supName] = (acc[supName] || 0) + Number(p.grand_total || 0);
    return acc;
  }, {});
  const departmentSegments = Object.entries(deptSpendMap).map(([label, value]) => ({ label, value }));
  const supplierSegments = Object.entries(supplierSpendMap).map(([label, value]) => ({ label, value }));

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      {/* Header */}
      <div className="border-b border-slate-800 pb-4">
        <div className="flex justify-between items-center flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <span>📊</span> لوحة المحاسبة والرقابة المالية
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              الاطلاع على الحركات المالية والتحليلات والمهام المحاسبية المطلوبة بـ (EGP / ج.م).
            </p>
          </div>
          <span className="bg-blue-900/40 text-blue-300 border border-blue-700/50 px-3 py-1.5 rounded-lg text-xs font-medium">
            🏦 الإدارة المالية والمحاسبة
          </span>
        </div>
      </div>

      {/* ── اختصارات الإجراءات السريعة (Quick Launcher Bar) ── */}
      <QuickLauncherBar className="mb-2" />

      {/* ── صندوق المهام والإجراءات المالية المطلوبة منك الآن (Action Inbox) ── */}
      {(() => {
        const accountingActionItems: ActionInboxItem[] = [
          ...pendingReviewPos.map((po) => ({
            id: `po-${po.id}`,
            rawId: po.id,
            type: 'PO' as const,
            code: po.po_number,
            title: po.supplier?.company_name || 'أمر شراء صادر',
            department: po.department?.name || (po.purchase_request as any)?.department?.name,
            supplier: po.supplier?.company_name,
            amount: Number(po.grand_total || 0),
            urgency: 'HIGH' as const,
            reason: 'أمر شراء صادر بانتظار المراجعة والاعتماد المالي',
            actionUrl: `/accounting/purchase-orders/${po.id}`,
            actionLabel: 'المراجعة والاعتماد المالي',
            created_at: (po.purchase_request as any)?.created_at || po.created_at || undefined,
            timeAgo: ((po.purchase_request as any)?.created_at || po.created_at) ? formatDateTime24h((po.purchase_request as any)?.created_at || po.created_at) : undefined,
            items_count: po.items?.length || 0,
            items_list: po.items?.map((it: any) => {
              const poQty = Number(it.quantity ?? it.actual_quantity ?? 0);
              const price = Number(it.unit_price || 0);
              const lineTotal = it.line_total !== undefined && it.line_total !== null && Number(it.line_total) > 0
                ? Number(it.line_total)
                : Math.round(poQty * price * 100) / 100;
              return {
                description: it.item_description || it.item?.name || 'بند توريد',
                quantity: poQty,
                uom: it.uom,
                unit_price: it.unit_price,
                line_total: lineTotal,
                specifications: it.specifications,
                parcel: it.item_reference,
                region: it.region,
              };
            }),
            onDirectApprove: async (_item: any, comment?: string) => {
              await approveAccountingPurchaseOrderApi(po.id, { comment, financial_notes: comment });
              await loadData(true);
            },
            directApproveLabel: 'اعتماد مالي فوري لأمر الشراء',
          })),
          ...directPrs.map((pr: any) => ({
            id: `pr-${pr.id}`,
            rawId: pr.id,
            type: 'PR' as const,
            code: pr.request_number,
            title: pr.justification || (pr.request_type === 'OFFICE_SUPPLIES' ? 'طلب شراء مباشر' : 'طلب مواد مشروعات'),
            department: pr.department?.name,
            requester: pr.requester?.name,
            amount: pr.total_estimated_cost ? Number(pr.total_estimated_cost) : undefined,
            urgency: pr.priority === 'HIGH' ? ('CRITICAL' as const) : ('NORMAL' as const),
            reason: 'طلب شراء بالمسار المباشر بانتظار موافقة وتحديد أسعار الحسابات',
            actionUrl: `/accounting/purchase-requests?open=${pr.id}`,
            actionLabel: 'مراجعة وتحديد الأسعار والاعتماد',
            created_at: pr.created_at || undefined,
            timeAgo: pr.created_at ? formatDateTime24h(pr.created_at) : undefined,
            request_type: pr.request_type,
            date_needed: pr.date_needed || undefined,
            priority: pr.priority,
            parcel_number: pr.items?.[0]?.item_reference || undefined,
            region: pr.items?.[0]?.region || undefined,
            items_count: pr.items?.length || 0,
            items_list: pr.items?.map((it: any) => ({
              description: it.item_description || it.item?.name || 'صنف',
              quantity: it.quantity,
              uom: it.uom,
              parcel: it.item_reference,
              region: it.region,
              unit_price: it.estimated_unit_price,
              line_total: it.estimated_line_total,
            })),
          })),

          // 4. Pending Quotes for Accounting Verification / Pricing
          ...quoteRequests.map((q) => ({
            id: `quote-${q.id}`,
            rawId: q.id,
            type: 'QUOTE' as const,
            code: q.request_number,
            title: q.justification || 'عروض أسعار بانتظار المراجعة والترشيح',
            subtitle: `${q.quotes?.length || 'عدة'} عروض أسعار مسجلة للمراجعة والتدقيق المالي`,
            department: q.department?.name,
            requester: q.requester?.name,
            amount: q.total_estimated_cost ? Number(q.total_estimated_cost) : undefined,
            urgency: 'HIGH' as const,
            reason: 'عروض أسعار مسجلة بانتظار الرقابة والمراجعة المالية وترشيح الأسعار',
            actionUrl: `/accounting/purchase-quotes?open=${q.id}`,
            actionLabel: 'مراجعة عروض الأسعار والترشيح',
            created_at: q.created_at || undefined,
            timeAgo: q.created_at ? formatDateTime24h(q.created_at) : undefined,
            items_count: q.items?.length || 0,
            items_list: q.items?.map((it) => ({
              description: it.item_description || it.item?.name || 'صنف',
              quantity: it.quantity,
              uom: it.uom,
              parcel: it.item_reference,
              region: it.region,
              unit_price: it.estimated_unit_price,
              line_total: it.estimated_line_total,
            })),
          })),
        ];

        return (
          <ActionRequiredInbox
            title="المهام والإجراءات المالية المطلوبة منك الآن"
            description="أوامر الشراء وإذونات الاستلام وفواتير الموردين التي تتطلب مراجعتك أو اعتمادك أو الصرف."
            roleName="الإدارة المالية والمحاسبة"
            onItemActionComplete={() => loadData(true)}
            items={accountingActionItems}
          />
        );
      })()}

      {/* Slim Horizontal KPI Pills */}
      <KpiPillsBar className="my-2">
        <KpiPill
          title="أوامر الشراء المصدرة"
          value={`${pos.length} أمر`}
          accentColor="cyan"
          icon={<span className="text-xs">📋</span>}
          to="/accounting/purchase-orders"
          clickableHint="أرشيف الأوامر ←"
        />
        <KpiPill
          title="إجمالي المشتريات الفعلية"
          value={<CurrencyDisplay amount={totalActualPoEgp} amountClassName="font-bold font-mono text-emerald-400 text-xs" />}
          accentColor="emerald"
          icon={<span className="text-xs">💵</span>}
          to="/accounting/reports"
          clickableHint="التقارير المالية ←"
        />
        <KpiPill
          title="توريدات قيد المتابعة"
          value={upcomingDeliveriesCount}
          accentColor="amber"
          icon={<span className="text-xs">🚚</span>}
          to="/accounting/purchase-orders"
          clickableHint="متابعة الاستلام ←"
        />
        <KpiPill
          title="الموردين النشطين"
          value={Object.keys(supplierSpendMap).length}
          accentColor="purple"
          icon={<span className="text-xs">🏢</span>}
          to="/accounting/supplier-finance"
          clickableHint="حسابات الموردين ←"
        />
      </KpiPillsBar>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DashboardBars title="الإنفاق الفعلي حسب القسم" subtitle="بناءً على أوامر الشراء الفعلية المعتمدة" segments={departmentSegments} unit="ج.م" />
        <DashboardBars title="الإنفاق الفعلي حسب المورد" subtitle="بناءً على أوامر الشراء الفعلية المعتمدة" segments={supplierSegments} unit="ج.م" />
      </div>

      {/* Recent PO Issues List */}
      <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">أحدث أوامر الشراء المصدرة</h3>
          <Link to="/accounting/purchase-orders" className="text-xs text-cyan-400 hover:underline">
            عرض الكل &rarr;
          </Link>
        </div>
        <div className="divide-y divide-slate-800 text-xs">
          {pos.slice(0, 5).map(p => (
            <div key={p.id} className="py-2.5 flex justify-between items-center">
              <div>
                <button type="button" onClick={() => void openPurchaseOrder(p)} disabled={openingPoId === p.id} className="font-mono font-bold text-cyan-400 hover:underline disabled:opacity-60">
                  {openingPoId === p.id ? 'جاري الفتح...' : p.po_number}
                </button>
                <span className="text-slate-400 mr-3">{p.supplier?.company_name || 'مورد'}</span>
              </div>
              <div className="font-mono font-bold text-emerald-400">
                {formatCleanNumber(p.grand_total)} ج.م
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedPo && (
        <PurchaseOrderPrintModal po={selectedPo} isOpen={true} onClose={() => setSelectedPo(null)} />
      )}
    </div>
  );
};

export default AccountingDashboardPage;
