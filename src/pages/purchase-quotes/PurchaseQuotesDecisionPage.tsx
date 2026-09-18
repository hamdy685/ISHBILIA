import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getPendingQuoteRequestsApi, recommendPurchaseQuoteApi, decidePurchaseQuoteApi } from '../../api/purchaseQuotes';
import apiClient from '../../api/client';
import { PurchaseRequest, PurchaseRequestQuote, PurchaseRequestQuoteRecommendation } from '../../types/purchaseRequest';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/Table';
import { TableSkeleton } from '../../components/ui/StateFeedback';
import ErrorMessage from '../../components/ErrorMessage';
import { parseApiError } from '../../utils/apiError';
import { getUnitLabel } from '../../utils/units';
import TableColumnFilters from '../../components/ui/TableColumnFilters';
import { getDefaultDateFrom, getTodayInputDate } from '../../utils/dateFilters';
import { UnifiedNotesCard } from '../../components/common/UnifiedNotesCard';

import { getToken } from '../../utils/authStorage';

type DecisionMode = 'recommend' | 'executive';

const getQuoteFileUrl = (quote: { id: number; file_url?: string | null; file_path?: string | null; file_name?: string | null }) => {
  if (!quote.file_url && !quote.file_path && !quote.file_name) return null;
  const token = getToken();
  const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
  if (quote.file_url && !quote.file_url.includes('/storage/quotes/')) {
    return quote.file_url.includes('?') ? `${quote.file_url}&token=${encodeURIComponent(token || '')}` : `${quote.file_url}${tokenParam}`;
  }
  return `/api/v1/purchase-quotes/${quote.id}/file${tokenParam}`;
};

const isGeneralManagerRequest = (request: PurchaseRequest): boolean =>
  request.is_general_manager_requester === true
  || request.requester_role === 'general_manager'
  || request.requester?.role === 'general_manager';

const renderRecommendationBadge = (
  rec: PurchaseRequestQuoteRecommendation | undefined,
  fallbackLabel: string = 'لم يرشح بعد'
) => {
  if (!rec) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-900 border border-slate-800 text-slate-400">
        <span>⏳</span>
        <span>{fallbackLabel}</span>
      </span>
    );
  }

  const isRecommend = rec.decision === 'RECOMMEND';

  return (
    <div className="inline-flex flex-col gap-1 items-start">
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black shadow-sm ${
          isRecommend
            ? 'bg-emerald-950/90 border border-emerald-500/60 text-emerald-300'
            : 'bg-rose-950/90 border border-rose-500/60 text-rose-300'
        }`}
      >
        <span className="text-sm">{isRecommend ? '✅' : '❌'}</span>
        <span>{isRecommend ? 'مرشح' : 'مرفوض'}</span>
      </span>
      {rec.user?.name && (
        <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1 pr-0.5">
          <span className="text-slate-500">بواسطة:</span>
          <span className="text-slate-200">{rec.user.name}</span>
        </span>
      )}
    </div>
  );
};

interface PurchaseQuotesDecisionPageProps {
  mode: DecisionMode;
}

const modeCopy: Record<DecisionMode, { title: string; subtitle: string; action: string }> = {
  recommend: {
    title: 'ترشيح عروض الأسعار',
    subtitle: 'راجع عروض الموردين للطلبات المسندة إليك فقط وأرسل ترشيح القسم.',
    action: 'ترشيح هذا العرض',
  },
  executive: {
    title: 'القرار التنفيذي لعروض الأسعار',
    subtitle: 'راجع ترشيح الحسابات، ثم اختر العرض النهائي أو ارفض العروض.',
    action: 'اختيار العرض',
  },
};

export const PurchaseQuotesDecisionPage: React.FC<PurchaseQuotesDecisionPageProps> = ({ mode }) => {
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<number, string>>({});
  const today = getTodayInputDate();
  const defaultDateFrom = getDefaultDateFrom();
  const [quoteFilters, setQuoteFilters] = useState({ item: '', supplier: '', unitPrice: '', total: '', currency: '', accounting: '', department: '', action: '', dateFrom: defaultDateFrom, dateTo: today });
  const [searchParams] = useSearchParams();
  const openRequestId = Number(searchParams.get('open') || 0);

  const [previewQuote, setPreviewQuote] = useState<PurchaseRequestQuote | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewContentType, setPreviewContentType] = useState<string>('application/pdf');

  const handlePreviewQuote = async (quote: PurchaseRequestQuote) => {
    setPreviewQuote(quote);
    setPreviewLoading(true);
    setPreviewError(null);
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
    }
    setPreviewBlobUrl(null);

    try {
      const res = await apiClient.get(`/purchase-quotes/${quote.id}/file`, {
        responseType: 'blob',
      });
      const rawType = res.headers ? res.headers['content-type'] : null;
      const type = typeof rawType === 'string' ? rawType : 'application/pdf';
      setPreviewContentType(type);
      const blob = new Blob([res.data], { type });
      const url = URL.createObjectURL(blob);
      setPreviewBlobUrl(url);
    } catch {
      // Fallback: If blob fetch fails, use direct URL with query token
      const directUrl = getQuoteFileUrl(quote);
      if (directUrl) {
        window.open(directUrl, '_blank');
        setPreviewQuote(null);
        return;
      }
      setPreviewError('تعذر جلب ملف عرض السعر.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const copy = modeCopy[mode];
  const hasNonDateQuoteFilter = Boolean(quoteFilters.item || quoteFilters.supplier || quoteFilters.unitPrice || quoteFilters.total || quoteFilters.currency || quoteFilters.accounting || quoteFilters.department || quoteFilters.action);
  const ignoreDefaultQuoteDate = hasNonDateQuoteFilter && quoteFilters.dateFrom === defaultDateFrom && quoteFilters.dateTo === today;
  const visibleRequests = useMemo(() => {
    const contains = (value: unknown, filter: string) => !filter || String(value ?? '').toLocaleLowerCase('ar-EG').includes(filter.toLocaleLowerCase('ar-EG'));
    const source = (mode === 'executive' ? requests.filter(request => request.status === 'PENDING_EXECUTIVE_QUOTE_DECISION') : requests.filter(request => request.status === 'PENDING_QUOTE_RECOMMENDATIONS')).filter(request => { const requestDate = String(request.created_at || '').slice(0, 10); return request.id === openRequestId || ignoreDefaultQuoteDate || ((!quoteFilters.dateFrom || requestDate >= quoteFilters.dateFrom) && (!quoteFilters.dateTo || requestDate <= quoteFilters.dateTo)); });
    return source.map(request => ({ ...request, quotes: (request.quotes || []).filter(quote => {
      const primaryItem = request.items?.[0];
      const accounting = quote.recommendations?.find(item => item.role_type === 'ACCOUNTING');
      const department = isGeneralManagerRequest(request)
        ? undefined
        : quote.recommendations?.find(item => item.role_type === 'DEPARTMENT');
      return contains(`${primaryItem?.item_description || primaryItem?.item?.name || ''} ${primaryItem?.item_reference || ''} ${primaryItem?.region || ''}`, quoteFilters.item) && contains(quote.supplier?.company_name, quoteFilters.supplier) && contains(quote.unit_price, quoteFilters.unitPrice) && contains(quote.total_amount, quoteFilters.total) && contains(quote.currency, quoteFilters.currency) && contains(accounting?.decision === 'RECOMMEND' ? 'مرشح' : accounting ? 'مرفوض' : 'لم يرشح بعد', quoteFilters.accounting) && contains(department?.decision === 'RECOMMEND' ? 'مرشح' : department ? 'مرفوض' : 'لم يرشح بعد', quoteFilters.department) && contains(mode === 'executive' ? 'اختيار العرض رفض جميع العروض' : 'ترشيح هذا العرض رفض العرض', quoteFilters.action);
    })})).filter(request => (request.quotes || []).length > 0);
  }, [mode, requests, quoteFilters, ignoreDefaultQuoteDate, openRequestId]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRequests(await getPendingQuoteRequestsApi());
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const act = async (request: PurchaseRequest, quote: PurchaseRequestQuote, decision: 'RECOMMEND' | 'REJECT' | 'SELECT') => {
    setSavingId(quote.id);
    setError(null);
    setSuccess(null);
    try {
      if (mode === 'executive') {
        await decidePurchaseQuoteApi(quote.id, decision === 'SELECT' ? 'SELECT' : 'REJECT', comments[quote.id]);
        setSuccess(decision === 'SELECT' ? 'تم اختيار العرض بنجاح، وعاد الطلب إلى مدير المشتريات لإنشاء أمر الشراء.' : 'تم رفض عروض الأسعار والطلب بنجاح.');
        setRequests(current => current.filter(r => r.id !== request.id));
      } else {
        const updatedRequest = await recommendPurchaseQuoteApi(
          quote.id,
          decision === 'REJECT' ? 'REJECT' : 'RECOMMEND',
          comments[quote.id],
        );
        setSuccess(
          decision === 'REJECT'
            ? 'تم تسجيل القرار ورفض العرض بنجاح.'
            : updatedRequest.status === 'PENDING_EXECUTIVE_QUOTE_DECISION'
              ? updatedRequest.is_general_manager_requester
                ? 'تم ترشيح العرض بنجاح. اكتمل ترشيح الحسابات، وتم إرسال الطلب إلى المدير العام لاتخاذ القرار النهائي.'
                : 'تم ترشيح العرض بنجاح. اكتملت ترشيحات الحسابات ومدير القسم، وتم إرسال الطلب إلى المدير التنفيذي لاتخاذ القرار النهائي.'
              : updatedRequest.is_general_manager_requester
                ? 'تم ترشيح العرض بنجاح. تم إرسال الطلب لقرار المدير العام.'
                : 'تم ترشيح العرض بنجاح واكتمال دورك، تم إرسال الطلب للمتابعة.',
        );
        setRequests(current => current.filter(r => r.id !== request.id));
      }
      await load();
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setSavingId(null);
    }
  };

  if (loading) return <TableSkeleton rows={5} columns={7} className="min-h-[360px]" />;

  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <h1 className="text-xl font-black text-slate-100">{copy.title}</h1>
        <p className="mt-1 text-sm text-slate-400">{copy.subtitle}</p>
      </div>
      {error && <ErrorMessage error={error} onDismiss={() => setError(null)} />}
      {success && (
        <div role="status" className="rounded-xl border border-emerald-700/70 bg-emerald-950/50 px-4 py-3 text-sm font-bold text-emerald-200 shadow-lg">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-base" aria-hidden="true">✓</span>
            <p>{success}</p>
            <button type="button" onClick={() => setSuccess(null)} className="mr-auto text-emerald-300 hover:text-white" aria-label="إغلاق رسالة النجاح">×</button>
          </div>
        </div>
      )}
      {!visibleRequests.length && <Card className="py-12 text-center text-slate-400">لا توجد عروض أسعار تحتاج إلى إجراء حاليًا.</Card>}
      {visibleRequests.map((request, reqIndex) => {
        const totalQuotes = (request.quotes || []).length;
        const totalItems = request.items?.length || 0;

        return (
          <Card key={request.id} className={`space-y-5 border-2 ${request.id === openRequestId ? 'border-cyan-400/90 ring-4 ring-cyan-400/20 shadow-cyan-950/50' : 'border-slate-700/80'} shadow-2xl bg-slate-900/95 rounded-2xl p-4 sm:p-6 mb-8`}>
            {/* Request Master Header */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 space-y-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between border-b border-slate-800 pb-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-950 border border-cyan-700/70 text-xs font-black text-cyan-300">
                      {reqIndex + 1}
                    </span>
                    <h2 className="font-mono text-base font-black text-cyan-300">
                      طلب شراء: {request.request_number}
                    </h2>
                  </div>
                  {request.date_needed && (
                    <span className="rounded-full border border-amber-700/60 bg-amber-950/40 px-3 py-1 text-xs font-mono font-bold text-amber-300">
                      ⏳ تاريخ الاحتياج: {request.date_needed}
                    </span>
                  )}
                  <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-bold text-slate-300">
                    📋 عدد عروض الأسعار: {totalQuotes} عروض
                  </span>
                </div>
                <div className="text-xs text-slate-400">
                  <span className="font-bold text-slate-200">{request.requester?.name || 'مقدم الطلب'}</span>
                  <span className="mx-1.5">•</span>
                  <span className="text-slate-300">{request.department?.name || 'القسم'}</span>
                  {isGeneralManagerRequest(request) && (
                    <span className="mr-2 rounded bg-amber-950/80 px-2 py-0.5 font-bold text-amber-300 border border-amber-700/60">
                      طلب المدير العام — لا يحتاج ترشيح القسم
                    </span>
                  )}
                </div>
              </div>

              {/* All Items Summary for this Purchase Request */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-400">
                  <span>📦 بنود ومواد الطلب ({totalItems}):</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {request.items?.map((item, itemIdx) => (
                    <div key={item.id || itemIdx} className="rounded-lg border border-slate-800/90 bg-slate-900/90 p-2.5 text-xs space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-bold text-slate-100 line-clamp-1">{item.item_description || item.item?.name || 'بند غير محدد'}</span>
                        <span className="shrink-0 font-mono text-[10px] font-bold text-cyan-300 bg-cyan-950/70 border border-cyan-800/50 px-1.5 py-0.5 rounded">
                          #{itemIdx + 1}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
                        {item.item_reference && <span className="font-mono text-cyan-300 font-semibold">قطعة: {item.item_reference}</span>}
                        {item.region && <span>المنطقة: {item.region}</span>}
                        <span className="font-bold text-amber-300 font-mono">الكمية: {item.quantity} {getUnitLabel(item.uom)}</span>
                      </div>
                      {item.specifications && (
                        <p className="text-[10px] text-slate-400 line-clamp-1">المواصفات: {item.specifications}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Executive Mode Overall Recommendation Badges */}
            {mode === 'executive' && (() => {
              const accountingRecommendation = request.quotes?.flatMap(quote => (quote.recommendations || []).map(recommendation => ({ recommendation, quote }))).find(entry => entry.recommendation.role_type === 'ACCOUNTING' && entry.recommendation.decision === 'RECOMMEND');
              const departmentRecommendation = request.quotes?.flatMap(quote => (quote.recommendations || []).map(recommendation => ({ recommendation, quote }))).find(entry => entry.recommendation.role_type === 'DEPARTMENT' && entry.recommendation.decision === 'RECOMMEND');
              const executiveOwnRequest = isGeneralManagerRequest(request);
              return (
                <div className={`grid gap-3 rounded-xl border border-cyan-900/70 bg-slate-950/70 p-4 text-sm ${executiveOwnRequest ? 'md:grid-cols-1' : 'md:grid-cols-2'}`}>
                  <div className="rounded-lg border border-emerald-800/70 bg-emerald-950/20 px-3 py-2 font-bold text-emerald-200">
                    <div className="text-xs text-emerald-400">ترشيح الحسابات</div>
                    <div className="mt-1">{accountingRecommendation ? `${accountingRecommendation.recommendation.user?.name || 'الحسابات'} رشّح ${accountingRecommendation.quote.supplier?.company_name || 'هذا العرض'}` : 'لم يصل ترشيح الحسابات بعد'}</div>
                  </div>
                  {!executiveOwnRequest && (
                    <div className="rounded-lg border border-amber-800/70 bg-amber-950/20 px-3 py-2 font-bold text-amber-200">
                      <div className="text-xs text-amber-400">ترشيح مدير القسم</div>
                      <div className="mt-1">{departmentRecommendation ? `${departmentRecommendation.recommendation.user?.name || 'مدير القسم'} رشّح ${departmentRecommendation.quote.supplier?.company_name || 'هذا العرض'}` : 'لم يصل ترشيح مدير القسم بعد'}</div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Column Filters */}
            <TableColumnFilters filters={[{ key: 'item', label: 'الصنف / القطعة / المنطقة', value: quoteFilters.item, onChange: (value) => setQuoteFilters(current => ({ ...current, item: value })) }, { key: 'supplier', label: 'المورد', value: quoteFilters.supplier, onChange: (value) => setQuoteFilters(current => ({ ...current, supplier: value })) }, { key: 'unitPrice', label: 'سعر الوحدة', type: 'number', value: quoteFilters.unitPrice, onChange: (value) => setQuoteFilters(current => ({ ...current, unitPrice: value })) }, { key: 'total', label: 'الإجمالي', type: 'number', value: quoteFilters.total, onChange: (value) => setQuoteFilters(current => ({ ...current, total: value })) }, { key: 'currency', label: 'العملة', value: quoteFilters.currency, onChange: (value) => setQuoteFilters(current => ({ ...current, currency: value })) }, { key: 'accounting', label: 'ترشيح الحسابات', value: quoteFilters.accounting, onChange: (value) => setQuoteFilters(current => ({ ...current, accounting: value })) }, { key: 'department', label: 'ترشيح القسم', value: quoteFilters.department, onChange: (value) => setQuoteFilters(current => ({ ...current, department: value })) }, { key: 'action', label: 'الإجراء', value: quoteFilters.action, onChange: (value) => setQuoteFilters(current => ({ ...current, action: value })) }, { key: 'dateFrom', label: 'من تاريخ الطلب', type: 'date', value: quoteFilters.dateFrom, onChange: (value) => setQuoteFilters(current => ({ ...current, dateFrom: value })) }, { key: 'dateTo', label: 'إلى تاريخ الطلب', type: 'date', value: quoteFilters.dateTo, onChange: (value) => setQuoteFilters(current => ({ ...current, dateTo: value })) }]} hasActiveFilters={Boolean(hasNonDateQuoteFilter || quoteFilters.dateFrom !== defaultDateFrom || quoteFilters.dateTo !== today)} onClear={() => setQuoteFilters({ item: '', supplier: '', unitPrice: '', total: '', currency: '', accounting: '', department: '', action: '', dateFrom: defaultDateFrom, dateTo: today })} />
            
            {/* Desktop Table View */}
            <div className="hidden min-w-0 md:block">
              <div className="overflow-x-auto">
                <Table className="min-w-[1120px] text-sm">
                  <TableHeader className="border-b-2 border-cyan-800/70 bg-slate-950">
                    <TableRow className="border-b border-slate-700/80">
                      <TableHead className="border-l border-slate-700/80 text-sm font-black text-slate-100">#</TableHead>
                      <TableHead className="border-l border-slate-700/80 text-sm font-black text-slate-100">المورد</TableHead>
                      <TableHead className="border-l border-slate-700/80 text-sm font-black text-slate-100">الأصناف المشمولة</TableHead>
                      <TableHead className="border-l border-slate-700/80 text-sm font-black text-slate-100">سعر الوحدة</TableHead>
                      <TableHead className="border-l border-slate-700/80 text-sm font-black text-slate-100">إجمالي العرض</TableHead>
                      <TableHead className="border-l border-slate-700/80 text-sm font-black text-slate-100">العملة</TableHead>
                      <TableHead className="border-l border-slate-700/80 text-sm font-black text-slate-100">ترشيح الحسابات</TableHead>
                      <TableHead className="border-l border-slate-700/80 text-sm font-black text-slate-100">ترشيح القسم</TableHead>
                      <TableHead className="text-center text-sm font-black text-slate-100">الإجراء والقرار</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-slate-700/80">
                    {(request.quotes || []).map((quote, qIndex) => {
                      const accounting = quote.recommendations?.find(item => item.role_type === 'ACCOUNTING');
                      const department = quote.recommendations?.find(item => item.role_type === 'DEPARTMENT');
                      const pdfUrl = getQuoteFileUrl(quote);
                      return (
                        <TableRow key={quote.id} className="border-b border-slate-700/80 even:bg-slate-800/25">
                          <TableCell className="border-l border-slate-700/70 align-top font-bold text-cyan-400 text-center">
                            {qIndex + 1}
                          </TableCell>
                          <TableCell className="min-w-[190px] border-l border-slate-700/70 align-top text-sm">
                            <div className="font-black text-slate-100">{quote.supplier?.company_name || '—'}</div>
                            {pdfUrl ? (
                              <button
                                type="button"
                                onClick={() => void handlePreviewQuote(quote)}
                                className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-cyan-950/90 hover:bg-cyan-900 border border-cyan-600/70 text-cyan-300 transition-all shadow-sm cursor-pointer"
                                title="فتح ومعاينة ملف عرض السعر PDF"
                              >
                                <span>📄</span>
                                <span>معاينة PDF</span>
                                <span className="text-[10px]">↗</span>
                              </button>
                            ) : (
                              <div className="text-[10px] text-slate-500 mt-1">لم يُرفق ملف</div>
                            )}
                            {quote.notes && (
                              <div className="text-[11px] text-slate-400 mt-1 bg-slate-950/60 p-1.5 rounded-lg border border-slate-800">
                                {quote.notes}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="min-w-[240px] border-l border-slate-700/70 align-top text-sm">
                            <div className="space-y-1">
                              {request.items?.map((item, iIdx) => (
                                <div key={item.id || iIdx} className="text-xs text-slate-200">
                                  <span className="font-bold text-slate-100">{item.item_description}</span>
                                  <span className="text-slate-400 mx-1">({item.quantity} {getUnitLabel(item.uom)})</span>
                                </div>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="border-l border-slate-700/70 align-top font-mono text-sm font-black text-amber-300">{quote.unit_price || '—'} ج.م</TableCell>
                          <TableCell className="border-l border-slate-700/70 align-top font-mono text-sm font-black text-emerald-300">{quote.total_amount} ج.م</TableCell>
                          <TableCell className="border-l border-slate-700/70 align-top text-sm font-bold text-slate-200">{quote.currency}</TableCell>
                          <TableCell className="border-l border-slate-700/70 align-top text-sm font-bold text-slate-200">
                            {renderRecommendationBadge(accounting)}
                          </TableCell>
                          <TableCell className="border-l border-slate-700/70 align-top text-sm font-bold text-slate-200">
                            {isGeneralManagerRequest(request) ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-cyan-950/80 border border-cyan-500/50 text-cyan-300">
                                <span>👑</span>
                                <span>قرار المدير العام مباشرة</span>
                              </span>
                            ) : (
                              renderRecommendationBadge(department)
                            )}
                          </TableCell>
                          <TableCell className="min-w-[250px] border-l border-slate-700/70 align-top text-sm">
                            <input value={comments[quote.id] || ''} onChange={event => setComments(current => ({ ...current, [quote.id]: event.target.value }))} placeholder="تعليق اختياري" className="mb-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100" />
                            <div className="flex justify-center gap-2">
                              <Button size="sm" variant={mode === 'executive' ? 'primary' : 'success'} disabled={savingId === quote.id} onClick={() => void act(request, quote, mode === 'executive' ? 'SELECT' : 'RECOMMEND')}>{mode === 'executive' ? copy.action : copy.action}</Button>
                              <Button size="sm" variant="danger" disabled={savingId === quote.id} onClick={() => void act(request, quote, 'REJECT')}>{mode === 'executive' ? 'رفض جميع العروض' : 'رفض العرض'}</Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Mobile Quote Cards View with Distinct Separation */}
            <div className="space-y-4 md:hidden">
              <div className="flex items-center gap-2 text-xs font-bold text-cyan-400 bg-cyan-950/40 border border-cyan-800/40 rounded-xl px-3 py-2">
                <span>📑</span>
                <span>قائمة عروض الأسعار المقدمة لهذا الطلب ({totalQuotes} عروض):</span>
              </div>

              {(request.quotes || []).map((quote, qIndex) => {
                const accounting = quote.recommendations?.find(item => item.role_type === 'ACCOUNTING');
                const department = quote.recommendations?.find(item => item.role_type === 'DEPARTMENT');
                const pdfUrl = getQuoteFileUrl(quote);

                return (
                  <article
                    key={`mobile-quote-${quote.id}`}
                    className="min-w-0 rounded-2xl border-2 border-slate-700/90 bg-slate-950/90 p-4 shadow-xl space-y-3.5 relative overflow-hidden"
                  >
                    {/* Top Quote Header Bar */}
                    <div className="flex min-w-0 items-start justify-between gap-3 border-b border-slate-800 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-cyan-900 border border-cyan-600 text-xs font-black text-cyan-200">
                          {qIndex + 1}
                        </span>
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 block">عرض مورد #{qIndex + 1} من {totalQuotes}</span>
                          <span className="font-black text-sm text-slate-100 block mt-0.5">
                            🏢 {quote.supplier?.company_name || 'مورد غير محدد'}
                          </span>
                        </div>
                      </div>
                      <div className="text-left shrink-0">
                        <span className="text-[10px] text-slate-400 block">إجمالي العرض</span>
                        <span className="font-mono text-base font-black text-emerald-400 block">
                          {quote.total_amount} {quote.currency || 'ج.م'}
                        </span>
                      </div>
                    </div>

                    {/* Price details & PDF Button */}
                    <div className="grid grid-cols-2 gap-2 bg-slate-900/90 rounded-xl p-2.5 border border-slate-800 text-xs">
                      <div>
                        <span className="text-slate-500 text-[11px] block">سعر الوحدة:</span>
                        <span className="font-mono font-black text-amber-300 text-sm">{quote.unit_price || '—'} ج.م</span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[11px] block">العملة:</span>
                        <span className="font-bold text-slate-200">{quote.currency || 'EGP'}</span>
                      </div>
                    </div>

                    {pdfUrl && (
                      <div>
                        <button
                          type="button"
                          onClick={() => void handlePreviewQuote(quote)}
                          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-cyan-950/90 hover:bg-cyan-900 border border-cyan-600/80 text-cyan-200 text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
                        >
                          <span>📄</span>
                          <span>معاينة وتحميل عرض السعر PDF</span>
                          <span>↗</span>
                        </button>
                      </div>
                    )}

                    {quote.notes && (
                      <div className="text-xs text-slate-300 bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
                        <span className="text-slate-500 font-bold">شروط وملاحظات المورد: </span>
                        {quote.notes}
                      </div>
                    )}

                    {/* Items for this quote */}
                    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2 text-xs">
                      <span className="font-bold text-slate-300 text-[11px] block">الأصناف المغطاة بالعرض:</span>
                      <div className="space-y-1.5">
                        {request.items?.map((item, itmIdx) => (
                          <div key={item.id || itmIdx} className="border-b border-slate-800/50 pb-1.5 text-xs space-y-0.5">
                            <div className="flex items-center justify-between">
                              <span className="text-slate-100 font-bold">{item.item_description}</span>
                              <span className="font-mono font-bold text-amber-300">{item.quantity} {getUnitLabel(item.uom)}</span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-slate-400">
                              {item.item_reference && (
                                <span className="font-mono text-cyan-300">قطعة: {item.item_reference}</span>
                              )}
                              {item.region && (
                                <>
                                  <span className="text-slate-600">•</span>
                                  <span className="text-slate-300">المنطقة: {item.region}</span>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Recommendations Status */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 text-xs">
                      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-2.5 space-y-1">
                        <span className="text-slate-400 font-bold block text-[11px]">ترشيح الحسابات:</span>
                        <div>{renderRecommendationBadge(accounting)}</div>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-2.5 space-y-1">
                        <span className="text-slate-400 font-bold block text-[11px]">ترشيح القسم:</span>
                        <div>
                          {isGeneralManagerRequest(request) ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-cyan-950/80 border border-cyan-500/50 text-cyan-300">
                              <span>👑</span>
                              <span>قرار المدير العام</span>
                            </span>
                          ) : (
                            renderRecommendationBadge(department)
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action & Decisions */}
                    <div className="space-y-2.5 border-t-2 border-slate-800 pt-3">
                      <input
                        value={comments[quote.id] || ''}
                        onChange={event => setComments(current => ({ ...current, [quote.id]: event.target.value }))}
                        placeholder="أدخل تعليقًا أو سبب القرار (اختياري)..."
                        className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 min-h-10 focus:border-cyan-500 focus:outline-none"
                      />
                      <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
                        <Button
                          size="sm"
                          variant={mode === 'executive' ? 'primary' : 'success'}
                          disabled={savingId === quote.id}
                          onClick={() => void act(request, quote, mode === 'executive' ? 'SELECT' : 'RECOMMEND')}
                          className="w-full min-h-11 font-bold text-xs"
                        >
                          {mode === 'executive' ? `✓ ${copy.action}` : `✓ ${copy.action}`}
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={savingId === quote.id}
                          onClick={() => void act(request, quote, 'REJECT')}
                          className="w-full min-h-11 font-bold text-xs"
                        >
                          {mode === 'executive' ? '✕ رفض جميع العروض' : '✕ رفض العرض'}
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <UnifiedNotesCard request={request} />
          </Card>
        );
      })}

      {previewQuote && (
        <Modal
          isOpen={Boolean(previewQuote)}
          onClose={() => {
            setPreviewQuote(null);
            if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
            setPreviewBlobUrl(null);
          }}
          title={`معاينة وتوثيق عرض السعر — ${previewQuote.supplier?.company_name || 'المورد'}`}
          subtitle={`قيمة العرض: ${previewQuote.total_amount} ${previewQuote.currency || 'EGP'}`}
          size="2xl"
          footer={
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                {previewBlobUrl && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        window.open(previewBlobUrl, '_blank');
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-cyan-800 hover:bg-cyan-700 text-cyan-100 text-xs font-bold inline-flex items-center gap-1.5 transition-all shadow-sm"
                    >
                      <span>↗️</span>
                      <span>فتح في نافذة مستقلة</span>
                    </button>
                    <a
                      href={previewBlobUrl}
                      download={`quote-${previewQuote.id}.pdf`}
                      className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold inline-flex items-center gap-1.5 transition-all"
                    >
                      <span>💾</span>
                      <span>تحميل المستند</span>
                    </a>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setPreviewQuote(null);
                  if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
                  setPreviewBlobUrl(null);
                }}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-bold"
              >
                إغلاق
              </button>
            </div>
          }
        >
          <div className="min-h-[60vh] max-h-[75vh] flex flex-col items-center justify-center w-full">
            {previewLoading ? (
              <div className="text-center p-8 space-y-3">
                <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm font-bold text-slate-200">جاري تحميل وتجهيز وثيقة عرض السعر...</p>
              </div>
            ) : previewBlobUrl ? (
              previewContentType.startsWith('image/') ? (
                <div className="p-2 overflow-auto max-h-[70vh] flex items-center justify-center w-full">
                  <img
                    src={previewBlobUrl}
                    alt={previewQuote.supplier?.company_name ? `معاينة وثيقة عرض السعر من ${previewQuote.supplier.company_name}` : "معاينة وثيقة عرض السعر للمورد"}
                    className="max-h-[68vh] max-w-full object-contain rounded-xl border border-slate-800 shadow-inner"
                  />
                </div>
              ) : (
                <iframe
                  src={previewBlobUrl}
                  title="معاينة عرض السعر"
                  className="w-full h-[70vh] rounded-xl border border-slate-800 bg-white"
                />
              )
            ) : (
              <div className="p-6 text-center space-y-3">
                <p className="text-sm text-rose-400 font-bold">{previewError || 'تعذر تحميل ملف العرض.'}</p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};

export default PurchaseQuotesDecisionPage;
