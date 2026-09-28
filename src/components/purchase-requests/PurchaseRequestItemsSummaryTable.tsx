import React from 'react';
import { PurchaseRequestItemFormInput, PurchaseRequestType } from '../../types/purchaseRequest';
import { getUnitLabel } from '../../utils/units';
import { formatCleanQty } from '../../utils/numberFormat';

interface Props {
  items: PurchaseRequestItemFormInput[];
  requestType?: PurchaseRequestType;
  parcelReference?: string;
  region?: string;
  onRemoveItem?: (index: number) => void;
  onScrollToItem?: (index: number) => void;
  className?: string;
}

export const PurchaseRequestItemsSummaryTable: React.FC<Props> = ({
  items,
  requestType = 'PROJECT',
  parcelReference,
  region,
  onRemoveItem,
  onScrollToItem,
  className = '',
}) => {
  const isOffice = requestType === 'OFFICE_SUPPLIES';

  // Calculate totals
  const totalItemsCount = items.length;
  const totalQuantity = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

  // Check validity
  const validItemsCount = items.filter((item) => {
    const hasDesc = Boolean(item.item_description?.trim());
    const hasQty = (Number(item.quantity) || 0) > 0;
    const effParcel = item.item_reference?.trim() || parcelReference?.trim();
    const effRegion = item.region?.trim() || region?.trim();
    if (isOffice) return hasDesc && hasQty;
    return hasDesc && hasQty && Boolean(effParcel) && Boolean(effRegion);
  }).length;

  const isAllValid = totalItemsCount > 0 && validItemsCount === totalItemsCount;

  return (
    <div
      className={`rounded-2xl border border-cyan-900/40 bg-slate-900/95 p-3.5 sm:p-5 md:p-6 shadow-2xl backdrop-blur-sm space-y-4 ${className}`}
      dir="rtl"
    >
      {/* Header bar */}
      <div className="flex flex-col gap-3 border-b border-slate-800 pb-3 sm:pb-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 text-sm shrink-0">
            📊
          </span>
          <div>
            <h3 className="text-sm sm:text-base font-black text-slate-100 leading-tight">
              جدول مراجعة وملخص البنود المضافة
            </h3>
          </div>
        </div>

        {/* Stats Badges - Responsive Grid */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border border-slate-700/80 bg-slate-950/80 p-2 shadow-inner">
            <span className="block text-[10px] text-slate-400 font-bold truncate">عدد البنود</span>
            <span className="font-mono text-xs sm:text-sm font-black text-cyan-300">{totalItemsCount} صنف</span>
          </div>

          <div className="rounded-xl border border-slate-700/80 bg-slate-950/80 p-2 shadow-inner">
            <span className="block text-[10px] text-slate-400 font-bold truncate">إجمالي الكميات</span>
            <span className="font-mono text-xs sm:text-sm font-black text-amber-300">
              {formatCleanQty(totalQuantity)}
            </span>
          </div>

          <div className={`rounded-xl border p-2 shadow-inner ${
            isAllValid
              ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300'
              : 'border-amber-500/40 bg-amber-950/40 text-amber-300'
          }`}>
            <span className="block text-[10px] opacity-80 font-bold truncate">حالة البيانات</span>
            <span className="text-[11px] sm:text-xs font-black truncate flex items-center justify-center gap-1">
              {isAllValid ? '✅ مكتمل' : `⚠️ ${validItemsCount}/${totalItemsCount}`}
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      {items.length === 0 ? (
        <div className="text-center py-6 text-slate-400 text-xs bg-slate-950/50 rounded-xl border border-dashed border-slate-800">
          لم يتم إضافة أي بنود بعد.
        </div>
      ) : (
        <>
          {/* ========================================================= */}
          {/* 1. MOBILE VIEW (Cards Layout - Perfect for phones)        */}
          {/* ========================================================= */}
          <div className="space-y-3 block md:hidden">
            {items.map((item, index) => {
              const effParcel = item.item_reference?.trim() || parcelReference?.trim();
              const effRegion = item.region?.trim() || region?.trim();
              const isItemValid =
                Boolean(item.item_description?.trim()) &&
                (Number(item.quantity) || 0) > 0 &&
                (isOffice || (Boolean(effParcel) && Boolean(effRegion)));

              return (
                <div
                  key={index}
                  className={`rounded-xl border p-3.5 space-y-2.5 shadow-md transition-all ${
                    !isItemValid
                      ? 'border-amber-600/50 bg-amber-950/20'
                      : 'border-slate-800 bg-slate-950/80'
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2 border-b border-slate-800/80 pb-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-950 text-cyan-300 border border-cyan-700 text-[10px] font-mono font-bold mt-0.5">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-slate-100 break-words">
                          {item.item_description?.trim() ? (
                            item.item_description
                          ) : (
                            <span className="text-rose-400 italic">⚠️ بدون اسم صنف</span>
                          )}
                        </div>
                        {item.specifications?.trim() && (
                          <p className="text-[11px] text-slate-400 mt-0.5 break-words">
                            المواصفات: {item.specifications}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 text-left">
                      <span className="inline-block rounded-lg bg-amber-500/15 border border-amber-500/40 px-2.5 py-1 font-mono font-black text-amber-300 text-xs">
                        {item.quantity !== undefined && item.quantity !== null && item.quantity !== ('' as any)
                          ? item.quantity
                          : 0}{' '}
                        <span className="text-[10px] font-normal text-amber-200">
                          {getUnitLabel(item.uom || 'PCS')}
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* Card Details Grid */}
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-lg bg-slate-900/90 border border-slate-800 px-2.5 py-1.5 flex flex-col">
                      <span className="text-[10px] text-slate-400">
                        {isOffice ? 'مكان الاستلام' : 'قطعة الأرض'}
                      </span>
                      <strong className="font-mono text-cyan-300 font-bold truncate mt-0.5">
                        {effParcel
                          ? effParcel
                          : isOffice
                          ? 'مقر الشركة'
                          : '⚠️ غير محدد'}
                      </strong>
                    </div>

                    <div className="rounded-lg bg-slate-900/90 border border-slate-800 px-2.5 py-1.5 flex flex-col">
                      <span className="text-[10px] text-slate-400">المنطقة</span>
                      <strong className="text-slate-200 font-medium truncate mt-0.5">
                        {effRegion
                          ? effRegion
                          : isOffice
                          ? 'إداري'
                          : '⚠️ غير محددة'}
                      </strong>
                    </div>
                  </div>

                  {/* Card Action Buttons */}
                  {(onRemoveItem || onScrollToItem) && (
                    <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-800/60">
                      {onScrollToItem && (
                        <button
                          type="button"
                          onClick={() => onScrollToItem(index)}
                          className="flex items-center gap-1 text-[11px] font-bold text-cyan-400 hover:text-cyan-300 bg-cyan-950/40 border border-cyan-800/40 rounded-lg px-2.5 py-1"
                        >
                          ✏️ تعديل
                        </button>
                      )}
                      {onRemoveItem && items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => onRemoveItem(index)}
                          className="flex items-center gap-1 text-[11px] font-bold text-rose-400 hover:text-rose-300 bg-rose-950/40 border border-rose-800/40 rounded-lg px-2.5 py-1"
                        >
                          🗑️ حذف
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Mobile Summary footer */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3 flex items-center justify-between text-xs font-bold text-slate-300">
              <span>إجمالي بنود الطلب ({totalItemsCount}):</span>
              <span className="font-mono text-amber-300">
                مجموع الكميات: {formatCleanQty(totalQuantity)}
              </span>
            </div>
          </div>

          {/* ========================================================= */}
          {/* 2. TABLET & DESKTOP VIEW (Standard Horizontal Table)      */}
          {/* ========================================================= */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/70 shadow-inner">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900/90 text-slate-300 border-b border-slate-800 whitespace-nowrap">
                  <th className="px-3 py-2.5 font-bold text-center w-12">#</th>
                  <th className="px-3.5 py-2.5 font-bold min-w-[180px]">الصنف / المادة المطلوبة</th>
                  <th className="px-3 py-2.5 font-bold min-w-[140px]">المواصفات الفنية</th>
                  <th className="px-3 py-2.5 font-bold min-w-[110px]">
                    {isOffice ? 'مقر / مكتب الاستلام' : 'رقم قطعة الأرض'}
                  </th>
                  <th className="px-3 py-2.5 font-bold min-w-[110px]">المنطقة</th>
                  <th className="px-3 py-2.5 font-bold text-center min-w-[90px]">الكمية</th>
                  <th className="px-3 py-2.5 font-bold text-center min-w-[80px]">الوحدة</th>
                  {(onRemoveItem || onScrollToItem) && (
                    <th className="px-3 py-2.5 font-bold text-center w-24">إجراءات</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {items.map((item, index) => {
                  const effParcel = item.item_reference?.trim() || parcelReference?.trim();
                  const effRegion = item.region?.trim() || region?.trim();
                  const isItemValid =
                    Boolean(item.item_description?.trim()) &&
                    (Number(item.quantity) || 0) > 0 &&
                    (isOffice || (Boolean(effParcel) && Boolean(effRegion)));

                  return (
                    <tr
                      key={index}
                      className={`transition-colors hover:bg-slate-800/40 ${
                        !isItemValid ? 'bg-amber-950/10' : index % 2 === 0 ? 'bg-slate-950/30' : 'bg-slate-900/20'
                      }`}
                    >
                      {/* Index */}
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-800/80 text-cyan-300 font-mono font-bold text-[11px] border border-slate-700">
                          {index + 1}
                        </span>
                      </td>

                      {/* Description */}
                      <td className="px-3.5 py-2.5 font-bold">
                        {item.item_description?.trim() ? (
                          <span className="text-slate-100">{item.item_description}</span>
                        ) : (
                          <span className="text-rose-400/80 italic text-[11px]">⚠️ لم يُكتب وصف الصنف بعد</span>
                        )}
                      </td>

                      {/* Specifications */}
                      <td className="px-3 py-2.5 text-slate-400">
                        {item.specifications?.trim() ? (
                          <span className="text-slate-300">{item.specifications}</span>
                        ) : (
                          <span className="text-slate-600 text-[11px]">—</span>
                        )}
                      </td>

                      {/* Reference / Parcel */}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {effParcel ? (
                          <span className="inline-block rounded-md bg-cyan-950/60 border border-cyan-800/40 px-2 py-0.5 font-mono text-cyan-300 font-bold text-[11px]">
                            {effParcel}
                          </span>
                        ) : isOffice ? (
                          <span className="text-slate-400 text-[11px]">مقر الشركة</span>
                        ) : (
                          <span className="text-rose-400/80 text-[11px]">⚠️ غير محدد</span>
                        )}
                      </td>

                      {/* Region */}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {effRegion ? (
                          <span className="text-slate-300 font-medium">{effRegion}</span>
                        ) : isOffice ? (
                          <span className="text-slate-400 text-[11px]">إداري</span>
                        ) : (
                          <span className="text-rose-400/80 text-[11px]">⚠️ غير محددة</span>
                        )}
                      </td>

                      {/* Quantity */}
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <span className="inline-block rounded-lg bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 font-mono font-black text-amber-300 text-xs">
                          {item.quantity !== undefined && item.quantity !== null && item.quantity !== ('' as any)
                            ? item.quantity
                            : 0}
                        </span>
                      </td>

                      {/* Unit */}
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <span className="inline-block rounded-md bg-slate-800 px-2 py-0.5 font-medium text-slate-300 text-[11px]">
                          {getUnitLabel(item.uom || 'PCS')}
                        </span>
                      </td>

                      {/* Actions */}
                      {(onRemoveItem || onScrollToItem) && (
                        <td className="px-3 py-2.5 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            {onScrollToItem && (
                              <button
                                type="button"
                                onClick={() => onScrollToItem(index)}
                                className="rounded p-1 text-cyan-400 hover:bg-cyan-950/60 hover:text-cyan-200 transition-colors"
                                title="الانتقال وتعديل هذا البند"
                              >
                                ✏️
                              </button>
                            )}
                            {onRemoveItem && items.length > 1 && (
                              <button
                                type="button"
                                onClick={() => onRemoveItem(index)}
                                className="rounded p-1 text-rose-400 hover:bg-rose-950/60 hover:text-rose-200 transition-colors"
                                title="حذف هذا البند"
                              >
                                🗑️
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              {/* Table Footer */}
              <tfoot className="border-t-2 border-slate-700 bg-slate-900/90 text-xs font-bold text-slate-300">
                <tr>
                  <td colSpan={5} className="px-3.5 py-2.5 text-slate-400">
                    الإجمالي الكلي: <span className="font-mono text-cyan-300">{totalItemsCount}</span> بنود
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="font-mono font-black text-amber-300">
                      {formatCleanQty(totalQuantity)}
                    </span>
                  </td>
                  <td colSpan={(onRemoveItem || onScrollToItem) ? 2 : 1} className="px-3 py-2.5 text-left text-slate-500 text-[11px]">
                    مجموع الكميات المطلوبة
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
};
