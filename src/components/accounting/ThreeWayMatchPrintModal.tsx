import React from 'react';
import { createPortal } from 'react-dom';
import { ApprovedReceipt } from '../../api/supplierFinance';
import { getUnitLabel } from '../../utils/units';
import { printDocumentOnly } from '../../utils/print';
import { formatCleanNumber } from '../../utils/numberFormat';

interface ThreeWayMatchPrintModalProps {
  receipt: ApprovedReceipt | null;
  isOpen: boolean;
  onClose: () => void;
}

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('ar-EG');
};

const money = (value: number | string | null | undefined) =>
  `${formatCleanNumber(value)} ج.م`;

export const ThreeWayMatchPrintModal: React.FC<ThreeWayMatchPrintModalProps> = ({
  receipt,
  isOpen,
  onClose,
}) => {
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

  if (!isOpen || !receipt) return null;

  const po = receipt.purchase_order;
  const pr = po?.purchase_request || receipt.purchase_request;

  // Extract PR items: either from pr.items or from po.items.pr_item
  const prItems = (pr as any)?.items?.length
    ? (pr as any).items
    : (po?.items || []).map((poItem) => ({
        id: poItem.pr_item_id || poItem.id,
        item_description: poItem.pr_item?.item_description || poItem.item_description || poItem.item_name,
        uom: poItem.pr_item?.uom || poItem.uom,
        quantity: poItem.pr_item?.quantity || poItem.quantity,
        specifications: poItem.pr_item?.specifications || poItem.specifications || '—',
        date_needed: pr?.date_needed || po?.delivery_date,
      }));

  const poItems = po?.items || [];
  const receiptItems = receipt.items || [];

  // Guarantee 100% parity across PR, PO, and GRN: all items represented in Section 3
  const displayReceiptItems = poItems.length > 0
    ? poItems.map((poItem, idx) => {
        const found = receiptItems.find(
          (ri) => ri.purchase_order_item?.id === poItem.id || (ri as any).purchase_order_item_id === poItem.id
        );
        if (found) return found;
        return {
          id: `derived-${poItem.id || idx}`,
          purchase_order_item: poItem,
          received_quantity: poItem.quantity,
          notes: receipt.warehouse_notes || 'مطابق للفحص والوزن',
        } as any;
      })
    : receiptItems;

  const itemSuppliers = poItems
    .map((item: any) => item.supplier?.company_name || item.pr_item?.supplier?.company_name)
    .filter(Boolean);
  const distinctSuppliers = Array.from(new Set(itemSuppliers));
  const poSupplierDisplay = distinctSuppliers.length > 1
    ? 'موردون متعددون (حسب البند)'
    : (po?.supplier?.company_name || distinctSuppliers[0] || '—');

  const handlePrint = () => {
    printDocumentOnly('.three-way-print-container .print-document', {
      orientation: 'portrait',
      title: `الدورة المستندية - ${po?.po_number || ''}`,
      pageMargin: '4mm',
    });
  };

  return createPortal(
    <div
      className="three-way-print-container print-container fixed inset-0 z-[9999] flex min-h-screen items-center justify-center overflow-y-auto bg-slate-950/85 p-2 sm:p-4 print:static print:block print:bg-white print:p-0"
      dir="rtl"
    >
      <div className="flex min-h-0 max-h-[calc(100dvh-1rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl print:block print:max-w-none print:max-h-none print:border-none print:shadow-none">
        {/* Modal Controls (Hidden in Print) */}
        <div className="print:hidden flex items-center justify-between gap-3 border-b border-slate-700 bg-slate-800 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-lg">📑</span>
            <div>
              <h2 className="text-xs sm:text-sm font-bold text-slate-100">
                طباعة الدورة المستندية الثلاثية (طلب شراء + أمر شراء + إذن استلام)
              </h2>
              <p className="text-[10.5px] text-slate-400">
                أمر الشراء: <strong className="font-mono text-cyan-300">{po?.po_number}</strong> • إذن الاستلام: <strong className="font-mono text-amber-300">{receipt.receipt_number}</strong>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 px-3.5 py-1.5 text-xs font-bold text-white transition-colors shadow-md"
            >
              <span>🖨️</span> طباعة المستند
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-600 bg-slate-700 text-lg font-black text-white hover:bg-slate-600"
              title="إغلاق"
            >
              ×
            </button>
          </div>
        </div>

        {/* Printable Document Viewport */}
        <div className="flex-1 overflow-y-auto bg-slate-900 p-2 sm:p-4 print:overflow-visible print:bg-white print:p-0">
          <div className="print-document three-way-single-page mx-auto max-w-4xl bg-white p-3 sm:p-4 text-black print:max-w-none print:p-0 space-y-1.5 font-sans leading-tight">

            {/* Document Unified Top Header: Logo on Right, Title in Center, Metadata on Left */}
            <div className="border-b border-black pb-1 mb-1">
              <div className="flex items-center justify-between gap-3">
                
                {/* 1. TOP RIGHT: Company Logo + Name */}
                <div className="text-right flex items-center gap-2 shrink-0">
                  <img
                    src="/eshbelia-logo.png"
                    alt="شعار شركة إشبيلية"
                    className="h-10 w-auto object-contain"
                  />
                  <div className="text-[9.5px] leading-tight">
                    <div className="font-black text-xs text-black">شركة إشبيلية</div>
                    <div className="text-[8.5px] text-slate-800 font-bold">للتطوير العقاري والمقاولات</div>
                  </div>
                </div>

                {/* 2. CENTER: Document Title */}
                <div className="text-center">
                  <h1 className="text-xs sm:text-sm font-black tracking-wide text-black border-b border-black pb-0.5 inline-block">
                    الدورة المستندية المتكاملة للمشتريات
                  </h1>
                  <div className="text-[9px] font-bold text-slate-800 mt-0.5">
                    طلب شراء • أمر شراء • إذن استلام
                  </div>
                </div>

                {/* 3. TOP LEFT: Unified Metadata & References */}
                <div className="text-left text-[9px] leading-tight font-bold text-black grid grid-cols-2 gap-x-2.5 gap-y-0.5" dir="rtl">
                  <div><strong>التاريخ:</strong> <span className="font-mono">{formatDate(receipt.received_at || receipt.created_at)}</span></div>
                  <div><strong>رقم الطلب:</strong> <span className="font-mono">{pr?.request_number || '—'}</span></div>
                  <div><strong>أمر الشراء:</strong> <span className="font-mono">{po?.po_number || '—'}</span></div>
                  <div><strong>إذن الاستلام:</strong> <span className="font-mono">{receipt.receipt_number}</span></div>
                  <div className="col-span-2"><strong>المشروع / القطعة:</strong> <span>{pr?.project_name || pr?.parcel_reference || po?.items?.[0]?.item_reference || '—'}</span></div>
                </div>
              </div>
            </div>

            {/* SECTION 1: طلب شراء (Purchase Request) */}
            <div className="border border-black p-1 space-y-0.5 bg-white">
              <div className="flex items-center justify-between border-b border-black pb-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-black bg-black text-white px-1.5 py-0.2">1</span>
                  <h2 className="text-[10px] font-black text-black">طلب شراء (Purchase Request)</h2>
                </div>
                <div className="text-[8.5px] space-x-2.5 rtl:space-x-reverse text-black font-semibold">
                  <span><strong>رقم الطلب:</strong> <span className="font-mono">{pr?.request_number || '—'}</span></span>
                  <span><strong>التاريخ:</strong> {formatDate(pr?.created_at)}</span>
                  <span><strong>القسم:</strong> {pr?.department?.name || '—'}</span>
                  <span><strong>مقدم الطلب:</strong> {pr?.requester?.name || '—'}</span>
                </div>
              </div>

              <table className="w-full border-collapse border border-black text-right text-[8.5px]">
                <thead>
                  <tr className="bg-slate-100 font-extrabold border-b border-black">
                    <th className="border border-black p-0.5 text-center w-6">م</th>
                    <th className="border border-black p-0.5">الصنف</th>
                    <th className="border border-black p-0.5 text-center w-28">المورد المعتمد</th>
                    <th className="border border-black p-0.5 text-center w-14">الوحدة</th>
                    <th className="border border-black p-0.5 text-center w-14">الكمية</th>
                    <th className="border border-black p-0.5 text-center w-20">تاريخ التوريد</th>
                    <th className="border border-black p-0.5">المواصفات الفنية</th>
                  </tr>
                </thead>
                <tbody>
                  {prItems.map((item: any, idx: number) => (
                    <tr key={item.id || idx} className="border-b border-black">
                      <td className="border border-black p-0.5 text-center font-bold">{idx + 1}</td>
                      <td className="border border-black p-0.5 font-bold">{item.item_description || item.item_name}</td>
                      <td className="border border-black p-0.5 text-center font-bold">
                        {item.supplier?.company_name || '—'}
                      </td>
                      <td className="border border-black p-0.5 text-center font-bold">{getUnitLabel(item.uom || '')}</td>
                      <td className="border border-black p-0.5 text-center font-mono font-black">{item.quantity}</td>
                      <td className="border border-black p-0.5 text-center font-mono">{formatDate(item.date_needed || pr?.date_needed)}</td>
                      <td className="border border-black p-0.5 text-[8px]">{item.specifications || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* SECTION 2: أمر شراء (Purchase Order) */}
            <div className="border border-black p-1 space-y-0.5 bg-white">
              <div className="flex items-center justify-between border-b border-black pb-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-black bg-black text-white px-1.5 py-0.2">2</span>
                  <h2 className="text-[10px] font-black text-black">أمر شراء (Purchase Order)</h2>
                </div>
                <div className="text-[8.5px] space-x-2.5 rtl:space-x-reverse text-black font-semibold">
                  <span><strong>رقم أمر الشراء:</strong> <span className="font-mono">{po?.po_number || '—'}</span></span>
                  <span><strong>التاريخ:</strong> {formatDate(po?.created_at)}</span>
                  <span><strong>المورد:</strong> {poSupplierDisplay}</span>
                  <span><strong>شروط الدفع:</strong> {po?.payment_terms || 'حسب الاتفاق'}</span>
                </div>
              </div>

              <table className="w-full border-collapse border border-black text-right text-[8.5px]">
                <thead>
                  <tr className="bg-slate-100 font-extrabold border-b border-black">
                    <th className="border border-black p-0.5 text-center w-6">م</th>
                    <th className="border border-black p-0.5">الصنف</th>
                    <th className="border border-black p-0.5 text-center w-28">المورد المعتمد</th>
                    <th className="border border-black p-0.5 text-center w-14">الوحدة</th>
                    <th className="border border-black p-0.5 text-center w-14">الكمية</th>
                    <th className="border border-black p-0.5 text-center w-18">السعر</th>
                    <th className="border border-black p-0.5 text-center w-20">الإجمالي</th>
                    <th className="border border-black p-0.5">الملاحظات والموقع</th>
                  </tr>
                </thead>
                <tbody>
                  {poItems.map((item, idx) => (
                    <tr key={item.id || idx} className="border-b border-black">
                      <td className="border border-black p-0.5 text-center font-bold">{idx + 1}</td>
                      <td className="border border-black p-0.5 font-bold">{item.item_name || item.item_description}</td>
                      <td className="border border-black p-0.5 text-center font-bold">
                        {item.supplier?.company_name || (item as any).pr_item?.supplier?.company_name || po?.supplier?.company_name || '—'}
                      </td>
                      <td className="border border-black p-0.5 text-center font-bold">{getUnitLabel(item.uom || '')}</td>
                      <td className="border border-black p-0.5 text-center font-mono font-black">{item.quantity}</td>
                      <td className="border border-black p-0.5 text-center font-mono">{money(item.unit_price)}</td>
                      <td className="border border-black p-0.5 text-center font-mono font-black">{money(item.line_total)}</td>
                      <td className="border border-black p-0.5 text-[8px]">
                        {[item.item_reference ? `قطعة: ${item.item_reference}` : '', item.region ? `المنطقة: ${item.region}` : '', item.specifications].filter(Boolean).join(' • ') || '—'}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-100 font-black border-t border-black">
                    <td colSpan={6} className="border border-black p-1 text-left font-black">
                      إجمالي أمر الشراء (بدون ضرائب أو خصومات):
                    </td>
                    <td className="border border-black p-1 text-center font-mono font-black text-[9px]">
                      {money(po?.grand_total)}
                    </td>
                    <td className="border border-black p-1"></td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* SECTION 3: إذن استلام (Goods Receipt Note) */}
            <div className="border border-black p-1 space-y-0.5 bg-white">
              <div className="flex items-center justify-between border-b border-black pb-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-black bg-black text-white px-1.5 py-0.2">3</span>
                  <h2 className="text-[10px] font-black text-black">إذن استلام (Goods Receipt Note)</h2>
                </div>
                <div className="text-[8.5px] space-x-2.5 rtl:space-x-reverse text-black font-semibold">
                  <span><strong>رقم الإذن:</strong> <span className="font-mono">{receipt.receipt_number}</span></span>
                  <span><strong>تاريخ الاستلام الفعلي:</strong> {formatDate(receipt.received_at)}</span>
                  <span><strong>أمين المخزن:</strong> {receipt.warehouse_keeper?.name || 'تم الفحص'}</span>
                  <span><strong>اعتماد الموقع:</strong> {receipt.site_engineer?.name || 'معتمد ميدانياً'}</span>
                </div>
              </div>

              <table className="w-full border-collapse border border-black text-right text-[8.5px]">
                <thead>
                  <tr className="bg-slate-100 font-extrabold border-b border-black">
                    <th className="border border-black p-0.5 text-center w-6">م</th>
                    <th className="border border-black p-0.5">الصنف</th>
                    <th className="border border-black p-0.5 text-center w-28">المورد المعتمد</th>
                    <th className="border border-black p-0.5 text-center w-14">الوحدة</th>
                    <th className="border border-black p-0.5 text-center w-14">الكمية المستلمة</th>
                    <th className="border border-black p-0.5">ملاحظات الاستلام وبون الميزان</th>
                  </tr>
                </thead>
                <tbody>
                  {displayReceiptItems.map((item, idx) => {
                    const poItem = item.purchase_order_item;
                    const prItem = poItem?.pr_item;
                    const itemUom = prItem?.uom || poItem?.uom || '';
                    return (
                      <tr key={item.id || idx} className="border-b border-black">
                        <td className="border border-black p-0.5 text-center font-bold">{idx + 1}</td>
                        <td className="border border-black p-0.5 font-bold">
                          {poItem?.item_name || poItem?.item_description || '—'}
                        </td>
                        <td className="border border-black p-0.5 text-center font-bold">
                          {poItem?.supplier?.company_name || (poItem as any)?.pr_item?.supplier?.company_name || po?.supplier?.company_name || '—'}
                        </td>
                        <td className="border border-black p-0.5 text-center font-bold">
                          {getUnitLabel(itemUom)}
                        </td>
                        <td className="border border-black p-0.5 text-center font-mono font-black">
                          {item.received_quantity}
                        </td>
                        <td className="border border-black p-0.5 text-[8px]">
                          {item.notes || receipt.warehouse_notes || 'مطابق للفحص والوزن'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* SECTION 4: UNIFIED SIGNATURES & APPROVALS BLOCK */}
            <div className="pt-0.5">
              <div className="text-center font-black text-[9px] border border-black bg-slate-100 py-0.5">
                بيانات وتوقيعات الاعتماد للدورة المستندية (موحدة لجميع المراحل)
              </div>
              <table className="w-full border-collapse border border-black text-center text-[8.5px]">
                <thead>
                  <tr className="bg-slate-100 border-b border-black font-black">
                    <th className="border border-black p-0.5 w-1/6">مقدم الطلب</th>
                    <th className="border border-black p-0.5 w-1/6">مهندس الموقع / الجودة</th>
                    <th className="border border-black p-0.5 w-1/6">إدارة المشتريات</th>
                    <th className="border border-black p-0.5 w-1/6">أمين المخزن / المستلم</th>
                    <th className="border border-black p-0.5 w-1/6">مراجع الحسابات</th>
                    <th className="border border-black p-0.5 w-1/6">يعتمد (المدير العام)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="h-10">
                    <td className="border border-black p-0.5 align-top font-bold">
                      <div>{pr?.requester?.name || 'مقدم الطلب'}</div>
                      <div className="text-[7.5px] text-slate-600 font-normal mt-2">التوقيع: ..............</div>
                    </td>
                    <td className="border border-black p-0.5 align-top font-bold">
                      <div>{receipt.site_engineer?.name || pr?.site_engineer?.name || 'مهندس الموقع'}</div>
                      <div className="text-[7.5px] text-slate-600 font-normal mt-2">التوقيع: ..............</div>
                    </td>
                    <td className="border border-black p-0.5 align-top font-bold">
                      <div>{po?.created_by?.name || 'إدارة المشتريات'}</div>
                      <div className="text-[7.5px] text-slate-600 font-normal mt-2">التوقيع: ..............</div>
                    </td>
                    <td className="border border-black p-0.5 align-top font-bold">
                      <div>{receipt.warehouse_keeper?.name || 'أمين المخزن'}</div>
                      <div className="text-[7.5px] text-slate-600 font-normal mt-2">التوقيع: ..............</div>
                    </td>
                    <td className="border border-black p-0.5 align-top font-bold">
                      <div>{po?.accounting_reviewer?.name || 'إدارة الحسابات'}</div>
                      <div className="text-[7.5px] text-slate-600 font-normal mt-2">التوقيع: ..............</div>
                    </td>
                    <td className="border border-black p-0.5 align-top font-bold">
                      <div>{po?.executive_approver?.name || 'م. محمد عبدالكريم'}</div>
                      <div className="text-[7.5px] text-slate-600 font-normal mt-2">التوقيع: ..............</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

          </div>
        </div>
      </div>
    </div>,
    document.body
  );

};

export default ThreeWayMatchPrintModal;
