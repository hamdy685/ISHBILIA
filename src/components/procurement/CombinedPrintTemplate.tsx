import React from 'react';
import { getUnitLabel } from '../../utils/units';
import { formatCleanNumber, formatCleanQty } from '../../utils/numberFormat';

export interface CombinedPrintTemplateItem {
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
}

export interface CombinedPrintTemplateProps {
  // PR Context (طلب الشراء)
  prNumber?: string;
  manualPrNumber?: string | null;
  prDate?: string | null;
  departmentName?: string;
  projectOrParcel?: string;
  region?: string;
  purpose?: string;
  requesterName?: string;
  qualityReviewerName?: string;
  procurementReviewerName?: string;
  executiveApproverName?: string;

  // PO Context (أمر الشراء)
  poNumber?: string;
  manualPoNumber?: string | null;
  poDate?: string | null;
  supplierName?: string;
  deliveryDate?: string;
  paymentTerms?: string;
  accountingName?: string;

  // Shared Items & Financials
  items?: CombinedPrintTemplateItem[];
  grandTotal?: number;
}

const formatDate = (value?: string | null): string => {
  if (!value) return new Date().toISOString().split('T')[0];
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/**
 * CombinedPrintTemplate (نموذج الطباعة المدمج الرسمي)
 * ورقة A4 واحدة مقسومة أفقياً:
 * - النصف العلوي: طلب الشراء (بدون أسعار، أعمدة المواصفات الفنية وتاريخ التوريد، وتوقيعات: مقدم الطلب، الجودة، المشتريات، يعتمد).
 * - النصف السفلي: أمر الشراء (ترويسة زرقاء، أعمدة السعر والإجمالي، إجمالي أصفر فاقع، توقيعات: المشتريات، الحسابات، يعتمد &).
 */
export const CombinedPrintTemplate = React.forwardRef<HTMLDivElement, CombinedPrintTemplateProps>(
  (props, ref) => {
    const {
      prNumber = '—',
      manualPrNumber,
      prDate,
      departmentName = 'إدارة المشاريع والتنفيذ',
      projectOrParcel = 'مشروع إشبيلية',
      region = '',
      purpose = 'اعتماد وتوريد للمشروع',
      items = [],
      poNumber = '—',
      manualPoNumber,
      poDate,
      supplierName = '—',
      deliveryDate,
      grandTotal,
    } = props;

    const prDateFormatted = formatDate(prDate);
    const poDateFormatted = formatDate(poDate);

    // Manual numbers priority
    const displayPrNumber = manualPrNumber?.trim() ? manualPrNumber.trim() : prNumber;
    const displayPoNumber = manualPoNumber?.trim() ? manualPoNumber.trim() : poNumber;

    // Fixed rows count (8 rows as shown in the official printed reference)
    const FIXED_ROWS_COUNT = 8;
    const paddedItems = [...items];
    while (paddedItems.length < FIXED_ROWS_COUNT) {
      paddedItems.push({
        item_description: '',
        quantity: '',
        uom: '',
        unit_price: '',
      });
    }

    // Calculated grand total
    const computedTotal =
      typeof grandTotal === 'number'
        ? grandTotal
        : items.reduce((sum, item) => {
            const q = Number(item.quantity) || 0;
            const p = Number(item.unit_price) || 0;
            return sum + q * p;
          }, 0);

    return (
      <div
        ref={ref}
        id="combined-print-document"
        dir="rtl"
        className="combined-print-template mx-auto bg-white text-black box-border w-[210mm] min-h-[297mm] max-h-[297mm] h-[297mm] p-[6mm] flex flex-col justify-between print:w-full print:h-full print:m-0 print:p-[5mm] print:border-none border-2 border-black"
        style={{
          fontFamily: "'Cairo', 'Tajawal', 'Segoe UI', Tahoma, Arial, sans-serif",
          WebkitPrintColorAdjust: 'exact',
          printColorAdjust: 'exact',
        }}
      >
        {/* ══════════════════════════════════════════════════════════
            النصف العلوي: طلب الشراء (بدون بيانات مالية)
           ══════════════════════════════════════════════════════════ */}
        <section className="flex flex-col justify-between flex-1 pb-1">
          {/* Header Row: Logo (Left) | Title & PR No (Center) | Metadata (Right) */}
          <div className="flex items-start justify-between gap-2 px-1">
            {/* Logo on Left */}
            <div className="w-1/4 shrink-0 text-left">
              <div className="inline-block text-center">
                <img
                  src="/eshbelia-logo.png"
                  alt="شركة إشبيلية"
                  className="h-14 w-auto object-contain mx-auto"
                  onError={(e) => {
                    // Fallback to building vector badge if image path not accessible
                    (e.currentTarget as HTMLElement).style.display = 'none';
                    const parent = e.currentTarget.parentElement;
                    if (parent && !parent.querySelector('.fallback-logo')) {
                      const fallback = document.createElement('div');
                      fallback.className = 'fallback-logo text-amber-600 font-black text-2xl';
                      fallback.innerHTML = '🏛️';
                      parent.prepend(fallback);
                    }
                  }}
                />
                <div className="text-[9px] font-black text-amber-700 tracking-wider mt-0.5 leading-tight">
                  ISHBILIA
                  <br />
                  اشبيلية
                </div>
              </div>
            </div>

            {/* Title & PR No in Center */}
            <div className="w-2/4 text-center self-center flex items-center justify-center gap-6">
              <div className="text-sm font-bold text-black">
                رقم &nbsp;
                <span className="font-mono text-base font-black border-b border-dotted border-black px-2 inline-block min-w-14">
                  {displayPrNumber !== '—' ? displayPrNumber : ''}
                </span>
              </div>
              <h1 className="text-3xl font-black text-black tracking-wide font-sans">
                طلب شراء
              </h1>
            </div>

            {/* Metadata on Right */}
            <div className="w-1/4 shrink-0 text-right text-xs font-bold text-black space-y-1" dir="rtl">
              <div className="flex items-center justify-end gap-1">
                <span className="font-mono font-bold text-xs">{prDateFormatted}</span>
                <span className="text-black font-bold">/التاريخ</span>
              </div>
              <div className="flex items-center justify-end gap-1">
                <span className="font-semibold text-xs truncate">{departmentName}</span>
                <span className="text-black font-bold">/ القسم</span>
              </div>
              <div className="flex items-center justify-end gap-1">
                <span className="font-semibold text-xs truncate">{projectOrParcel}</span>
                <span className="text-black font-bold">/المشروع</span>
              </div>
            </div>
          </div>

          {/* PR Table (No Prices / Financial Data) */}
          <div className="mt-2">
            <table
              className="w-full border-collapse border-2 border-black text-center text-xs"
              style={{ border: '2px solid #000000' }}
            >
              <thead>
                <tr className="bg-white text-black font-black text-center h-7 border-b-2 border-black">
                  <th className="border border-black p-1 w-10 text-center font-black">م</th>
                  <th className="border border-black p-1 text-center font-black">الصنف</th>
                  <th className="border border-black p-1 w-16 text-center font-black">الوحدة</th>
                  <th className="border border-black p-1 w-16 text-center font-black">الكمية</th>
                  <th className="border border-black p-1 w-28 text-center font-black">تاريخ التوريد</th>
                  <th className="border border-black p-1 w-48 text-center font-black">المواصفات الفنية</th>
                </tr>
              </thead>
              <tbody>
                {paddedItems.map((item, idx) => {
                  const hasData = Boolean(item.item_description);
                  return (
                    <tr key={`pr-row-${idx}`} className="h-[6.5mm] border border-black">
                      <td className="border border-black p-0.5 text-center font-mono font-bold">
                        {hasData ? idx + 1 : ''}
                      </td>
                      <td className="border border-black p-0.5 text-right px-2 font-bold text-black truncate max-w-[200px]">
                        {item.item_description || ''}
                      </td>
                      <td className="border border-black p-0.5 text-center font-medium">
                        {hasData ? getUnitLabel(item.uom || 'PCS') : ''}
                      </td>
                      <td className="border border-black p-0.5 text-center font-mono font-black">
                        {hasData ? formatCleanQty(item.quantity) : ''}
                      </td>
                      <td className="border border-black p-0.5 text-center font-mono text-[11px]">
                        {hasData ? (item.delivery_date ? formatDate(item.delivery_date) : deliveryDate ? formatDate(deliveryDate) : '') : ''}
                      </td>
                      <td className="border border-black p-0.5 text-right px-2 text-[10px] text-black truncate max-w-[180px]">
                        {item.specifications || (hasData && item.item_reference ? `قطعة ${item.item_reference}` : '')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* PR Signatures Row */}
          <div className="flex items-center justify-between text-center px-8 pt-3 text-xs font-bold text-black">
            <div className="w-1/4">مقدم الطلب</div>
            <div className="w-1/4">الجودة</div>
            <div className="w-1/4">المشتريات</div>
            <div className="w-1/4">يعتمد</div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            الفاصل الأفقي الأسود بين النصفين
           ══════════════════════════════════════════════════════════ */}
        <div className="border-b-2 border-black my-1" style={{ borderColor: '#000000' }} />

        {/* ══════════════════════════════════════════════════════════
            النصف السفلي: أمر الشراء (ترويسة زرقاء وإجمالي أصفر)
           ══════════════════════════════════════════════════════════ */}
        <section className="flex flex-col justify-between flex-1 pt-1">
          {/* Header Row: Logo (Left) | Title & Zone (Center) | Metadata (Right) */}
          <div className="flex items-start justify-between gap-2 px-1">
            {/* Logo on Left */}
            <div className="w-1/4 shrink-0 text-left">
              <div className="inline-block text-center">
                <img
                  src="/eshbelia-logo.png"
                  alt="شركة إشبيلية"
                  className="h-14 w-auto object-contain mx-auto"
                  onError={(e) => {
                    (e.currentTarget as HTMLElement).style.display = 'none';
                    const parent = e.currentTarget.parentElement;
                    if (parent && !parent.querySelector('.fallback-logo')) {
                      const fallback = document.createElement('div');
                      fallback.className = 'fallback-logo text-amber-600 font-black text-2xl';
                      fallback.innerHTML = '🏛️';
                      parent.prepend(fallback);
                    }
                  }}
                />
                <div className="text-[9px] font-black text-amber-700 tracking-wider mt-0.5 leading-tight">
                  ISHBILIA
                  <br />
                  اشبيلية
                </div>
              </div>
            </div>

            {/* Title & Zone in Center */}
            <div className="w-2/4 text-center self-center">
              <h1 className="text-3xl font-black text-black tracking-wide font-sans">
                أمر شراء
              </h1>
              <div className="text-xs font-bold text-black mt-0.5">
                مجاورة : <span className="font-semibold">{region || projectOrParcel || ''}</span>
              </div>
            </div>

            {/* Metadata on Right */}
            <div className="w-1/4 shrink-0 text-right text-xs font-bold text-black space-y-0.5" dir="rtl">
              <div className="flex items-center justify-end gap-1">
                <span className="font-mono font-bold text-xs">{poDateFormatted}</span>
                <span className="text-black font-bold">/التاريخ</span>
              </div>
              <div className="flex items-center justify-end gap-1">
                <span className="font-mono font-bold text-xs">{displayPoNumber !== '—' ? displayPoNumber : displayPrNumber}</span>
                <span className="text-black font-bold">/رقم الطلب</span>
              </div>
              <div className="flex items-center justify-end gap-1">
                <span className="font-semibold text-xs truncate">{projectOrParcel}</span>
                <span className="text-black font-bold">/المشروع</span>
              </div>
              <div className="flex items-center justify-end gap-1">
                <span className="font-semibold text-xs truncate">{purpose}</span>
                <span className="text-black font-bold">/غرض الشراء</span>
              </div>
            </div>
          </div>

          {/* PO Table (Light Blue Header & Yellow Total) */}
          <div className="mt-2">
            <table
              className="w-full border-collapse border-2 border-black text-center text-xs"
              style={{ border: '2px solid #000000' }}
            >
              <thead>
                <tr
                  className="bg-[#5B9BD5] bg-header-blue text-black font-black text-center h-7 border-b-2 border-black"
                  style={{
                    backgroundColor: '#5B9BD5',
                    WebkitPrintColorAdjust: 'exact',
                    printColorAdjust: 'exact',
                  }}
                >
                  <th className="border border-black p-1 w-10 text-center font-black">م</th>
                  <th className="border border-black p-1 text-center font-black">الصنف</th>
                  <th className="border border-black p-1 w-16 text-center font-black">الوحدة</th>
                  <th className="border border-black p-1 w-16 text-center font-black">الكمية</th>
                  <th className="border border-black p-1 w-20 text-center font-black">السعر</th>
                  <th className="border border-black p-1 w-24 text-center font-black">الإجمالي</th>
                  <th className="border border-black p-1 w-32 text-center font-black">ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {paddedItems.map((item, idx) => {
                  const hasData = Boolean(item.item_description);
                  const qty = Number(item.quantity) || 0;
                  const price = Number(item.unit_price) || 0;
                  const lineTotal =
                    typeof item.line_total !== 'undefined'
                      ? Number(item.line_total)
                      : Math.round(qty * price * 100) / 100;

                  return (
                    <tr key={`po-row-${idx}`} className="h-[6.5mm] border border-black">
                      <td className="border border-black p-0.5 text-center font-mono font-bold">
                        {hasData ? idx + 1 : ''}
                      </td>
                      <td className="border border-black p-0.5 text-right px-2 font-bold text-black truncate max-w-[200px]">
                        {item.item_description || ''}
                      </td>
                      <td className="border border-black p-0.5 text-center font-medium">
                        {hasData ? getUnitLabel(item.uom || 'PCS') : ''}
                      </td>
                      <td className="border border-black p-0.5 text-center font-mono font-black">
                        {hasData ? formatCleanQty(item.quantity) : ''}
                      </td>
                      <td className="border border-black p-0.5 text-center font-mono font-bold">
                        {hasData && price > 0 ? formatCleanNumber(price) : ''}
                      </td>
                      <td className="border border-black p-0.5 text-center font-mono font-bold">
                        {hasData ? (lineTotal > 0 ? formatCleanNumber(lineTotal) : '0') : idx === 1 ? '0' : ''}
                      </td>
                      <td className="border border-black p-0.5 text-center px-1 text-[11px] font-bold text-black truncate">
                        {idx === 0
                          ? `مورد / ${supplierName || '—'}`
                          : item.specifications || (hasData && item.item_reference ? `قطعة ${item.item_reference}` : '')}
                      </td>
                    </tr>
                  );
                })}

                {/* الصف الإجمالي الموحد مع الخلية الصفراء المميزة */}
                <tr className="border-2 border-black h-8" style={{ borderTop: '2px solid #000000' }}>
                  <td
                    colSpan={5}
                    className="border border-black p-1 text-center font-black text-sm tracking-widest bg-white"
                  >
                    الأجـــــــــــــــــمالـــــــــي
                  </td>
                  <td
                    colSpan={2}
                    className="border-2 border-black p-1 text-center font-mono font-black text-base bg-[#FFFF00] bg-yellow-total text-black"
                    style={{
                      backgroundColor: '#FFFF00',
                      border: '2px solid #000000',
                      WebkitPrintColorAdjust: 'exact',
                      printColorAdjust: 'exact',
                    }}
                  >
                    {formatCleanNumber(computedTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* PO Signatures Row */}
          <div className="flex items-center justify-between text-center px-12 pt-3 text-xs font-bold text-black">
            <div className="w-1/3">المشتريات</div>
            <div className="w-1/3">الحسابات</div>
            <div className="w-1/3">يعتمد &amp;</div>
          </div>
        </section>
      </div>
    );
  }
);

CombinedPrintTemplate.displayName = 'CombinedPrintTemplate';
