import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Card, KpiPill, KpiPillsBar } from '../../components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/Table';
import ActionRequiredInbox, { ActionInboxItem } from '../../components/dashboard/ActionRequiredInbox';
import QuickLauncherBar from '../../components/dashboard/QuickLauncherBar';
import ErrorMessage from '../../components/ErrorMessage';
import LoadingSpinner from '../../components/LoadingSpinner';
import { parseApiError } from '../../utils/apiError';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';
import {
  ApprovedReceipt,
  SupplierInvoice,
  getApprovedReceiptsForAccountingApi,
  getSupplierInvoicesApi,
  matchSupplierInvoiceApi,
} from '../../api/supplierFinance';
import { getAccountingPurchaseOrdersApi } from '../../api/accounting';
import { getOwnPurchaseRequestsApi, submitPurchaseRequestApi } from '../../api/purchaseRequests';
import { PurchaseOrder } from '../../types/purchaseOrder';
import { PurchaseRequest } from '../../types/purchaseRequest';
import { getUnitLabel } from '../../utils/units';
import { formatCleanNumber } from '../../utils/numberFormat';

const cleanDate = (d?: string | null) => (d ? String(d).slice(0, 10) : '—');
const money = (value: string | number | null | undefined) =>
  `${formatCleanNumber(value)} ج.م`;

const receiptValue = (receipt: ApprovedReceipt) => {
  const po = receipt.purchase_order;
  if (po && (po.finalized_at || (po.status && !['PO_DRAFT', 'REJECTED', 'CANCELLED'].includes(po.status) && Number(po.grand_total) > 0))) {
    return Number(po.grand_total);
  }
  return (receipt.items || []).reduce((sum, item) => {
    const poItem = item.purchase_order_item;
    const finalQty = poItem?.quantity !== undefined ? Number(poItem.quantity) : Number(item.received_quantity || 0);
    const unitPrice = Number(poItem?.unit_price || 0);
    const lineTotal = poItem?.line_total !== undefined && Number(poItem.line_total) > 0
      ? Number(poItem.line_total)
      : Math.round(finalQty * unitPrice * 100) / 100;
    return sum + lineTotal;
  }, 0);
};

export const SiteAccountantDashboardPage: React.FC = () => {
  const { user, hasRole } = useAuth();
  const [receipts, setReceipts] = useState<ApprovedReceipt[]>([]);
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [ownRequests, setOwnRequests] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'RECEIPTS' | 'INVOICES' | 'ORDERS' | 'MY_REQUESTS'>('RECEIPTS');
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadDashboardData = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [receiptsData, invoicesData, posData, requestsData] = await Promise.all([
        getApprovedReceiptsForAccountingApi().catch(() => []),
        getSupplierInvoicesApi().catch(() => []),
        getAccountingPurchaseOrdersApi().catch(() => []),
        getOwnPurchaseRequestsApi().catch(() => []),
      ]);
      setReceipts(receiptsData || []);
      setInvoices(invoicesData || []);
      setPurchaseOrders(posData || []);
      setOwnRequests(requestsData || []);
    } catch (err) {
      if (!silent) setError(parseApiError(err).message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboardData(false);
  }, []);

  useRealtimeRefresh(() => {
    void loadDashboardData(true);
  });

  const pendingMatchInvoices = useMemo(
    () => invoices.filter((inv) => inv.matching_status === 'PENDING'),
    [invoices]
  );

  const draftRequests = useMemo(
    () => ownRequests.filter((r) => r.status === 'DRAFT'),
    [ownRequests]
  );

  const accountantScope = useMemo(() => {
    if (hasRole('licenses_accountant')) {
      return {
        dashboardTitle: 'لوحة حسابات التراخيص',
        defaultName: 'المهندس أحمد',
        deptBadge: 'قسم التراخيص',
        inboxTitle: 'المهام والإجراءات العاجلة المطلوبة منك الآن',
        defaultDeptName: 'قسم التراخيص',
        scopeDescription: 'متابعة أذونات استلام وأوامر شراء التراخيص، تسجيل فواتير الموردين، وإصدار طلبات الشراء.',
      };
    }
    if (hasRole('buffet_accountant')) {
      return {
        dashboardTitle: 'لوحة حسابات المكتبيات والبوفيه',
        defaultName: 'المهندسة شروق',
        deptBadge: 'قسم المكتبيات والبوفيه',
        inboxTitle: 'المهام والإجراءات العاجلة المطلوبة منكِ الآن',
        defaultDeptName: 'المكتبيات والبوفيه',
        scopeDescription: 'متابعة أذونات استلام وأوامر شراء المكتبيات والبوفيه، تسجيل فواتير الموردين، وإصدار طلبات الشراء.',
      };
    }
    return {
      dashboardTitle: 'لوحة متابعة الحسابات',
      defaultName: 'حبيبة',
      deptBadge: 'أقسام التنفيذ والتشطيبات والمباني',
      inboxTitle: 'المهام والإجراءات العاجلة المطلوبة منكِ الآن',
      defaultDeptName: 'التنفيذ والتشطيبات والمباني',
      scopeDescription: 'متابعة المهام والإجراءات العاجلة، تسجيل فواتير الموردين، ومطابقة أذونات الاستلام وإصدار طلبات الشراء.',
    };
  }, [user, hasRole]);

  // Build Action Required Inbox Items
  const actionInboxItems: ActionInboxItem[] = useMemo(() => {
    const items: ActionInboxItem[] = [];

    // 1. Approved Receipts waiting for invoice
    for (const receipt of receipts) {
      items.push({
        id: `rcpt-${receipt.id}`,
        rawId: receipt.id,
        type: 'RECEIPT',
        code: receipt.receipt_number,
        title: 'إذن استلام معتمد بانتظار تسجيل الفاتورة',
        subtitle: receipt.purchase_order?.supplier?.company_name || 'مورد غير محدد',
        department: receipt.purchase_order?.purchase_request?.department?.name || accountantScope.defaultDeptName,
        supplier: receipt.purchase_order?.supplier?.company_name,
        amount: receiptValue(receipt),
        urgency: 'HIGH',
        reason: 'تم اعتماد إذن الاستلام في الموقع وينتظر تسجيل فاتورة المورد الرسمية وترحيلها.',
        actionUrl: `/accounting/supplier-finance?tab=payments&purchase_receipt_id=${receipt.id}`,
        actionLabel: 'تسجيل الفاتورة',
        timeAgo: cleanDate(receipt.received_at),
        created_at: receipt.received_at || undefined,
        items_count: receipt.items?.length || 0,
        items_list: receipt.items?.map((it) => ({
          description: it.purchase_order_item?.item_name || it.purchase_order_item?.item_description || 'صنف',
          quantity: it.received_quantity,
          uom: it.purchase_order_item?.uom,
          specifications: it.purchase_order_item?.specifications,
          parcel: it.purchase_order_item?.item_reference,
          region: it.purchase_order_item?.region,
          unit_price: it.purchase_order_item?.unit_price,
          line_total: Number(it.received_quantity) * Number(it.purchase_order_item?.unit_price || 0),
        })),
      });
    }

    // 2. Invoices waiting for three-way match
    for (const invoice of pendingMatchInvoices) {
      items.push({
        id: `inv-${invoice.id}`,
        rawId: invoice.id,
        type: 'INVOICE',
        code: invoice.invoice_number,
        title: 'فاتورة مورد مسجلة بانتظار المطابقة الثلاثية',
        subtitle: invoice.supplier?.company_name || 'مورد غير محدد',
        department: invoice.purchase_order?.purchase_request?.department?.name,
        supplier: invoice.supplier?.company_name,
        amount: invoice.amount,
        urgency: 'NORMAL',
        reason: 'فاتورة مورد تم إدخالها وتتطلب تنفيذ المطابقة الثلاثية لإرسالها للصرف المالي.',
        actionUrl: '/accounting/supplier-finance?tab=payments',
        actionLabel: 'تنفيذ المطابقة',
        timeAgo: cleanDate(invoice.created_at || invoice.invoice_date),
        created_at: (invoice.created_at || invoice.invoice_date) ?? undefined,
      });
    }

    // 3. Draft PRs created by this site accountant
    for (const pr of draftRequests) {
      items.push({
        id: `pr-${pr.id}`,
        rawId: pr.id,
        type: 'PR',
        code: pr.request_number,
        title: pr.justification || 'مسودة طلب شراء',
        subtitle: `طلب شراء - ${pr.items?.length || 0} بنود`,
        department: pr.department?.name,
        urgency: 'NORMAL',
        reason: 'مسودة طلب شراء محفوظة لديك وجاهزة للإرسال لدورة المراجعة والاعتماد.',
        actionUrl: `/requests/${pr.id}`,
        actionLabel: 'إرسال للاعتماد',
        timeAgo: cleanDate(pr.created_at || pr.date_needed),
        created_at: pr.created_at || undefined,
        items_count: pr.items?.length || 0,
        items_list: pr.items?.map((it) => ({
          description: it.item_description || it.item?.name || 'صنف',
          quantity: it.quantity,
          uom: it.uom,
          parcel: it.item_reference,
          region: it.region,
        })),
        onDirectSubmit: async () => {
          await submitPurchaseRequestApi(pr.id);
          setActionSuccess(`تم إرسال طلب الشراء ${pr.request_number} بنجاح ✅`);
          await loadDashboardData(true);
        },
      });
    }

    return items;
  }, [receipts, pendingMatchInvoices, draftRequests]);

  const handleMatchInvoice = async (invoice: SupplierInvoice) => {
    setError(null);
    try {
      await matchSupplierInvoiceApi(invoice.id);
      setActionSuccess(`تمت مطابقة الفاتورة ${invoice.invoice_number} بنجاح ✅`);
      await loadDashboardData(true);
    } catch (err) {
      setError(parseApiError(err).message);
    }
  };

  if (loading) {
    return <LoadingSpinner message="جاري تحميل لوحة متابعة الحسابات..." fullScreen />;
  }

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      {/* Header Banner */}
      <div className="flex flex-col gap-3 rounded-2xl border border-cyan-800/60 bg-gradient-to-r from-slate-900 via-slate-900/95 to-cyan-950/40 p-4 sm:p-5 shadow-xl sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/20 border border-cyan-400/50 text-2xl shadow-inner">
            📊
          </span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-black text-slate-100">{accountantScope.dashboardTitle}</h1>
              <span className="rounded-xl border border-cyan-500/50 bg-cyan-950/80 px-2.5 py-0.5 text-[11px] font-black text-cyan-300">
                {user?.name || accountantScope.defaultName}
              </span>
              <span className="rounded-xl border border-amber-700/50 bg-amber-950/40 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                {accountantScope.deptBadge}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {accountantScope.scopeDescription}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:shrink-0">
          <Link to="/accounting/supplier-finance">
            <Button variant="primary" size="sm" className="font-bold flex items-center gap-1.5 shadow-md shadow-cyan-950/40">
              <span>🧾</span>
              <span>تسجيل فاتورة مورد</span>
            </Button>
          </Link>
          <Link to="/requests/create">
            <Button variant="secondary" size="sm" className="font-bold flex items-center gap-1.5 border-amber-700/60 text-amber-200 hover:bg-amber-950/40">
              <span>✍️</span>
              <span>إنشاء طلب شراء جديد</span>
            </Button>
          </Link>
        </div>
      </div>

      {error && <ErrorMessage error={error} onDismiss={() => setError(null)} onRetry={() => void loadDashboardData()} />}
      {actionSuccess && (
        <div className="rounded-xl border border-emerald-700/60 bg-emerald-950/40 p-3 text-xs font-bold text-emerald-300 flex items-center justify-between">
          <span>{actionSuccess}</span>
          <button type="button" onClick={() => setActionSuccess(null)} className="text-emerald-400 hover:text-white px-2">
            ✕
          </button>
        </div>
      )}

      {/* ── اختصارات الإجراءات السريعة (Quick Launcher Bar) ── */}
      <QuickLauncherBar className="mb-2" />

      {/* Action Required Inbox (الأخبار والمهام العاجلة المطلوبة فوراً) */}
      <ActionRequiredInbox
        title={accountantScope.inboxTitle}
        description="أذونات استلام معتمدة جاهزة للفوترة، وفواتير مسجلة تنتظر المطابقة، ومسودات طلباتك."
        roleName="قسم الحسابات"
        items={actionInboxItems}
        onItemActionComplete={() => void loadDashboardData(true)}
      />

      {/* KPI Pills Bar (Horizontal Slim Strip) */}
      <KpiPillsBar className="my-1">
        <KpiPill
          title="أذونات جاهزة للفوترة"
          value={receipts.length}
          accentColor="amber"
          icon={<span className="text-xs">🧾</span>}
          isActive={activeTab === 'RECEIPTS'}
          onClick={() => setActiveTab('RECEIPTS')}
          clickableHint="عرض أذونات الاستلام"
        />
        <KpiPill
          title="فواتير بانتظار المطابقة"
          value={pendingMatchInvoices.length}
          accentColor="cyan"
          icon={<span className="text-xs">⏳</span>}
          isActive={activeTab === 'INVOICES'}
          onClick={() => setActiveTab('INVOICES')}
          clickableHint="عرض فواتير المطابقة"
        />
        <KpiPill
          title="إجمالي الفواتير المسجلة"
          value={invoices.length}
          accentColor="emerald"
          icon={<span className="text-xs">📑</span>}
          isActive={activeTab === 'INVOICES'}
          onClick={() => setActiveTab('INVOICES')}
          clickableHint="عرض أرشيف الفواتير"
        />
        <KpiPill
          title="أوامر الشراء الجارية"
          value={purchaseOrders.length}
          accentColor="slate"
          icon={<span className="text-xs">📋</span>}
          isActive={activeTab === 'ORDERS'}
          onClick={() => setActiveTab('ORDERS')}
          clickableHint="عرض أوامر الشراء"
        />
        <KpiPill
          title="طلبات الشراء الخاصة بي"
          value={ownRequests.length}
          accentColor="slate"
          icon={<span className="text-xs">✍️</span>}
          isActive={activeTab === 'MY_REQUESTS'}
          onClick={() => setActiveTab('MY_REQUESTS')}
          clickableHint="عرض طلبات الشراء"
        />
      </KpiPillsBar>

      {/* Tab 1: Approved Receipts Waiting for Invoicing */}
      {activeTab === 'RECEIPTS' && (
        <Card className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-base font-black text-slate-100 flex items-center gap-2">
                <span>🧾</span> إذونات الاستلام المعتمدة الجاهزة للفوترة ({receipts.length})
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                معتمدة من مهندس الموقع وجاهزة لإدخال فاتورة المورد الرسمية وترحيلها.
              </p>
            </div>
            <Link to="/accounting/supplier-finance">
              <Button size="sm" variant="secondary" className="text-xs">
                فتح شاشة الفوترة الكاملة ←
              </Button>
            </Link>
          </div>

          {receipts.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>إذن الاستلام</TableHead>
                    <TableHead>أمر الشراء</TableHead>
                    <TableHead>المورد</TableHead>
                    <TableHead>القسم</TableHead>
                    <TableHead>تاريخ الاستلام</TableHead>
                    <TableHead>قيمة المستلم</TableHead>
                    <TableHead>الإجراء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receipts.slice(0, 10).map((receipt) => (
                    <TableRow key={receipt.id}>
                      <TableCell className="font-mono font-bold text-cyan-300 whitespace-nowrap">
                        {receipt.receipt_number}
                      </TableCell>
                      <TableCell className="font-mono whitespace-nowrap">
                        {receipt.purchase_order?.po_number || '—'}
                      </TableCell>
                      <TableCell className="font-bold text-slate-200">
                        {receipt.purchase_order?.supplier?.company_name || '—'}
                      </TableCell>
                      <TableCell className="text-slate-300">
                        {receipt.purchase_order?.purchase_request?.department?.name || '—'}
                      </TableCell>
                      <TableCell className="font-mono text-slate-300 whitespace-nowrap">
                        {cleanDate(receipt.received_at)}
                      </TableCell>
                      <TableCell className="font-mono font-bold text-emerald-300 whitespace-nowrap">
                        {money(receiptValue(receipt))}
                      </TableCell>
                      <TableCell>
                        <Link to={`/accounting/supplier-finance?tab=payments&purchase_receipt_id=${receipt.id}`}>
                          <Button size="sm" variant="primary" className="whitespace-nowrap font-bold">
                            تسجيل فاتورة
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-slate-500">
              ✨ لا توجد إذونات استلام معتمدة تنتظر الفوترة حالياً.
            </div>
          )}
        </Card>
      )}

      {/* Tab 2: Invoices and Matching Status */}
      {activeTab === 'INVOICES' && (
        <Card className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-base font-black text-slate-100 flex items-center gap-2">
                <span>📑</span> فواتير الموردين المسجلة ({invoices.length})
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                الفواتير المسجلة الخاصة بـ {accountantScope.deptBadge} وحالة المطابقة الثلاثية.
              </p>
            </div>
            <Link to="/accounting/supplier-finance">
              <Button size="sm" variant="secondary" className="text-xs">
                فتح سجل الفواتير الكامل ←
              </Button>
            </Link>
          </div>

          {invoices.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>رقم الفاتورة</TableHead>
                    <TableHead>المورد</TableHead>
                    <TableHead>أمر الشراء</TableHead>
                    <TableHead>تاريخ الفاتورة</TableHead>
                    <TableHead>قيمة الفاتورة</TableHead>
                    <TableHead>حالة المطابقة</TableHead>
                    <TableHead>الإجراء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.slice(0, 10).map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono font-bold text-cyan-300 whitespace-nowrap">
                        {inv.invoice_number}
                      </TableCell>
                      <TableCell className="font-bold text-slate-200">
                        {inv.supplier?.company_name || '—'}
                      </TableCell>
                      <TableCell className="font-mono whitespace-nowrap">
                        {inv.purchase_order?.po_number || '—'}
                      </TableCell>
                      <TableCell className="font-mono text-slate-300 whitespace-nowrap">
                        {cleanDate(inv.invoice_date)}
                      </TableCell>
                      <TableCell className="font-mono font-bold text-emerald-300 whitespace-nowrap">
                        {money(inv.amount)}
                      </TableCell>
                      <TableCell>
                        {inv.matching_status === 'MATCHED' ? (
                          <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-black text-emerald-300">
                            ✅ مطابقة
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-black text-amber-300">
                            ⏳ بانتظار المطابقة
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {inv.matching_status === 'PENDING' ? (
                          <Button
                            size="sm"
                            variant="primary"
                            className="whitespace-nowrap font-bold"
                            onClick={() => void handleMatchInvoice(inv)}
                          >
                            تنفيذ المطابقة
                          </Button>
                        ) : (
                          <span className="text-xs font-bold text-emerald-400">جاهزة للصرف</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-slate-500">
              لا توجد فواتير مسجلة حتى الآن.
            </div>
          )}
        </Card>
      )}

      {/* Tab 3: Purchase Orders */}
      {activeTab === 'ORDERS' && (
        <Card className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-base font-black text-slate-100 flex items-center gap-2">
                <span>📋</span> أوامر الشراء الصادرة ({purchaseOrders.length})
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                أوامر الشراء المعتمدة التابعة لـ {accountantScope.deptBadge} لمتابعة توريداتها.
              </p>
            </div>
            <Link to="/accounting/purchase-orders">
              <Button size="sm" variant="secondary" className="text-xs">
                عرض كافة أوامر الشراء ←
              </Button>
            </Link>
          </div>

          {purchaseOrders.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>رقم الأمر</TableHead>
                    <TableHead>المورد</TableHead>
                    <TableHead>القسم</TableHead>
                    <TableHead>إجمالي الأمر</TableHead>
                    <TableHead>حالة التوريد</TableHead>
                    <TableHead>الإجراء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchaseOrders.slice(0, 10).map((po) => (
                    <TableRow key={po.id}>
                      <TableCell className="font-mono font-bold text-cyan-300 whitespace-nowrap">
                        {po.po_number}
                      </TableCell>
                      <TableCell className="font-bold text-slate-200">
                        {po.supplier?.company_name || '—'}
                      </TableCell>
                      <TableCell className="text-slate-300">
                        {po.purchase_request?.department?.name || '—'}
                      </TableCell>
                      <TableCell className="font-mono font-bold text-emerald-300 whitespace-nowrap">
                        {money(po.grand_total)}
                      </TableCell>
                      <TableCell>
                        <span className="rounded-full bg-cyan-950 border border-cyan-800 px-2.5 py-0.5 text-[10px] font-bold text-cyan-300">
                          {po.delivery_status || po.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Link to={`/accounting/purchase-orders/${po.id}`}>
                          <Button size="sm" variant="secondary" className="whitespace-nowrap text-xs">
                            عرض التفاصيل
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-slate-500">
              لا توجد أوامر شراء صادرة حالياً.
            </div>
          )}
        </Card>
      )}

      {/* Tab 4: My Own Purchase Requests */}
      {activeTab === 'MY_REQUESTS' && (
        <Card className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-base font-black text-slate-100 flex items-center gap-2">
                <span>✍️</span> طلبات الشراء الخاصة بي ({ownRequests.length})
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                طلبات الشراء التي قمتِ بإنشائها ومتابعة مراحل اعتمادها.
              </p>
            </div>
            <Link to="/requests/create">
              <Button size="sm" variant="primary" className="text-xs font-bold">
                + طلب شراء جديد
              </Button>
            </Link>
          </div>

          {ownRequests.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>رقم الطلب</TableHead>
                    <TableHead>الغرض / المبرر</TableHead>
                    <TableHead>عدد البنود</TableHead>
                    <TableHead>تاريخ الاحتياج</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>الإجراء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ownRequests.slice(0, 10).map((pr) => (
                    <TableRow key={pr.id}>
                      <TableCell className="font-mono font-bold text-cyan-300 whitespace-nowrap">
                        {pr.request_number}
                      </TableCell>
                      <TableCell className="text-slate-200 max-w-[200px] truncate">
                        {pr.justification || '—'}
                      </TableCell>
                      <TableCell className="font-bold text-center">
                        {pr.items?.length || 0}
                      </TableCell>
                      <TableCell className="font-mono text-slate-300 whitespace-nowrap">
                        {cleanDate(pr.date_needed)}
                      </TableCell>
                      <TableCell>
                        <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-[10px] font-bold text-slate-200">
                          {pr.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Link to={`/requests/${pr.id}`}>
                          <Button size="sm" variant="secondary" className="whitespace-nowrap text-xs">
                            عرض الطلب
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-slate-500">
              لم تقومي بإنشاء أي طلبات شراء بعد. اضغطي على "طلب شراء جديد" لإنشاء أول طلب.
            </div>
          )}
        </Card>
      )}
    </div>
  );
};

export default SiteAccountantDashboardPage;
