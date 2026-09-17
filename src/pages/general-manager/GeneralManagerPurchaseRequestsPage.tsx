import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import {
  approveGeneralManagerPurchaseRequestApi,
  getGeneralManagerPurchaseRequestsApi,
  rejectGeneralManagerPurchaseRequestApi,
  updateGeneralManagerPurchaseRequestApi,
} from '../../api/generalManager';
import { Button } from '../../components/ui/Button';
import {
  PurchaseRequest,
  PurchaseRequestItemFormInput,
  PR_STATUS_LABELS,
} from '../../types/purchaseRequest';
import { parseApiError } from '../../utils/apiError';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';
import TableFilterBar from '../../components/ui/TableFilterBar';
import PurchaseRequestTimeline from '../../components/procurement/PurchaseRequestTimeline';
import RejectRequestDialog from '../../components/reviewer/RejectRequestDialog';
import ErrorMessage from '../../components/ErrorMessage';
import { getUnitLabel } from '../../utils/units';
import { getSummaryParcels, getSummaryRegions, getSummaryQuantities } from '../../utils/formatRequestSummary';
import { UnifiedNotesCard } from '../../components/common/UnifiedNotesCard';

interface DraftItemState extends PurchaseRequestItemFormInput {
  isExcluded?: boolean;
}

const toDraftItems = (request: PurchaseRequest): DraftItemState[] =>
  (request.items || []).map((item) => ({
    item_id: item.item_id ?? null,
    item_description: item.item_description,
    item_reference: item.item_reference || '',
    region: item.region || '',
    quantity: item.quantity,
    uom: item.uom || 'PCS',
    specifications: item.specifications || '',
    notes: item.notes || '',
    isExcluded: false,
  }));

export const isPrReturnedFromProcurement = (request: PurchaseRequest | null | undefined): boolean => {
  if (!request) return false;
  const isInitialStatus = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED_BY_REVIEWER'].includes(request.status);
  if (isInitialStatus) return false;
  return (
    request.status === 'APPROVED_BY_PROCUREMENT' ||
    request.procurement_route === 'DIRECT' ||
    Boolean(request.direct_supplier_id || request.direct_supplier) ||
    Number(request.total_estimated_cost || 0) > 0 ||
    Boolean(request.items?.some((it) => Number(it.estimated_unit_price || 0) > 0))
  );
};

export const GeneralManagerPurchaseRequestsPage: React.FC = () => {
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [selected, setSelected] = useState<PurchaseRequest | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [routeFilter, setRouteFilter] = useState('ALL');
  const [draftNotes, setDraftNotes] = useState('');
  const [draftItems, setDraftItems] = useState<DraftItemState[]>([]);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [directApprovingId, setDirectApprovingId] = useState<number | null>(null);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const handleDirectApprove = async (request: PurchaseRequest) => {
    setDirectApprovingId(request.id);
    setError(null);
    setNotice(null);
    try {
      await approveGeneralManagerPurchaseRequestApi(request.id, 'تم الاعتماد المباشر من المدير التنفيذي.');
      const isReturned = isPrReturnedFromProcurement(request);
      setNotice(
        isReturned
          ? `تم اعتماد طلب الشراء (${request.request_number}) نهائياً بنجاح وتحويله للإدارة المالية للموافقة وإصدار أمر الشراء.`
          : `تم اعتماد طلب الشراء (${request.request_number}) بنجاح وإرساله لإدارة المشتريات للبدء في التسعير.`
      );
      await loadRequests(true);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setDirectApprovingId(null);
    }
  };

  const handleConfirmReject = async (rejectionReason: string) => {
    if (!selected) return;
    setActionLoading(true);
    setError(null);
    try {
      await rejectGeneralManagerPurchaseRequestApi(selected.id, rejectionReason.trim());
      setIsRejectModalOpen(false);
      setSelected(null);
      setSearchParams({}, { replace: true });
      await loadRequests(true);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setActionLoading(false);
    }
  };

  const loadRequests = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await getGeneralManagerPurchaseRequestsApi();
      setRequests(data);
      if (!silent) setError(null);
    } catch (err) {
      if (!silent) setError(parseApiError(err).message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void loadRequests(false);
  }, []);

  useRealtimeRefresh(() => {
    void loadRequests(true);
  });

  useEffect(() => {
    const requestId = Number(searchParams.get('open') || searchParams.get('request_id'));
    if (!requestId || selected || loading) return;

    const request = requests.find((item) => item.id === requestId);
    if (request) {
      openRequest(request);
      setSearchParams({}, { replace: true });
    }
  }, [loading, requests, searchParams, selected, setSearchParams]);

  const openRequest = (request: PurchaseRequest) => {
    setSelected(request);
    setDraftNotes(request.notes || '');
    setDraftItems(toDraftItems(request));
    setComment('');
    setError(null);
    setIsRejectModalOpen(false);
  };

  const updateItem = (index: number, field: keyof PurchaseRequestItemFormInput, value: any) => {
    setDraftItems((items) =>
      items.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)),
    );
  };

  const toggleExcludeItem = (index: number) => {
    setDraftItems((items) =>
      items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, isExcluded: !item.isExcluded } : item,
      ),
    );
  };

  const removeItemPermanently = (index: number) => {
    setDraftItems((items) => items.filter((_, itemIndex) => itemIndex !== index));
  };

  const activeApprovedItems = draftItems.filter((item) => !item.isExcluded);

  const filteredRequests = requests.filter((request) => {
    const search = searchTerm.trim().toLowerCase();
    const matchesSearch =
      !search ||
      request.request_number.toLowerCase().includes(search) ||
      (request.requester?.name || '').toLowerCase().includes(search) ||
      (request.direct_supplier?.company_name || '').toLowerCase().includes(search);
    
    const isReturned = isPrReturnedFromProcurement(request);
    const matchesRoute =
      routeFilter === 'ALL' ||
      (routeFilter === 'RETURNED' && isReturned) ||
      (routeFilter === 'DISPATCH' && !isReturned) ||
      (routeFilter === 'QUOTES' && request.procurement_route === 'QUOTES');
    return matchesSearch && matchesRoute;
  });

  const performAction = async (action: 'approve' | 'reject') => {
    if (!selected) return;

    if (action === 'reject') {
      setIsRejectModalOpen(true);
      return;
    }

    // Action === 'approve'
    if (activeApprovedItems.length === 0) {
      setError(
        'تم استبعاد جميع البنود! إذا كنت ترغب في رفض الطلب بالكامل يرجى الضغط على "رفض الطلب"، أو اترك بنداً واحداً على الأقل للاعتماد.',
      );
      return;
    }

    setActionLoading(true);
    setError(null);
    try {
      const isModified =
        activeApprovedItems.length !== (selected.items || []).length ||
        draftNotes !== (selected.notes || '') ||
        activeApprovedItems.some((item, i) => {
          const original = selected.items?.[i];
          if (!original) return true;
          return (
            item.item_description !== original.item_description ||
            Number(item.quantity) !== Number(original.quantity) ||
            item.item_reference !== (original.item_reference || '') ||
            item.region !== (original.region || '')
          );
        });

      if (isModified) {
        // Send the updated clean items (only approved ones)
        const cleanedItems: PurchaseRequestItemFormInput[] = activeApprovedItems.map((item) => ({
          item_id: item.item_id ?? null,
          item_description: item.item_description,
          item_reference: item.item_reference || 'قطعة عامة',
          region: item.region || 'المنطقة الرئيسية',
          quantity: Number(item.quantity) || 1,
          uom: item.uom || 'PCS',
          specifications: item.specifications || '',
          notes: item.notes || '',
        }));

        await updateGeneralManagerPurchaseRequestApi(selected.id, {
          notes: draftNotes,
          items: cleanedItems,
          comment:
            comment.trim() ||
            (activeApprovedItems.length < (selected.items || []).length
              ? `تم اعتماد عدد (${activeApprovedItems.length}) بند واستبعاد باقي البنود من المدير التنفيذي.`
              : 'تم اعتماد وتعديل الطلب من المدير التنفيذي.'),
        });
      } else {
        await approveGeneralManagerPurchaseRequestApi(selected.id, comment.trim() || undefined);
      }

      setSelected(null);
      setSearchParams({}, { replace: true });
      await loadRequests();
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-sm text-cyan-300" dir="rtl">
        جاري تحميل طلبات القرار التنفيذي...
      </div>
    );
  }

  return (
    <div className="space-y-5" dir="rtl">
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 border-b border-slate-800 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-100 flex items-center gap-2">
            <span>👑</span> طلبات القرار التنفيذي
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            طلبات الشراء التي اعتمدها المراجع وتنتظر موافقتك أو اعتماد بنود محددة واستبعاد أخرى أو الرفض التنفيذي.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-lg border border-amber-700/50 bg-amber-950/40 px-3 py-2 text-xs font-black text-amber-200">
            {requests.length} طلب بانتظار قرارك
          </span>
          <Link
            to="/general-manager/purchase-quotes"
            className="rounded-lg border border-indigo-700/50 bg-indigo-950/40 px-3 py-2 text-xs font-bold text-indigo-200 hover:bg-indigo-900/60 transition-colors"
          >
            ⚖️ شاشة البت في عروض الأسعار ←
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-800/50 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      {notice && (
        <div className="rounded-xl border border-emerald-700/60 bg-emerald-950/30 p-3 text-xs font-bold text-emerald-200">
          {notice}
        </div>
      )}

      <TableFilterBar
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="بحث برقم الطلب أو الموظف أو المورد..."
        selects={[
          {
            label: 'نوع وتدفق الطلب',
            value: routeFilter,
            onChange: setRouteFilter,
            options: [
              { value: 'ALL', label: 'كل الطلبات' },
              { value: 'RETURNED', label: '📥 راجع من المشتريات (مسعر)' },
              { value: 'DISPATCH', label: '🛫 رايح للمشتريات (طلب جديد)' },
              { value: 'QUOTES', label: 'عروض أسعار' },
            ],
          },
        ]}
        onClear={() => {
          setSearchTerm('');
          setRouteFilter('ALL');
        }}
        hasActiveFilters={Boolean(searchTerm || routeFilter !== 'ALL')}
        resultCount={filteredRequests.length}
        totalCount={requests.length}
        resultLabel="طلب"
      />

      {requests.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-10 text-center text-sm text-slate-400">
          لا توجد طلبات بانتظار القرار التنفيذي حاليًا.
        </div>
      ) : (
        <>
          <div className="hidden min-w-0 xl:block overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/60">
            <table className="min-w-[950px] w-full text-right text-xs">
              <thead className="bg-slate-900 text-slate-300">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap font-bold">رقم الطلب</th>
                  <th className="px-4 py-3 whitespace-nowrap font-bold">الصنف المطلوب والكمية</th>
                  <th className="px-4 py-3 whitespace-nowrap font-bold">رقم قطعة الأرض</th>
                  <th className="px-4 py-3 whitespace-nowrap font-bold">المنطقة</th>
                  <th className="px-4 py-3 whitespace-nowrap font-bold">تاريخ الاحتياج</th>
                  <th className="px-4 py-3 whitespace-nowrap font-bold">مقدم الطلب</th>
                  <th className="px-4 py-3 whitespace-nowrap font-bold">القسم</th>
                  <th className="px-4 py-3 whitespace-nowrap font-bold">المورد</th>
                  <th className="px-4 py-3 whitespace-nowrap font-bold">الإجمالي التقديري</th>
                  <th className="px-4 py-3 whitespace-nowrap font-bold">المراجع</th>
                  <th className="px-4 py-3 whitespace-nowrap font-bold">الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((request) => {
                  const firstItem = request.items?.[0];
                  const otherItemsCount = (request.items?.length || 0) - 1;
                  const parcelsDisplay = getSummaryParcels(request);
                  const regionsDisplay = getSummaryRegions(request);
                  const quantitiesInfo = getSummaryQuantities(request.items);

                  return (
                    <tr key={request.id} className="border-t border-slate-800 text-slate-200 hover:bg-slate-900/40">
                      <td className="px-4 py-3 font-bold font-mono whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <span className="text-cyan-300">{request.request_number}</span>
                          {isPrReturnedFromProcurement(request) ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-950/90 text-emerald-300 border border-emerald-700/60 w-fit">
                              <span>📥</span> راجع مسعر
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-950/90 text-sky-300 border border-sky-700/60 w-fit">
                              <span>🛫</span> رايح للمشتريات
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 max-w-[260px]">
                        {firstItem ? (
                          <div>
                            <div className="font-bold text-slate-100 truncate" title={firstItem.item?.name || firstItem.item_description}>
                              {firstItem.item?.name || firstItem.item_description}
                            </div>
                            <div className="text-[11px] text-amber-300 font-mono mt-0.5">
                              {quantitiesInfo.display}
                              {otherItemsCount > 0 && (
                                <span className="mr-2 rounded bg-slate-800 border border-slate-700 px-1.5 py-0.5 text-[10px] text-cyan-300 font-sans">
                                  +{otherItemsCount} بنود أخرى
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-cyan-300 whitespace-nowrap">
                        {parcelsDisplay}
                      </td>
                      <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                        {regionsDisplay}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-amber-300 whitespace-nowrap">
                        {request.date_needed || '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{request.requester?.name || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{request.department?.name || '—'}</td>
                      <td className="px-4 py-3 font-bold text-emerald-300 whitespace-nowrap">
                        {request.direct_supplier?.company_name || 'عروض أسعار'}
                      </td>
                      <td className="px-4 py-3 font-mono text-emerald-300 whitespace-nowrap">
                        {request.procurement_route === 'DIRECT'
                           ? `${Number(request.total_estimated_cost || 0).toLocaleString('ar-EG', {
                               minimumFractionDigits: 2,
                             })} ج.م`
                           : '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{request.assigned_reviewer?.name || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => openRequest(request)}
                          >
                            فتح الطلب ومراجعة البنود
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="success"
                            className={`font-bold flex items-center gap-1 text-white shadow-sm ${
                              isPrReturnedFromProcurement(request)
                                ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-950/40'
                                : 'bg-sky-600 hover:bg-sky-500 shadow-sky-950/40'
                            }`}
                            isLoading={directApprovingId === request.id}
                            disabled={actionLoading || directApprovingId !== null}
                            onClick={() => void handleDirectApprove(request)}
                          >
                            <span>{isPrReturnedFromProcurement(request) ? '👑✓' : '📤'}</span>
                            <span>{isPrReturnedFromProcurement(request) ? 'اعتماد نهائي' : 'إرسال للمشتريات'}</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 xl:hidden">
            {filteredRequests.map((request) => {
              const firstItem = request.items?.[0];
              const otherItemsCount = (request.items?.length || 0) - 1;
              const parcelsDisplay = getSummaryParcels(request);
              const regionsDisplay = getSummaryRegions(request);
              const quantitiesInfo = getSummaryQuantities(request.items);

              return (
                <article
                  key={`mobile-gm-pr-${request.id}`}
                  className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3"
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="min-w-0 break-normal font-mono text-sm font-black text-cyan-300">
                        {request.request_number}
                      </span>
                      {isPrReturnedFromProcurement(request) ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-950/90 text-emerald-300 border border-emerald-700/60">
                          📥 راجع مسعر
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-950/90 text-sky-300 border border-sky-700/60">
                          🛫 رايح للمشتريات
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 rounded-md border border-amber-700/50 bg-amber-950/30 px-2 py-1 text-[11px] font-bold text-amber-200">
                      {request.items?.length || 0} بنود
                    </span>
                  </div>

                  {firstItem && (
                    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-1.5">
                      <div className="text-xs text-slate-400">الصنف:</div>
                      <div className="font-bold text-slate-100 text-sm">{firstItem.item?.name || firstItem.item_description}</div>
                      <div className="flex items-center justify-between text-xs pt-1 flex-wrap gap-2">
                        <span className="text-amber-300 font-mono font-bold">
                          الكمية: {quantitiesInfo.display}
                        </span>
                        <span className="text-cyan-300 font-mono">
                          قطعة: {parcelsDisplay}
                        </span>
                        <span className="text-slate-300">
                          المنطقة: <strong className="text-amber-300">{regionsDisplay}</strong>
                        </span>
                      </div>
                      {otherItemsCount > 0 && (
                        <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800">
                          + يوجد عدد {otherItemsCount} بنود أخرى في هذا الطلب
                        </div>
                      )}
                    </div>
                  )}

                  <dl className="grid min-w-0 grid-cols-2 gap-2 text-xs">
                    <div>
                      <dt className="text-slate-500">تاريخ الاحتياج</dt>
                      <dd className="mt-0.5 font-mono font-bold text-amber-300">{request.date_needed || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">مقدم الطلب</dt>
                      <dd className="mt-0.5 font-bold text-slate-200">{request.requester?.name || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">القسم</dt>
                      <dd className="mt-0.5 text-slate-300">{request.department?.name || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">المورد</dt>
                      <dd className="mt-0.5 font-bold text-emerald-300">
                        {request.direct_supplier?.company_name || 'عروض أسعار'}
                      </dd>
                    </div>
                  </dl>

                  <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="w-full text-xs font-bold"
                      onClick={() => openRequest(request)}
                    >
                      فتح ومراجعة البنود
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="success"
                      className={`w-full text-xs font-bold text-white shadow-sm ${
                        isPrReturnedFromProcurement(request)
                          ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-950/40'
                          : 'bg-sky-600 hover:bg-sky-500 shadow-sky-950/40'
                      }`}
                      isLoading={directApprovingId === request.id}
                      disabled={actionLoading || directApprovingId !== null}
                      onClick={() => void handleDirectApprove(request)}
                    >
                      <span>{isPrReturnedFromProcurement(request) ? '👑✓' : '📤'}</span>
                      <span>
                        {isPrReturnedFromProcurement(request)
                          ? 'اعتماد تنفيذي نهائي (للحسابات)'
                          : 'موافقة وإرسال للمشتريات'}
                      </span>
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      {/* ── General Manager Review & Item Control Modal ── */}
      {selected &&
        createPortal(
          <div
            className="modal-top-viewport fixed inset-0 z-[9999] flex min-h-screen items-center justify-center overflow-y-auto bg-slate-950/80 p-3 sm:p-6 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label="قرار المدير التنفيذي"
          >
            <div className="min-h-0 max-h-[calc(100dvh-2rem)] w-full max-w-[1150px] overflow-y-auto rounded-3xl border border-slate-700 bg-slate-950 p-4 pb-24 sm:p-6 sm:pb-6 shadow-2xl space-y-4">
              {/* Top Modal Bar */}
              <div className="flex flex-col gap-2 border-b border-slate-800 pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-black text-slate-100 font-mono">
                      {selected.request_number}
                    </h2>
                    <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-300 border border-amber-500/30">
                      قرار المدير العام
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    الحالة: {PR_STATUS_LABELS[selected.status]}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    isLoading={actionLoading}
                    onClick={() => void performAction('approve')}
                    className={`text-xs font-black shadow-md ${
                      isPrReturnedFromProcurement(selected)
                        ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-slate-950'
                        : 'bg-gradient-to-r from-sky-600 to-cyan-500 hover:from-sky-500 hover:to-cyan-400 text-slate-950'
                    }`}
                    title={isPrReturnedFromProcurement(selected) ? 'اعتماد نهائي وإحالة للحسابات' : 'موافقة وإرسال للمشتريات'}
                  >
                    {isPrReturnedFromProcurement(selected)
                      ? `👑✓ اعتماد نهائي للحسابات (${activeApprovedItems.length})`
                      : `📤 موافقة وإرسال للمشتريات (${activeApprovedItems.length})`}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    isLoading={actionLoading}
                    onClick={() => setIsRejectModalOpen(true)}
                    className="text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white"
                    title="رفض الطلب"
                  >
                    ✕ رفض
                  </Button>
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-600 bg-slate-900/60 text-lg font-black text-slate-300 hover:border-cyan-400 hover:text-white cursor-pointer"
                    onClick={() => {
                      setSelected(null);
                      setSearchParams({}, { replace: true });
                    }}
                    title="إغلاق النافذة"
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* Request Info Cards */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 text-xs">
                <div className="rounded-xl border border-amber-800/60 bg-amber-950/20 p-3">
                  <span className="text-amber-400 font-bold block">تاريخ الاحتياج ⏳</span>
                  <strong className="mt-1 text-amber-200 block font-mono text-sm">{selected.date_needed || 'غير محدد'}</strong>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                  <span className="text-slate-500 block">مقدم الطلب</span>
                  <strong className="mt-1 text-slate-100 block">{selected.requester?.name || '—'}</strong>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                  <span className="text-slate-500 block">القسم</span>
                  <strong className="mt-1 text-slate-100 block">{selected.department?.name || '—'}</strong>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                  <span className="text-slate-500 block">المراجع</span>
                  <strong className="mt-1 text-slate-100 block">{selected.assigned_reviewer?.name || '—'}</strong>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                  <span className="text-slate-500 block">المورد المقترح</span>
                  <strong className="mt-1 text-emerald-300 block">{selected.direct_supplier?.company_name || 'عروض أسعار'}</strong>
                </div>
              </div>

              {/* Timeline */}
              <PurchaseRequestTimeline request={selected} />

              {/* Comment */}
              <div>
                <label className="text-xs font-bold text-slate-300">
                  تعليق أو توجيه المدير العام
                  <textarea
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    rows={2}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                    placeholder="اكتب توجيهاتك لقسم المشتريات (اختياري للاعتماد، وإلزامي للرفض)..."
                  />
                </label>
              </div>

              {/* Items Management Box (Selective Item Approval / Removal) */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-800 pb-3">
                  <div>
                    <h3 className="text-sm font-black text-slate-100 flex items-center gap-2">
                      <span>📦</span> مراجعة بنود الطلب والاعتماد الجزئي
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-emerald-950/80 border border-emerald-800/60 px-3 py-1 text-xs font-bold text-emerald-300">
                      معتمد: {activeApprovedItems.length} من {draftItems.length} بند
                    </span>
                  </div>
                </div>

                {/* Items Table */}
                <div className="space-y-3">
                  <div className="hidden min-w-0 md:block overflow-x-auto rounded-xl border border-slate-800">
                    <table className="min-w-[900px] w-full text-right text-xs">
                      <thead className="bg-slate-950 text-slate-300">
                        <tr>
                          <th className="px-3 py-2.5 whitespace-nowrap font-bold">الحالة</th>
                          <th className="px-3 py-2.5 whitespace-nowrap font-bold">الصنف</th>
                          <th className="px-3 py-2.5 whitespace-nowrap font-bold">المواصفات</th>
                          <th className="px-3 py-2.5 whitespace-nowrap font-bold">رقم القطعة</th>
                          <th className="px-3 py-2.5 whitespace-nowrap font-bold">المنطقة</th>
                          <th className="px-3 py-2.5 whitespace-nowrap font-bold">الكمية</th>
                          <th className="px-3 py-2.5 whitespace-nowrap font-bold text-center">التحكم بالبند</th>
                        </tr>
                      </thead>
                      <tbody>
                        {draftItems.map((item, index) => {
                          const isExcluded = item.isExcluded;
                          return (
                            <tr
                              key={index}
                              className={`border-t border-slate-800 transition-colors ${
                                isExcluded
                                  ? 'bg-rose-950/20 opacity-60'
                                  : 'hover:bg-slate-800/30'
                              }`}
                            >
                              <td className="px-3 py-2.5 whitespace-nowrap">
                                {isExcluded ? (
                                  <span className="rounded bg-rose-500/20 border border-rose-500/40 px-2 py-0.5 text-[10px] font-bold text-rose-300">
                                    ❌ مستبعد
                                  </span>
                                ) : (
                                  <span className="rounded bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                                    ✓ معتمد
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2.5">
                                <input
                                  disabled={isExcluded}
                                  value={item.item_description}
                                  onChange={(e) => updateItem(index, 'item_description', e.target.value)}
                                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-slate-100 disabled:bg-slate-950 disabled:text-slate-500"
                                />
                              </td>
                              <td className="px-3 py-2.5">
                                <input
                                  disabled={isExcluded}
                                  value={item.specifications || ''}
                                  onChange={(e) => updateItem(index, 'specifications', e.target.value)}
                                  placeholder="مواصفات البند..."
                                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-100 disabled:bg-slate-950 disabled:text-slate-500"
                                />
                              </td>
                              <td className="px-3 py-2.5">
                                <input
                                  disabled={isExcluded}
                                  value={item.item_reference || ''}
                                  onChange={(e) => updateItem(index, 'item_reference', e.target.value)}
                                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-slate-100 font-mono text-xs disabled:bg-slate-950 disabled:text-slate-500"
                                />
                              </td>
                              <td className="px-3 py-2.5">
                                <input
                                  disabled={isExcluded}
                                  value={item.region || ''}
                                  onChange={(e) => updateItem(index, 'region', e.target.value)}
                                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-slate-100 disabled:bg-slate-950 disabled:text-slate-500"
                                />
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap">
                                <div className="flex items-center gap-1">
                                  <input
                                    disabled={isExcluded}
                                    type="number"
                                    min="0.01"
                                    step="any"
                                    value={item.quantity}
                                    onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                                    className="w-20 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-slate-100 font-bold disabled:bg-slate-950 disabled:text-slate-500"
                                  />
                                  <span className="text-xs text-slate-400">{getUnitLabel(item.uom)}</span>
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-center whitespace-nowrap">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => toggleExcludeItem(index)}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${
                                      isExcluded
                                        ? 'border-emerald-600 bg-emerald-950/60 text-emerald-300 hover:bg-emerald-900/60'
                                        : 'border-amber-600/60 bg-amber-950/40 text-amber-200 hover:bg-amber-900/60'
                                    }`}
                                    title={isExcluded ? 'إلغاء الاستبعاد وإعادة اعتماد البند' : 'استبعاد البند من أمر الشراء'}
                                  >
                                    {isExcluded ? '↩️ استرجاع البند' : '🚫 استبعاد البند'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeItemPermanently(index)}
                                    className="px-2 py-1 rounded-lg text-xs text-rose-400 hover:bg-rose-950/50 hover:text-rose-200 border border-transparent hover:border-rose-800/60"
                                    title="حذف البند نهائياً من الطلب"
                                  >
                                    🗑️
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile View */}
                  <div className="space-y-3 md:hidden">
                    {draftItems.map((item, index) => {
                      const isExcluded = item.isExcluded;
                      return (
                        <article
                          key={`mobile-draft-item-${index}`}
                          className={`rounded-2xl border p-3.5 space-y-3 ${
                            isExcluded
                              ? 'border-rose-900/60 bg-rose-950/20 opacity-70'
                              : 'border-slate-800 bg-slate-950/70'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-slate-100 text-sm">بند {index + 1}</span>
                            {isExcluded ? (
                              <span className="rounded bg-rose-500/20 border border-rose-500/40 px-2 py-0.5 text-[10px] font-bold text-rose-300">
                                ❌ مستبعد من الشراء
                              </span>
                            ) : (
                              <span className="rounded bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                                ✓ معتمد
                              </span>
                            )}
                          </div>

                          <div className="space-y-2 text-xs">
                            <div>
                              <label className="text-slate-400 block mb-1">اسم الصنف</label>
                              <input
                                disabled={isExcluded}
                                value={item.item_description}
                                onChange={(e) => updateItem(index, 'item_description', e.target.value)}
                                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-slate-100"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-slate-400 block mb-1">رقم القطعة</label>
                                <input
                                  disabled={isExcluded}
                                  value={item.item_reference || ''}
                                  onChange={(e) => updateItem(index, 'item_reference', e.target.value)}
                                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-slate-100"
                                />
                              </div>
                              <div>
                                <label className="text-slate-400 block mb-1">الكمية</label>
                                <input
                                  disabled={isExcluded}
                                  type="number"
                                  min="0.01"
                                  value={item.quantity}
                                  onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-slate-100 font-bold"
                                />
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => toggleExcludeItem(index)}
                              className={`flex-1 py-1.5 rounded-lg text-xs font-bold border ${
                                isExcluded
                                  ? 'border-emerald-600 bg-emerald-950 text-emerald-300'
                                  : 'border-amber-600 bg-amber-950 text-amber-200'
                              }`}
                            >
                              {isExcluded ? '↩️ استرجاع البند' : '🚫 استبعاد هذا البند'}
                            </button>
                            <button
                              type="button"
                              onClick={() => removeItemPermanently(index)}
                              className="px-3 py-1.5 rounded-lg text-xs border border-rose-800 text-rose-300 bg-rose-950/40"
                            >
                              🗑️
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Universal Notes and Decisions Trail */}
              <UnifiedNotesCard request={selected} />

              {/* Error Message inside Modal */}
              {error && (
                <div className="pt-1">
                  <ErrorMessage error={error} onDismiss={() => setError(null)} />
                </div>
              )}

              {/* Modal Actions */}
              <div className="fixed bottom-0 inset-x-0 z-30 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 border-t border-slate-800 bg-slate-950/95 p-3 shadow-2xl backdrop-blur sm:static sm:z-auto sm:mt-5 sm:flex sm:w-auto sm:justify-start sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none sm:backdrop-blur-none">
                <Button
                  type="button"
                  variant="primary"
                  isLoading={actionLoading}
                  onClick={() => void performAction('approve')}
                  className="flex-1 sm:flex-none min-h-11 text-xs sm:text-sm font-black bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-slate-950 shadow-lg"
                >
                  <span>
                    ✓ اعتماد البنود المحددة ({activeApprovedItems.length}) وإرسال للمشتريات
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  isLoading={actionLoading}
                  onClick={() => setIsRejectModalOpen(true)}
                  className="flex-1 sm:flex-none min-h-11 text-xs sm:text-sm font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg"
                >
                  <span>✕ رفض الطلب بالكامل</span>
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Rejection Confirmation Dialog */}
      {selected && (
        <RejectRequestDialog
          isOpen={isRejectModalOpen}
          requestNumber={selected.request_number}
          isRejecting={actionLoading}
          onConfirm={handleConfirmReject}
          onCancel={() => setIsRejectModalOpen(false)}
        />
      )}
    </div>
  );
};

export default GeneralManagerPurchaseRequestsPage;
