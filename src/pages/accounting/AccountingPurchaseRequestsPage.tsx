import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  approveDirectAccountingPurchaseRequestApi,
  getAccountingActiveSuppliersApi,
  getDirectAccountingPurchaseRequestsApi,
  rejectDirectAccountingPurchaseRequestApi,
  AccountingReviewFinancialData,
} from '../../api/accountingPurchaseRequests';
import { PurchaseRequest } from '../../types/purchaseRequest';
import { المورد } from '../../types/purchaseOrder';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/Table';
import { TableSkeleton } from '../../components/ui/StateFeedback';
import ErrorMessage from '../../components/ErrorMessage';
import { parseApiError } from '../../utils/apiError';
import PrDetailsModal from '../../components/procurement/PrDetailsModal';
import DirectAccountingReviewModal from '../../components/procurement/DirectAccountingReviewModal';
import TableFilterBar from '../../components/ui/TableFilterBar';
import { getDefaultDateFrom, getTodayInputDate, isDefaultTodayRange } from '../../utils/dateFilters';
import { useRealtimeRefresh, emitAppDataUpdated } from '../../hooks/useRealtimeRefresh';
import { getUnitLabel } from '../../utils/units';
import { getSummaryParcels, getSummaryRegions, getSummaryQuantities } from '../../utils/formatRequestSummary';
import { formatCleanNumber } from '../../utils/numberFormat';

const AccountingPurchaseRequestsPage: React.FC = () => {
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [suppliers, setSuppliers] = useState<المورد[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<number | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<PurchaseRequest | null>(null);
  const [reviewingRequest, setReviewingRequest] = useState<PurchaseRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = getTodayInputDate();
  const defaultDateFrom = getDefaultDateFrom();
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState(today);
  const [searchParams, setSearchParams] = useSearchParams();

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [reqs, supps] = await Promise.all([
        getDirectAccountingPurchaseRequestsApi(),
        getAccountingActiveSuppliersApi(),
      ]);
      setRequests(reqs);
      setSuppliers(supps);
    } catch (err) {
      if (!silent) setError(parseApiError(err).message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void load(false);
  }, []);

  useRealtimeRefresh(() => { void load(true); });

  useEffect(() => {
    const requestId = Number(searchParams.get('open') || 0);
    if (!requestId || loading) return;
    const request = requests.find((item) => item.id === requestId);
    if (!request) return;
    setReviewingRequest(request);
    setSearchParams((current) => {
      current.delete('open');
      return current;
    }, { replace: true });
  }, [loading, requests, searchParams, setSearchParams]);

  const normalizedSearch = searchTerm.trim().toLocaleLowerCase('ar-EG');
  const ignoreDefaultDateForSearch = Boolean(normalizedSearch) && isDefaultTodayRange(dateFrom, dateTo);
  const filteredRequests = requests.filter((request) => {
    const firstItem = request.items?.[0];
    const searchableText = [request.request_number, request.department?.name, request.target_department?.name, request.direct_supplier?.company_name, request.requester?.name, request.assigned_reviewer?.name, firstItem?.item_description, firstItem?.item_reference, firstItem?.region].filter(Boolean).join(' ').toLocaleLowerCase('ar-EG');
    const requestDate = String(request.created_at || '').slice(0, 10);
    return (!normalizedSearch || searchableText.includes(normalizedSearch)) && (ignoreDefaultDateForSearch || ((!dateFrom || requestDate >= dateFrom) && (!dateTo || requestDate <= dateTo)));
  });

  const approve = async (request: PurchaseRequest, financialData: AccountingReviewFinancialData) => {
    setActionId(request.id);
    setError(null);
    try {
      await approveDirectAccountingPurchaseRequestApi(
        request.id,
        financialData,
        financialData.notes || 'تمت الموافقة المالية على الطلب من الإدارة المالية.',
      );
      setReviewingRequest(null);
      await load();
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setActionId(null);
    }
  };

  const reject = async (request: PurchaseRequest, commentInput?: string) => {
    const comment = commentInput?.trim() || window.prompt('اكتب سبب الرفض المالي:');
    if (!comment?.trim()) return;

    setActionId(request.id);
    setError(null);
    try {
      await rejectDirectAccountingPurchaseRequestApi(request.id, comment.trim());
      setReviewingRequest(null);
      await load();
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setActionId(null);
    }
  };

  if (loading) return <TableSkeleton rows={6} columns={7} className="min-h-[360px]" />;

  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <h1 className="text-xl font-black text-slate-100">طلبات الموافقة المالية المباشرة</h1>
        <p className="mt-1 text-sm text-slate-400">طلبات شراء مباشرة أرسلها مدير المشتريات للمراجعة المالية. بعد الموافقة تعود إلى مدير المشتريات لإنشاء أمر الشراء.</p>
      </div>

      {error && <ErrorMessage error={error} onDismiss={() => setError(null)} />}
      <TableFilterBar
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="بحث برقم الطلب أو القسم أو المورد أو رقم قطعة الأرض..."
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onClear={() => { setSearchTerm(''); setDateFrom(defaultDateFrom); setDateTo(today); }}
        hasActiveFilters={Boolean(searchTerm || dateFrom !== defaultDateFrom || dateTo !== today)}
        resultCount={filteredRequests.length}
        totalCount={requests.length}
        resultLabel="طلب موافقة مالية"
      />

      {!filteredRequests.length ? (
        <Card className="py-12 text-center text-slate-400">{requests.length ? 'لا توجد طلبات مطابقة للفلاتر الحالية.' : 'لا توجد طلبات بانتظار الموافقة المالية المباشرة.'}</Card>
      ) : (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-4">
            <h2 className="font-bold text-amber-300">طلبات شراء مباشرة بانتظار الحسابات ({filteredRequests.length} من {requests.length})</h2>
            <span className="text-xs text-slate-500">الموافقة تعيد الطلب إلى مدير المشتريات لإنشاء أمر الشراء</span>
          </div>
          <div className="hidden min-w-0 xl:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">رقم الطلب</TableHead>
                  <TableHead className="whitespace-nowrap">القسم</TableHead>
                  <TableHead className="whitespace-nowrap">المورد</TableHead>
                  <TableHead className="whitespace-nowrap">تاريخ الاحتياج</TableHead>
                  <TableHead className="whitespace-nowrap">مقدم الطلب</TableHead>
                  <TableHead className="whitespace-nowrap">رئيس القسم</TableHead>
                  <TableHead className="whitespace-nowrap">الصنف</TableHead>
                  <TableHead className="whitespace-nowrap">رقم قطعة الأرض</TableHead>
                  <TableHead className="whitespace-nowrap">المنطقة</TableHead>
                  <TableHead className="whitespace-nowrap">الكمية / العدد</TableHead>
                  <TableHead className="whitespace-nowrap">الإجمالي المقترح</TableHead>
                  <TableHead className="whitespace-nowrap text-center">الإجراء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.map(request => {
                  const itemNames = request.items?.map((item) => item.item_description || item.item?.name).filter(Boolean) || [];
                  const itemsDisplay = itemNames.length === 0
                    ? '—'
                    : itemNames.length === 1
                      ? itemNames[0]
                      : `${itemNames[0]} (+${itemNames.length - 1} أصناف)`;
                  const parcelsDisplay = getSummaryParcels(request);
                  const regionsDisplay = getSummaryRegions(request);
                  const quantitiesInfo = getSummaryQuantities(request.items);
                  const estimatedTotal = request.items?.reduce((sum, item) => sum + Number(item.estimated_line_total || (Number(item.quantity || 0) * Number(item.estimated_unit_price || 0))), 0) || 0;

                  return (
                    <TableRow key={request.id}>
                      <TableCell className="whitespace-nowrap font-mono font-bold text-cyan-300">{request.request_number}</TableCell>
                      <TableCell className="max-w-[160px]">{request.department?.name || '—'}</TableCell>
                      <TableCell className="max-w-[180px] font-bold">{request.direct_supplier?.company_name || '—'}</TableCell>
                      <TableCell className="whitespace-nowrap font-mono font-bold text-amber-300">{request.date_needed || '—'}</TableCell>
                      <TableCell className="max-w-[160px]">{request.requester?.name || '—'}</TableCell>
                      <TableCell className="max-w-[160px]">{request.assigned_reviewer?.name || '—'}</TableCell>
                      <TableCell className="max-w-[180px] truncate font-bold">
                        <span title={itemNames.join('، ')}>{itemsDisplay}</span>
                      </TableCell>
                      <TableCell className="font-mono text-cyan-300 whitespace-nowrap">{parcelsDisplay}</TableCell>
                      <TableCell className="whitespace-nowrap">{regionsDisplay}</TableCell>
                      <TableCell className="whitespace-nowrap font-mono font-bold text-amber-300">
                        <span title={quantitiesInfo.tooltip}>{quantitiesInfo.display}</span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono font-bold text-emerald-300">{formatCleanNumber(estimatedTotal)} ج.م</TableCell>
                      <TableCell className="min-w-[190px]"><div className="flex flex-wrap justify-center gap-2"><Button size="sm" variant="secondary" className="whitespace-nowrap" onClick={() => setSelectedRequest(request)}>عرض التفاصيل</Button><Button size="sm" variant="success" className="whitespace-nowrap" disabled={actionId === request.id} onClick={() => setReviewingRequest(request)}>مراجعة واعتماد</Button><Button size="sm" variant="danger" className="whitespace-nowrap" disabled={actionId === request.id} onClick={() => void reject(request)}>رفض الطلب</Button></div></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 xl:hidden">
            {filteredRequests.map(request => {
              const itemNames = request.items?.map((item) => item.item_description || item.item?.name).filter(Boolean) || [];
              const parcelsDisplay = getSummaryParcels(request);
              const regionsDisplay = getSummaryRegions(request);
              const quantitiesInfo = getSummaryQuantities(request.items);
              const estimatedTotal = request.items?.reduce((sum, item) => sum + Number(item.estimated_line_total || (Number(item.quantity || 0) * Number(item.estimated_unit_price || 0))), 0) || 0;

              return (
                <article key={`mobile-${request.id}`} className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                  <div className="flex min-w-0 items-start justify-between gap-3"><span className="min-w-0 break-normal font-mono text-sm font-black text-cyan-300">{request.request_number}</span><span className="shrink-0 text-[11px] text-amber-300">موافقة مالية</span></div>
                  <dl className="mt-4 grid min-w-0 grid-cols-1 gap-3 text-xs min-[420px]:grid-cols-2">
                    <div className="min-w-0"><dt className="text-slate-500">القسم</dt><dd className="mt-1 break-normal font-bold leading-6 text-slate-200">{request.department?.name || 'غير محدد'}</dd></div>
                    <div className="min-w-0"><dt className="text-slate-500">تاريخ الاحتياج</dt><dd className="mt-1 break-normal font-mono font-bold text-amber-300">{request.date_needed || 'غير محدد'}</dd></div>
                    <div className="min-w-0"><dt className="text-slate-500">المورد</dt><dd className="mt-1 break-normal font-bold leading-6 text-slate-100">{request.direct_supplier?.company_name || 'غير محدد'}</dd></div>
                    <div className="min-w-0"><dt className="text-slate-500">مقدم الطلب</dt><dd className="mt-1 break-normal leading-6 text-slate-300">{request.requester?.name || 'غير محدد'}</dd></div>
                    <div className="min-w-0 min-[420px]:col-span-2"><dt className="text-slate-500">الصنف وقطعة الأرض</dt><dd className="mt-1 break-normal font-bold leading-6 text-slate-200">{itemNames.join('، ') || 'غير محدد'} <span className="font-mono text-cyan-300">({parcelsDisplay})</span></dd></div>
                    <div className="min-w-0"><dt className="text-slate-500">المنطقة</dt><dd className="mt-1 break-normal text-slate-300">{regionsDisplay}</dd></div>
                    <div className="min-w-0"><dt className="text-slate-500">الكمية / العدد</dt><dd className="mt-1 font-mono font-bold text-amber-300">{quantitiesInfo.display}</dd></div>
                    <div className="min-w-0 min-[420px]:col-span-2"><dt className="text-slate-500">الإجمالي المقترح</dt><dd className="mt-1 whitespace-nowrap font-mono font-bold text-emerald-300">{formatCleanNumber(estimatedTotal)} ج.م</dd></div>
                  </dl>
                  <div className="mt-4 grid grid-cols-1 gap-2 min-[420px]:grid-cols-3"><Button size="sm" variant="secondary" className="w-full whitespace-nowrap" onClick={() => setSelectedRequest(request)}>عرض التفاصيل</Button><Button size="sm" variant="success" className="w-full whitespace-nowrap" disabled={actionId === request.id} onClick={() => setReviewingRequest(request)}>مراجعة واعتماد</Button><Button size="sm" variant="danger" className="w-full whitespace-nowrap" disabled={actionId === request.id} onClick={() => void reject(request)}>رفض الطلب</Button></div>
                </article>
              );
            })}
          </div>
        </Card>
      )}

      <PrDetailsModal
        pr={selectedRequest}
        isOpen={Boolean(selectedRequest)}
        onClose={() => setSelectedRequest(null)}
      />
      <DirectAccountingReviewModal
        request={reviewingRequest}
        suppliers={Array.isArray(suppliers) ? suppliers : []}
        isOpen={Boolean(reviewingRequest)}
        reviewMode="accounting"
        onConfirm={(financialData) => { if (reviewingRequest) void approve(reviewingRequest, financialData); }}
        onReject={(comment) => { if (reviewingRequest) void reject(reviewingRequest, comment); }}
        onClose={() => { if (actionId === null) setReviewingRequest(null); }}
        isSubmitting={actionId === reviewingRequest?.id}
      />
    </div>
  );
};

export default AccountingPurchaseRequestsPage;
