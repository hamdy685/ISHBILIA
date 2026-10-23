import React from 'react';
import { MaterialTransferRequest } from '../../types/materialTransfer';
import { formatCleanNumber } from '../../utils/numberFormat';

interface PrintableMaterialTransferProps {
  request: MaterialTransferRequest;
  onClose?: () => void;
}

export const PrintableMaterialTransfer: React.FC<PrintableMaterialTransferProps> = ({
  request,
  onClose,
}) => {
  const handlePrint = () => {
    window.print();
  };

  // Format date parts (e.g. 2026 / 10 / 23)
  const dateObj = request.transfer_date ? new Date(request.transfer_date) : new Date();
  const year = isNaN(dateObj.getFullYear()) ? '' : dateObj.getFullYear();
  const month = isNaN(dateObj.getMonth()) ? '' : String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = isNaN(dateObj.getDate()) ? '' : String(dateObj.getDate()).padStart(2, '0');

  // Fill up to 10 rows to match the official printed template form
  const totalRows = Math.max(10, request.items?.length || 0);
  const rows = Array.from({ length: totalRows }, (_, i) => {
    return request.items && request.items[i] ? request.items[i] : null;
  });

  return (
    <div className="printable-transfer-container" dir="rtl">
      {/* ── Action Toolbar (Hidden during print) ── */}
      <div className="print:hidden flex items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-4 rounded-2xl mb-6 shadow-xl">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📋</span>
          <div>
            <h3 className="text-base font-bold text-white">معاينة وطباعة نموذج طلب نقل الخامات</h3>
            <p className="text-xs text-slate-400">
              نموذج رسمي معتمد يطابق تصميم الاستمارة الورقية لإدارة المشروعات
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-emerald-900/30 transition-all cursor-pointer active:scale-95"
          >
            <span>🖨️</span>
            <span>طباعة النموذج (A4)</span>
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-medium text-sm rounded-xl transition-all cursor-pointer"
            >
              <span>✕</span>
              <span>إغلاق</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Official Printable Paper Layout (Matches the exact photo attached) ── */}
      <div className="official-transfer-sheet bg-white text-black p-6 sm:p-8 rounded-2xl border-2 border-slate-900 shadow-2xl max-w-4xl mx-auto font-sans print:p-2 print:border-none print:shadow-none print:max-w-none print:m-0">
        
        {/* Outer Border Frame */}
        <div className="border-2 border-slate-900 rounded-2xl p-4 sm:p-6 space-y-4">

          {/* 1. Header Row */}
          <div className="grid grid-cols-3 items-center gap-2">
            
            {/* Left Box: Request Number & Date */}
            <div className="flex flex-col gap-2">
              <div className="border-2 border-slate-800 rounded-xl px-3 py-1.5 text-center">
                <span className="text-xs font-bold text-slate-700 ml-1">#</span>
                <span className="text-sm font-black font-mono tracking-wider text-slate-900">
                  {request.request_number || '....................'}
                </span>
              </div>
              <div className="border-2 border-slate-800 rounded-xl px-2 py-1.5 text-center text-xs font-bold text-slate-800 flex items-center justify-center gap-1">
                <span>التاريخ :</span>
                <span className="font-mono text-slate-900 font-black">
                  {year} / {month} / {day}
                </span>
              </div>
            </div>

            {/* Center Box: Main Title */}
            <div className="flex justify-center">
              <div className="border-2 border-slate-900 rounded-2xl px-6 py-2.5 text-center bg-slate-50/50 shadow-sm w-full max-w-[260px]">
                <h1 className="text-xl sm:text-2xl font-black text-slate-950 tracking-tight leading-tight">
                  طلب نقل
                  <br />
                  خامات
                </h1>
                <p className="text-[10px] sm:text-[11px] font-black tracking-widest text-slate-800 mt-1 uppercase font-mono border-t border-slate-300 pt-1">
                  MATERIAL TRANSFER REQUEST
                </p>
              </div>
            </div>

            {/* Right: Department Name */}
            <div className="text-left rtl:text-right pr-2">
              <h2 className="text-lg sm:text-xl font-black text-slate-950 tracking-tight">
                إدارة المشروعات
              </h2>
            </div>
          </div>

          {/* Divider Line */}
          <div className="h-0.5 bg-slate-900 my-2" />

          {/* 2. From / To Project Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* From Project */}
            <div className="border-2 border-slate-900 rounded-xl p-3 flex items-center gap-2 bg-slate-50/30">
              <span className="text-sm font-black text-slate-900 shrink-0">○ من مشروع :</span>
              <span className="text-sm font-bold text-slate-950 underline decoration-slate-400 decoration-1 underline-offset-4 flex-1">
                {request.from_project || '................................................'}
              </span>
            </div>

            {/* To Project */}
            <div className="border-2 border-slate-900 rounded-xl p-3 flex items-center gap-2 bg-slate-50/30">
              <span className="text-sm font-black text-slate-900 shrink-0">● إلى مشروع :</span>
              <span className="text-sm font-bold text-slate-950 underline decoration-slate-400 decoration-1 underline-offset-4 flex-1">
                {request.to_project || '................................................'}
              </span>
            </div>
          </div>

          {/* 3. Items Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border-2 border-slate-900 text-center text-xs">
              <thead>
                <tr className="border-b-2 border-slate-900 bg-slate-100">
                  <th className="border-l-2 border-slate-900 py-2.5 px-2 w-12 font-black text-slate-900 text-sm">
                    م
                  </th>
                  <th className="border-l-2 border-slate-900 py-2.5 px-3 font-black text-slate-900 text-sm">
                    نوع الخامة / بيان الصنف
                  </th>
                  <th className="border-l-2 border-slate-900 py-2.5 px-2 w-24 font-black text-slate-900 text-sm">
                    الوحدة
                  </th>
                  <th className="border-l-2 border-slate-900 py-2.5 px-2 w-28 font-black text-slate-900 text-sm">
                    العدد / الكمية
                  </th>
                  <th className="py-2.5 px-3 font-black text-slate-900 text-sm w-44">
                    ملاحظات / حالة الخامة
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const seq = idx + 1;
                  return (
                    <tr
                      key={seq}
                      className="border-b border-slate-800 hover:bg-slate-50 transition-colors h-9"
                    >
                      {/* Seq Number */}
                      <td className="border-l-2 border-slate-900 font-bold text-slate-900 text-sm">
                        {seq}
                      </td>

                      {/* Description */}
                      <td className="border-l-2 border-slate-900 px-3 text-right font-bold text-slate-900">
                        {row ? (
                          row.item_description
                        ) : (
                          <span className="text-slate-300 font-light select-none">....................................................................</span>
                        )}
                      </td>

                      {/* UOM */}
                      <td className="border-l-2 border-slate-900 px-2 font-bold text-slate-800">
                        {row ? (
                          row.uom
                        ) : (
                          <span className="text-slate-300 font-light select-none">..................</span>
                        )}
                      </td>

                      {/* Quantity */}
                      <td className="border-l-2 border-slate-900 px-2 font-mono font-black text-slate-950 text-sm">
                        {row ? (
                          formatCleanNumber(row.quantity)
                        ) : (
                          <span className="text-slate-300 font-light select-none">....................</span>
                        )}
                      </td>

                      {/* Notes / Condition */}
                      <td className="px-3 text-right text-xs text-slate-700">
                        {row ? (
                          row.notes || '-'
                        ) : (
                          <span className="text-slate-300 font-light select-none">........................................</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 4. Bottom Box: Driver & Vehicle Plate Info */}
          <div className="border-2 border-slate-900 rounded-xl p-3.5 bg-slate-50/30 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Driver Name */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-slate-900 shrink-0">
                اسم السائق / الناقل :
              </span>
              <span className="text-sm font-bold text-slate-950 underline decoration-slate-400 decoration-1 underline-offset-4 flex-1">
                {request.driver_name || '...................................................'}
              </span>
            </div>

            {/* Vehicle Plate / Equipment */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-slate-900 shrink-0">
                رقم السيارة / المعدة :
              </span>
              <span className="text-sm font-bold font-mono text-slate-950 underline decoration-slate-400 decoration-1 underline-offset-4 flex-1">
                {request.vehicle_plate_number || '...................................................'}
              </span>
            </div>
          </div>

          {/* 5. Field Signatures & Handover Acknowledgements */}
          <div className="border-2 border-slate-900 rounded-xl p-3 grid grid-cols-3 gap-3 text-center bg-slate-50/20">
            <div className="border-l-2 border-slate-900 pl-2">
              <span className="text-xs font-black block text-slate-900 mb-1">
                مسؤول الإفراج والتحميل
              </span>
              <p className="text-[10px] text-slate-600 mb-6">(مشروع المنقول منه)</p>
              <div className="border-t border-dashed border-slate-400 pt-1 text-[11px] text-slate-700">
                الاسم والتوقيع: ..........................
              </div>
            </div>

            <div className="border-l-2 border-slate-900 px-2">
              <span className="text-xs font-black block text-slate-900 mb-1">
                السائق المستلم
              </span>
              <p className="text-[10px] text-slate-600 mb-6">(مسؤول النقل والتوصيل)</p>
              <div className="border-t border-dashed border-slate-400 pt-1 text-[11px] text-slate-700">
                الاسم والتوقيع: ..........................
              </div>
            </div>

            <div className="pr-2">
              <span className="text-xs font-black block text-slate-900 mb-1">
                مسؤول الاستلام بالموقع
              </span>
              <p className="text-[10px] text-slate-600 mb-6">(مشروع المنقول إليه)</p>
              <div className="border-t border-dashed border-slate-400 pt-1 text-[11px] text-slate-700">
                الاسم والتوقيع: ..........................
              </div>
            </div>
          </div>

          {/* 6. Audit & Tracking Stamp (Digital Lifecycle Certification) */}
          <div className="border-t border-slate-300 pt-3 text-[11px] text-slate-600 grid grid-cols-3 gap-2">
            <div>
              <span className="font-bold block text-slate-800">✍️ مقدم الطلب:</span>
              <span className="font-semibold text-slate-950">{request.user?.name || 'غير محدد'}</span>
              <span className="block text-[10px] text-slate-500 font-mono">
                {request.created_at ? new Date(request.created_at).toLocaleString('ar-EG') : ''}
              </span>
            </div>

            <div>
              <span className="font-bold block text-slate-800">✅ المراجع المعتمد:</span>
              <span className="font-semibold text-slate-950">
                {request.reviewer?.name || (request.status === 'PENDING_REVIEWER' ? 'بانتظار المراجعة' : 'اعتماد تلقائي')}
              </span>
              <span className="block text-[10px] text-slate-500 font-mono">
                {request.reviewed_at ? new Date(request.reviewed_at).toLocaleString('ar-EG') : '-'}
              </span>
            </div>

            <div>
              <span className="font-bold block text-slate-800">📂 الحسابات والأرشفة:</span>
              <span className="font-semibold text-slate-950">
                {request.accountant?.name || (request.status === 'ARCHIVED' ? 'معتمد ومؤرشف' : 'بانتظار الحسابات')}
              </span>
              <span className="block text-[10px] text-slate-500 font-mono">
                {request.accounted_at ? new Date(request.accounted_at).toLocaleString('ar-EG') : '-'}
              </span>
            </div>
          </div>

          {request.accounting_notes && (
            <div className="bg-amber-50 border border-amber-300 rounded-lg p-2 text-xs text-amber-950">
              <span className="font-black">ملاحظات والتوجيه المحاسبي: </span>
              <span>{request.accounting_notes}</span>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
