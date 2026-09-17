import React, { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import ErrorMessage from '../../components/ErrorMessage';
import { TableSkeleton } from '../../components/ui/StateFeedback';
import PurchaseRequestStatusBadge from '../../components/purchase-requests/PurchaseRequestStatusBadge';
import { useAuth } from '../../context/AuthContext';
import { getReviewableRequestsApi, approvePurchaseRequestApi, ReviewerRequestFilters } from '../../api/reviewer';
import { ApiError } from '../../types/api';
import { PurchaseRequest, PR_STATUS_LABELS } from '../../types/purchaseRequest';
import { parseApiError } from '../../utils/apiError';
import { Button } from '../../components/ui/Button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table';
import { usePersistedState } from '../../hooks/usePersistedState';
import { getDefaultDateFrom, getTodayInputDate, isDefaultTodayRange } from '../../utils/dateFilters';
import { getUnitLabel } from '../../utils/units';
import { getSummaryParcels, getSummaryRegions, getSummaryQuantities } from '../../utils/formatRequestSummary';

const INITIAL_FILTERS: ReviewerRequestFilters = {
  request_number: '',
  requester_name: '',
  status: '',
  item_reference: '',
  region: '',
  from_date: '',
  to_date: '',
};

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('ar-EG');
};



const REVIEWER_PENDING_STATUSES = new Set(['SUBMITTED', 'UNDER_REVIEW']);
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

const REVIEWER_EDITABLE_STATUSES = ['UNDER_REVIEW', 'PENDING_PROCUREMENT_APPROVAL', 'APPROVED_BY_REVIEWER'];

import { useRealtimeRefresh, emitAppDataUpdated } from '../../hooks/useRealtimeRefresh';
import { ApproveRequestDialog } from '../../components/reviewer/ApproveRequestDialog';

export const ReviewerRequestsPage: React.FC = () => {
  const { user, hasPermission, hasRole } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const urlStatus = searchParams.get('status');
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [activeFilter, setActiveFilter] = usePersistedState<string>('reviewer.active-filter.v1', urlStatus || 'ALL');
  const [searchFilters, setSearchFilters] = usePersistedState<ReviewerRequestFilters>('reviewer.search-filters.v4', INITIAL_FILTERS);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [requestToApprove, setRequestToApprove] = useState<PurchaseRequest | null>(null);
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (location.state && (location.state as { message?: string }).message) {
      setSuccessMsg((location.state as { message?: string }).message || null);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const fetchRequests = async (filters: ReviewerRequestFilters = searchFilters, silent = false) => {
    if (!silent) setIsLoading(true);
    setError(null);
    try {
      const data = await getReviewableRequestsApi(filters);
      setRequests(data);
    } catch (err) {
      if (!silent) setError(parseApiError(err));
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchRequests(searchFilters, false);
  }, []);

  useRealtimeRefresh(() => fetchRequests(searchFilters, true));

  const handleConfirmApprove = async (comment?: string, siteEngineerUserId?: number | null, requiresWarehouseReceipt?: boolean) => {
    if (!requestToApprove) return;
    setIsApproving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await approvePurchaseRequestApi(requestToApprove.id, comment, siteEngineerUserId, requiresWarehouseReceipt);
      setSuccessMsg(`✅ تم اعتماد طلب الشراء رقم ${requestToApprove.request_number} وتحديد مسار الاستلام بنجاح.`);
      setRequestToApprove(null);
      emitAppDataUpdated();
      await fetchRequests(searchFilters, true);
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setIsApproving(false);
    }
  };

  // Requests returned by the Reviewer API are already strictly scoped by backend authorization
  const scopedRequests = requests;

  const filteredRequests = scopedRequests.filter((request) => {
    if (activeFilter === 'ALL') return true;
    if (activeFilter === 'PENDING') return REVIEWER_PENDING_STATUSES.has(request.status);
    if (activeFilter === 'APPROVED') return REVIEWER_APPROVED_STATUSES.has(request.status);
    if (activeFilter === 'SUBMITTED') return request.status === 'SUBMITTED';
    if (activeFilter === 'UNDER_REVIEW') return request.status === 'UNDER_REVIEW';
    if (activeFilter === 'REJECTED') return request.status === 'REJECTED';
    return request.status === activeFilter;
  });

  if (isLoading) {
    return <TableSkeleton rows={7} columns={9} message="جارٍ تحميل طلبات المراجعة الخاصة بقسمك..." className="min-h-[300px]" />;
  }

  const updateFilter = (key: keyof ReviewerRequestFilters, value: string) => {
    setSearchFilters((current) => ({ ...current, [key]: value }));
  };

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const hasNonDateSearch = Object.entries(searchFilters).some(([key, value]) => key !== 'from_date' && key !== 'to_date' && Boolean(value));
    const shouldSearchAllDates = hasNonDateSearch && isDefaultTodayRange(searchFilters.from_date || '', searchFilters.to_date || '');
    const effectiveFilters = shouldSearchAllDates ? { ...searchFilters, from_date: '', to_date: '' } : searchFilters;
    if (shouldSearchAllDates) setSearchFilters(effectiveFilters);
    void fetchRequests(effectiveFilters);
  };

  const resetSearch = () => {
    const resetFilters = { ...INITIAL_FILTERS };
    setSearchFilters(resetFilters);
    setActiveFilter('ALL');
    void fetchRequests(resetFilters);
  };

  const btnFilterVariant = (filter: string) => (activeFilter === filter ? 'primary' : 'outline');
  const countFor = (status: string) => requests.filter((request) => request.status === status).length;

  return (
    <div className="space-y-3.5 animate-fade-in" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-xl font-black text-slate-100 flex items-center gap-2">📋 طلبات الشراء للمراجعة</h1>
          <p className="text-xs text-slate-400 mt-1">جميع طلبات الشراء الواردة من الموظفين ضمن قسمك المعتمد.</p>
        </div>
      </div>

      {successMsg && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200 shadow-lg shadow-emerald-950/40">
          <div className="flex items-center gap-2">
            <span className="text-lg">✅</span>
            <span className="font-bold">{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-400 hover:text-emerald-200 text-xs font-bold px-2.5 py-1 rounded-lg border border-emerald-500/30 hover:bg-emerald-900/40 transition-colors"
          >
            إغلاق ✕
          </button>
        </div>
      )}

      <form onSubmit={submitSearch} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-100">بحث وتصفية الطلبات</h2>
            <p className="text-[11px] text-slate-400 mt-1">تظهر النتائج الخاصة بقسمك فقط، حتى عند استخدام أي معيار بحث.</p>
          </div>
          <span className="text-[11px] text-cyan-300 bg-cyan-950/40 border border-cyan-800/60 rounded-lg px-2.5 py-1">عزل حسب القسم مفعل</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="space-y-1">
            <span className="block text-[11px] font-semibold text-slate-400">رقم الطلب</span>
            <input value={searchFilters.request_number || ''} onChange={(event) => updateFilter('request_number', event.target.value)} placeholder="مثال: PR-2026-0001" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-cyan-500" />
          </label>
          <label className="space-y-1">
            <span className="block text-[11px] font-semibold text-slate-400">اسم مقدم الطلب</span>
            <input value={searchFilters.requester_name || ''} onChange={(event) => updateFilter('requester_name', event.target.value)} placeholder="اكتب اسم الموظف" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-cyan-500" />
          </label>
          <label className="space-y-1">
            <span className="block text-[11px] font-semibold text-slate-400">رقم قطعة الأرض</span>
            <input value={searchFilters.item_reference || ''} onChange={(event) => updateFilter('item_reference', event.target.value)} placeholder="رقم القطعة" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-cyan-500" />
          </label>
          <label className="space-y-1">
            <span className="block text-[11px] font-semibold text-slate-400">المنطقة</span>
            <input value={searchFilters.region || ''} onChange={(event) => updateFilter('region', event.target.value)} placeholder="اسم المنطقة" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-cyan-500" />
          </label>
          <label className="space-y-1">
            <span className="block text-[11px] font-semibold text-slate-400">الحالة</span>
            <select value={searchFilters.status || ''} onChange={(event) => updateFilter('status', event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-cyan-500">
              <option value="">كل الحالات</option>
              {Object.entries(PR_STATUS_LABELS).filter(([status]) => status !== 'DRAFT').map(([status, label]) => <option key={status} value={status}>{label}</option>)}
            </select>
          </label>

          <label className="space-y-1">
            <span className="block text-[11px] font-semibold text-slate-400">من تاريخ الطلب</span>
            <input type="date" value={searchFilters.from_date || ''} onChange={(event) => updateFilter('from_date', event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-cyan-500" />
          </label>
          <label className="space-y-1">
            <span className="block text-[11px] font-semibold text-slate-400">إلى تاريخ الطلب</span>
            <input type="date" value={searchFilters.to_date || ''} onChange={(event) => updateFilter('to_date', event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-cyan-500" />
          </label>
          <div className="flex items-end gap-2">
            <Button type="submit" variant="primary" size="sm" className="flex-1">بحث</Button>
            <Button type="button" variant="outline" size="sm" onClick={resetSearch}>إعادة ضبط</Button>
          </div>
        </div>
      </form>

      <div className="flex flex-wrap gap-2">
        <Button variant={btnFilterVariant('ALL')} size="sm" onClick={() => setActiveFilter('ALL')}>الكل({requests.length})</Button>
        <Button variant={btnFilterVariant('PENDING')} size="sm" onClick={() => setActiveFilter('PENDING')}>في انتظار بدء المراجعة({countFor('SUBMITTED')})</Button>
        <Button variant={btnFilterVariant('UNDER_REVIEW')} size="sm" onClick={() => setActiveFilter('UNDER_REVIEW')}>قيد المراجعة({countFor('UNDER_REVIEW')})</Button>
        <Button variant={btnFilterVariant('PENDING_PROCUREMENT_APPROVAL')} size="sm" onClick={() => setActiveFilter('PENDING_PROCUREMENT_APPROVAL')}>بانتظار المشتريات({countFor('PENDING_PROCUREMENT_APPROVAL')})</Button>
        <Button variant={btnFilterVariant('APPROVED_BY_REVIEWER')} size="sm" onClick={() => setActiveFilter('APPROVED_BY_REVIEWER')}>معتمدة من المراجع({countFor('APPROVED_BY_REVIEWER')})</Button>
        <Button variant={btnFilterVariant('APPROVED_BY_PROCUREMENT')} size="sm" onClick={() => setActiveFilter('APPROVED_BY_PROCUREMENT')}>اعتمدتها المشتريات({countFor('APPROVED_BY_PROCUREMENT')})</Button>
        <Button variant={btnFilterVariant('REJECTED')} size="sm" onClick={() => setActiveFilter('REJECTED')}>مرفوضة({countFor('REJECTED')})</Button>
      </div>


      {successMsg && (
        <div className="rounded-xl border border-emerald-800 bg-emerald-950/40 p-3 text-xs font-bold text-emerald-300 flex items-center justify-between">
          <span>{successMsg}</span>
          <button type="button" onClick={() => setSuccessMsg(null)} className="text-emerald-400 font-black">✕</button>
        </div>
      )}
      <ErrorMessage error={error} onDismiss={() => setError(null)} onRetry={() => void fetchRequests(searchFilters)} />

      {filteredRequests.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-16 text-center text-sm text-slate-500">
          لا توجد طلبات شراء مطابقة للتصفية المختارة. تأكد من المعايير أو اضغط «إعادة ضبط» لعرض كل الطلبات المسندة إلى قسمك.
        </div>
      ) : (
        <>
        <div className="hidden overflow-x-auto xl:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>رقم الطلب</TableHead>
              <TableHead>مقدم الطلب</TableHead>
              <TableHead>القسم</TableHead>
              <TableHead>الصنف / المواد</TableHead>
              <TableHead>رقم قطعة الأرض</TableHead>
              <TableHead>المنطقة</TableHead>
              <TableHead>الكمية / العدد</TableHead>
              <TableHead>تاريخ الاحتياج</TableHead>
              <TableHead>تاريخ الطلب</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead className="text-center">الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRequests.map((request) => {
              const itemNames = request.items?.map((item) => item.item_description || item.item?.name).filter(Boolean) || [];
              const itemsDisplay = itemNames.length === 0
                ? '—'
                : itemNames.length === 1
                  ? itemNames[0]
                  : `${itemNames[0]} (+${itemNames.length - 1} أصناف)`;
              const parcelsDisplay = getSummaryParcels(request);
              const regionsDisplay = getSummaryRegions(request);
              const quantitiesInfo = getSummaryQuantities(request.items);

              const canQuickApprove = (request.status === 'SUBMITTED' || request.status === 'UNDER_REVIEW') && hasPermission('purchase_request.approve');

              return (
                <TableRow key={request.id}>
                  <TableCell className="font-mono font-bold text-cyan-400"><Link to={`/reviewer/requests/${request.id}`} className="hover:underline">{request.request_number}</Link></TableCell>
                  <TableCell>{request.requester?.name || '—'}</TableCell>
                  <TableCell>{request.department?.name || '—'}</TableCell>
                  <TableCell className="font-semibold text-slate-100 max-w-[200px] truncate">
                    <span title={itemNames.join('، ')}>{itemsDisplay}</span>
                  </TableCell>
                  <TableCell className="font-mono text-cyan-300 whitespace-nowrap">{parcelsDisplay}</TableCell>
                  <TableCell className="whitespace-nowrap">{regionsDisplay}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div title={quantitiesInfo.tooltip}>
                      <div className="font-mono font-bold text-amber-300">{quantitiesInfo.display}</div>
                      {quantitiesInfo.subtext && (
                        <div className="text-[10px] text-slate-400 font-normal leading-tight">{quantitiesInfo.subtext}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono font-bold text-amber-300 whitespace-nowrap">{request.date_needed || '—'}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(request.created_at)}</TableCell>
                  <TableCell><PurchaseRequestStatusBadge status={request.status} /></TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1.5 flex-wrap">
                      {canQuickApprove && (
                        <Button
                          variant="success"
                          size="sm"
                          onClick={() => setRequestToApprove(request)}
                          className="px-2.5 py-1 text-xs"
                          title="اعتماد الطلب وتحديد مهندس الموقع المستلم"
                        >
                          اعتماد الطلب
                        </Button>
                      )}
                      {REVIEWER_EDITABLE_STATUSES.includes(request.status) && hasPermission('purchase_request.edit_during_review') && (
                        <Link to={`/reviewer/requests/${request.id}/review`}><Button variant="secondary" size="sm" className="px-2 py-1">{request.status === 'PENDING_PROCUREMENT_APPROVAL' ? 'تعديل قبل المشتريات' : 'مراجعة وتعديل'}</Button></Link>
                      )}
                      {!canQuickApprove && !REVIEWER_EDITABLE_STATUSES.includes(request.status) && (
                        <Link to={`/reviewer/requests/${request.id}`}><Button variant="secondary" size="sm" className="px-2 py-1">عرض الطلب</Button></Link>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 xl:hidden">
          {filteredRequests.map((request) => {
            const itemNames = request.items?.map((item) => item.item_description || item.item?.name).filter(Boolean) || [];
            const parcelsDisplay = getSummaryParcels(request);
            const regionsDisplay = getSummaryRegions(request);
            const quantitiesInfo = getSummaryQuantities(request.items);
            const canQuickApprove = (request.status === 'SUBMITTED' || request.status === 'UNDER_REVIEW') && hasPermission('purchase_request.approve');

            return (
              <article key={`mobile-${request.id}`} className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <Link to={`/reviewer/requests/${request.id}`} className="font-mono text-sm font-black text-cyan-300 hover:underline">{request.request_number}</Link>
                  <div className="flex flex-wrap items-center justify-end gap-2"><PurchaseRequestStatusBadge status={request.status} /></div>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div className="col-span-2"><dt className="text-slate-500">الصنف / المواد المطلوبة</dt><dd className="mt-1 font-bold text-cyan-200">{itemNames.join('، ') || 'غير محدد'}</dd></div>
                  <div><dt className="text-slate-500">رقم قطعة الأرض</dt><dd className="mt-1 font-mono font-bold text-slate-200">{parcelsDisplay}</dd></div>
                  <div>
                    <dt className="text-slate-500">الكمية / العدد</dt>
                    <dd className="mt-1" title={quantitiesInfo.tooltip}>
                      <span className="font-mono font-bold text-amber-300">{quantitiesInfo.display}</span>
                      {quantitiesInfo.subtext && (
                        <span className="text-[10px] text-slate-400 block font-normal leading-tight">{quantitiesInfo.subtext}</span>
                      )}
                    </dd>
                  </div>
                  <div><dt className="text-slate-500">المنطقة</dt><dd className="mt-1 font-bold text-slate-200">{regionsDisplay}</dd></div>
                  <div><dt className="text-slate-500">تاريخ الاحتياج</dt><dd className="mt-1 font-mono font-bold text-amber-300">{request.date_needed || 'غير محدد'}</dd></div>
                  <div><dt className="text-slate-500">مقدم الطلب</dt><dd className="mt-1 font-bold text-slate-200">{request.requester?.name || 'غير محدد'}</dd></div>
                  <div><dt className="text-slate-500">تاريخ الطلب</dt><dd className="mt-1 font-mono text-slate-300">{formatDate(request.created_at)}</dd></div>
                  <div><dt className="text-slate-500">القسم</dt><dd className="mt-1 font-bold text-slate-200">{request.department?.name || 'غير محدد'}</dd></div>
                </dl>
                <div className="mt-4 flex flex-wrap gap-2">
                  {canQuickApprove && (
                    <Button
                      variant="success"
                      size="sm"
                      onClick={() => setRequestToApprove(request)}
                      className="flex-1"
                    >
                      اعتماد الطلب
                    </Button>
                  )}
                  {REVIEWER_EDITABLE_STATUSES.includes(request.status) && hasPermission('purchase_request.edit_during_review') && <Link to={`/reviewer/requests/${request.id}/review`} className="flex-1"><Button variant="secondary" size="sm" className="w-full">{request.status === 'PENDING_PROCUREMENT_APPROVAL' ? 'تعديل قبل المشتريات' : 'مراجعة وتعديل'}</Button></Link>}
                  <Link to={`/reviewer/requests/${request.id}`} className="flex-1"><Button variant="secondary" size="sm" className="w-full">عرض الطلب</Button></Link>
                </div>
              </article>
            );
          })}
        </div>
        </>
      )}

      <ApproveRequestDialog
        isOpen={requestToApprove !== null}
        requestNumber={requestToApprove?.request_number || ''}
        initialSiteEngineerId={requestToApprove?.site_engineer?.id || requestToApprove?.site_engineer_user_id || requestToApprove?.target_department?.site_engineer?.id || null}
        initialRequiresWarehouseReceipt={requestToApprove?.requires_warehouse_receipt ?? true}
        isApproving={isApproving}
        onConfirm={handleConfirmApprove}
        onCancel={() => setRequestToApprove(null)}
      />
    </div>
  );
};

export default ReviewerRequestsPage;
