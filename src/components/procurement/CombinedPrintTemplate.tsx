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
  reviewerName?: string;
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
  accountantName?: string;

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
 * CombinedPrintTemplate (نموذج الطباعة المدمج الرسمي بالاعتمادات الرقمية وهندسة الشبكة)
 * ورقة A4 واحدة مقسومة أفقياً:
 * - ترويسة بنظام Grid من 3 أعمدة (شعار، عنوان ورقم المستند، بيانات وصفية جدولية).
 * - جدول بحدود واضحة وخلايا مدمجة ونظيفة بدون أصفار وهمية.
 * - إسقاط آلي لأسماء الأشخاص الفعليين بدلاً من مساحات التوقيع اليدوية الفارغة.
 * - فاصل متقطع بين النصفين: border-t-2 border-dashed border-gray-400 my-4.
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
      requesterName = 'م. كامل',
      reviewerName = 'م. كريم',
      qualityReviewerName = 'م. أحمد جودة',
      procurementReviewerName = 'م. أحمد بدوي',
      executiveApproverName = 'م. كريم',
      items = [],
      poNumber = '—',
      manualPoNumber,
      poDate,
      supplierName = '—',
      deliveryDate,
      accountantName = 'أ. حسن',
      grandTotal,
    } = props;

    const prDateFormatted = formatDate(prDate);
    const poDateFormatted = formatDate(poDate);

    // إعطاء الأولوية للترقيم اليدوي عند توفره
    const displayPrNumber = manualPrNumber?.trim() ? manualPrNumber.trim() : prNumber;
    const displayPoNumber = manualPoNumber?.trim() ? manualPoNumber.trim() : poNumber;

    // ضبط عدد الأسطر الثابت لملء النموذج بدقة متناهية (8 صفوف)
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
          {/* 1. هندسة الترويسة بنظام Grid من 3 أعمدة */}
          <div className="grid grid-cols-3 items-start gap-4 px-1">
            {/* العمود الأيمن (في RTL): الشعار Logo */}
            <div className="text-right">
              <div className="inline-block text-center">
                <img
                  src="/eshbelia-logo.png"
                  alt="شركة إشبيلية"
                  className="h-14 w-auto object-contain mx-auto"
                  onError={(e) => {
                    (e.currentTarget as HTMLElement).style.display = 'none';
                  }}
                />
                <div className="text-[9px] font-black text-amber-700 tracking-wider mt-0.5 leading-tight">
                  ISHBILIA
                  <br />
                  اشبيلية
                </div>
              </div>
            </div>

            {/* العمود الأوسط: العنوان ورقم المستند */}
            <div className="text-center self-center">
              <h1 className="text-2xl font-bold text-black tracking-wide font-sans">
                طلب شراء
              </h1>
              <div className="text-sm font-semibold text-gray-800 mt-1">
                رقم: <span className="font-mono font-bold">{displayPrNumber}</span>
              </div>
            </div>

            {/* العمود الأيسر: البيانات الوصفية الجدولية المفصولة */}
            <div className="text-right bg-slate-50/60 p-2 rounded border border-gray-200" dir="rtl">
              <div className="grid grid-cols-2 text-xs gap-y-1">
                <span className="font-bold text-gray-800">التاريخ:</span>
                <span className="font-mono text-left">{prDateFormatted}</span>
                <span className="font-bold text-gray-800">القسم:</span>
                <span className="truncate">{departmentName}</span>
                <span className="font-bold text-gray-800">المشروع:</span>
                <span className="truncate">{projectOrParcel}</span>
              </div>
            </div>
          </div>

          {/* 2. جدول طلب الشراء (تنظيف البيانات وإلغاء الأصفار الوهمية) */}
          <div className="mt-3">
            <table
              className="w-full border-collapse border border-black text-center text-xs"
              style={{ border: '1.5px solid #000000' }}
            >
              <thead>
                <tr className="bg-white text-black font-bold text-center h-8 border-b border-black">
                  <th className="border border-black p-2 w-10 text-center font-bold">م</th>
                  <th className="border border-black p-2 text-center font-bold">الصنف</th>
                  <th className="border border-black p-2 w-16 text-center font-bold">الوحدة</th>
                  <th className="border border-black p-2 w-16 text-center font-bold">الكمية</th>
                  <th className="border border-black p-2 w-28 text-center font-bold">تاريخ التوريد</th>
                  <th className="border border-black p-2 w-48 text-center font-bold">المواصفات الفنية</th>
                </tr>
              </thead>
              <tbody>
                {paddedItems.map((item, idx) => {
                  const hasData = Boolean(item.item_description);
                  return (
                    <tr key={`pr-row-${idx}`} className="h-[6.5mm] border border-black">
                      <td className="border border-black p-2 text-center font-mono font-bold">
                        {hasData ? idx + 1 : ''}
                      </td>
                      <td className="border border-black p-2 text-right font-bold text-black truncate max-w-[200px]">
                        {item.item_description || ''}
                      </td>
                      <td className="border border-black p-2 text-center">
                        {hasData ? getUnitLabel(item.uom || 'PCS') : ''}
                      </td>
                      <td className="border border-black p-2 text-center font-mono font-bold">
                        {hasData ? formatCleanQty(item.quantity) : ''}
                      </td>
                      <td className="border border-black p-2 text-center font-mono text-xs">
                        {hasData ? (item.delivery_date ? formatDate(item.delivery_date) : deliveryDate ? formatDate(deliveryDate) : '') : ''}
                      </td>
                      <td className="border border-black p-2 text-right text-xs text-black truncate max-w-[180px]">
                        {item.specifications || (hasData && item.item_reference ? `قطعة ${item.item_reference}` : '')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 3. الإسقاط الآلي للأسماء (Dynamic Signatures) - طلب الشراء */}
          <div className="flex justify-between items-center text-center px-12 mt-4">
            <div className="w-1/3">
              <span className="text-sm text-gray-600 block">مقدم الطلب</span>
              <span className="font-bold text-lg text-black mt-1 block">{requesterName || 'م. كامل'}</span>
            </div>
            <div className="w-1/3">
              <span className="text-sm text-gray-600 block">المراجع</span>
              <span className="font-bold text-lg text-black mt-1 block">{reviewerName || qualityReviewerName || 'م. كريم'}</span>
            </div>
            <div className="w-1/3">
              <span className="text-sm text-gray-600 block">المشتريات</span>
              <span className="font-bold text-lg text-black mt-1 block">{procurementReviewerName || 'م. أحمد بدوي'}</span>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            الفاصل: خط متقطع بين النصفين
           ══════════════════════════════════════════════════════════ */}
        <div className="border-t-2 border-dashed border-gray-400 my-4" />

        {/* ══════════════════════════════════════════════════════════
            النصف السفلي: أمر الشراء (ترويسة زرقاء وإجمالي أصفر)
           ══════════════════════════════════════════════════════════ */}
        <section className="flex flex-col justify-between flex-1 pt-1">
          {/* 1. هندسة الترويسة بنظام Grid من 3 أعمدة */}
          <div className="grid grid-cols-3 items-start gap-4 px-1">
            {/* العمود الأيمن (في RTL): الشعار Logo */}
            <div className="text-right">
              <div className="inline-block text-center">
                <img
                  src="/eshbelia-logo.png"
                  alt="شركة إشبيلية"
                  className="h-14 w-auto object-contain mx-auto"
                  onError={(e) => {
                    (e.currentTarget as HTMLElement).style.display = 'none';
                  }}
                />
                <div className="text-[9px] font-black text-amber-700 tracking-wider mt-0.5 leading-tight">
                  ISHBILIA
                  <br />
                  اشبيلية
                </div>
              </div>
            </div>

            {/* العمود الأوسط: العنوان ورقم المستند */}
            <div className="text-center self-center">
              <h1 className="text-2xl font-bold text-black tracking-wide font-sans">
                أمر شراء
              </h1>
              <div className="text-sm font-semibold text-gray-800 mt-1">
                رقم: <span className="font-mono font-bold">{displayPoNumber !== '—' ? displayPoNumber : displayPrNumber}</span>
              </div>
              {region && (
                <div className="text-xs font-semibold text-gray-600 mt-0.5">
                  مجاورة: {region}
                </div>
              )}
            </div>

            {/* العمود الأيسر: البيانات الوصفية الجدولية المفصولة */}
            <div className="text-right bg-slate-50/60 p-2 rounded border border-gray-200" dir="rtl">
              <div className="grid grid-cols-2 text-xs gap-y-1">
                <span className="font-bold text-gray-800">التاريخ:</span>
                <span className="font-mono text-left">{poDateFormatted}</span>
                <span className="font-bold text-gray-800">رقم الطلب:</span>
                <span className="font-mono text-left">{displayPrNumber}</span>
                <span className="font-bold text-gray-800">المشروع:</span>
                <span className="truncate">{projectOrParcel}</span>
                <span className="font-bold text-gray-800">غرض الشراء:</span>
                <span className="truncate">{purpose}</span>
              </div>
            </div>
          </div>

          {/* 2. جدول أمر الشراء (تنظيف البيانات وإلغاء الأصفار الوهمية) */}
          <div className="mt-3">
            <table
              className="w-full border-collapse border border-black text-center text-xs"
              style={{ border: '1.5px solid #000000' }}
            >
              <thead>
                <tr
                  className="bg-[#5B9BD5] bg-header-blue text-black font-bold text-center h-8 border-b border-black"
                  style={{
                    backgroundColor: '#5B9BD5',
                    WebkitPrintColorAdjust: 'exact',
                    printColorAdjust: 'exact',
                  }}
                >
                  <th className="border border-black p-2 w-10 text-center font-bold">م</th>
                  <th className="border border-black p-2 text-center font-bold">الصنف</th>
                  <th className="border border-black p-2 w-16 text-center font-bold">الوحدة</th>
                  <th className="border border-black p-2 w-16 text-center font-bold">الكمية</th>
                  <th className="border border-black p-2 w-20 text-center font-bold">السعر</th>
                  <th className="border border-black p-2 w-24 text-center font-bold">الإجمالي</th>
                  <th className="border border-black p-2 w-32 text-center font-bold">ملاحظات</th>
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
                      <td className="border border-black p-2 text-center font-mono font-bold">
                        {hasData ? idx + 1 : ''}
                      </td>
                      <td className="border border-black p-2 text-right font-bold text-black truncate max-w-[200px]">
                        {item.item_description || ''}
                      </td>
                      <td className="border border-black p-2 text-center">
                        {hasData ? getUnitLabel(item.uom || 'PCS') : ''}
                      </td>
                      <td className="border border-black p-2 text-center font-mono font-bold">
                        {hasData ? formatCleanQty(item.quantity) : ''}
                      </td>
                      <td className="border border-black p-2 text-center font-mono font-bold">
                        {hasData && price > 0 ? formatCleanNumber(price) : ''}
                      </td>
                      <td className="border border-black p-2 text-center font-mono font-bold">
                        {hasData && lineTotal > 0 ? formatCleanNumber(lineTotal) : ''}
                      </td>
                      <td className="border border-black p-2 text-center text-xs font-bold text-black truncate">
                        {idx === 0 && supplierName && supplierName !== '—'
                          ? `مورد / ${supplierName}`
                          : item.specifications || (hasData && item.item_reference ? `قطعة ${item.item_reference}` : '')}
                      </td>
                    </tr>
                  );
                })}

                {/* صف الإجمالي الموحد مع الخلية الصفراء المميزة */}
                <tr className="border-2 border-black h-8" style={{ borderTop: '2px solid #000000' }}>
                  <td
                    colSpan={5}
                    className="border border-black p-2 text-center font-black text-sm tracking-widest bg-white"
                  >
                    الأجـــــــــــــــــمالـــــــــي
                  </td>
                  <td
                    colSpan={2}
                    className="border-2 border-black p-2 text-center font-mono font-black text-base bg-[#FFFF00] bg-yellow-total text-black"
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

          {/* 3. الإسقاط الآلي للأسماء (Dynamic Signatures) - أمر الشراء */}
          <div className="flex justify-around items-center text-center px-20 mt-4">
            <div className="w-1/2">
              <span className="text-sm text-gray-600 block">المشتريات</span>
              <span className="font-bold text-lg text-black mt-1 block">{procurementReviewerName || 'م. أحمد بدوي'}</span>
            </div>
            <div className="w-1/2">
              <span className="text-sm text-gray-600 block">الحسابات</span>
              <span className="font-bold text-lg text-black mt-1 block">{accountantName || 'أ. حسن'}</span>
            </div>
          </div>
        </section>
      </div>
    );
  }
);

CombinedPrintTemplate.displayName = 'CombinedPrintTemplate';
