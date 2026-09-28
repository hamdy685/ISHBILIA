import React from 'react';
import { createPortal } from 'react-dom';
import { PurchaseRequest } from '../../types/purchaseRequest';
import { getUnitLabel } from '../../utils/units';
import { printDocumentOnly } from '../../utils/print';
import { formatCleanQty } from '../../utils/numberFormat';
import { extractRebarInfo } from '../../utils/rebar';

interface PurchaseRequestPrintModalProps {
  pr: PurchaseRequest;
  isOpen: boolean;
  onClose: () => void;
}

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('ar-EG');
};

const PRINT_EXTRA_ROWS = 4;

export const PurchaseRequestPrintModal: React.FC<PurchaseRequestPrintModalProps> = ({ pr, isOpen, onClose }) => {
  React.useEffect(() => {
    if (!isOpen) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handlePrint = () => printDocumentOnly();
  const handleShare = () => {
    const text = [
      'طلب شراء رقم: ' + pr.request_number,
      'القسم: ' + (pr.department?.name || '—'),
      'صاحب الطلب: ' + (pr.requester?.name || '—'),
      'البنود: ' + (pr.items || []).map((item) => item.item_description).join('، '),
    ].join('\\n');
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
  };

  return createPortal(
    <div className="print-container modal-top-viewport fixed inset-0 z-[9999] flex h-full w-full items-center justify-center overflow-hidden bg-slate-950/80 p-3 sm:p-5 print:static print:block print:bg-white print:p-0" dir="rtl">
      <div className="flex h-auto max-h-[calc(100dvh-2rem)] w-[min(96vw,1200px)] max-w-[1200px] flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl print:block print:max-w-none print:max-h-none print:border-none print:shadow-none">
        <div className="print:hidden flex shrink-0 items-center justify-between gap-3 border-b border-slate-700 bg-slate-800 px-4 py-3 sm:px-5">
          <h2 className="font-bold text-slate-100">طباعة طلب الشراء</h2>
          <div className="flex items-center gap-2">
            <button type="button" onClick={handleShare} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">مشاركة</button>
            <button type="button" onClick={handlePrint} className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-bold text-white">طباعة</button>
            <button type="button" onClick={onClose} aria-label="إغلاق نافذة الطباعة" title="إغلاق" className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-700 text-xl font-black leading-none text-white hover:bg-rose-700">×</button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-900 p-3 sm:p-6 print:overflow-visible print:bg-white print:p-0">
          <div className="print-document mx-auto max-w-5xl bg-white p-3 sm:p-6 text-slate-900 print:max-w-none print:p-3">
            <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-4 border-b-2 border-slate-900 pb-3">
              <div className="space-y-1 text-right text-sm font-bold">
                <div>التاريخ: <span className="font-normal">{formatDate(pr.created_at)}</span></div>
                <div>القسم: <span className="font-normal">{pr.department?.name || '—'}</span></div>
                <div>صاحب الطلب: <span className="font-normal">{pr.requester?.name || '—'}</span></div>
              </div>
              <div className="text-center">
                <img src="/eshbelia-logo.png" alt="شعار شركة اشبيلية" className="document-logo mx-auto h-16 w-auto object-contain" />
                <div className="text-2xl font-black">طلب شراء</div>
                <div className="mt-1 text-xs font-bold">شركة اشبيلية</div>
              </div>
              <div className="text-left text-sm font-bold space-y-1">
                <div>رقم الطلب: <span className="font-mono font-normal">{pr.request_number}</span></div>
                {pr.request_type !== 'OFFICE_SUPPLIES' && (
                  <>
                    <div>قطعة الأرض: <span className="font-mono font-normal">{pr.parcel_reference || pr.items?.[0]?.item_reference || '—'}</span></div>
                    <div>المنطقة: <span className="font-normal">{pr.region || pr.items?.[0]?.region || '—'}</span></div>
                  </>
                )}
              </div>
            </div>

            <div className="overflow-x-auto print:overflow-visible">
            <table className="mt-3 w-full border-collapse border border-slate-900 text-right text-[10px]">
              <thead>
                <tr className="bg-slate-100 font-black">
                  <th className="border border-slate-900 p-2 text-center">م</th>
                  <th className="border border-slate-900 p-2">رقم قطعة الأرض</th>
                  <th className="border border-slate-900 p-2">المنطقة</th>
                  <th className="border border-slate-900 p-2">اسم الصنف</th>
                  <th className="border border-slate-900 p-2 text-center">الوحدة</th>
                  <th className="border border-slate-900 p-2 text-center">الكمية</th>
                  <th className="border border-slate-900 p-2">المواصفات الفنية</th>
                </tr>
              </thead>
              <tbody>
                {(pr.items || []).map((item, index) => (
                  <tr key={item.id || index} className="h-6">
                    <td className="border border-slate-900 p-2 text-center">{index + 1}</td>
                    <td className="border border-slate-900 p-2 font-mono">{item.item_reference || pr.parcel_reference || '—'}</td>
                    <td className="border border-slate-900 p-2">{item.region || pr.region || '—'}</td>
                    <td className="border border-slate-900 p-2 font-bold">{item.item_description}</td>
                    <td className="border border-slate-900 p-2 text-center">
                      <div>{getUnitLabel(item.uom)}</div>
                      {extractRebarInfo(item.specifications) && (
                        <div className="text-[9px] font-bold text-slate-800">
                          ({extractRebarInfo(item.specifications)?.barCount} سيخ {extractRebarInfo(item.specifications)?.linia})
                        </div>
                      )}
                    </td>
                    <td className="border border-slate-900 p-2 text-center">{formatCleanQty(item.quantity)}</td>
                    <td className="border border-slate-900 p-2">{item.specifications || '—'}</td>
                  </tr>
                ))}
                {Array.from({ length: PRINT_EXTRA_ROWS }, (_, extraIndex) => {
                  const rowNumber = (pr.items?.length || 0) + extraIndex + 1;
                  return (
                    <tr key={`blank-print-row-${extraIndex}`} className="h-6">
                      <td className="border border-slate-900 p-2 text-center">{rowNumber}</td>
                      <td className="border border-slate-900 p-2">{' '}</td>
                      <td className="border border-slate-900 p-2">{' '}</td>
                      <td className="border border-slate-900 p-2">{' '}</td>
                      <td className="border border-slate-900 p-2 text-center">{' '}</td>
                      <td className="border border-slate-900 p-2 text-center">{' '}</td>
                      <td className="border border-slate-900 p-2">{' '}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>

          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default PurchaseRequestPrintModal;
