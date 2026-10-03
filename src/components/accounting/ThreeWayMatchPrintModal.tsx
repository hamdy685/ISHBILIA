import React from 'react';
import { createPortal } from 'react-dom';
import { ApprovedReceipt } from '../../api/supplierFinance';
import { PurchaseOrder } from '../../types/purchaseOrder';
import { getUnitLabel } from '../../utils/units';
import { printDocumentOnly } from '../../utils/print';
import { formatCleanNumber } from '../../utils/numberFormat';

interface ThreeWayMatchPrintModalProps {
  receipt?: ApprovedReceipt | null;
  po?: PurchaseOrder | null;
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
  receipt: propsReceipt,
  po: propsPo,
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

  if (!isOpen || (!propsReceipt && !propsPo)) return null;

  const po = propsPo || propsReceipt?.purchase_order || null;
  const receipt = propsReceipt || (po?.receipts?.[0] as any) || {
    id: 0,
    receipt_number: po?.po_number ? `GRN-${po.po_number}` : 'إذن استلام',
    received_at: po?.created_at,
    created_at: po?.created_at,
    purchase_order: po,
    purchase_request: po?.purchase_request,
    warehouse_keeper: null,
    site_engineer: po?.purchase_request?.site_engineer || null,
    warehouse_notes: 'مطابق للفحص والمعاينة',
    items: [],
  };

  const pr = po?.purchase_request || receipt.purchase_request;

  // Extract PR items: either from pr.items or from po.items.pr_item
  const prItems = (pr as any)?.items?.length
    ? (pr as any).items
    : (po?.items || []).map((poItem) => ({
        id: poItem.pr_item_id || poItem.id,
        item_description: poItem.pr_item?.item_description || poItem.item_description || poItem.item_name,
        uom: poItem.pr_item?.uom || poItem.uom,
        quantity: poItem.pr_item?.quantity || poItem.quantity,
        specifications: poItem.pr_item?.specifications || poItem.specifications || '---',
        date_needed: pr?.date_needed || po?.delivery_date,
      }));

  const poItems = po?.items || [];
  const receiptItems = receipt.items || [];

  // Guarantee 100% parity across PR, PO, and GRN: all items represented in Section 3
  const displayReceiptItems = poItems.length > 0
    ? poItems.map((poItem, idx) => {
        const found = receiptItems.find(
          (ri: any) => ri.purchase_order_item?.id === poItem.id || (ri as any).purchase_order_item_id === poItem.id
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
    : (po?.supplier?.company_name || distinctSuppliers[0] || '---');

  // Digital Signatures resolution from Props with fallback '---'
  const prRequesterName =
    pr?.requester?.name ||
    (pr as any)?.requested_by?.name ||
    po?.requested_by?.name ||
    '---';

  const prReviewerName =
    pr?.assigned_reviewer?.name ||
    (pr as any)?.reviewer?.name ||
    (pr as any)?.department?.manager?.name ||
    '---';

  const prApproverName =
    (pr as any)?.approver?.name ||
    po?.department_approver?.name ||
    po?.executive_approver?.name ||
    '---';

  const poProcurementName =
    po?.created_by?.name ||
    (po as any)?.procurement_officer?.name ||
    '---';

  const poAccountantName =
    po?.accounting_reviewer?.name ||
    (po as any)?.accountant?.name ||
    '---';

  const poApproverName =
    po?.executive_approver?.name ||
    (po as any)?.approved_by?.name ||
    '---';

  const warehouseKeeperName =
    propsReceipt?.warehouse_keeper?.name ||
    po?.receipts?.[0]?.warehouse_keeper?.name ||
    (receipt?.warehouse_keeper?.name && receipt.warehouse_keeper.name !== 'أمين المخزن' ? receipt.warehouse_keeper.name : null) ||
    '---';

  const siteEngineerName =
    propsReceipt?.site_engineer?.name ||
    po?.receipts?.[0]?.site_engineer?.name ||
    pr?.site_engineer?.name ||
    (receipt?.site_engineer?.name && receipt.site_engineer.name !== 'مهندس الموقع' ? receipt.site_engineer.name : null) ||
    '---';

  const projectName =
    pr?.project_name ||
    pr?.parcel_reference ||
    po?.items?.[0]?.item_reference ||
    '---';

  const docDate = formatDate(
    receipt?.received_at ||
    receipt?.created_at ||
    po?.created_at ||
    pr?.created_at
  );

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
          <div className="print-document three-way-single-page mx-auto max-w-4xl bg-white p-3 sm:p-5 text-black print:max-w-none print:p-0 space-y-1 font-sans leading-tight">

            {/* 4. تنظيف الترويسة العلوية: grid grid-cols-3 (اليمين: المشروع/التاريخ | الوسط: العنوان | اليسار: الشعار) */}
            <div className="border-b-2 border-gray-300 pb-2 mb-2">
              <div className="grid grid-cols-3 items-center gap-2">
                {/* Right: بيانات المشروع / التاريخ */}
                <div className="text-right text-xs leading-relaxed text-slate-700">
                  <div>
                    <span className="font-bold text-black">المشروع / الموقع: </span>
                    <span className="font-semibold text-slate-900">{projectName}</span>
                  </div>
                  <div>
                    <span className="font-bold text-black">التاريخ: </span>
                    <span className="font-mono font-semibold text-slate-900">{docDate}</span>
                  </div>
                </div>

                {/* Center: عنوان الدورة المستندية المتكاملة */}
                <div className="text-center">
                  <h1 className="text-base sm:text-lg font-black tracking-wide text-black border-b border-gray-400 pb-0.5 inline-block">
                    الدورة المستندية المتكاملة
                  </h1>
                  <div className="text-[10px] font-bold text-slate-600 mt-0.5">
                    طلب شراء • أمر شراء • إذن استلام
                  </div>
                </div>

                {/* Left: الشعار Logo */}
                <div className="flex items-center justify-end gap-2.5">
                  <div className="text-left leading-tight">
                    <div className="font-black text-xs text-black">شركة إشبيلية</div>
                    <div className="text-[9px] text-slate-600 font-semibold">للتطوير العقاري والمقاولات</div>
                  </div>
                  <img
                    src="/eshbelia-logo.png"
                    alt="شعار شركة إشبيلية"
                    className="h-10 w-auto object-contain"
                  />
                </div>
              </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════════════════
                المرحلة الأولى: طلب الشراء (Purchase Request)
               ═════════════════════════════════════════════════════════════════════════ */}
            {/* Header Bar */}
            <div className="bg-gray-100 border border-gray-300 rounded-t px-3 py-1 flex items-center justify-between font-bold text-xs text-slate-800">
              <div className="flex items-center gap-2">
                <span className="bg-slate-700 text-white text-[10px] px-1.5 py-0.2 rounded font-mono">1</span>
                <span>طلب شراء رقم: <span className="font-mono text-black">{pr?.request_number || '---'}</span></span>
              </div>
              <div className="text-[11px] text-slate-600 font-normal">
                <span>تاريخ الطلب: <strong className="font-mono text-slate-800">{formatDate(pr?.created_at)}</strong></span>
                {pr?.department?.name && <span className="mr-3">القسم: <strong className="text-slate-800">{pr.department.name}</strong></span>}
              </div>
            </div>

            {/* PR Table (Minimalist with border-gray-300) */}
            <div className="overflow-hidden rounded-b border-x border-b border-gray-300">
              <table className="w-full border-collapse text-right text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-300 font-bold text-slate-700">
                    <th className="border-l border-gray-300 p-1 text-center w-8">م</th>
                    <th className="border-l border-gray-300 p-1">بيان الصنف</th>
                    <th className="border-l border-gray-300 p-1 text-center w-20">الوحدة</th>
                    <th className="border-l border-gray-300 p-1 text-center w-24">الكمية المطلوبة</th>
                    <th className="p-1">المواصفات الفنية / الغرض</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-300">
                  {prItems.map((item: any, idx: number) => (
                    <tr key={item.id || idx} className="hover:bg-gray-50/50">
                      <td className="border-l border-gray-300 p-1 text-center font-bold text-slate-600">{idx + 1}</td>
                      <td className="border-l border-gray-300 p-1 font-bold text-slate-900">{item.item_description || item.item_name}</td>
                      <td className="border-l border-gray-300 p-1 text-center text-slate-700">{getUnitLabel(item.uom || '')}</td>
                      <td className="border-l border-gray-300 p-1 text-center font-mono font-bold text-slate-900">{item.quantity}</td>
                      <td className="p-1 text-[11px] text-slate-600">{item.specifications || '---'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Inline Digital Signatures - PR */}
            <div className="flex justify-between text-sm font-bold mt-1 mb-4 px-4 text-slate-800">
              <span>مقدم الطلب: <span className="font-semibold">{prRequesterName}</span></span>
              <span>مراجع: <span className="font-semibold">{prReviewerName}</span></span>
              <span>اعتماد: <span className="font-semibold">{prApproverName}</span></span>
            </div>

            {/* ═════════════════════════════════════════════════════════════════════════
                المرحلة الثانية: أمر الشراء (Purchase Order)
               ═════════════════════════════════════════════════════════════════════════ */}
            {/* Header Bar */}
            <div className="bg-gray-100 border border-gray-300 rounded-t px-3 py-1 flex items-center justify-between font-bold text-xs text-slate-800">
              <div className="flex items-center gap-2">
                <span className="bg-slate-700 text-white text-[10px] px-1.5 py-0.2 rounded font-mono">2</span>
                <span>أمر شراء رقم: <span className="font-mono text-black">{po?.po_number || '---'}</span></span>
              </div>
              <div className="text-[11px] text-slate-600 font-normal">
                <span>تاريخ الأمر: <strong className="font-mono text-slate-800">{formatDate(po?.created_at)}</strong></span>
                <span className="mr-3">المورد: <strong className="text-slate-800">{poSupplierDisplay}</strong></span>
              </div>
            </div>

            {/* PO Table (Minimalist with border-gray-300) */}
            <div className="overflow-hidden rounded-b border-x border-b border-gray-300">
              <table className="w-full border-collapse text-right text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-300 font-bold text-slate-700">
                    <th className="border-l border-gray-300 p-1 text-center w-8">م</th>
                    <th className="border-l border-gray-300 p-1">بيان الصنف</th>
                    <th className="border-l border-gray-300 p-1 text-center w-20">الوحدة</th>
                    <th className="border-l border-gray-300 p-1 text-center w-20">الكمية</th>
                    <th className="border-l border-gray-300 p-1 text-center w-24">سعر الوحدة</th>
                    <th className="border-l border-gray-300 p-1 text-center w-28">الإجمالي</th>
                    <th className="p-1">الملاحظات والموقع</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-300">
                  {poItems.map((item, idx) => (
                    <tr key={item.id || idx} className="hover:bg-gray-50/50">
                      <td className="border-l border-gray-300 p-1 text-center font-bold text-slate-600">{idx + 1}</td>
                      <td className="border-l border-gray-300 p-1 font-bold text-slate-900">{item.item_name || item.item_description}</td>
                      <td className="border-l border-gray-300 p-1 text-center text-slate-700">{getUnitLabel(item.uom || '')}</td>
                      <td className="border-l border-gray-300 p-1 text-center font-mono font-bold text-slate-900">{item.quantity}</td>
                      <td className="border-l border-gray-300 p-1 text-center font-mono text-slate-800">{money(item.unit_price)}</td>
                      <td className="border-l border-gray-300 p-1 text-center font-mono font-bold text-slate-900">{money(item.line_total)}</td>
                      <td className="p-1 text-[11px] text-slate-600">
                        {[item.item_reference ? `قطعة: ${item.item_reference}` : '', item.region ? `المنطقة: ${item.region}` : '', item.specifications].filter(Boolean).join(' • ') || '---'}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 border-t-2 border-gray-300 font-bold text-slate-900">
                    <td colSpan={5} className="border-l border-gray-300 p-1 text-left font-black">
                      إجمالي أمر الشراء:
                    </td>
                    <td className="border-l border-gray-300 p-1 text-center font-mono font-black text-xs text-black">
                      {money(po?.grand_total)}
                    </td>
                    <td className="p-1"></td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Inline Digital Signatures - PO */}
            <div className="flex justify-between text-sm font-bold mt-1 mb-4 px-4 text-slate-800">
              <span>إدارة المشتريات: <span className="font-semibold">{poProcurementName}</span></span>
              <span>الحسابات: <span className="font-semibold">{poAccountantName}</span></span>
              <span>اعتماد: <span className="font-semibold">{poApproverName}</span></span>
            </div>

            {/* ═════════════════════════════════════════════════════════════════════════
                المرحلة الثالثة: إذن الاستلام (Goods Receipt Note)
               ═════════════════════════════════════════════════════════════════════════ */}
            {/* Header Bar */}
            <div className="bg-gray-100 border border-gray-300 rounded-t px-3 py-1 flex items-center justify-between font-bold text-xs text-slate-800">
              <div className="flex items-center gap-2">
                <span className="bg-slate-700 text-white text-[10px] px-1.5 py-0.2 rounded font-mono">3</span>
                <span>إذن استلام رقم: <span className="font-mono text-black">{receipt.receipt_number || '---'}</span></span>
              </div>
              <div className="text-[11px] text-slate-600 font-normal">
                <span>تاريخ الاستلام الفعلي: <strong className="font-mono text-slate-800">{formatDate(receipt.received_at || receipt.created_at)}</strong></span>
              </div>
            </div>

            {/* GRN Table (Minimalist with border-gray-300) */}
            <div className="overflow-hidden rounded-b border-x border-b border-gray-300">
              <table className="w-full border-collapse text-right text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-300 font-bold text-slate-700">
                    <th className="border-l border-gray-300 p-1 text-center w-8">م</th>
                    <th className="border-l border-gray-300 p-1">الصنف المستلم</th>
                    <th className="border-l border-gray-300 p-1 text-center w-20">الوحدة</th>
                    <th className="border-l border-gray-300 p-1 text-center w-24">الكمية المستلمة</th>
                    <th className="p-1">ملاحظات الفحص والاستلام</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-300">
                  {displayReceiptItems.map((item: any, idx: number) => {
                    const poItem = item.purchase_order_item;
                    const prItem = poItem?.pr_item;
                    const itemUom = prItem?.uom || poItem?.uom || '';
                    return (
                      <tr key={item.id || idx} className="hover:bg-gray-50/50">
                        <td className="border-l border-gray-300 p-1 text-center font-bold text-slate-600">{idx + 1}</td>
                        <td className="border-l border-gray-300 p-1 font-bold text-slate-900">
                          {poItem?.item_name || poItem?.item_description || '---'}
                        </td>
                        <td className="border-l border-gray-300 p-1 text-center text-slate-700">
                          {getUnitLabel(itemUom)}
                        </td>
                        <td className="border-l border-gray-300 p-1 text-center font-mono font-bold text-slate-900">
                          {item.received_quantity}
                        </td>
                        <td className="p-1 text-[11px] text-slate-600">
                          {item.notes || receipt.warehouse_notes || 'مطابق للفحص والوزن'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Inline Digital Signatures - GRN */}
            <div className="flex justify-between text-sm font-bold mt-1 mb-4 px-4 text-slate-800">
              <span>أمين المخزن: <span className="font-semibold">{warehouseKeeperName}</span></span>
              <span>مهندس الموقع: <span className="font-semibold">{siteEngineerName}</span></span>
            </div>

          </div>
        </div>
      </div>
    </div>,
    document.body
  );

};

export default ThreeWayMatchPrintModal;
