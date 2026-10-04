import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getApprovedPurchaseRequestsApi, getProcurementAnalyticsApi, ProcurementAnalyticsResponse } from '../../api/procurement';
import { getPurchaseOrdersApi, getPendingActualPosApi } from '../../api/purchaseOrders';
import { PurchaseOrder } from '../../types/purchaseOrder';
import { PurchaseRequest } from '../../types/purchaseRequest';
import PurchaseOrderStatusBadge from '../../components/procurement/PurchaseOrderStatusBadge';
import DirectPoModal from '../../components/procurement/DirectPoModal';
import PurchaseOrderPrintModal from '../../components/procurement/PurchaseOrderPrintModal';
import LoadingSpinner from '../../components/LoadingSpinner';
import { KpiCard } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table';
import { CurrencyDisplay } from '../../components/ui/CurrencyDisplay';
import ProcurementCharts from '../../components/procurement/ProcurementCharts';
import ActionRequiredInbox, { ActionInboxItem } from '../../components/dashboard/ActionRequiredInbox';

export const ProcurementDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [prs, setPrs] = useState<PurchaseRequest[]>([]);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [pendingActualPos, setPendingActualPos] = useState<PurchaseOrder[]>([]);
  const [analytics, setAnalytics] = useState<ProcurementAnalyticsResponse | null>(null);
  const [period, setPeriod] = useState<string>('90');
  const [loading, setLoading] = useState<boolean>(true);

  const [isDirectPoModalOpen, setIsDirectPoModalOpen] = useState<boolean>(false);
  const [selectedPrintPo, setSelectedPrintPo] = useState<PurchaseOrder | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [approvedPrs, allPosPage, analyticsData, pendingActualPage] = await Promise.all([
        getApprovedPurchaseRequestsApi(),
        getPurchaseOrdersApi({ page: 1, per_page: 15 }),
        getProcurementAnalyticsApi(period),
        getPendingActualPosApi({ per_page: 20 }),
      ]);
      setPrs(approvedPrs || []);
      setPos(allPosPage?.data || []);
      setAnalytics(analyticsData);
      setPendingActualPos(pendingActualPage?.data || []);
    } catch (err) {
      console.error('Error loading procurement dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [period]);

  const countStatus = (s: string) => pos.filter(x => x.status === s).length;

  return (
    <div className="procurement-reference-page space-y-6 animate-fade-in" dir="rtl">
      {/* Top Banner & Quick الإجراءات */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center space-x-2 space-x-reverse">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
            <h1 className="text-xl font-black text-slate-100">إدارة المشتريات</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            متابعة وإصدار أوامر الشراء، مراجعة الطلبات المعتمدة، وإدارة علاقات الموردين بالنظام
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Distinct Button for Actual PO */}
          <Link to="/procurement/purchase-orders?status=PENDING_ACTUAL_PO">
            <button
              type="button"
              className="relative inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-black shadow-lg transition-all duration-200 cursor-pointer bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 hover:from-amber-500 hover:to-orange-500 text-white shadow-amber-950/50 border border-amber-400/50 active:scale-95"
            >
              <span className="text-sm">⚡</span>
              <span>إنشاء أمر الشراء الفعلي</span>
              {pendingActualPos.length > 0 && (
                <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-black leading-none text-amber-950 bg-amber-300 rounded-full shadow animate-pulse">
                  {pendingActualPos.length}
                </span>
              )}
            </button>
          </Link>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsDirectPoModalOpen(true)}
          >
            + أمر شراء مباشر
          </Button>
          <Link to="/procurement/purchase-requests">
            <Button variant="secondary" size="sm">
              الطلبات المعلقة ({prs.length})
            </Button>
          </Link>
          <Link to="/procurement/suppliers">
            <Button variant="secondary" size="sm">
              سجل الموردين
            </Button>
          </Link>
          <Link to="/procurement/reports">
            <Button variant="secondary" size="sm">
              التقارير الفورية
            </Button>
          </Link>
        </div>
      </div>

      {/* ── صندوق المهام والإجراءات المطلوبة منك الآن (Action Inbox) ── */}
      {(() => {
        // Detect PRs that have pending supplements awaiting procurement processing
        const supplementPrs = prs.filter(pr =>
          Array.isArray(pr.supplements) &&
          pr.supplements.some((s: any) => s.status === 'REVIEWER_APPROVED' || s.status === 'SUBMITTED')
        );

        const procurementActionItems: ActionInboxItem[] = [
          // ── Supplement Fast-Track Items (CRITICAL — appear first) ──
          ...supplementPrs.map((pr) => ({
            id: `supplement-pr-${pr.id}`,
            rawId: pr.id,
            type: 'PR' as const,
            code: pr.request_number,
            title: `⚡ كمالة تكميلية — ${pr.justification || pr.request_number}`,
            subtitle: 'إصدار ملحق توريد سريع لنفس المورد',
            department: pr.department?.name,
            requester: pr.requester?.name,
            amount: pr.total_estimated_cost ? Number(pr.total_estimated_cost) : undefined,
            urgency: 'CRITICAL' as const,
            reason: 'طلب كمالة تكميلية معتمد من المراجع ينتظر إصدار أمر توريد سريع لنفس المورد — تأخيره يعطل العمل بالموقع.',
            actionUrl: `/procurement?openSupplement=${pr.id}&tab=0`,
            actionLabel: '⚡ إصدار ملحق توريد سريع',
            timeAgo: pr.created_at ? pr.created_at.slice(0, 10) : undefined,
            request_type: pr.request_type,
            date_needed: pr.date_needed || undefined,
            priority: 'URGENT' as const,
            parcel_number: pr.items?.[0]?.item_reference || undefined,
            region: pr.items?.[0]?.region || undefined,
            items_count: pr.items?.length || 0,
            items_list: pr.items?.map((it) => ({
              description: it.item_description || it.item?.name || 'صنف',
              quantity: it.quantity,
              uom: it.uom,
              parcel: it.item_reference,
              region: it.region,
              unit_price: it.estimated_unit_price,
              line_total: it.estimated_line_total,
              specifications: it.specifications,
            })),
          })),
          // ── Normal Approved PRs (excluding supplement ones already shown) ──
          ...prs
            .filter(pr => !supplementPrs.find(sp => sp.id === pr.id))
            .map((pr) => ({
              id: `pr-${pr.id}`,
              rawId: pr.id,
              type: 'PR' as const,
              code: pr.request_number,
              title: pr.justification || (pr.request_type === 'OFFICE_SUPPLIES' ? 'طلب مستلزمات مكتبية' : 'طلب مواد مشروعات'),
              subtitle: pr.justification ? (pr.request_type === 'OFFICE_SUPPLIES' ? 'مستلزمات مكتبية' : 'مشتريات مواقع') : undefined,
              department: pr.department?.name,
              requester: pr.requester?.name,
              amount: pr.total_estimated_cost ? Number(pr.total_estimated_cost) : undefined,
              urgency: pr.priority === 'HIGH' ? ('CRITICAL' as const) : ('NORMAL' as const),
              reason: 'طلب معتمد جاهز للتسعير أو إصدار أمر الشراء فوراً',
              actionUrl: `/procurement/purchase-orders/create?pr=${pr.id}`,
              actionLabel: 'إصدار أمر الشراء',
              timeAgo: pr.created_at ? pr.created_at.slice(0, 10) : undefined,
              request_type: pr.request_type,
              date_needed: pr.date_needed || undefined,
              priority: pr.priority,
              parcel_number: pr.items?.[0]?.item_reference || undefined,
              region: pr.items?.[0]?.region || undefined,
              items_count: pr.items?.length || 0,
              items_list: pr.items?.map((it) => ({
                description: it.item_description || it.item?.name || 'صنف',
                quantity: it.quantity,
                uom: it.uom,
                parcel: it.item_reference,
                region: it.region,
                unit_price: it.estimated_unit_price,
                line_total: it.estimated_line_total,
                specifications: it.specifications,
              })),
            })),
          ...pos
            .filter((p) => p.status === 'PENDING_ACTUAL_PO')
            .map((po) => ({
              id: `po-actual-${po.id}`,
              rawId: po.id,
              type: 'PO' as const,
              code: po.po_number,
              title: `📦 إذن الاستلام معتمد — مطلوب إصدار أمر الشراء الفعلي (${po.supplier?.company_name || 'المورد'})`,
              subtitle: 'الموقع أتم الاستلام — يرجى مطابقة وتعديل الأسعار والكميات لإصدار الأمر الفعلي للحسابات',
              department: po.department?.name || po.purchase_request?.department?.name,
              supplier: po.supplier?.company_name,
              amount: Number(po.grand_total || 0),
              urgency: 'CRITICAL' as const,
              reason: 'تم استلام البضاعة واعتماد إذن الاستلام بالموقع — أمر الشراء بانتظار إصدار الأمر الفعلي من المشتريات لإرساله للإدارة المالية.',
              actionUrl: `/procurement/purchase-orders/${po.id}/edit`,
              actionLabel: '⚡ إصدار أمر الشراء الفعلي',
              timeAgo: po.updated_at ? po.updated_at.slice(0, 10) : undefined,
              items_count: po.items?.length || 0,
              items_list: po.items?.map((it: any) => ({
                description: it.item_description || it.item?.name || 'بند توريد',
                quantity: it.quantity,
                uom: it.uom,
                unit_price: it.unit_price,
                line_total: it.line_total,
              })),
            })),
          ...pos
            .filter((p) => p.status === 'RETURNED_TO_PROCUREMENT')
            .map((po) => ({
              id: `po-ret-${po.id}`,
              rawId: po.id,
              type: 'PO' as const,
              code: po.po_number,
              title: po.supplier?.company_name || 'أمر شراء معاد',
              department: po.department?.name || po.purchase_request?.department?.name,
              supplier: po.supplier?.company_name,
              amount: Number(po.grand_total || 0),
              urgency: 'CRITICAL' as const,
              reason: 'أمر شراء معاد من الحسابات/الإدارة يتطلب التعديل والمراجعة',
              actionUrl: `/procurement/purchase-orders/${po.id}/edit`,
              actionLabel: 'تعديل أمر الشراء',
              timeAgo: po.created_at ? po.created_at.slice(0, 10) : undefined,
              items_count: po.items?.length || 0,
              items_list: po.items?.map((it: any) => ({
                description: it.item_description || it.item?.name || 'بند توريد',
                quantity: it.quantity,
                uom: it.uom,
                unit_price: it.unit_price,
                line_total: it.line_total,
              })),
            })),
        ];

        return (
          <ActionRequiredInbox
            title="المهام والإجراءات المطلوبة من إدارة المشتريات الآن"
            description="الطلبات المعتمدة الجاهزة للتعميد وأوامر الشراء التي تحتاج تدخلك الفوري."
            roleName="إدارة المشتريات والتعاقدات"
            onItemActionComplete={() => loadData()}
            items={procurementActionItems}
          />
        );
      })()}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          title="إجمالي أوامر الشراء الفعلية"
          value={<CurrencyDisplay amount={analytics?.metrics.total_value || 0} amountClassName="text-base font-bold font-mono text-cyan-400" />}
          subtext="أمر شراء فعلي معتمد"
          accentColor="cyan"
          to="/procurement/reports"
          clickableHint="عرض التقارير ←"
        />
        <KpiCard
          title="طلبات معتمدة بانتظار PO"
          value={prs.length}
          subtext="جاهزة للإصدار"
          accentColor="amber"
          to="/procurement/approved-requests"
          clickableHint="إصدار أوامر شراء ←"
        />
        <KpiCard
          title="بانتظار الإصدار الفعلي"
          value={pendingActualPos.length || countStatus('PENDING_ACTUAL_PO')}
          subtext="استلام معتمد بالـ GRN"
          accentColor="amber"
          to="/procurement/purchase-orders?status=PENDING_ACTUAL_PO"
          clickableHint="إصدار الأوامر الفعلية ←"
        />
        <KpiCard
          title="أوامر مسودة DRAFT"
          value={countStatus('PO_DRAFT')}
          subtext="قيد التحرير"
          accentColor="slate"
          to="/procurement/purchase-orders?status=PO_DRAFT"
          clickableHint="عرض المسودات ←"
        />
        <KpiCard
          title="أوامر معادة للمشتريات"
          value={countStatus('RETURNED_TO_PROCUREMENT')}
          subtext="تطلب تعديل"
          accentColor="rose"
          to="/procurement/purchase-orders?status=RETURNED_TO_PROCUREMENT"
          clickableHint="تعديل وإعادة إرسال ←"
        />
        <KpiCard
          title="معتمدة نهائياً"
          value={countStatus('FINAL_APPROVED')}
          subtext="جاهزة للتوريد"
          accentColor="emerald"
          to="/procurement/purchase-orders?status=FINAL_APPROVED"
          clickableHint="متابعة التوريدات ←"
        />
      </div>

      {/* ── قسم أوامر الشراء الفعلية المعتمدة بالـ GRN (مطلوب إصدار أمر الشراء الفعلي) ── */}
      <section className="rounded-2xl border-2 border-amber-500/50 bg-gradient-to-br from-amber-950/30 via-slate-900 to-slate-950 p-5 shadow-xl shadow-amber-950/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-amber-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-xl shadow-inner shrink-0">
              ⚡
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-black text-slate-100">
                  قسم أوامر الشراء الفعلية (بانتظار الإصدار النهائي)
                </h2>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                  استلام معتمد بالـ GRN
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                الطلبات المستلمة بالموقع والمعتمد إذن استلامها، تتطلب مطابقة الكميات وتعديل الأسعار لإصدار أمر الشراء الفعلي النهائي للحسابات.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link to="/procurement/purchase-orders?status=PENDING_ACTUAL_PO">
              <Button variant="secondary" size="sm" className="text-xs border-amber-700/50 hover:bg-amber-950/40 text-amber-300">
                أرشيف الأوامر الفعلية ({pendingActualPos.length}) ←
              </Button>
            </Link>
          </div>
        </div>

        {pendingActualPos.length === 0 ? (
          <div className="text-center py-6 text-slate-400 text-xs bg-slate-900/60 rounded-xl border border-slate-800/80 mt-4">
            🎉 لا توجد طلبات معلقة بانتظار إصدار أمر الشراء الفعلي حالياً. تم استكمال جميع الاستلامات المعتمدة وتحويلها للحسابات.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-amber-900/30">
                    <TableHead className="text-amber-200">رقم أمر الشراء</TableHead>
                    <TableHead className="text-amber-200">طلب الشراء والقسم</TableHead>
                    <TableHead className="text-amber-200">المورد</TableHead>
                    <TableHead className="text-amber-200">إذن الاستلام المعتمد بالموقع</TableHead>
                    <TableHead className="text-amber-200">تاريخ الاستلام</TableHead>
                    <TableHead className="text-amber-200">الحالة الحالية</TableHead>
                    <TableHead className="text-amber-200 text-center">الإجراء المباشر</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingActualPos.slice(0, 6).map((po) => {
                    const latestReceipt = po.receipts && po.receipts.length > 0 ? po.receipts[0] : null;
                    return (
                      <TableRow key={`pending-actual-${po.id}`} className="hover:bg-amber-950/20 border-b border-amber-900/20">
                        <TableCell className="font-mono font-bold text-amber-300">
                          <Link to={`/procurement/purchase-orders/${po.id}`} className="hover:underline">
                            {po.po_number}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs font-semibold text-slate-200">{po.purchase_request?.request_number || 'مباشر'}</div>
                          <div className="text-[11px] text-slate-400">{po.purchase_request?.department?.name || po.department?.name || '—'}</div>
                        </TableCell>
                        <TableCell className="text-slate-200 font-medium">
                          {po.supplier?.company_name || 'غير محدد'}
                        </TableCell>
                        <TableCell>
                          {latestReceipt ? (
                            <div className="space-y-0.5">
                              <span className="font-mono text-xs font-bold text-cyan-300">{latestReceipt.receipt_number}</span>
                              {latestReceipt.site_engineer && (
                                <div className="text-[10px] text-slate-400">اعتماد: {latestReceipt.site_engineer.name}</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs">معتمد بالـ GRN</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-slate-400">
                          {latestReceipt?.received_at || po.actual_delivery_date || '—'}
                        </TableCell>
                        <TableCell>
                          <PurchaseOrderStatusBadge status={po.status} />
                        </TableCell>
                        <TableCell className="text-center">
                          <Link to={`/procurement/purchase-orders/${po.id}/edit`}>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black shadow-md transition-all cursor-pointer bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-amber-900/40 border border-amber-400/40 active:scale-95"
                            >
                              <span>⚡ إنشاء أمر الشراء الفعلي</span>
                            </button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-3">
              {pendingActualPos.slice(0, 6).map((po) => {
                const latestReceipt = po.receipts && po.receipts.length > 0 ? po.receipts[0] : null;
                return (
                  <article key={`mobile-pending-actual-${po.id}`} className="rounded-xl border border-amber-500/40 bg-slate-900/80 p-4 shadow">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Link to={`/procurement/purchase-orders/${po.id}`} className="font-mono text-sm font-black text-amber-300 hover:underline">
                          {po.po_number}
                        </Link>
                        <p className="text-xs text-slate-400 mt-0.5">{po.purchase_request?.request_number || 'أمر مباشر'} • {po.supplier?.company_name}</p>
                      </div>
                      <PurchaseOrderStatusBadge status={po.status} />
                    </div>
                    {latestReceipt && (
                      <div className="mt-3 p-2 bg-amber-950/30 rounded border border-amber-900/40 text-[11px] text-slate-300 flex justify-between">
                        <span>إذن الاستلام: <strong className="font-mono text-cyan-300">{latestReceipt.receipt_number}</strong></span>
                        <span>تاريخ: {latestReceipt.received_at || '—'}</span>
                      </div>
                    )}
                    <div className="mt-3">
                      <Link to={`/procurement/purchase-orders/${po.id}/edit`} className="block">
                        <button
                          type="button"
                          className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-black shadow-md bg-gradient-to-r from-amber-600 to-orange-600 text-white"
                        >
                          <span>⚡ إنشاء أمر الشراء الفعلي</span>
                        </button>
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {!loading && <ProcurementCharts orders={pos} />}

      {loading ? (
        <LoadingSpinner message="جاري تحديث بيانات المشتريات..." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Approved Requests Queue */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider">طلبات الشراء المعتمدة بانتظار إصدار أمر الشراء</h2>
              <Link to="/procurement/purchase-requests" className="text-xs font-bold text-cyan-400 hover:underline">
                عرض الكل ({prs.length}) &larr;
              </Link>
            </div>

            {prs.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs bg-slate-900/40 rounded-xl border border-slate-800">
                لا توجد طلبات شراء معتمدة بانتظار إصدار أمر الشراء.
              </div>
            ) : (
              <>
                <div className="hidden min-w-0 md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap">رقم الطلب</TableHead>
                        <TableHead className="whitespace-nowrap">القسم</TableHead>
                        <TableHead className="whitespace-nowrap text-center">الإجراء</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {prs.slice(0, 5).map(pr => (
                        <TableRow key={pr.id}>
                          <TableCell className="whitespace-nowrap font-mono font-bold text-cyan-400">{pr.request_number}</TableCell>
                          <TableCell className="max-w-[180px] text-slate-400">{pr.department?.name || '—'}</TableCell>
                          <TableCell className="text-center">
                            <Link to={`/procurement/purchase-orders/create?pr=${pr.id}`}>
                              <Button variant="primary" size="sm" className="whitespace-nowrap px-2 py-0.5 text-[10px]">+ أمر شراء</Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="space-y-3 md:hidden">
                  {prs.slice(0, 5).map(pr => (
                    <article key={`mobile-pr-${pr.id}`} className="min-w-0 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                      <div className="flex min-w-0 items-center justify-between gap-3">
                        <span className="min-w-0 break-normal font-mono text-sm font-black text-cyan-300">{pr.request_number}</span>
                        <span className="shrink-0 text-[11px] text-slate-500">طلب معتمد</span>
                      </div>
                      <p className="mt-3 break-normal text-xs leading-6 text-slate-300"><span className="text-slate-500">القسم: </span>{pr.department?.name || 'غير محدد'}</p>
                      <Link to={`/procurement/purchase-orders/create?pr=${pr.id}`} className="mt-4 block">
                        <Button variant="primary" size="sm" className="w-full whitespace-nowrap">إنشاء أمر شراء</Button>
                      </Link>
                    </article>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Recent أوامر الشراء */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider">أحدث أوامر الشراء الصادرة</h2>
              <Link to="/procurement/purchase-orders" className="text-xs font-bold text-cyan-400 hover:underline">
                أرشيف أوامر الشراء ({pos.length}) &larr;
              </Link>
            </div>

            {pos.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs bg-slate-900/40 rounded-xl border border-slate-800">
                لا توجد أوامر شراء صادرة حالياً.
              </div>
            ) : (
              <>
                <div className="hidden min-w-0 md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap">رقم الأمر</TableHead>
                        <TableHead className="whitespace-nowrap">المورد</TableHead>
                        <TableHead className="whitespace-nowrap">الحالة</TableHead>
                        <TableHead className="whitespace-nowrap">الإجمالي</TableHead>
                        <TableHead className="whitespace-nowrap text-center">عرض / طباعة</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pos.slice(0, 5).map(po => (
                        <TableRow key={po.id}>
                          <TableCell className="whitespace-nowrap font-mono font-bold text-cyan-400">
                            <Link to={`/procurement/purchase-orders/${po.id}`} className="hover:underline">{po.po_number}</Link>
                          </TableCell>
                          <TableCell className="max-w-[190px] font-bold text-slate-100">{po.supplier?.company_name || 'غير محدد'}</TableCell>
                          <TableCell className="whitespace-nowrap"><PurchaseOrderStatusBadge status={po.status} /></TableCell>
                          <TableCell className="whitespace-nowrap"><CurrencyDisplay amount={po.grand_total} amountClassName="font-mono font-bold text-emerald-400" /></TableCell>
                          <TableCell className="text-center">
                            <Button variant="secondary" size="sm" onClick={() => setSelectedPrintPo(po)} className="whitespace-nowrap px-2 py-0.5 text-[10px]">معاينة وطباعة</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="space-y-3 md:hidden">
                  {pos.slice(0, 5).map(po => (
                    <article key={`mobile-po-${po.id}`} className="min-w-0 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <Link to={`/procurement/purchase-orders/${po.id}`} className="min-w-0 break-normal font-mono text-sm font-black text-cyan-300 hover:underline">{po.po_number}</Link>
                        <div className="shrink-0"><PurchaseOrderStatusBadge status={po.status} /></div>
                      </div>
                      <dl className="mt-4 grid min-w-0 grid-cols-1 gap-3 text-xs min-[420px]:grid-cols-2">
                        <div className="min-w-0"><dt className="text-slate-500">المورد</dt><dd className="mt-1 break-normal font-bold leading-6 text-slate-100">{po.supplier?.company_name || 'غير محدد'}</dd></div>
                        <div className="min-w-0"><dt className="text-slate-500">الإجمالي</dt><dd className="mt-1 break-normal"><CurrencyDisplay amount={po.grand_total} amountClassName="font-mono font-bold text-emerald-400" /></dd></div>
                      </dl>
                      <Button variant="secondary" size="sm" onClick={() => setSelectedPrintPo(po)} className="mt-4 w-full whitespace-nowrap">معاينة وطباعة</Button>
                    </article>
                  ))}
                </div>
              </>
            )}
          </div>

        </div>
      )}

      {/* Direct PO Creation Modal */}
      <DirectPoModal
        isOpen={isDirectPoModalOpen}
        onClose={() => setIsDirectPoModalOpen(false)}
        onSuccess={(newPoId) => navigate(`/procurement/purchase-orders/${newPoId}/edit`)}
      />

      {/* Purchase Order طباعة Preview Modal */}
      {selectedPrintPo && (
        <PurchaseOrderPrintModal
          po={selectedPrintPo}
          isOpen={!!selectedPrintPo}
          onClose={() => setSelectedPrintPo(null)}
        />
      )}
    </div>
  );
};

export default ProcurementDashboardPage;
