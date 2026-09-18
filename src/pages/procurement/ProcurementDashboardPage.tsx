import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getApprovedPurchaseRequestsApi, getProcurementAnalyticsApi, ProcurementAnalyticsResponse } from '../../api/procurement';
import { getPurchaseOrdersApi } from '../../api/purchaseOrders';
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
  const [analytics, setAnalytics] = useState<ProcurementAnalyticsResponse | null>(null);
  const [period, setPeriod] = useState<string>('90');
  const [loading, setLoading] = useState<boolean>(true);

  const [isDirectPoModalOpen, setIsDirectPoModalOpen] = useState<boolean>(false);
  const [selectedPrintPo, setSelectedPrintPo] = useState<PurchaseOrder | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [approvedPrs, allPosPage, analyticsData] = await Promise.all([
        getApprovedPurchaseRequestsApi(),
        getPurchaseOrdersApi({ page: 1, per_page: 15 }),
        getProcurementAnalyticsApi(period)
      ]);
      setPrs(approvedPrs || []);
      setPos(allPosPage?.data || []);
      setAnalytics(analyticsData);
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
          title="إجمالي قيم المشتريات"
          value={<CurrencyDisplay amount={analytics?.metrics.total_value || 0} amountClassName="text-base font-bold font-mono text-cyan-400" />}
          subtext="أمر شراء فعال"
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
          title="أوامر مسودة DRAFT"
          value={countStatus('PO_DRAFT')}
          subtext="قيد التحرير"
          accentColor="slate"
          to="/procurement/manager?tab=1&status=PO_DRAFT"
          clickableHint="عرض المسودات ←"
        />
        <KpiCard
          title="مراجعة المحاسبة"
          value={countStatus('PENDING_ACCOUNTING_REVIEW')}
          subtext="لدى الحسابات"
          accentColor="amber"
          to="/procurement/manager?tab=1&status=PENDING_ACCOUNTING_REVIEW"
          clickableHint="متابعة الحسابات ←"
        />
        <KpiCard
          title="أوامر معادة للمشتريات"
          value={countStatus('RETURNED_TO_PROCUREMENT')}
          subtext="تطلب تعديل"
          accentColor="rose"
          to="/procurement/manager?tab=1&status=RETURNED_TO_PROCUREMENT"
          clickableHint="تعديل وإعادة إرسال ←"
        />
        <KpiCard
          title="معتمدة نهائياً"
          value={countStatus('FINAL_APPROVED')}
          subtext="جاهزة للتوريد"
          accentColor="emerald"
          to="/procurement/manager?tab=1&status=FINAL_APPROVED"
          clickableHint="متابعة التوريدات ←"
        />
      </div>

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
