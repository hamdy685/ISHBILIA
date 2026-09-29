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
          <div className="print-document mx-auto max-w-5xl bg-white p-4 sm:p-6 text-black print:max-w-none print:p-2 space-y-3.5">
            {/* Header: Logo on Top Right, Title Center, Metadata Left */}
            <div className="border-b-2 border-black pb-3">
              <div className="flex items-start justify-between gap-4">
                {/* 1. TOP RIGHT: Logo + Company Name */}
                <div className="text-right flex items-center gap-3 shrink-0">
                  <img
                    src="/eshbelia-logo.png"
                    alt="شعار شركة اشبيلية"
                    className="h-14 sm:h-16 w-auto object-contain"
                  />
                  <div className="text-[11px] leading-snug">
                    <div className="font-black text-sm text-black">شركة إشبيلية</div>
                    <div className="text-[10px] text-slate-800 font-bold">للتطوير العقاري والمقاولات</div>
                  </div>
                </div>

                {/* 2. CENTER: Title & PR Number */}
                <div className="text-center self-center">
                  <h1 className="text-xl font-black text-black border-b-2 border-black pb-0.5 inline-block">
                    طلب شراء (Purchase Request)
                  </h1>
                  <div className="text-xs font-mono font-black text-black mt-1">
                    رقم: {pr.request_number}
                  </div>
                </div>

                {/* 3. TOP LEFT: Metadata */}
                <div className="text-left text-xs font-bold text-black space-y-0.5" dir="rtl">
                  <div><strong>التاريخ:</strong> <span className="font-mono">{formatDate(pr.created_at)}</span></div>
                  <div><strong>القسم:</strong> <span>{pr.department?.name || '—'}</span></div>
                  <div><strong>المشروع:</strong> <span>{(pr as any).project_name || pr.department?.name || 'موقع الشركة'}</span></div>
                  <div><strong>قطعة الأرض:</strong> <span className="font-mono">{pr.parcel_reference || pr.items?.[0]?.item_reference || '—'}</span></div>
                  <div><strong>المنطقة:</strong> <span>{pr.region || pr.items?.[0]?.region || '—'}</span></div>
                </div>
              </div>
            </div>

            {/* Excel Grid Table */}
            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full border-collapse border-2 border-black text-right text-[10px]">
                <thead>
                  <tr className="bg-slate-100 font-black border-b-2 border-black text-black">
                    <th className="border border-black p-2 text-center w-8">م</th>
                    <th className="border border-black p-2">الصنف</th>
                    <th className="border border-black p-2 text-center w-16">الوحدة</th>
                    <th className="border border-black p-2 text-center w-16">الكمية</th>
                    <th className="border border-black p-2 text-center w-24">تاريخ التوريد</th>
                    <th className="border border-black p-2">المواصفات الفنية</th>
                  </tr>
                </thead>
                <tbody>
                  {(pr.items || []).map((item, index) => (
                    <tr key={item.id || index} className="border-b border-black">
                      <td className="border border-black p-2 text-center font-bold">{index + 1}</td>
                      <td className="border border-black p-2 font-bold">{item.item_description}</td>
                      <td className="border border-black p-2 text-center font-bold">
                        <div>{getUnitLabel(item.uom)}</div>
                        {extractRebarInfo(item.specifications) && (
                          <div className="text-[9px] font-bold text-slate-800">
                            ({extractRebarInfo(item.specifications)?.barCount} سيخ {extractRebarInfo(item.specifications)?.linia})
                          </div>
                        )}
                      </td>
                      <td className="border border-black p-2 text-center font-mono font-black">{formatCleanQty(item.quantity)}</td>
                      <td className="border border-black p-2 text-center font-mono">{formatDate(item.date_needed || pr.date_needed)}</td>
                      <td className="border border-black p-2 text-[9.5px]">{item.specifications || '—'}</td>
                    </tr>
                  ))}
                  {Array.from({ length: Math.max(PRINT_EXTRA_ROWS - (pr.items?.length || 0), 2) }, (_, extraIndex) => {
                    const rowNumber = (pr.items?.length || 0) + extraIndex + 1;
                    return (
                      <tr key={`blank-print-row-${extraIndex}`} className="h-6 border-b border-black">
                        <td className="border border-black p-1.5 text-center font-mono text-slate-400">{rowNumber}</td>
                        <td className="border border-black p-1.5">{' '}</td>
                        <td className="border border-black p-1.5 text-center">{' '}</td>
                        <td className="border border-black p-1.5 text-center">{' '}</td>
                        <td className="border border-black p-1.5 text-center">{' '}</td>
                        <td className="border border-black p-1.5">{' '}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Excel Signatures Grid Table matching user's Image 3 */}
            <div className="pt-2">
              <table className="w-full border-collapse border-2 border-black text-center text-[10px]">
                <thead>
                  <tr className="bg-slate-100 border-b-2 border-black font-black">
                    <th className="border border-black p-1.5 w-1/4">مقدم الطلب</th>
                    <th className="border border-black p-1.5 w-1/4">الجودة / مهندس الموقع</th>
                    <th className="border border-black p-1.5 w-1/4">المشتريات</th>
                    <th className="border border-black p-1.5 w-1/4">يعتمد (المدير العام)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="h-16">
                    <td className="border border-black p-1.5 align-top font-bold">
                      <div>{pr.requester?.name || 'مقدم الطلب'}</div>
                      <div className="text-[9px] text-slate-600 font-normal mt-3">التوقيع: ..............</div>
                    </td>
                    <td className="border border-black p-1.5 align-top font-bold">
                      <div>{pr.site_engineer?.name || pr.assigned_reviewer?.name || 'مهندس الموقع'}</div>
                      <div className="text-[9px] text-slate-600 font-normal mt-3">التوقيع: ..............</div>
                    </td>
                    <td className="border border-black p-1.5 align-top font-bold">
                      <div>إدارة المشتريات</div>
                      <div className="text-[9px] text-slate-600 font-normal mt-3">التوقيع: ..............</div>
                    </td>
                    <td className="border border-black p-1.5 align-top font-bold">
                      <div>المهندس محمد عبدالكريم</div>
                      <div className="text-[9px] text-slate-600 font-normal mt-3">التوقيع: ..............</div>
                    </td>
                  </tr>
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
