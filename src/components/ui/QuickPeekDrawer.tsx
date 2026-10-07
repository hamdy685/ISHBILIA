import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { cachedGetData } from '../../api/client';
import { PurchaseRequest } from '../../types/purchaseRequest';
import { PurchaseOrder } from '../../types/purchaseOrder';
import { CurrencyDisplay } from './CurrencyDisplay';
import { StatusBadge } from './StatusBadge';
import { getUnitLabel } from '../../utils/units';
import { formatDateTime24h } from '../../utils/dateTime';

export type PeekType = 'PR' | 'PO';

export interface QuickPeekDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  type: PeekType;
  id: number | null;
}

export const QuickPeekDrawer: React.FC<QuickPeekDrawerProps> = ({
  isOpen,
  onClose,
  type,
  id,
}) => {
  const [loading, setLoading] = useState(false);
  const [prData, setPrData] = useState<PurchaseRequest | null>(null);
  const [poData, setPoData] = useState<PurchaseOrder | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !id) {
      setPrData(null);
      setPoData(null);
      setError(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    const loadData = async () => {
      try {
        if (type === 'PR') {
          const res = await cachedGetData<{ data: PurchaseRequest }>(`/purchase-requests/${id}`);
          if (isMounted) setPrData(res.data);
        } else if (type === 'PO') {
          const res = await cachedGetData<{ data: PurchaseOrder }>(`/purchase-orders/${id}`);
          if (isMounted) setPoData(res.data);
        }
      } catch (err: any) {
        if (isMounted) setError(err?.response?.data?.message || 'تعذر تحميل بيانات المعاينة السريعة.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadData();

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);

    return () => {
      isMounted = false;
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, id, type, onClose]);

  if (!isOpen) return null;

  const fullPageRoute = type === 'PR' ? `/requests/${id}` : `/procurement/purchase-orders/${id}`;

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-hidden print-container print:static print:block print:bg-white print:p-0" dir="rtl">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/75 backdrop-blur-xs transition-opacity duration-300 animate-fade-in print:hidden"
      />

      <div className="fixed inset-y-0 left-0 max-w-full flex pl-0 sm:pl-10 print:static print:block print:w-full print:p-0">
        <div className="w-screen max-w-xl bg-slate-900 border-r border-slate-800 shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out animate-slide-left print-document print:bg-white print:text-black print:max-w-none print:w-full print:border-none print:shadow-none print:p-0">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 text-base">
                {type === 'PR' ? '📋' : '📑'}
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm sm:text-base font-black text-slate-100">
                    {type === 'PR'
                      ? `طلب شراء: ${prData?.request_number || `#${id}`}`
                      : `أمر شراء: ${poData?.po_number || `PO-#${id}`}`}
                  </h2>
                  {(prData?.status || poData?.status) && (
                    <StatusBadge status={(prData?.status || poData?.status)!} />
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">معاينة سريعة لكافة التفاصيل والبنود</p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex min-h-[44px] sm:min-h-0 items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-300 hover:border-rose-500/60 hover:bg-rose-950/40 hover:text-rose-300 transition-colors cursor-pointer"
              aria-label="إغلاق المعاينة"
              title="إغلاق نافذة المعاينة"
            >
              <span className="text-sm font-bold">✕</span>
              <span>إغلاق</span>
            </button>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            {loading ? (
              <div className="flex min-h-[250px] items-center justify-center text-cyan-300">
                <div className="flex flex-col items-center gap-3">
                  <span className="h-7 w-7 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                  <span className="text-xs font-bold text-slate-400">جاري تحميل البيانات...</span>
                </div>
              </div>
            ) : error ? (
              <div className="rounded-xl border border-rose-800/50 bg-rose-950/40 p-4 text-xs font-bold text-rose-300">
                {error}
              </div>
            ) : (
              <>
                {/* ── Key Summary Grid ── */}
                <div className="grid grid-cols-2 gap-3">
                  {type === 'PR' && prData && (
                    <>
                      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                        <span className="text-[10px] font-bold text-slate-500 block">مقدم الطلب</span>
                        <span className="text-xs font-bold text-slate-200 mt-0.5 block">{prData.requester?.name || '—'}</span>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                        <span className="text-[10px] font-bold text-slate-500 block">القسم المستفيد</span>
                        <span className="text-xs font-bold text-slate-200 mt-0.5 block">{prData.department?.name || '—'}</span>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                        <span className="text-[10px] font-bold text-slate-500 block">تاريخ ووقت تقديم الطلب</span>
                        <span className="text-xs font-mono font-bold text-cyan-300 mt-0.5 block" dir="ltr">{formatDateTime24h(prData.created_at)}</span>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                        <span className="text-[10px] font-bold text-slate-500 block">تاريخ الحاجة</span>
                        <span className="text-xs font-mono font-bold text-amber-300 mt-0.5 block">{prData.date_needed || 'غير محدد'}</span>
                      </div>
                    </>
                  )}

                  {type === 'PO' && poData && (
                    <>
                      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                        <span className="text-[10px] font-bold text-slate-500 block">المورد المعتمد</span>
                        <span className="text-xs font-bold text-slate-200 mt-0.5 block">{poData.supplier?.company_name || 'غير محدد'}</span>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                        <span className="text-[10px] font-bold text-slate-500 block">تاريخ ووقت الطلب الأصلي</span>
                        <span className="text-xs font-mono font-bold text-cyan-300 mt-0.5 block" dir="ltr">{formatDateTime24h(poData.purchase_request?.created_at || poData.created_at)}</span>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                        <span className="text-[10px] font-bold text-slate-500 block">الإجمالي المالي</span>
                        <div className="text-xs font-mono font-bold text-emerald-300 mt-0.5">
                          <CurrencyDisplay amount={poData.grand_total || poData.subtotal} />
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                        <span className="text-[10px] font-bold text-slate-500 block">شروط الدفع</span>
                        <span className="text-xs font-bold text-slate-300 mt-0.5 block">{poData.payment_terms || 'عند الاستلام'}</span>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                        <span className="text-[10px] font-bold text-slate-500 block">تاريخ التسليم</span>
                        <span className="text-xs font-mono font-bold text-amber-300 mt-0.5 block">{poData.delivery_date || '—'}</span>
                      </div>
                    </>
                  )}
                </div>

                {/* ── Justification / Notes ── */}
                {((type === 'PR' && prData?.justification) || (type === 'PO' && poData?.notes)) && (
                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3.5 space-y-1">
                    <span className="text-[11px] font-bold text-slate-400 block">
                      {type === 'PR' ? '📝 مبررات الاحتياج والغرض:' : '📌 ملاحظات أمر الشراء:'}
                    </span>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {type === 'PR' ? prData?.justification : poData?.notes}
                    </p>
                  </div>
                )}

                {/* ── Items Table ── */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black text-slate-200 flex items-center gap-1.5">
                      <span>📦</span> الأصناف والبنود المطلوبة
                    </h3>
                    <span className="text-[11px] font-mono text-slate-400">
                      {type === 'PR' ? prData?.items?.length || 0 : poData?.items?.length || 0} بنود
                    </span>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
                    <table style={{ minWidth: '460px' }} className="w-full text-right text-xs">
                      <thead className="bg-slate-900/90 text-slate-400 font-bold border-b border-slate-800 whitespace-nowrap">
                        <tr>
                          <th className="p-2.5 whitespace-nowrap">الصنف والمواصفات</th>
                          <th className="p-2.5 text-center whitespace-nowrap">الكمية</th>
                          <th className="p-2.5 whitespace-nowrap">القطعة / المنطقة</th>
                          {type === 'PO' && <th className="p-2.5 whitespace-nowrap">الإجمالي</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {type === 'PR' &&
                          prData?.items?.map((item, idx) => (
                            <tr key={item.id || idx} className="hover:bg-slate-900/40">
                              <td className="p-2.5">
                                <div className="font-bold text-slate-200">{item.item_description || item.item?.name}</div>
                                {item.specifications && (
                                  <div className="text-[10px] text-slate-400 mt-0.5">{item.specifications}</div>
                                )}
                              </td>
                              <td className="p-2.5 text-center font-mono font-bold text-cyan-300 whitespace-nowrap">
                                {item.quantity} {getUnitLabel(item.uom)}
                              </td>
                              <td className="p-2.5 text-[11px] text-amber-300/90 font-bold whitespace-nowrap">
                                {item.item_reference ? `قطعة #${item.item_reference}` : '—'}
                                {item.region && ` (${item.region})`}
                              </td>
                            </tr>
                          ))}

                        {type === 'PO' &&
                          poData?.items?.map((item, idx) => (
                            <tr key={item.id || idx} className="hover:bg-slate-900/40">
                              <td className="p-2.5">
                                <div className="font-bold text-slate-200">{item.item_description || item.item?.name}</div>
                                {item.specifications && (
                                  <div className="text-[10px] text-slate-400 mt-0.5">{item.specifications}</div>
                                )}
                              </td>
                              <td className="p-2.5 text-center font-mono font-bold text-cyan-300 whitespace-nowrap">
                                {item.quantity} {getUnitLabel(item.uom)}
                              </td>
                              <td className="p-2.5 text-[11px] text-amber-300/90 font-bold whitespace-nowrap">
                                {item.item_reference ? `قطعة #${item.item_reference}` : '—'}
                                {item.region && ` (${item.region})`}
                              </td>
                              <td className="p-2.5 font-mono font-bold text-emerald-300 whitespace-nowrap">
                                <CurrencyDisplay amount={item.line_total || Number(item.unit_price) * Number(item.quantity)} />
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Footer Actions */}
          <div className="p-4 border-t border-slate-800 bg-slate-950/90 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-bold text-slate-300 hover:border-rose-500/60 hover:bg-rose-950/30 hover:text-rose-300 transition-colors cursor-pointer"
            >
              ✕ إغلاق المعاينة
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-1.5 rounded-xl border border-cyan-800/60 bg-cyan-950/40 px-3.5 py-2 text-xs font-bold text-cyan-200 hover:bg-cyan-900/60 transition-colors"
              >
                <span>🖨️</span>
                <span>طباعة</span>
              </button>

              <Link
                to={fullPageRoute}
                onClick={onClose}
                className="flex items-center gap-1.5 rounded-xl bg-cyan-600 px-4 py-2 text-xs font-black text-white hover:bg-cyan-500 transition-colors shadow-lg shadow-cyan-900/40"
              >
                <span>فتح الصفحة الكاملة</span>
                <span>←</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default QuickPeekDrawer;
