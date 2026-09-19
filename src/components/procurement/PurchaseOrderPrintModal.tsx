import React from 'react';
import { createPortal } from 'react-dom';
import { PurchaseOrder } from '../../types/purchaseOrder';
import { getUnitLabel } from '../../utils/units';
import { printDocumentOnly } from '../../utils/print';
import { SupplementItemBadge } from '../common/SupplementItemBadge';

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
      'الإجمالي: ' + Number(po.grand_total || 0).toFixed(2) + ' ج.م',
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
          <div className="print-document mx-auto max-w-5xl bg-white p-3 sm:p-6 text-slate-900 print:max-w-none print:p-3">
            <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-4 border-b-2 border-slate-900 pb-3">
              <div className="space-y-1 text-right text-sm font-bold">
                <div>التاريخ: <span className="font-normal">{formatDate(po.created_at)}</span></div>
                <div>رقم الطلب: <span className="font-mono font-normal">{po.purchase_request?.request_number || '—'}</span></div>
                <div>القسم: <span className="font-normal">{po.department?.name || po.purchase_request?.department?.name || '—'}</span></div>
                <div>صاحب الطلب: <span className="font-normal">{po.requested_by?.name || po.purchase_request?.requester?.name || '—'}</span></div>
                <div>رئيس القسم المعتمد: <span className="font-normal">{po.department_approver?.name || po.purchase_request?.assigned_reviewer?.name || '—'}</span></div>
                <div>اعتماد المدير التنفيذي: <span className="font-normal">{po.executive_approver?.name || 'المهندس محمد عبدالكريم'}</span></div>
              </div>
              <div className="text-center">
                <img src="/eshbelia-logo.png" alt="شعار شركة اشبيلية" className="document-logo mx-auto h-16 w-auto object-contain" />
                <div className="text-2xl font-black">أمر شراء</div>
                <div className="mt-1 text-xs font-bold">شركة اشبيلية</div>
              </div>
              <div className="text-left text-sm font-bold">
                <div>رقم أمر الشراء: <span className="font-mono font-normal">{po.po_number}</span></div>
              </div>
            </div>

            <div className="overflow-x-auto print:overflow-visible">
            <table className="mt-3 w-full border-collapse border border-slate-900 text-right text-[10px]">
              <thead>
                <tr className="bg-[#5B9BD5] font-black">
                  <th className="border border-slate-900 p-2 text-center">م</th>
                  <th className="border border-slate-900 p-2">رقم قطعة الأرض</th>
                  <th className="border border-slate-900 p-2">المنطقة</th>
                  <th className="border border-slate-900 p-2">اسم الصنف</th>
                  <th className="border border-slate-900 p-2 text-center">الوحدة</th>
                  <th className="border border-slate-900 p-2 text-center">الكمية</th>
                  <th className="border border-slate-900 p-2 text-center">السعر</th>
                  <th className="border border-slate-900 p-2 text-center">الإجمالي</th>
                  <th className="border border-slate-900 p-2">ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {(po.items || []).map((item, index) => (
                  <tr key={item.id || index} className="h-6">
                    <td className="border border-slate-900 p-2 text-center">{index + 1}</td>
                    <td className="border border-slate-900 p-2 font-mono">{item.item_reference || '—'}</td>
                    <td className="border border-slate-900 p-2">{item.region || '—'}</td>
                    <td className="border border-slate-900 p-2 font-bold">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span>{item.item_name || item.item_description}</span>
                        <SupplementItemBadge
                          isSupplementary={item.is_supplementary}
                          batchNumber={item.supplement_batch}
                        />
                      </div>
                    </td>
                    <td className="border border-slate-900 p-2 text-center">{getUnitLabel(item.uom || 'PCS')}</td>
                    <td className="border border-slate-900 p-2 text-center">{item.quantity}</td>
                    <td className="border border-slate-900 p-2 text-center">{Number(item.unit_price || 0).toFixed(2)}</td>
                    <td className="border border-slate-900 p-2 text-center">{Number(item.line_total || 0).toFixed(2)}</td>
                    <td className="border border-slate-900 p-2">{item.specifications || '—'}</td>
                  </tr>
                ))}
                {Array.from({ length: PRINT_EXTRA_ROWS }, (_, extraIndex) => {
                  const rowNumber = (po.items?.length || 0) + extraIndex + 1;
                  return (
                    <tr key={`blank-print-row-${extraIndex}`} className="h-6">
                      <td className="border border-slate-900 p-2 text-center">{rowNumber}</td>
                      <td className="border border-slate-900 p-2">{' '}</td>
                      <td className="border border-slate-900 p-2">{' '}</td>
                      <td className="border border-slate-900 p-2">{' '}</td>
                      <td className="border border-slate-900 p-2 text-center">{' '}</td>
                      <td className="border border-slate-900 p-2 text-center">{' '}</td>
                      <td className="border border-slate-900 p-2 text-center">{' '}</td>
                      <td className="border border-slate-900 p-2 text-center">{' '}</td>
                      <td className="border border-slate-900 p-2">{' '}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>

            <div className="mt-2 mr-auto w-48 border-2 border-slate-900 bg-yellow-300 text-center font-black">
              <div className="border-b border-slate-900 p-1.5">الإجمالي الكلي</div>
              <div className="border-b border-slate-900 p-1.5">{Number(po.grand_total || 0).toFixed(2)}</div>
              <div className="p-1.5">ج.م</div>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-4 text-center text-[10px] font-bold">
              <div>
                <div>مدير المشتريات</div>
                <div className="mt-1 font-normal">المهندس أحمد بدوي</div>
              </div>
              <div>
                <div>اسم الموظف</div>
                <div className="mt-1 font-normal">{po.requested_by?.name || po.purchase_request?.requester?.name || '—'}</div>
              </div>
              <div>
                <div>رئيس القسم</div>
                <div className="mt-1 font-normal">{po.department_approver?.name || po.purchase_request?.assigned_reviewer?.name || '—'}</div>
                <div className="mt-1 font-normal text-[9px]">{po.department?.name || po.purchase_request?.department?.name || '—'}</div>
              </div>
              <div>
                <div>المدير التنفيذي / المدير العام</div>
                <div className="mt-1 font-normal">{po.executive_approver?.name || 'المهندس محمد عبدالكريم'}</div>
                <div className="mt-1 text-[9px]">اعتماد نهائي</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  ), document.body);
};

export default PurchaseOrderPrintModal;
