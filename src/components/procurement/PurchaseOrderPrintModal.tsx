import React from 'react';
import { createPortal } from 'react-dom';
import { PurchaseOrder } from '../../types/purchaseOrder';
import { getUnitLabel } from '../../utils/units';
import { printDocumentOnly } from '../../utils/print';
import { SupplementItemBadge } from '../common/SupplementItemBadge';
import { formatCleanNumber, formatCleanQty } from '../../utils/numberFormat';
import { extractRebarInfo } from '../../utils/rebar';

interface PurchaseOrderPrintModalProps {
  po: PurchaseOrder;
  isOpen: boolean;
  onClose: () => void;
}

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('ar-EG');
};

const PRINT_EXTRA_ROWS = 4;

export const PurchaseOrderPrintModal: React.FC<PurchaseOrderPrintModalProps> = ({ po, isOpen, onClose }) => {
  React.useEffect(() => {
    if (!isOpen) return;
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

  if (!isOpen || !po) return null;

  const handlePrint = () => printDocumentOnly();
  const handleShare = () => {
    const text = [
      'أمر شراء رقم: ' + po.po_number,
      'صاحب الطلب: ' + (po.requested_by?.name || po.purchase_request?.requester?.name || '—'),
      'رئيس القسم المعتمد: ' + (po.department_approver?.name || po.purchase_request?.assigned_reviewer?.name || '—'),
      'اعتماد المدير التنفيذي: ' + (po.executive_approver?.name || 'المهندس محمد عبدالكريم'),
      'البنود: ' + (po.items || []).map((item) => item.item_name || item.item_description).join('، '),
      'الإجمالي: ' + formatCleanNumber(po.grand_total) + ' ج.م',
    ].join('\\n');
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
  };

  return createPortal((
    <div className="print-container po-modal-viewport fixed inset-0 z-[9999] flex min-h-screen items-center justify-center overflow-y-auto bg-slate-950/80 p-4 sm:p-6 print:static print:block print:bg-white" dir="rtl">
      <div className="flex min-h-0 max-h-[calc(100dvh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl sm:max-h-[calc(100dvh-3rem)] print:block print:max-w-none print:max-h-none print:border-none print:shadow-none">
        <div className="print:hidden flex items-center justify-between gap-3 border-b border-slate-700 bg-slate-800 px-5 py-3">
          <h2 className="font-bold text-slate-100">طباعة أمر الشراء</h2>
          <div className="flex gap-2">
            <button type="button" onClick={handleShare} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">مشاركة</button>
            <button type="button" onClick={handlePrint} className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-bold text-white">طباعة</button>
            <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-600 bg-slate-700 text-2xl font-black leading-none text-white hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-400/70" aria-label="إغلاق النافذة" title="إغلاق النافذة">×</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-900 p-3 sm:p-6 print:overflow-visible print:bg-white print:p-0">
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

                {/* 2. CENTER: Title & PO Number */}
                <div className="text-center self-center">
                  <h1 className="text-xl font-black text-black border-b-2 border-black pb-0.5 inline-block">
                    أمر شراء (Purchase Order)
                  </h1>
                  <div className="text-xs font-mono font-black text-black mt-1">
                    رقم: {po.po_number}
                  </div>
                </div>

                {/* 3. TOP LEFT: Metadata */}
                <div className="text-left text-xs font-bold text-black space-y-0.5" dir="rtl">
                  <div><strong>التاريخ:</strong> <span className="font-mono">{formatDate(po.created_at)}</span></div>
                  <div><strong>رقم الطلب:</strong> <span className="font-mono">{po.purchase_request?.request_number || '—'}</span></div>
                  <div><strong>القسم:</strong> <span>{po.department?.name || po.purchase_request?.department?.name || '—'}</span></div>
                  <div><strong>المورد:</strong> <span>{po.supplier?.company_name || '—'}</span></div>
                  <div><strong>صاحب الطلب:</strong> <span>{po.requested_by?.name || po.purchase_request?.requester?.name || '—'}</span></div>
                </div>
              </div>
            </div>

            {/* Excel Grid Table */}
            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full border-collapse border-2 border-black text-right text-[10px]">
                <thead>
                  <tr className="bg-slate-100 font-black border-b-2 border-black text-black">
                    <th className="border border-black p-2 text-center w-8">م</th>
                    <th className="border border-black p-2">رقم قطعة الأرض</th>
                    <th className="border border-black p-2">المنطقة</th>
                    <th className="border border-black p-2">اسم الصنف</th>
                    <th className="border border-black p-2 text-center">الوحدة</th>
                    <th className="border border-black p-2 text-center">الكمية</th>
                    <th className="border border-slate-900 p-2 text-center">السعر</th>
                    <th className="border border-slate-900 p-2 text-center">الإجمالي</th>
                    <th className="border border-slate-900 p-2">ملاحظات ومواصفات</th>
                  </tr>
                </thead>
                <tbody>
                  {(po.items || []).map((item, index) => (
                    <tr key={item.id || index} className="border-b border-black">
                      <td className="border border-black p-2 text-center font-bold">{index + 1}</td>
                      <td className="border border-black p-2 font-mono font-bold">{item.item_reference || '—'}</td>
                      <td className="border border-black p-2">{item.region || '—'}</td>
                      <td className="border border-black p-2 font-bold">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span>{item.item_name || item.item_description}</span>
                          <SupplementItemBadge
                            isSupplementary={item.is_supplementary}
                            batchNumber={item.supplement_batch}
                          />
                        </div>
                      </td>
                      <td className="border border-black p-2 text-center font-bold">
                        <div>{getUnitLabel(item.uom || 'PCS')}</div>
                        {extractRebarInfo(item.specifications) && (
                          <div className="text-[9px] font-bold text-slate-800">
                            ({extractRebarInfo(item.specifications)?.barCount} سيخ {extractRebarInfo(item.specifications)?.linia})
                          </div>
                        )}
                      </td>
                      <td className="border border-black p-2 text-center font-mono font-black">{formatCleanQty(item.quantity)}</td>
                      <td className="border border-black p-2 text-center font-mono font-bold">{formatCleanNumber(item.unit_price)}</td>
                      <td className="border border-black p-2 text-center font-mono font-black">{formatCleanNumber(item.line_total)}</td>
                      <td className="border border-black p-2 text-[9.5px]">{item.specifications || '—'}</td>
                    </tr>
                  ))}
                  {Array.from({ length: Math.max(PRINT_EXTRA_ROWS - (po.items?.length || 0), 2) }, (_, extraIndex) => {
                    const rowNumber = (po.items?.length || 0) + extraIndex + 1;
                    return (
                      <tr key={`blank-print-row-${extraIndex}`} className="h-6 border-b border-black">
                        <td className="border border-black p-1.5 text-center font-mono text-slate-400">{rowNumber}</td>
                        <td className="border border-black p-1.5">{' '}</td>
                        <td className="border border-black p-1.5">{' '}</td>
                        <td className="border border-black p-1.5">{' '}</td>
                        <td className="border border-black p-1.5 text-center">{' '}</td>
                        <td className="border border-black p-1.5 text-center">{' '}</td>
                        <td className="border border-black p-1.5 text-center">{' '}</td>
                        <td className="border border-black p-1.5 text-center">{' '}</td>
                        <td className="border border-black p-1.5">{' '}</td>
                      </tr>
                    );
                  })}
                  {/* Total Row in Excel Grid */}
                  <tr className="bg-slate-100 font-black border-t-2 border-black">
                    <td colSpan={7} className="border border-black p-2 text-left font-black text-sm">
                      الإجمالي الكلي لأمر الشراء (ج.م):
                    </td>
                    <td className="border border-black p-2 text-center font-mono font-black text-sm">
                      {formatCleanNumber(po.grand_total)}
                    </td>
                    <td className="border border-black p-2"></td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Excel Signatures Grid Table */}
            <div className="pt-2">
              <table className="w-full border-collapse border-2 border-black text-center text-[10px]">
                <thead>
                  <tr className="bg-slate-100 border-b-2 border-black font-black">
                    <th className="border border-black p-1.5 w-1/5">صاحب الطلب</th>
                    <th className="border border-black p-1.5 w-1/5">رئيس القسم المعتمد</th>
                    <th className="border border-black p-1.5 w-1/5">إدارة المشتريات</th>
                    <th className="border border-black p-1.5 w-1/5">مراجع الحسابات</th>
                    <th className="border border-black p-1.5 w-1/5">يعتمد (المدير العام)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="h-16">
                    <td className="border border-black p-1.5 align-top font-bold">
                      <div>{po.requested_by?.name || po.purchase_request?.requester?.name || '—'}</div>
                      <div className="text-[9px] text-slate-600 font-normal mt-3">التوقيع: ..............</div>
                    </td>
                    <td className="border border-black p-1.5 align-top font-bold">
                      <div>{po.department_approver?.name || po.purchase_request?.assigned_reviewer?.name || '—'}</div>
                      <div className="text-[9px] text-slate-600 font-normal mt-3">التوقيع: ..............</div>
                    </td>
                    <td className="border border-black p-1.5 align-top font-bold">
                      <div>{po.created_by?.name || 'المهندس أحمد بدوي'}</div>
                      <div className="text-[9px] text-slate-600 font-normal mt-3">التوقيع: ..............</div>
                    </td>
                    <td className="border border-black p-1.5 align-top font-bold">
                      <div>{po.accounting_reviewer?.name || 'إدارة الحسابات'}</div>
                      <div className="text-[9px] text-slate-600 font-normal mt-3">التوقيع: ..............</div>
                    </td>
                    <td className="border border-black p-1.5 align-top font-bold">
                      <div>{po.executive_approver?.name || 'المهندس محمد عبدالكريم'}</div>
                      <div className="text-[9px] text-slate-600 font-normal mt-3">التوقيع: ..............</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  ), document.body);
};

export default PurchaseOrderPrintModal;
