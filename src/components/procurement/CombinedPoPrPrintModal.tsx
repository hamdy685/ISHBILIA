import React from 'react';
import { createPortal } from 'react-dom';
import { printDocumentOnly } from '../../utils/print';
import { formatCleanNumber } from '../../utils/numberFormat';
import { tafqeetCurrency } from '../../utils/tafqeet';
import { getUnitLabel } from '../../utils/units';

export interface CombinedPrintItem {
  id?: number;
  item_description: string;
  item_reference?: string;
  region?: string;
  quantity: number | string;
  uom?: string;
  unit_price: number | string;
  specifications?: string;
}

export interface CombinedPrintData {
  // PR Context
  prId?: number;
  prNumber: string;
  manualPrNumber?: string | null;
  prDate?: string | null;
  requesterName?: string;
  departmentName?: string;
  reviewerName?: string;
  executiveApproverName?: string;
  projectOrParcel?: string;
  region?: string;
  dateNeeded?: string;
  prNotes?: string;

  // PO Context
  poNumber: string;
  manualPoNumber?: string | null;
  poDate?: string | null;
  supplierName: string;
  supplierPhone?: string;
  supplierTaxNumber?: string;
  paymentTerms?: string;
  deliveryTerms?: string;
  deliveryDate?: string;
  poNotes?: string;
  items: CombinedPrintItem[];
  grandTotal: number;
}

interface CombinedPoPrPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: CombinedPrintData;
}

const formatDate = (value?: string | null) => {
  if (!value) return new Date().toLocaleDateString('ar-EG');
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('ar-EG');
};

export const CombinedPoPrPrintModal: React.FC<CombinedPoPrPrintModalProps> = ({
  isOpen,
  onClose,
  data,
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

  if (!isOpen) return null;

  const handlePrint = () => {
    printDocumentOnly('.combined-print-container .print-document', {
      title: `مستند_مدمج_${data.poNumber || data.prNumber}`,
      orientation: 'portrait',
    });
  };

  const handleShareWhatsApp = () => {
    const textLines = [
      '🏢 *شركة إشبيلية للتطوير العقاري والمقاولات*',
      '📄 *مستند مدمج: طلب شراء + أمر شراء معتمد*',
      '─────────────────────────',
      `📝 *طلب الشراء:* ${data.prNumber} ${data.manualPrNumber ? `(يدوي: ${data.manualPrNumber})` : ''}`,
      `📑 *أمر الشراء:* ${data.poNumber} ${data.manualPoNumber ? `(يدوي: ${data.manualPoNumber})` : ''}`,
      `👤 *مقدم الطلب:* ${data.requesterName || '—'}`,
      `🏢 *القسم:* ${data.departmentName || '—'}`,
      `✅ *المراجع:* ${data.reviewerName || '—'}`,
      `👔 *الاعتماد الإداري:* ${data.executiveApproverName || 'المدير التنفيذي'}`,
      `🏬 *المورد:* ${data.supplierName || '—'}`,
      `📍 *المشروع / القطعة:* ${data.projectOrParcel || '—'} ${data.region ? `(${data.region})` : ''}`,
      `💰 *إجمالي أمر الشراء:* ${formatCleanNumber(data.grandTotal)} ج.م`,
      `💵 *المبلغ كتابة:* ${tafqeetCurrency(data.grandTotal)}`,
      '─────────────────────────',
      '📌 تم اعتماد وتأكيد الدورة المستندية الرسمية (طلب شراء + أمر شراء تجاري دون إذن استلام).',
    ];

    const shareUrl = `https://wa.me/?text=${encodeURIComponent(textLines.join('\n'))}`;
    window.open(shareUrl, '_blank');
  };

  return createPortal(
    <div
      className="combined-print-container fixed inset-0 z-[9999] flex min-h-screen items-center justify-center overflow-y-auto bg-slate-950/85 p-4 sm:p-6 backdrop-blur-sm print:static print:block print:bg-white"
      dir="rtl"
    >
      <div className="flex min-h-0 max-h-[calc(100dvh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl sm:max-h-[calc(100dvh-3rem)] print:block print:max-w-none print:max-h-none print:border-none print:shadow-none">
        
        {/* Header Controls (Screen only) */}
        <div className="print:hidden flex items-center justify-between gap-3 border-b border-slate-700 bg-slate-800 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">📑</span>
            <div>
              <h2 className="font-black text-slate-100 text-sm sm:text-base">
                معاينة وطباعة المستند المدمج (طلب الشراء + أمر الشراء)
              </h2>
              <p className="text-[11px] text-slate-400">
                مستند ثنائي الصفحات معتمد رسميًا دون إذن الاستلام بالموقع
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-emerald-950/40 transition active:scale-95"
            >
              <span>📱</span>
              <span>إرسال واتساب</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 px-4 py-2 text-xs font-bold text-white shadow-md shadow-cyan-950/40 transition active:scale-95"
            >
              <span>🖨️</span>
              <span>طباعة المستند</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-600 bg-slate-700 text-xl font-black text-white hover:bg-slate-600 transition"
              title="إغلاق"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Printable Document Body */}
        <div className="flex-1 overflow-y-auto bg-slate-900 p-4 sm:p-6 print:overflow-visible print:bg-white print:p-0">
          <div className="print-document mx-auto max-w-4xl bg-white text-black print:max-w-none print:p-0">
            
            {/* ════════════════════════════════════════════════════════════
                PAGE 1: طلب الشراء المعتمد (APPROVED PURCHASE REQUEST)
               ════════════════════════════════════════════════════════════ */}
            <section
              className="p-6 sm:p-8 bg-white text-black min-h-[270mm] flex flex-col justify-between"
              style={{ pageBreakAfter: 'always', breakAfter: 'page' }}
            >
              <div>
                {/* Official Letterhead */}
                <div className="border-b-2 border-black pb-3 mb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="text-right flex items-center gap-3">
                      <img
                        src="/eshbelia-logo.png"
                        alt="شعار شركة إشبيلية"
                        className="h-16 w-auto object-contain"
                        onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                      />
                      <div className="text-[11px] leading-snug">
                        <div className="font-black text-base text-black">شركة إشبيلية</div>
                        <div className="text-[10px] text-slate-800 font-bold">للتطوير العقاري والمقاولات</div>
                        <div className="text-[9px] text-slate-600">إدارة المشروعات والتنفيذ والمشتريات</div>
                      </div>
                    </div>

                    <div className="text-center self-center">
                      <div className="inline-block border-2 border-black bg-slate-100 px-4 py-1.5 rounded-lg shadow-sm">
                        <h1 className="text-lg font-black text-black">طلب شراء مواد / أعمال</h1>
                        <div className="text-[11px] font-bold text-slate-700">Purchase Requisition</div>
                      </div>
                      <div className="text-xs font-mono font-black text-black mt-1.5" dir="ltr">
                        {data.prNumber}
                        {data.manualPrNumber && (
                          <span className="text-[11px] font-sans font-bold text-slate-800 mr-2">
                            (يدوي: {data.manualPrNumber})
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-left text-xs font-bold text-black space-y-1" dir="rtl">
                      <div><strong>التاريخ:</strong> <span className="font-mono">{formatDate(data.prDate)}</span></div>
                      <div><strong>القسم:</strong> <span>{data.departmentName || '—'}</span></div>
                      <div><strong>تاريخ الاحتياج:</strong> <span className="font-mono">{data.dateNeeded || '—'}</span></div>
                    </div>
                  </div>
                </div>

                {/* PR Context Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-lg border border-black bg-slate-50 text-xs mb-4">
                  <div>
                    <span className="text-slate-600 block text-[10px] font-semibold">مقدم الطلب:</span>
                    <span className="font-bold text-black">{data.requesterName || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-600 block text-[10px] font-semibold">المشروع / قطعة الأرض:</span>
                    <span className="font-mono font-bold text-black">{data.projectOrParcel || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-600 block text-[10px] font-semibold">المنطقة / الموقع:</span>
                    <span className="font-bold text-black">{data.region || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-600 block text-[10px] font-semibold">حالة الاعتماد:</span>
                    <span className="font-bold text-emerald-800">معتمد تنفيذيًا ✅</span>
                  </div>
                </div>

                {/* PR Items Table */}
                <div className="mb-4">
                  <table className="w-full border-collapse border border-black text-xs text-right">
                    <thead>
                      <tr className="bg-slate-200 text-black font-black border-b border-black">
                        <th className="border border-black p-2 text-center w-10">م</th>
                        <th className="border border-black p-2">بيان الصنف والمواصفات الفنية</th>
                        <th className="border border-black p-2 text-center w-28">رقم القطعة / المشروع</th>
                        <th className="border border-black p-2 text-center w-20">الكمية</th>
                        <th className="border border-black p-2 text-center w-20">الوحدة</th>
                        <th className="border border-black p-2 text-center w-28">السعر التقديري</th>
                        <th className="border border-black p-2 text-center w-28">الإجمالي التقديري</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((item, idx) => {
                        const qty = Number(item.quantity) || 0;
                        const price = Number(item.unit_price) || 0;
                        const total = qty * price;
                        return (
                          <tr key={idx} className="border-b border-black">
                            <td className="border border-black p-2 text-center font-mono font-bold">{idx + 1}</td>
                            <td className="border border-black p-2 font-bold">
                              <div>{item.item_description}</div>
                              {item.specifications && (
                                <div className="text-[10px] text-slate-600 font-normal mt-0.5">{item.specifications}</div>
                              )}
                            </td>
                            <td className="border border-black p-2 text-center font-mono font-semibold">
                              {item.item_reference || data.projectOrParcel || '—'}
                            </td>
                            <td className="border border-black p-2 text-center font-mono font-black">{qty}</td>
                            <td className="border border-black p-2 text-center font-bold">{getUnitLabel(item.uom)}</td>
                            <td className="border border-black p-2 text-center font-mono">{formatCleanNumber(price)}</td>
                            <td className="border border-black p-2 text-center font-mono font-bold">{formatCleanNumber(total)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* PR Notes if any */}
                {data.prNotes && (
                  <div className="border border-black rounded-lg p-2.5 bg-slate-50 text-xs mb-4">
                    <strong className="text-black block mb-0.5">ملاحظات ومبررات طلب الشراء:</strong>
                    <div className="text-slate-800 whitespace-pre-wrap">{data.prNotes}</div>
                  </div>
                )}
              </div>

              {/* Signatures & Cycle Decision Box for PR */}
              <div className="border-2 border-black rounded-xl p-4 bg-slate-50 mt-4">
                <div className="text-xs font-black text-black border-b border-black pb-1.5 mb-3 flex items-center justify-between">
                  <span>سجل الاعتمادات والتوقيعات الرسمية لدورة طلب الشراء:</span>
                  <span className="text-[10px] font-normal text-slate-600">صفحة 1 من 2 (طلب الشراء)</span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-xs text-center">
                  <div className="border-l border-slate-400 pl-2">
                    <div className="font-bold text-slate-700 text-[11px] mb-1">مقدم الطلب (المهندس)</div>
                    <div className="font-black text-black text-sm my-1">{data.requesterName || '—'}</div>
                    <div className="text-[10px] text-slate-500 font-mono">التوقيع: معتمد إلكترونياً</div>
                  </div>
                  <div className="border-l border-slate-400 pl-2">
                    <div className="font-bold text-slate-700 text-[11px] mb-1">مراجع / رئيس القسم</div>
                    <div className="font-black text-black text-sm my-1">{data.reviewerName || '—'}</div>
                    <div className="text-[10px] text-slate-500 font-mono">التوقيع: تم الفحص والاعتماد</div>
                  </div>
                  <div>
                    <div className="font-bold text-emerald-800 text-[11px] mb-1">المدير المباشر / المدير التنفيذي</div>
                    <div className="font-black text-emerald-950 text-sm my-1">{data.executiveApproverName || 'المهندس محمد عبدالكريم'}</div>
                    <div className="text-[10px] text-emerald-700 font-bold">القرار: موافقة واعتماد نهائي ✅</div>
                  </div>
                </div>
              </div>
            </section>

            {/* ════════════════════════════════════════════════════════════
                PAGE 2: أمر الشراء التجاري (COMMERCIAL PURCHASE ORDER)
               ════════════════════════════════════════════════════════════ */}
            <section className="p-6 sm:p-8 bg-white text-black min-h-[270mm] flex flex-col justify-between">
              <div>
                {/* PO Header */}
                <div className="border-b-2 border-black pb-3 mb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="text-right flex items-center gap-3">
                      <img
                        src="/eshbelia-logo.png"
                        alt="شعار شركة إشبيلية"
                        className="h-16 w-auto object-contain"
                        onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                      />
                      <div className="text-[11px] leading-snug">
                        <div className="font-black text-base text-black">شركة إشبيلية</div>
                        <div className="text-[10px] text-slate-800 font-bold">للتطوير العقاري والمقاولات</div>
                        <div className="text-[9px] text-slate-600">إدارة التوريدات والمشتريات المركزية</div>
                      </div>
                    </div>

                    <div className="text-center self-center">
                      <div className="inline-block border-2 border-black bg-cyan-50 px-5 py-1.5 rounded-lg shadow-sm">
                        <h1 className="text-lg font-black text-black">أمر شراء تجاري معتمد</h1>
                        <div className="text-[11px] font-bold text-slate-700">Official Purchase Order</div>
                      </div>
                      <div className="text-xs font-mono font-black text-cyan-950 mt-1.5" dir="ltr">
                        {data.poNumber}
                        {data.manualPoNumber && (
                          <span className="text-[11px] font-sans font-bold text-slate-800 mr-2">
                            (يدوي: {data.manualPoNumber})
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-left text-xs font-bold text-black space-y-1" dir="rtl">
                      <div><strong>تاريخ الأمر:</strong> <span className="font-mono">{formatDate(data.poDate)}</span></div>
                      <div><strong>مرجع طلب الشراء:</strong> <span className="font-mono">{data.prNumber}</span></div>
                      <div><strong>موعد التوريد:</strong> <span className="font-mono">{data.deliveryDate || '—'}</span></div>
                    </div>
                  </div>
                </div>

                {/* PO Commercial Info Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-lg border border-black bg-slate-50 text-xs mb-4">
                  <div>
                    <span className="text-slate-600 block text-[10px] font-semibold">السادة المورد:</span>
                    <span className="font-black text-black text-sm">{data.supplierName || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-600 block text-[10px] font-semibold">شروط الدفع:</span>
                    <span className="font-bold text-black">{data.paymentTerms || 'دفع عند الاستلام'}</span>
                  </div>
                  <div>
                    <span className="text-slate-600 block text-[10px] font-semibold">مكان وشروط التسليم:</span>
                    <span className="font-bold text-black">{data.deliveryTerms || 'بالموقع'}</span>
                  </div>
                  <div>
                    <span className="text-slate-600 block text-[10px] font-semibold">صاحب المعاملة:</span>
                    <span className="font-bold text-black">{data.requesterName || '—'}</span>
                  </div>
                </div>

                {/* PO Items Table */}
                <div className="mb-4">
                  <table className="w-full border-collapse border border-black text-xs text-right">
                    <thead>
                      <tr className="bg-slate-200 text-black font-black border-b border-black">
                        <th className="border border-black p-2 text-center w-10">م</th>
                        <th className="border border-black p-2">بيان الصنف والمواصفات المعتمدة للتوريد</th>
                        <th className="border border-black p-2 text-center w-28">قطعة الأرض / الموقع</th>
                        <th className="border border-black p-2 text-center w-20">الكمية</th>
                        <th className="border border-black p-2 text-center w-20">الوحدة</th>
                        <th className="border border-black p-2 text-center w-28">سعر الوحدة (ج.م)</th>
                        <th className="border border-black p-2 text-center w-28">إجمالي القيمة (ج.م)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((item, idx) => {
                        const qty = Number(item.quantity) || 0;
                        const price = Number(item.unit_price) || 0;
                        const total = qty * price;
                        return (
                          <tr key={idx} className="border-b border-black">
                            <td className="border border-black p-2 text-center font-mono font-bold">{idx + 1}</td>
                            <td className="border border-black p-2 font-bold">
                              <div>{item.item_description}</div>
                              {item.specifications && (
                                <div className="text-[10px] text-slate-600 font-normal mt-0.5">{item.specifications}</div>
                              )}
                            </td>
                            <td className="border border-black p-2 text-center font-mono font-semibold">
                              {item.item_reference || data.projectOrParcel || '—'}
                            </td>
                            <td className="border border-black p-2 text-center font-mono font-black">{qty}</td>
                            <td className="border border-black p-2 text-center font-bold">{getUnitLabel(item.uom)}</td>
                            <td className="border border-black p-2 text-center font-mono font-semibold">{formatCleanNumber(price)}</td>
                            <td className="border border-black p-2 text-center font-mono font-black">{formatCleanNumber(total)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-100 border-t-2 border-black font-black">
                        <td colSpan={5} className="border border-black p-2 text-left pl-4 font-bold text-xs">
                          إجمالي قيمة أمر الشراء (بالجنيه المصري EGP):
                        </td>
                        <td colSpan={2} className="border border-black p-2 text-center font-mono text-base font-black text-black">
                          {formatCleanNumber(data.grandTotal)} ج.م
                        </td>
                      </tr>
                      <tr className="bg-slate-50 border-t border-black">
                        <td colSpan={7} className="border border-black p-2 text-right text-xs font-bold text-slate-800">
                          <span className="text-slate-600 font-normal ml-2">المبلغ بالحروف:</span>
                          <span>{tafqeetCurrency(data.grandTotal)}</span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* PO Notes */}
                {data.poNotes && (
                  <div className="border border-black rounded-lg p-2.5 bg-slate-50 text-xs mb-4">
                    <strong className="text-black block mb-0.5">تعليمات وملاحظات التوريد:</strong>
                    <div className="text-slate-800 whitespace-pre-wrap">{data.poNotes}</div>
                  </div>
                )}
              </div>

              {/* Official PO Authorization Signatures */}
              <div className="border-2 border-black rounded-xl p-4 bg-slate-50 mt-4">
                <div className="text-xs font-black text-black border-b border-black pb-1.5 mb-3 flex items-center justify-between">
                  <span>التوقيعات والاعتمادات التجارية الرسمية لأمر الشراء:</span>
                  <span className="text-[10px] font-normal text-slate-600">صفحة 2 من 2 (أمر الشراء التجاري)</span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-xs text-center">
                  <div className="border-l border-slate-400 pl-2">
                    <div className="font-bold text-slate-700 text-[11px] mb-1">إدارة المشتريات والتوريدات</div>
                    <div className="font-black text-black text-sm my-1">م. أحمد بدوي</div>
                    <div className="text-[10px] text-slate-500 font-mono">الإصدار: تم إصدار الأمر تجاريًا</div>
                  </div>
                  <div className="border-l border-slate-400 pl-2">
                    <div className="font-bold text-slate-700 text-[11px] mb-1">المراجعة والمطابقة المالية</div>
                    <div className="font-black text-black text-sm my-1">الإدارة المالية / الحسابات</div>
                    <div className="text-[10px] text-slate-500 font-mono">التأكيد: مراجع ماليًا</div>
                  </div>
                  <div>
                    <div className="font-bold text-emerald-800 text-[11px] mb-1">الاعتماد الإداري والتنفيذي</div>
                    <div className="font-black text-emerald-950 text-sm my-1">{data.executiveApproverName || 'المهندس محمد عبدالكريم'}</div>
                    <div className="text-[10px] text-emerald-700 font-bold">القرار: معتمد للتوريد والتشغيل ✅</div>
                  </div>
                </div>
              </div>
            </section>

          </div>
        </div>

      </div>
    </div>,
    document.body
  );
};

export default CombinedPoPrPrintModal;
