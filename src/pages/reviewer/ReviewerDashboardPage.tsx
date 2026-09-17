import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ErrorMessage from '../../components/ErrorMessage';
import LoadingSpinner from '../../components/LoadingSpinner';
import PurchaseRequestStatusBadge from '../../components/purchase-requests/PurchaseRequestStatusBadge';
import { useAuth } from '../../context/AuthContext';
import {
  getReviewableRequestsApi,
  approvePurchaseRequestApi,
  rejectPurchaseRequestApi,
} from '../../api/reviewer';
import { getAssignedReceiptsApi, ReceiptRecord } from '../../api/purchaseReceipts';
import { getPendingQuoteRequestsApi } from '../../api/purchaseQuotes';
import { ApiError } from '../../types/api';
import { PurchaseRequest } from '../../types/purchaseRequest';
import { parseApiError } from '../../utils/apiError';
import { KpiCard, KpiPill, KpiPillsBar } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table';
import ActionRequiredInbox, { ActionInboxItem } from '../../components/dashboard/ActionRequiredInbox';
import QuickLauncherBar from '../../components/dashboard/QuickLauncherBar';
import { getUnitLabel } from '../../utils/units';

import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';

const REVIEWER_APPROVED_STATUSES = new Set([
  'PENDING_EXECUTIVE_APPROVAL',
  'PENDING_PROCUREMENT_APPROVAL',
  'APPROVED_BY_REVIEWER',
  'APPROVED_BY_PROCUREMENT',
  'PENDING_ACCOUNTING_APPROVAL',
  'APPROVED_BY_ACCOUNTING',
  'PENDING_QUOTE_RECOMMENDATIONS',
  'PENDING_EXECUTIVE_QUOTE_DECISION',
]);

export const ReviewerDashboardPage: React.FC = () => {
  const { user, hasPermission, hasRole } = useAuth();
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [assignedReceipts, setAssignedReceipts] = useState<ReceiptRecord[]>([]);
  const [quoteRequests, setQuoteRequests] = useState<PurchaseRequest[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<ApiError | null>(null);

  const fetchRequests = async (silent = false) => {
    if (!silent) setIsLoading(true);
    setError(null);
    try {
      const [data, receipts, quotes] = await Promise.all([
        getReviewableRequestsApi(),
        getAssignedReceiptsApi().catch(() => []),
        getPendingQuoteRequestsApi().catch(() => []),
      ]);
      setRequests(data || []);
      setAssignedReceipts(receipts || []);
      setQuoteRequests(quotes || []);
    } catch (err) {
      if (!silent) setError(parseApiError(err));
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchRequests(false);
  }, []);

  useRealtimeRefresh(() => fetchRequests(true));

  // Requests returned by the Reviewer API are already strictly scoped by backend authorization
  const scopedRequests = requests;

  const submittedCount = scopedRequests.filter((r) => r.status === 'SUBMITTED').length;
  const underReviewCount = scopedRequests.filter((r) => r.status === 'UNDER_REVIEW').length;
  const approvedCount = scopedRequests.filter((r) => REVIEWER_APPROVED_STATUSES.has(r.status)).length;
  const rejectedCount = scopedRequests.filter((r) => r.status === 'REJECTED').length;
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const filteredRequests = scopedRequests.filter((r) => {
    if (activeFilter === 'SUBMITTED' && r.status !== 'SUBMITTED') return false;
    if (activeFilter === 'UNDER_REVIEW' && r.status !== 'UNDER_REVIEW') return false;
    if (activeFilter === 'APPROVED' && !REVIEWER_APPROVED_STATUSES.has(r.status)) return false;
    if (activeFilter === 'REJECTED' && r.status !== 'REJECTED') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const numMatch = r.request_number?.toLowerCase().includes(q);
      const reqMatch = r.requester?.name?.toLowerCase().includes(q);
      const deptMatch = r.department?.name?.toLowerCase().includes(q);
      const parcelMatch = r.items?.some((it) => it.item_reference?.toLowerCase().includes(q));
      const itemMatch = r.items?.some((it) => (it.item_description || it.item?.name || '').toLowerCase().includes(q));
      return numMatch || reqMatch || deptMatch || parcelMatch || itemMatch;
    }
    return true;
  });

  const getFilterLabel = () => {
    switch (activeFilter) {
      case 'SUBMITTED': return 'في انتظار المراجعة';
      case 'UNDER_REVIEW': return 'قيد المراجعة';
      case 'APPROVED': return 'المعتمدة';
      case 'REJECTED': return 'المرفوضة';
      default: return 'جميع الطلبات';
    }
  };

  const visibleRequests = filteredRequests;

  if (isLoading) {
    return <LoadingSpinner fullScreen message="تحميل لوحة مراجعة الطلبات..." />;
  }

  const reviewerActionItems: ActionInboxItem[] = [
    ...scopedRequests
      .filter((r) => r.status === 'SUBMITTED' || r.status === 'UNDER_REVIEW')
      .map((req) => ({
        id: `pr-${req.id}`,
        rawId: req.id,
        type: 'PR' as const,
        code: req.request_number,
        title: req.justification || (req.request_type === 'OFFICE_SUPPLIES' ? 'طلب مستلزمات مكتبية' : 'طلب مواد مشروعات'),
        subtitle: req.justification ? (req.request_type === 'OFFICE_SUPPLIES' ? 'مستلزمات مكتبية' : 'مشتريات مواقع') : undefined,
        department: req.department?.name,
        target_department: req.target_department?.name,
        requester: req.requester?.name,
        amount: undefined, // Reviewers do not handle financial data on purchase requests
        urgency: req.priority === 'HIGH' ? ('CRITICAL' as const) : ('NORMAL' as const),
        reason: req.status === 'SUBMITTED' ? 'طلب جديد مقدم بانتظار مراجعتك واعتمادك الفني' : 'طلب قيد المراجعة الفنية',
        actionUrl: hasPermission('purchase_request.review') ? `/reviewer/requests/${req.id}/review` : `/reviewer/requests/${req.id}`,
        actionLabel: req.status === 'SUBMITTED' ? 'مراجعة وتعديل الطلب' : 'استكمال المراجعة',
        timeAgo: req.created_at ? req.created_at.slice(0, 10) : undefined,
        request_type: req.request_type,
        date_needed: req.date_needed || undefined,
        priority: req.priority,
        parcel_number: req.items?.[0]?.item_reference || undefined,
        region: req.items?.[0]?.region || undefined,
        items_count: req.items?.length || 0,
        items_list: req.items?.map((it) => ({
          description: it.item_description || it.item?.name || 'صنف',
          quantity: it.quantity,
          uom: it.uom,
          parcel: it.item_reference,
          region: it.region,
        })),
        requires_warehouse_receipt: req.requires_warehouse_receipt ?? true,
        onDirectApprove: hasPermission('purchase_request.review')
          ? async (
              _item: any,
              comment?: string,
              siteEngineerUserId?: number | null,
              requiresWarehouseReceipt?: boolean
            ) => {
              await approvePurchaseRequestApi(req.id, comment, siteEngineerUserId, requiresWarehouseReceipt);
              await fetchRequests(true);
            }
          : undefined,
        onDirectReject: hasPermission('purchase_request.review')
          ? async (_item: any, reason: string) => {
              await rejectPurchaseRequestApi(req.id, reason);
              await fetchRequests(true);
            }
          : undefined,
        directApproveLabel: 'اعتماد ونقل للمدير التنفيذي',
        directRejectLabel: 'رفض الطلب',
        requireApproveModal: true,
      })),

    ...quoteRequests
      .filter((q) => q.status === 'PENDING_QUOTE_RECOMMENDATIONS')
      .map((q) => ({
        id: `quote-${q.id}`,
        rawId: q.id,
        type: 'QUOTE' as const,
        code: q.request_number,
        title: q.justification || 'عروض أسعار بانتظار الترشيح',
        subtitle: `${q.quotes?.length || 'عدة'} عروض أسعار مسجلة من الموردين`,
        department: q.department?.name,
        requester: q.requester?.name,
        amount: q.total_estimated_cost ? Number(q.total_estimated_cost) : undefined,
        urgency: 'HIGH' as const,
        reason: 'عروض أسعار مسجلة بانتظار التوصية الفنية لاختيار العرض الأنسب',
        actionUrl: `/reviewer/purchase-quotes?open=${q.id}`,
        actionLabel: 'البت وترشيح عروض الأسعار',
        timeAgo: q.created_at ? q.created_at.slice(0, 10) : undefined,
        items_count: q.items?.length || 0,
        items_list: q.items?.map((it) => ({
          description: it.item_description || it.item?.name || 'صنف',
          quantity: it.quantity,
          uom: it.uom,
          parcel: it.item_reference,
          region: it.region,
        })),
      })),

    ...assignedReceipts
      .filter((r) => r.status === 'WAREHOUSE_RECEIPT_SUBMITTED' || r.status === 'PENDING_SITE_ENGINEER')
      .map((r) => ({
        id: `receipt-${r.id}`,
        rawId: r.id,
        type: 'RECEIPT' as const,
        code: r.receipt_number,
        title: r.purchase_order?.items?.[0]?.item_description || `إذن استلام ${r.receipt_number}`,
        subtitle: r.purchase_order ? `لأمر الشراء ${r.purchase_order.po_number}` : undefined,
        department: r.purchase_request?.department?.name || r.purchase_order?.purchase_request?.department?.name,
        supplier: r.purchase_order?.supplier?.company_name,
        urgency: 'CRITICAL' as const,
        reason: 'تم استلام المواد بالمخزن وبانتظار معاينتك ومطابقتك الهندسية بالموقع',
        actionUrl: `/site-engineer?receipt_id=${r.id}`,
        actionLabel: 'فحص واعتماد إذن الاستلام',
        timeAgo: r.created_at ? r.created_at.slice(0, 10) : undefined,
        items_count: r.items?.length || 0,
        items_list: r.items?.map((it) => ({
          description: it.purchase_order_item?.item_description || 'بند استلام',
          quantity: it.received_quantity,
          uom: it.purchase_order_item?.uom,
          parcel: it.purchase_order_item?.item_reference,
          region: it.purchase_order_item?.region,
        })),
      })),
  ];

  return (
    <div className="min-w-0 space-y-6 animate-fade-in" dir="rtl">
      <div className="flex min-w-0 flex-col justify-between gap-4 border-b border-slate-800 pb-4 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-black text-slate-100">
            <span aria-hidden="true">📊</span> لوحة مراجعة الطلبات
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            مراجعة واعتماد طلبات الشراء، ترشيح عروض الأسعار، وفحص أذونات الاستلام الميدانية
          </p>
        </div>

        {/* Action Header bar */}
        <div className="flex items-center gap-2">
          <Link to="/requests/create">
            <Button variant="primary" size="sm" className="whitespace-nowrap flex items-center gap-1">
              <span>✍️</span> إنشاء طلب جديد
            </Button>
          </Link>
        </div>
      </div>

      <ErrorMessage error={error} onDismiss={() => setError(null)} />

      {/* ── اختصارات الإجراءات السريعة (Quick Launcher Bar) ── */}
      <QuickLauncherBar className="mb-2" />

      {/* ── صندوق المهام والإجراءات المطلوبة منك الآن (Action Inbox) ── */}
      <ActionRequiredInbox
        title="المهام والإجراءات المطلوبة منك الآن"
        description="الطلبات، عروض الأسعار، وأذونات الاستلام التي تتطلب مراجعتك واعتمادك الفني والميداني."
        roleName={`المراجع الفني / رئيس القسم (${user?.department?.name || 'عام'})`}
        onItemActionComplete={() => fetchRequests(true)}
        items={reviewerActionItems}
      />

      {/* Slim Horizontal KPI Pills */}
      <KpiPillsBar className="my-2">
        <KpiPill
          title="الكل"
          value={scopedRequests.length}
          accentColor="slate"
          icon={<span className="text-xs">📋</span>}
          isActive={activeFilter === 'ALL'}
          onClick={() => setActiveFilter('ALL')}
          clickableHint="عرض جميع الطلبات"
        />
        <KpiPill
          title="في انتظار المراجعة"
          value={submittedCount}
          accentColor="indigo"
          icon={<span className="text-xs">⏳</span>}
          isActive={activeFilter === 'SUBMITTED'}
          onClick={() => setActiveFilter(activeFilter === 'SUBMITTED' ? 'ALL' : 'SUBMITTED')}
          clickableHint="اضغط لتصفية في الانتظار"
        />
        <KpiPill
          title="قيد المراجعة"
          value={underReviewCount}
          accentColor="cyan"
          icon={<span className="text-xs">🔍</span>}
          isActive={activeFilter === 'UNDER_REVIEW'}
          onClick={() => setActiveFilter(activeFilter === 'UNDER_REVIEW' ? 'ALL' : 'UNDER_REVIEW')}
          clickableHint="اضغط لتصفية قيد المراجعة"
        />
        <KpiPill
          title="معتمدة"
          value={approvedCount}
          accentColor="emerald"
          icon={<span className="text-xs">✅</span>}
          isActive={activeFilter === 'APPROVED'}
          onClick={() => setActiveFilter(activeFilter === 'APPROVED' ? 'ALL' : 'APPROVED')}
          clickableHint="اضغط لتصفية المعتمدة"
        />
        <KpiPill
          title="مرفوضة"
          value={rejectedCount}
          accentColor="rose"
          icon={<span className="text-xs">❌</span>}
          isActive={activeFilter === 'REJECTED'}
          onClick={() => setActiveFilter(activeFilter === 'REJECTED' ? 'ALL' : 'REJECTED')}
          clickableHint="اضغط لتصفية المرفوضة"
        />
      </KpiPillsBar>

      <section className="min-w-0 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-2xl border border-slate-800">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-bold text-slate-200">
              📋 {activeFilter === 'ALL' ? 'طلبات الشراء' : `طلبات (${getFilterLabel()})`}
            </h2>
            <span className="text-[11px] font-bold bg-cyan-950/80 border border-cyan-800/60 text-cyan-300 px-2 py-0.5 rounded-full">
              {filteredRequests.length} طلب
            </span>
            {activeFilter !== 'ALL' && (
              <button
                type="button"
                onClick={() => setActiveFilter('ALL')}
                className="text-[11px] bg-slate-800 hover:bg-slate-700 text-cyan-400 px-2 py-0.5 rounded-full border border-slate-700 transition-colors"
              >
                إلغاء التصفية ✕
              </button>
            )}
          </div>

          <div className="w-full sm:w-72">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="🔍 بحث برقم الطلب، الصنف، القطعة..."
              className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
          </div>
        </div>

        {requests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/40 p-6 py-12 text-center text-xs text-slate-400">
            لا توجد طلبات شراء تنتظر المراجعة حالياً ضمن اختصاصك.
          </div>
        ) : (
          <>
            <div className="hidden min-w-0 md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">رقم الطلب#</TableHead>
                    <TableHead className="whitespace-nowrap">مقدم الطلب</TableHead>
                    <TableHead className="whitespace-nowrap">القسم</TableHead>
                    <TableHead className="whitespace-nowrap">الصنف</TableHead>
                    <TableHead className="whitespace-nowrap">رقم قطعة الأرض</TableHead>
                    <TableHead className="whitespace-nowrap">المنطقة</TableHead>
                    <TableHead className="whitespace-nowrap">الكمية / العدد</TableHead>
                    <TableHead className="whitespace-nowrap">تاريخ الاحتياج</TableHead>
                    <TableHead className="whitespace-nowrap">الحالة</TableHead>
                    <TableHead className="whitespace-nowrap text-center">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRequests.map((pr) => {
                    const item = pr.items?.[0];
                    const itemName = item?.item_description || item?.item?.name || '—';
                    const parcelNumber = item?.item_reference || '—';
                    const regionName = item?.region || (pr.request_type === 'OFFICE_SUPPLIES' ? 'مقر الشركة' : '—');
                    const quantity = item ? `${item.quantity || '—'} ${getUnitLabel(item.uom)}` : '—';

                    return (
                      <TableRow key={pr.id}>
                        <TableCell className="whitespace-nowrap font-mono font-bold text-cyan-400">
                          <Link to={`/reviewer/requests/${pr.id}`} className="hover:underline">{pr.request_number}</Link>
                        </TableCell>
                        <TableCell className="max-w-[180px] font-bold text-slate-100">{pr.requester?.name || 'غير محدد'}</TableCell>
                        <TableCell className="max-w-[180px] text-slate-400">{pr.department?.name || 'غير محدد'}</TableCell>
                        <TableCell className="max-w-[180px] font-semibold text-slate-100 text-xs">{itemName}</TableCell>
                        <TableCell className="font-mono text-cyan-300 text-xs whitespace-nowrap">{parcelNumber}</TableCell>
                        <TableCell className="text-slate-300 text-xs whitespace-nowrap">{regionName}</TableCell>
                        <TableCell className="font-mono font-bold text-amber-300 text-xs whitespace-nowrap">{quantity}</TableCell>
                        <TableCell className="font-mono font-bold text-amber-300 text-xs whitespace-nowrap">{pr.date_needed || '—'}</TableCell>
                        <TableCell className="whitespace-nowrap"><PurchaseRequestStatusBadge status={pr.status} /></TableCell>
                        <TableCell>
                          <div className="flex justify-center gap-2">
                            <Link to={`/reviewer/requests/${pr.id}`}>
                              <Button variant="secondary" size="sm" className="whitespace-nowrap px-2 py-0.5 text-[10px]">عرض</Button>
                            </Link>
                            {pr.status === 'SUBMITTED' && hasPermission('purchase_request.review') && (
                              <Link to={`/reviewer/requests/${pr.id}/review`}>
                                <Button variant="primary" size="sm" className="whitespace-nowrap px-2 py-0.5 text-[10px]">بدء المراجعة</Button>
                              </Link>
                            )}
                            {pr.status === 'UNDER_REVIEW' && hasPermission('purchase_request.review') && (
                              <Link to={`/reviewer/requests/${pr.id}/review`}>
                                <Button variant="warning" size="sm" className="whitespace-nowrap bg-amber-950/60 px-2 py-0.5 text-[10px] text-amber-300 hover:bg-amber-900/60">متابعة</Button>
                              </Link>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-3 md:hidden">
              {visibleRequests.map((pr) => {
                const item = pr.items?.[0];
                const itemName = item?.item_description || item?.item?.name || 'غير محدد';
                const parcelNumber = item?.item_reference || '—';
                const regionName = item?.region || (pr.request_type === 'OFFICE_SUPPLIES' ? 'مقر الشركة' : 'غير محددة');
                const quantity = item ? `${item.quantity || '—'} ${getUnitLabel(item.uom)}` : '—';

                return (
                  <article key={`mobile-${pr.id}`} className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <Link to={`/reviewer/requests/${pr.id}`} className="min-w-0 break-normal text-sm font-black text-cyan-300 hover:underline">
                        {pr.request_number}
                      </Link>
                      <div className="shrink-0"><PurchaseRequestStatusBadge status={pr.status} /></div>
                    </div>

                    <dl className="mt-4 grid min-w-0 grid-cols-1 gap-3 text-xs min-[420px]:grid-cols-2">
                      <div className="min-w-0">
                        <dt className="text-slate-500">مقدم الطلب</dt>
                        <dd className="mt-1 break-normal font-bold leading-6 text-slate-100">{pr.requester?.name || 'غير محدد'}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-slate-500">القسم</dt>
                        <dd className="mt-1 break-normal font-bold leading-6 text-slate-200">{pr.department?.name || 'غير محدد'}</dd>
                      </div>
                      <div className="min-w-0 min-[420px]:col-span-2">
                        <dt className="text-slate-500">الصنف وقطعة الأرض والمنطقة</dt>
                        <dd className="mt-1 break-normal font-bold leading-6 text-slate-100">{itemName} <span className="font-mono text-cyan-300">({parcelNumber} - {regionName})</span></dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-slate-500">الكمية / العدد</dt>
                        <dd className="mt-1 font-mono font-bold text-amber-300">{quantity}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-slate-500">تاريخ الاحتياج</dt>
                        <dd className="mt-1 font-mono font-bold text-amber-300">{pr.date_needed || 'غير محدد'}</dd>
                      </div>
                      <div className="min-w-0 min-[420px]:col-span-2">
                        <dt className="text-slate-500">الحالة الحالية</dt>
                        <dd className="mt-1 break-normal font-bold leading-6 text-slate-200"><PurchaseRequestStatusBadge status={pr.status} /></dd>
                      </div>
                    </dl>

                  <div className="mt-4 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
                    <Link to={`/reviewer/requests/${pr.id}`} className="min-w-0">
                      <Button variant="secondary" size="sm" className="w-full whitespace-nowrap">عرض الطلب</Button>
                    </Link>
                    {pr.status === 'SUBMITTED' && hasPermission('purchase_request.review') && (
                      <Link to={`/reviewer/requests/${pr.id}/review`} className="min-w-0">
                        <Button variant="primary" size="sm" className="w-full whitespace-nowrap">بدء المراجعة</Button>
                      </Link>
                    )}
                    {pr.status === 'UNDER_REVIEW' && hasPermission('purchase_request.review') && (
                      <Link to={`/reviewer/requests/${pr.id}/review`} className="min-w-0">
                        <Button variant="warning" size="sm" className="w-full whitespace-nowrap bg-amber-950/60 text-amber-300 hover:bg-amber-900/60">متابعة المراجعة</Button>
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          </>
        )}
      </section>
    </div>
  );
};

export default ReviewerDashboardPage;
