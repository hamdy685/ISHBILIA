import React from 'react';
import { PurchaseOrder } from '../../types/purchaseOrder';
import { getUnitLabel } from '../../utils/units';
import { formatCleanNumber } from '../../utils/numberFormat';

export interface CombinedPrintTemplateProps {
  po?: PurchaseOrder | null;
  receipt?: any | null;
  pr?: any | null;

  // Manual / Individual Prop Overrides (optional)
  prNumber?: string;
  manualPrNumber?: string | null;
  prDate?: string | null;
  requesterName?: string;
  reviewerName?: string;
  executionManagerName?: string;
  prItems?: Array<{
    item_description: string;
    uom?: string;
    quantity: number | string;
    specifications?: string;
  }>;

  poNumber?: string;
  manualPoNumber?: string | null;
  poDate?: string | null;
  supplierName?: string;
  procurementName?: string;
  accountantName?: string;
  generalManagerName?: string;
  poItems?: Array<{
    item_description: string;
    item_reference?: string;
    region?: string;
    uom?: string;
    quantity: number | string;
    unit_price: number | string;
    line_total?: number | string;
    specifications?: string;
  }>;
  grandTotal?: number | string;

  // Shared & Contextual overrides
  items?: Array<{
    id?: number;
    item_description: string;
    item_reference?: string;
    region?: string;
    quantity: number | string;
    uom?: string;
    unit_price?: number | string;
    line_total?: number | string;
    specifications?: string;
    delivery_date?: string;
    supplier_name?: string;
  }>;
  departmentName?: string;
  projectOrParcel?: string;
  region?: string;
  purpose?: string;
  deliveryDate?: string;
  paymentTerms?: string;
  procurementReviewerName?: string;
  qualityReviewerName?: string;
  executiveApproverName?: string;

  grnNumber?: string;
  grnDate?: string | null;
  warehouseKeeperName?: string;
  siteEngineerName?: string;
  grnItems?: Array<{
    item_description: string;
    uom?: string;
    received_quantity: number | string;
    notes?: string;
  }>;
}

const formatDate = (value?: string | null): string => {
  if (!value) return '---';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const CombinedPrintTemplate = React.forwardRef<HTMLDivElement, CombinedPrintTemplateProps>(
  (props, ref) => {
    const {
      po,
      receipt: propReceipt,
      pr: propPr,
    } = props;

    // Resolve Context Entities
    const resolvedPr = propPr || po?.purchase_request || null;
    const resolvedReceipt = propReceipt || po?.receipts?.[0] || null;

    // ── 1. Section 1: Purchase Request (طلب الشراء) ───────────────────────────
    const displayPrNumber =
      props.manualPrNumber ||
      resolvedPr?.manual_request_number ||
      props.prNumber ||
      resolvedPr?.request_number ||
      '---';

    const prDate = formatDate(props.prDate || resolvedPr?.created_at);

    const requesterName =
      props.requesterName ||
      resolvedPr?.requester?.name ||
      po?.requested_by?.name ||
      '---';

    const reviewerName =
      props.reviewerName ||
      resolvedPr?.assigned_reviewer?.name ||
      (resolvedPr?.approval_history?.find((a: any) => a.action === 'APPROVED_BY_REVIEWER')?.actor?.name) ||
      '---';

    const executionManagerName =
      props.executionManagerName ||
      (resolvedPr?.approval_history?.find((a: any) =>
        a.action === 'APPROVED_BY_EXECUTIVE' || a.action === 'EXECUTIVE_SELECTED_QUOTE'
      )?.actor?.name) ||
      po?.executive_approver?.name ||
      '---';

    // PR Line Items
    const rawPrItems = props.prItems || props.items || resolvedPr?.items || [];
    const resolvedPrItems = rawPrItems.length > 0
      ? rawPrItems.map((item: any) => ({
          description: item.item_description || item.item_name || item.item?.name || '---',
          uom: item.uom || 'PCS',
          quantity: item.quantity ?? '---',
          specifications: item.specifications || item.notes || '---',
        }))
      : (po?.items || []).map((poItem: any) => ({
          description: poItem.pr_item?.item_description || poItem.item_description || poItem.item_name || '---',
          uom: poItem.pr_item?.uom || poItem.uom || 'PCS',
          quantity: poItem.pr_item?.quantity || poItem.quantity || '---',
          specifications: poItem.pr_item?.specifications || poItem.specifications || '---',
        }));

    // ── 2. Section 2: Actual Purchase Order (أمر الشراء الفعلي) ───────────────
    const displayPoNumber =
      props.poNumber ||
      po?.po_number ||
      '---';

    const manualPoNumber =
      props.manualPoNumber ||
      po?.manual_po_number ||
      null;

    const poDate = formatDate(props.poDate || po?.finalized_at || po?.created_at);

    const supplierName =
      props.supplierName ||
      po?.supplier?.company_name ||
      '---';

    const procurementName =
      props.procurementName ||
      po?.finalized_by?.name ||
      po?.created_by?.name ||
      '---';

    const accountantName =
      props.accountantName ||
      po?.accounting_reviewer?.name ||
      (po?.approval_history?.find((a: any) => a.action === 'ACCOUNTING_APPROVED')?.actor?.name) ||
      '---';

    const generalManagerName =
      props.generalManagerName ||
      'م. محمد عبدالكريم';

    // PO Line Items (Actual final quantities and prices approved by procurement)
    const rawPoItems = props.poItems || props.items || po?.items || [];
    const resolvedPoItems = rawPoItems.map((item: any) => {
      const qty = Number(item.quantity || 0);
      const price = Number(item.unit_price || 0);
      const lineTotal = item.line_total !== undefined ? Number(item.line_total) : Math.round(qty * price * 100) / 100;
      return {
        description: item.item_description || item.item_name || '---',
        reference: item.item_reference || '',
        region: item.region || '',
        uom: item.uom || 'PCS',
        quantity: item.quantity ?? 0,
        unit_price: price,
        line_total: lineTotal,
        specifications: item.specifications || '',
      };
    });

    const grandTotal =
      props.grandTotal !== undefined
        ? Number(props.grandTotal)
        : (po?.grand_total !== undefined ? Number(po.grand_total) : resolvedPoItems.reduce((acc, it) => acc + it.line_total, 0));

    // ── 3. Section 3: Goods Receipt Note (إذن الاستلام) ──────────────────────
    const displayGrnNumber =
      props.grnNumber ||
      resolvedReceipt?.receipt_number ||
      (po?.po_number ? `GRN-${po.po_number}` : '---');

    const grnDate = formatDate(
      props.grnDate ||
      resolvedReceipt?.received_at ||
      resolvedReceipt?.site_engineer_approved_at ||
      resolvedReceipt?.created_at
    );

    const warehouseKeeperName =
      props.warehouseKeeperName ||
      resolvedReceipt?.warehouse_keeper?.name ||
      (resolvedReceipt?.warehouse_keeper && typeof resolvedReceipt.warehouse_keeper === 'string' ? resolvedReceipt.warehouse_keeper : null) ||
      '---';

    const siteEngineerName =
      props.siteEngineerName ||
      resolvedReceipt?.site_engineer?.name ||
      resolvedPr?.site_engineer?.name ||
      '---';

    // GRN Line Items: map receipt items, falling back to PO items with matching received quantities
    const rawGrnItems = props.grnItems || resolvedReceipt?.items || [];
    const resolvedGrnItems = rawGrnItems.length > 0
      ? rawGrnItems.map((item: any) => {
          const poItem = item.purchase_order_item || po?.items?.find((p: any) => p.id === item.purchase_order_item_id);
          return {
            description: poItem?.item_description || poItem?.item_name || item.item_description || '---',
            uom: poItem?.uom || item.uom || 'PCS',
            received_quantity: item.received_quantity ?? '---',
            notes: item.notes || resolvedReceipt?.warehouse_notes || 'مطابق للفحص والمعاينة',
          };
        })
      : resolvedPoItems.map((poItem: any) => ({
          description: poItem.description,
          uom: poItem.uom,
          received_quantity: poItem.quantity,
          notes: resolvedReceipt?.warehouse_notes || 'مطابق للفحص والمعاينة',
        }));

    return (
      <div
        ref={ref}
        className="combined-print-template print-document w-full bg-white print:w-full print:bg-white text-black font-sans leading-tight text-xs"
        dir="rtl"
      >
        {/* ══════════════════════════════════════════════════════════════════════
            القسم الأول: طلب الشراء (Purchase Request)
           ══════════════════════════════════════════════════════════════════════ */}
        <section className="mb-6">
          {/* الترويسة: شعار الشركة يميناً، وعنوان في المنتصف، والتاريخ يساراً */}
          <div className="flex items-center justify-between border-b-2 border-slate-800 pb-2 mb-2">
            {/* يميناً: الشعار واسم الشركة */}
            <div className="flex items-center gap-2 w-1/3">
              <img
                src="/eshbelia-logo.png"
                alt="شعار شركة إشبيلية"
                className="h-9 w-auto object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <div className="leading-tight">
                <div className="font-black text-xs text-black">شركة إشبيلية</div>
                <div className="text-[9px] text-slate-600 font-semibold">للتطوير العقاري والمقاولات</div>
              </div>
            </div>

            {/* منتصف: عنوان طلب الشراء ورقم الطلب */}
            <div className="text-center w-1/3">
              <h2 className="text-sm font-black text-black tracking-wide border-b border-slate-400 pb-0.5 inline-block">
                طلب شراء رقم: <span className="font-mono text-slate-900">{displayPrNumber}</span>
              </h2>
              {resolvedPr?.department?.name && (
                <div className="text-[10px] text-slate-600 mt-0.5">
                  القسم: <span className="font-bold text-slate-800">{resolvedPr.department.name}</span>
                </div>
              )}
            </div>

            {/* يساراً: التاريخ */}
            <div className="text-left w-1/3 text-xs text-slate-700">
              <div>
                <span className="font-bold text-black">التاريخ: </span>
                <span className="font-mono font-semibold text-slate-900">{prDate}</span>
              </div>
            </div>
          </div>

          {/* الجدول: الأصناف، الكميات المطلوبة، والمواصفات الفنية */}
          <div className="overflow-hidden border border-slate-400 rounded-sm">
            <table className="w-full border-collapse text-right text-xs">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-400 font-bold text-slate-800">
                  <th className="border-l border-slate-300 p-1.5 text-center w-8">م</th>
                  <th className="border-l border-slate-300 p-1.5">بيان الصنف</th>
                  <th className="border-l border-slate-300 p-1.5 text-center w-20">الوحدة</th>
                  <th className="border-l border-slate-300 p-1.5 text-center w-28">الكمية المطلوبة</th>
                  <th className="p-1.5">المواصفات الفنية / الغرض</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-300">
                {resolvedPrItems.length > 0 ? (
                  resolvedPrItems.map((item: any, idx: number) => (
                    <tr key={`pr-item-${idx}`} className="hover:bg-slate-50">
                      <td className="border-l border-slate-300 p-1.5 text-center font-bold text-slate-600">{idx + 1}</td>
                      <td className="border-l border-slate-300 p-1.5 font-bold text-slate-900">{item.description}</td>
                      <td className="border-l border-slate-300 p-1.5 text-center text-slate-700">{getUnitLabel(item.uom)}</td>
                      <td className="border-l border-slate-300 p-1.5 text-center font-mono font-bold text-slate-900">{item.quantity}</td>
                      <td className="p-1.5 text-[11px] text-slate-600">{item.specifications}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="p-2 text-center text-slate-500">لا توجد بنود مسجلة بطلب الشراء</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* التوقيعات الرقمية: أسفل الجدول مباشرة */}
          <div className="flex justify-between text-sm font-bold px-4 mt-2 text-slate-800">
            <span>مقدم الطلب: <span className="font-semibold text-black">{requesterName}</span></span>
            <span>مراجع: <span className="font-semibold text-black">{reviewerName}</span></span>
            <span>مدير التنفيذ: <span className="font-semibold text-black">{executionManagerName}</span></span>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════════════
            القسم الثاني: أمر الشراء الفعلي (Actual Purchase Order)
           ══════════════════════════════════════════════════════════════════════ */}
        <section className="mb-6">
          {/* الترويسة: عنوان صريح ومميز 'أمر شراء فعلي رقم: PO-XXX' في المنتصف */}
          <div className="flex items-center justify-between border-b-2 border-slate-800 pb-2 mb-2">
            <div className="w-1/3 text-right text-xs text-slate-700">
              <span className="font-bold text-black">المورد: </span>
              <span className="font-bold text-slate-900">{supplierName}</span>
            </div>

            <div className="text-center w-1/3">
              <h2 className="text-sm font-black text-black tracking-wide border-b-2 border-emerald-600 pb-0.5 inline-block">
                أمر شراء فعلي رقم: <span className="font-mono text-black">{displayPoNumber}</span>
                {manualPoNumber && (
                  <span className="text-[11px] font-mono text-slate-600 mr-1.5 font-normal">
                    (يدوي: {manualPoNumber})
                  </span>
                )}
              </h2>
            </div>

            <div className="text-left w-1/3 text-xs text-slate-700">
              <div>
                <span className="font-bold text-black">تاريخ الأمر: </span>
                <span className="font-mono font-semibold text-slate-900">{poDate}</span>
              </div>
            </div>
          </div>

          {/* الجدول: يعرض الكميات الفعلية النهائية والأسعار الإجمالية المعتمدة */}
          <div className="overflow-hidden border border-slate-400 rounded-sm">
            <table className="w-full border-collapse text-right text-xs">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-400 font-bold text-slate-800">
                  <th className="border-l border-slate-300 p-1.5 text-center w-8">م</th>
                  <th className="border-l border-slate-300 p-1.5">بيان الصنف الفعلي</th>
                  <th className="border-l border-slate-300 p-1.5 text-center w-28">القطعة / المنطقة</th>
                  <th className="border-l border-slate-300 p-1.5 text-center w-16">الوحدة</th>
                  <th className="border-l border-slate-300 p-1.5 text-center w-24">الكمية الفعلية</th>
                  <th className="border-l border-slate-300 p-1.5 text-center w-24">سعر الوحدة</th>
                  <th className="p-1.5 text-center w-28">الإجمالي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-300">
                {resolvedPoItems.length > 0 ? (
                  resolvedPoItems.map((item: any, idx: number) => (
                    <tr key={`po-item-${idx}`} className="hover:bg-slate-50">
                      <td className="border-l border-slate-300 p-1.5 text-center font-bold text-slate-600">{idx + 1}</td>
                      <td className="border-l border-slate-300 p-1.5 font-bold text-slate-900">
                        {item.description}
                        {item.specifications && (
                          <span className="block text-[10px] text-slate-500 font-normal">{item.specifications}</span>
                        )}
                      </td>
                      <td className="border-l border-slate-300 p-1.5 text-center text-[11px] text-slate-700">
                        {[item.reference ? `قطعة ${item.reference}` : '', item.region].filter(Boolean).join(' - ') || '---'}
                      </td>
                      <td className="border-l border-slate-300 p-1.5 text-center text-slate-700">{getUnitLabel(item.uom)}</td>
                      <td className="border-l border-slate-300 p-1.5 text-center font-mono font-bold text-slate-900">{item.quantity}</td>
                      <td className="border-l border-slate-300 p-1.5 text-center font-mono text-slate-800">
                        {formatCleanNumber(item.unit_price)} ج.م
                      </td>
                      <td className="p-1.5 text-center font-mono font-bold text-slate-900">
                        {formatCleanNumber(item.line_total)} ج.م
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="p-2 text-center text-slate-500">لا توجد بنود بأمر الشراء</td>
                  </tr>
                )}

                {/* تلوين صف الإجمالي النهائي بلون مميز خفيف (bg-yellow-100) */}
                <tr className="bg-yellow-100 border-t-2 border-slate-400 font-bold text-slate-900">
                  <td colSpan={6} className="border-l border-slate-300 p-2 text-left font-black text-xs">
                    الإجمالي النهائي الفعلي لأمر الشراء:
                  </td>
                  <td className="p-2 text-center font-mono font-black text-sm text-black">
                    {formatCleanNumber(grandTotal)} ج.م
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* التوقيعات الرقمية: أسفل الجدول مباشرة */}
          <div className="flex justify-between text-sm font-bold px-4 mt-2 text-slate-800">
            <span>إدارة المشتريات: <span className="font-semibold text-black">{procurementName}</span></span>
            <span>الإدارة المالية: <span className="font-semibold text-black">{accountantName}</span></span>
            <span>المدير العام: <span className="font-semibold text-black">{generalManagerName}</span></span>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════════════
            القسم الثالث: إذن الاستلام (Goods Receipt Note)
           ══════════════════════════════════════════════════════════════════════ */}
        <section className="mb-6">
          {/* الترويسة: عنوان 'إذن استلام فعلي رقم: GRN-XXX' في المنتصف */}
          <div className="flex items-center justify-between border-b-2 border-slate-800 pb-2 mb-2">
            <div className="w-1/3 text-right text-xs text-slate-700">
              <span className="font-bold text-black">الموقع / المخزن: </span>
              <span className="font-semibold text-slate-900">{resolvedPr?.project_name || resolvedPr?.parcel_reference || 'موقع المشروع'}</span>
            </div>

            <div className="text-center w-1/3">
              <h2 className="text-sm font-black text-black tracking-wide border-b border-slate-400 pb-0.5 inline-block">
                إذن استلام فعلي رقم: <span className="font-mono text-black">{displayGrnNumber}</span>
              </h2>
            </div>

            <div className="text-left w-1/3 text-xs text-slate-700">
              <div>
                <span className="font-bold text-black">تاريخ الاستلام: </span>
                <span className="font-mono font-semibold text-slate-900">{grnDate}</span>
              </div>
            </div>
          </div>

          {/* الجدول: يعرض الكميات التي تم استلامها فعلياً وملاحظات الفحص */}
          <div className="overflow-hidden border border-slate-400 rounded-sm">
            <table className="w-full border-collapse text-right text-xs">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-400 font-bold text-slate-800">
                  <th className="border-l border-slate-300 p-1.5 text-center w-8">م</th>
                  <th className="border-l border-slate-300 p-1.5">الصنف المستلم</th>
                  <th className="border-l border-slate-300 p-1.5 text-center w-20">الوحدة</th>
                  <th className="border-l border-slate-300 p-1.5 text-center w-28">الكمية المستلمة فعلياً</th>
                  <th className="p-1.5">ملاحظات الفحص والاستلام</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-300">
                {resolvedGrnItems.length > 0 ? (
                  resolvedGrnItems.map((item: any, idx: number) => (
                    <tr key={`grn-item-${idx}`} className="hover:bg-slate-50">
                      <td className="border-l border-slate-300 p-1.5 text-center font-bold text-slate-600">{idx + 1}</td>
                      <td className="border-l border-slate-300 p-1.5 font-bold text-slate-900">{item.description}</td>
                      <td className="border-l border-slate-300 p-1.5 text-center text-slate-700">{getUnitLabel(item.uom)}</td>
                      <td className="border-l border-slate-300 p-1.5 text-center font-mono font-bold text-slate-900">
                        {item.received_quantity}
                      </td>
                      <td className="p-1.5 text-[11px] text-slate-600">{item.notes}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="p-2 text-center text-slate-500">لا توجد بيانات استلام مسجلة</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* التوقيعات الرقمية: أسفل الجدول مباشرة */}
          <div className="flex justify-between text-sm font-bold px-4 mt-2 text-slate-800">
            <span>أمين المخزن: <span className="font-semibold text-black">{warehouseKeeperName}</span></span>
            <span>مهندس الموقع: <span className="font-semibold text-black">{siteEngineerName}</span></span>
          </div>
        </section>
      </div>
    );
  }
);

CombinedPrintTemplate.displayName = 'CombinedPrintTemplate';

export default CombinedPrintTemplate;
