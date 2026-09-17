import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ErrorMessage from '../../components/ErrorMessage';
import { TableSkeleton } from '../../components/ui/StateFeedback';
import PurchaseRequestTable from '../../components/purchase-requests/PurchaseRequestTable';
import DeleteRequestDialog from '../../components/purchase-requests/DeleteRequestDialog';
import SubmitRequestDialog from '../../components/purchase-requests/SubmitRequestDialog';
import { useAuth } from '../../context/AuthContext';
import {
  deletePurchaseRequestApi,
  getOwnPurchaseRequestsApi,
  submitPurchaseRequestApi,
} from '../../api/purchaseRequests';
import { ApiError } from '../../types/api';
import { PurchaseRequest } from '../../types/purchaseRequest';
import { parseApiError } from '../../utils/apiError';
import { Button } from '../../components/ui/Button';
import TableFilterBar from '../../components/ui/TableFilterBar';
import { getDefaultDateFrom, getTodayInputDate, isDefaultTodayRange } from '../../utils/dateFilters';

const EMPLOYEE_EDITABLE_STATUSES = new Set(['DRAFT', 'SUBMITTED', 'UNDER_REVIEW']);
const EMPLOYEE_REVIEW_STATUSES = new Set(['UNDER_REVIEW']);
const EMPLOYEE_SUBMITTED_STATUSES = new Set(['SUBMITTED']);
const EMPLOYEE_APPROVED_STATUSES = new Set([
  'APPROVED_BY_REVIEWER',
  'PENDING_EXECUTIVE_APPROVAL',
  'PENDING_PROCUREMENT_APPROVAL',
  'APPROVED_BY_PROCUREMENT',
  'PENDING_ACCOUNTING_APPROVAL',
  'APPROVED_BY_ACCOUNTING',
  'PENDING_QUOTE_RECOMMENDATIONS',
  'PENDING_EXECUTIVE_QUOTE_DECISION',
]);

import { useRealtimeRefresh, emitAppDataUpdated } from '../../hooks/useRealtimeRefresh';

export const PurchaseRequestsPage: React.FC = () => {
  const { hasRole, hasPermission } = useAuth();
  const isProcurementOrAdmin = hasRole('procurement_manager') || hasRole('admin');
  const [searchParams] = useSearchParams();
  const initialStatus = searchParams.get('status') || 'ALL';
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [activeFilter, setActiveFilter] = useState<string>(initialStatus);
  const [needsActionOnly, setNeedsActionOnly] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const todayInputDate = getTodayInputDate();
  const defaultDateFrom = getDefaultDateFrom();
  const [dateFrom, setDateFrom] = useState<string>(() => isProcurementOrAdmin ? '' : defaultDateFrom);
  const [dateTo, setDateTo] = useState<string>(() => isProcurementOrAdmin ? '' : todayInputDate);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<ApiError | null>(null);

  // Modals
  const [selectedSubmitPr, setSelectedSubmitPr] = useState<PurchaseRequest | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [selectedDeletePr, setSelectedDeletePr] = useState<PurchaseRequest | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const fetchRequests = async (silent = false) => {
    if (!silent) setIsLoading(true);
    setError(null);
    try {
      const data = await getOwnPurchaseRequestsApi();
      setRequests(data);
    } catch (err) {
      if (!silent) setError(parseApiError(err));
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests(false);
  }, []);

  useRealtimeRefresh(() => fetchRequests(true));

  const handleConfirmSubmit = async () => {
    if (!selectedSubmitPr) return;
    setIsSubmitting(true);
    try {
      await submitPurchaseRequestApi(selectedSubmitPr.id);
      setSelectedSubmitPr(null);
      emitAppDataUpdated();
      await fetchRequests(true);
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!selectedDeletePr) return;
    setIsDeleting(true);
    try {
      await deletePurchaseRequestApi(selectedDeletePr.id);
      setSelectedDeletePr(null);
      emitAppDataUpdated();
      await fetchRequests(true);
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setIsDeleting(false);
    }
  };

  const requestNeedsAction = (request: PurchaseRequest) => {
    const canEdit = EMPLOYEE_EDITABLE_STATUSES.has(request.status) && hasPermission('purchase_request.edit_own');
    const canDelete = request.status === 'DRAFT' && hasPermission('purchase_request.edit_own');
    const canSubmit = request.status === 'DRAFT' && hasPermission('purchase_request.submit');
    return canEdit || canDelete || canSubmit;
  };

  const filteredRequests = requests.filter((r) => {
    const matchesNeedsAction = !needsActionOnly || requestNeedsAction(r);
    const matchesFilter =
      activeFilter === 'ALL' ? true :
      activeFilter === 'PENDING' ? EMPLOYEE_REVIEW_STATUSES.has(r.status) :
      activeFilter === 'SUBMITTED' ? EMPLOYEE_SUBMITTED_STATUSES.has(r.status) :
      activeFilter === 'APPROVED' ? EMPLOYEE_APPROVED_STATUSES.has(r.status) :
      r.status === activeFilter;
    const searchableText = [
      r.request_number,
      r.department?.name,
      r.department?.code,
      r.target_department?.name,
      r.target_department?.code,
      r.requester?.name,
      r.assigned_reviewer?.name,
      r.status,
      ...(r.items || []).flatMap((item) => [item.item_reference, item.region, item.item_description]),
    ].filter(Boolean).join(' ').toLocaleLowerCase('ar-EG');
    const normalizedSearch = searchQuery.trim().toLocaleLowerCase('ar-EG');
    const matchesSearch = !normalizedSearch || searchableText.includes(normalizedSearch);
    const neededDate = r.date_needed || (r.created_at ? r.created_at.slice(0, 10) : '');
    const ignoreDefaultDateRangeForSearch = Boolean(normalizedSearch) && isDefaultTodayRange(dateFrom, dateTo);
    const matchesFrom = ignoreDefaultDateRangeForSearch || !dateFrom || neededDate >= dateFrom;
    const matchesTo = ignoreDefaultDateRangeForSearch || !dateTo || neededDate <= dateTo;
    return matchesNeedsAction && matchesFilter && matchesSearch && matchesFrom && matchesTo;
  });

  if (isLoading) {
    return <TableSkeleton rows={6} columns={5} className="min-h-[260px]" />;
  }

  const btnFilterVariant = (filter: string) => (activeFilter === filter ? 'primary' : 'outline');
  const hasResultFilters = Boolean(searchQuery.trim() || dateFrom !== defaultDateFrom || dateTo !== todayInputDate || activeFilter !== 'ALL' || needsActionOnly);

  return (
    <div className="space-y-3.5" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-3">
        <div>
          <h1 className="text-xl font-black text-slate-100 flex items-center gap-2">
            <span>📋</span> {isProcurementOrAdmin ? 'طلبات الشراء' : 'طلبات الشراء الخاصة بي'}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {isProcurementOrAdmin
              ? 'سجل ومتابعة جميع طلبات الشراء في الشركة ومتابعة حالاتها.'
              : 'سجل وتتبع جميع طلبات الشراء المقدمة من قبلك.'}
          </p>
        </div>

        {hasPermission('purchase_request.create') && (
          <Link to="/requests/create">
            <Button variant="primary" size="md">
              + طلب شراء جديد
            </Button>
          </Link>
        )}
      </div>

      <ErrorMessage error={error} onDismiss={() => setError(null)} />

      {/* البحث السريع + التصفية */}
      <div className="space-y-2.5">
        <div className="rounded-2xl border border-cyan-500/30 bg-slate-900/80 p-2.5 shadow-md sm:p-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label htmlFor="purchase-request-quick-search" className="text-xs font-black text-slate-100">بحث سريع في الطلبات</label>
            {searchQuery.trim() && (
              <button type="button" onClick={() => setSearchQuery('')} className="min-h-7 shrink-0 rounded-lg px-2 text-xs font-bold text-cyan-300 hover:bg-cyan-500/10 cursor-pointer" aria-label="مسح البحث">مسح</button>
            )}
          </div>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-base text-cyan-300" aria-hidden="true">⌕</span>
            <input
              id="purchase-request-quick-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Escape') setSearchQuery(''); }}
              placeholder="ابحث برقم الطلب، الموظف، القسم، الصنف، قطعة الأرض أو المنطقة..."
              enterKeyHint="search"
              autoComplete="off"
              className="min-h-10 w-full min-w-0 rounded-xl border border-cyan-500/40 bg-slate-950/80 pr-9 pl-4 py-2 text-xs text-slate-100 placeholder:text-xs placeholder:text-slate-500 focus:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
              aria-label="البحث السريع في طلبات الشراء"
            />
          </div>
        </div>

        <TableFilterBar
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          onClear={() => { setSearchQuery(''); setDateFrom(defaultDateFrom); setDateTo(todayInputDate); setActiveFilter('ALL'); setNeedsActionOnly(false); }}
          hasActiveFilters={Boolean(searchQuery || dateFrom !== defaultDateFrom || dateTo !== todayInputDate || activeFilter !== 'ALL' || needsActionOnly)}
          resultCount={filteredRequests.length}
          totalCount={requests.length}
          resultLabel="طلب شراء"
        />
        {/* تصفية Tabs */}
        <div className="border-b border-slate-800 pb-3">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Button variant={btnFilterVariant('ALL')} size="sm" className="w-full sm:w-auto" onClick={() => { setActiveFilter('ALL'); setNeedsActionOnly(false); }}>
              الكل({requests.length})
            </Button>
            <Button variant={needsActionOnly ? 'primary' : 'outline'} size="sm" className="w-full sm:w-auto" onClick={() => setNeedsActionOnly(current => !current)}>
              يحتاج إجراء مني ({requests.filter(requestNeedsAction).length})
            </Button>
            <Button variant={btnFilterVariant('DRAFT')} size="sm" className="w-full sm:w-auto" onClick={() => setActiveFilter('DRAFT')}>
              مسودات ({requests.filter(r => r.status === 'DRAFT').length})
            </Button>
            <Button variant={btnFilterVariant('PENDING')} size="sm" className="w-full sm:w-auto" onClick={() => setActiveFilter('PENDING')}>
              قيد المراجعة ({requests.filter(r => EMPLOYEE_REVIEW_STATUSES.has(r.status)).length})
            </Button>
            <Button variant={btnFilterVariant('SUBMITTED')} size="sm" className="w-full sm:w-auto" onClick={() => setActiveFilter('SUBMITTED')}>
              مُرسلة للمراجعة ({requests.filter(r => EMPLOYEE_SUBMITTED_STATUSES.has(r.status)).length})
            </Button>
            <Button variant={btnFilterVariant('APPROVED')} size="sm" className="w-full sm:w-auto" onClick={() => setActiveFilter('APPROVED')}>
              معتمدة ({requests.filter(r => EMPLOYEE_APPROVED_STATUSES.has(r.status)).length})
            </Button>
            <Button variant={btnFilterVariant('REJECTED')} size="sm" className="w-full sm:w-auto" onClick={() => setActiveFilter('REJECTED')}>
              مرفوضة ({requests.filter(r => r.status === 'REJECTED').length})
            </Button>
          </div>
        </div>
      </div>

      {/* Table Component */}
      <PurchaseRequestTable
        requests={filteredRequests}
        emptyMessage={hasResultFilters ? 'لا توجد طلبات مطابقة للفلاتر الحالية' : 'لا توجد طلبات شراء حالياً'}
        emptyDescription={hasResultFilters ? 'غيّر كلمة البحث أو التاريخ أو تبويب الحالة، أو استخدم «مسح كل الفلاتر» لعرض الطلبات.' : 'ابدأ بإنشاء أول طلب شراء جديد لمؤسستك.'}
        onOpenSubmitModal={(pr) => setSelectedSubmitPr(pr)}
        onOpenDeleteModal={(pr) => setSelectedDeletePr(pr)}
      />

      {/* Dialog Modals */}
      <SubmitRequestDialog
        isOpen={!!selectedSubmitPr}
        requestNumber={selectedSubmitPr?.request_number || ''}
        isSubmitting={isSubmitting}
        onConfirm={handleConfirmSubmit}
        onCancel={() => setSelectedSubmitPr(null)}
      />

      <DeleteRequestDialog
        isOpen={!!selectedDeletePr}
        requestNumber={selectedDeletePr?.request_number || ''}
        isDeleting={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setSelectedDeletePr(null)}
      />
    </div>
  );
};

export default PurchaseRequestsPage;
