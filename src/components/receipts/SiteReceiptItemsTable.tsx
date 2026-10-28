import React, { useState } from 'react';
import { ReceiptRecord } from '../../api/purchaseReceipts';
import { getUnitLabel } from '../../utils/units';
import { SupplementItemBadge } from '../common/SupplementItemBadge';

export interface SiteReceiptItemsTableProps {
  receipt: ReceiptRecord;
  items?: ReceiptRecord['items'];
  quantities?: Record<string, string>;
  onQuantityChange?: (key: string, value: string) => void;
  itemNotes?: Record<string, string>;
  onItemNoteChange?: (key: string, value: string) => void;
  isReviewer?: boolean;
  readOnly?: boolean;
  /** Custom key generator if needed (e.g. for modal vs page) */
  getKey?: (receiptId: number, itemId: number) => string;
}

export const SiteReceiptItemsTable: React.FC<SiteReceiptItemsTableProps> = ({
  receipt,
  items,
  quantities = {},
  onQuantityChange,
  itemNotes = {},
  onItemNoteChange,
  isReviewer = false,
  readOnly = false,
  getKey,
}) => {
  const receiptItems = items || receipt.items || [];
  const [expandedItemId, setExpandedItemId] = useState<number | null>(null);
  const [activeNoteItemId, setActiveNoteItemId] = useState<number | null>(null);

  if (!receiptItems || receiptItems.length === 0) {
    return (
      <div className="p-4 text-center text-xs text-slate-400 bg-slate-950/60 rounded-xl border border-slate-800">
        لا توجد بنود مسجلة في هذا الإذن
      </div>
    );
  }

  const resolveKey = (itemId: number) => {
    if (getKey) return getKey(receipt.id, itemId);
    return `receipt-${receipt.id}-${itemId}`;
  };

  const warehouseQtyLabel = readOnly
    ? 'الكمية المطلوبة'
    : receipt.receipt_type === 'REQUESTER_OFFICE'
    ? 'كمية أمر الشراء'
    : receipt.receipt_type === 'SITE_DIRECT'
    ? 'كمية التوريد المباشر'
    : 'كمية المخزن';

  const confirmedQtyLabel = readOnly
    ? 'الكمية المستلمة'
    : receipt.receipt_type === 'REQUESTER_OFFICE'
    ? 'الكمية المستلمة فعلياً'
    : 'الكمية المعتمدة ميدانياً';

  return (
    <div className="w-full space-y-2" dir="rtl">
      {/* 
        Responsive, organized table wrapper without unwanted clipping or hidden overflow 
      */}
      <div className="w-full overflow-x-auto rounded-2xl border border-slate-800/90 bg-slate-950/90 shadow-md">
        <table className="w-full text-right text-xs sm:text-sm border-collapse min-w-[640px]">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/95 text-slate-300 font-bold select-none">
              {/* # Index */}
              <th className="py-3 px-2.5 w-10 text-center text-slate-400">#</th>
              {/* Item Description */}
              <th className="py-3 px-3 text-right">البند والمواصفات</th>
              {/* Parcel / Region */}
              <th className="py-3 px-2.5 text-center whitespace-nowrap">القطعة / المنطقة</th>
              {/* Unit */}
              <th className="py-3 px-2.5 text-center whitespace-nowrap">الوحدة</th>
              {/* Warehouse / Ordered Qty */}
              <th className="py-3 px-2.5 text-center whitespace-nowrap">
                {warehouseQtyLabel}
              </th>
              {/* Confirmed / Received Qty */}
              <th className="py-3 px-2.5 text-center whitespace-nowrap">
                {confirmedQtyLabel}
              </th>
              {/* Notes */}
              <th className="py-3 px-2.5 text-center whitespace-nowrap">
                ملاحظات
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-800/60">
            {receiptItems.map((item, idx) => {
              const key = resolveKey(item.id);
              const val = quantities[key] ?? String(item.received_quantity ?? '');
              const noteVal = itemNotes[key] ?? (item.notes || '');

              const poItem = item.purchase_order_item;
              const prItem = poItem?.pr_item;
              const itemName =
                poItem?.item_description || poItem?.item?.name || 'بند استلام';

              /* Unit resolution */
              const siteUom = prItem?.uom || poItem?.uom || '';
              const uomLabel = getUnitLabel(siteUom) || siteUom;

              /* Quantity conversion when PR and PO have different units */
              const poQty = Number(poItem?.quantity || 0);
              const prQty = Number(prItem?.quantity || 0);
              const isDiffUom = Boolean(
                prItem?.uom &&
                  poItem?.uom &&
                  prItem.uom !== poItem.uom &&
                  poQty > 0 &&
                  prQty > 0
              );

              const displayWarehouseQty = isDiffUom
                ? Number(item.received_quantity) > poQty * 2
                  ? Number(item.received_quantity)
                  : Math.round(Number(item.received_quantity) * (prQty / poQty))
                : item.received_quantity;

              /* Ordered Quantity from PO */
              const orderedQty = item.ordered_quantity ?? poItem?.quantity ?? '—';

              /* In read-only (archive) mode display received quantity */
              const displayConfirmedQty = displayWarehouseQty;

              /* Supplementary info */
              const parcel =
                poItem?.item_reference ||
                prItem?.item_reference ||
                receipt.purchase_order?.purchase_request?.parcel_reference ||
                receipt.purchase_request?.parcel_reference;

              const region =
                poItem?.region ||
                prItem?.region ||
                receipt.purchase_order?.purchase_request?.region ||
                receipt.purchase_request?.region;

              const isExpanded = expandedItemId === item.id;
              const isNoteOpen = activeNoteItemId === item.id;

              return (
                <React.Fragment key={item.id}>
                  {/* ── Main Item Row ── */}
                  <tr
                    className={`transition-colors ${
                      isExpanded
                        ? 'bg-emerald-950/25'
                        : idx % 2 === 0
                        ? 'bg-transparent hover:bg-slate-900/40'
                        : 'bg-slate-900/20 hover:bg-slate-900/50'
                    }`}
                  >
                    {/* Index */}
                    <td className="py-3 px-2.5 text-center font-mono text-xs text-slate-400 font-bold whitespace-nowrap">
                      {idx + 1}
                    </td>

                    {/* Item Name & Badges */}
                    <td className="py-3 px-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedItemId(isExpanded ? null : item.id)
                            }
                            title={`${itemName} (انقر لعرض التفاصيل الكاملة)`}
                            className="text-right font-bold text-slate-100 hover:text-emerald-300 transition-colors text-xs sm:text-sm leading-snug cursor-pointer select-none"
                          >
                            {itemName}
                          </button>

                          <SupplementItemBadge
                            isSupplementary={poItem?.is_supplementary}
                            batchNumber={poItem?.supplement_batch}
                          />

                          {poItem?.shipment_group && (
                            <span className="text-[10px] font-bold text-amber-300 bg-amber-950/90 border border-amber-600/60 px-2 py-0.5 rounded flex items-center gap-1 shadow-xs whitespace-nowrap">
                              <span>🚚</span>
                              <span>شحنة: {poItem.shipment_group.group_number}</span>
                            </span>
                          )}
                        </div>

                        {/* Different Unit Conversion Hint */}
                        {isDiffUom && (
                          <div className="text-[11px] text-slate-400 font-sans">
                            (ما يعادل {item.received_quantity} {getUnitLabel(poItem?.uom || '')})
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Parcel & Region */}
                    <td className="py-3 px-2.5 text-center whitespace-nowrap">
                      {parcel || region ? (
                        <div className="flex flex-col gap-1 items-center justify-center">
                          {parcel && (
                            <span className="font-mono text-cyan-300 bg-cyan-950/80 border border-cyan-800/60 px-2 py-0.5 rounded text-[11px] font-bold inline-flex items-center gap-1 shadow-xs">
                              <span>🏷️</span>
                              <span>{parcel}</span>
                            </span>
                          )}
                          {region && (
                            <span className="text-amber-300 bg-amber-950/80 border border-amber-800/60 px-2 py-0.5 rounded text-[11px] font-bold inline-flex items-center gap-1 shadow-xs">
                              <span>📍</span>
                              <span>{region}</span>
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-600 font-bold">—</span>
                      )}
                    </td>

                    {/* Unit */}
                    <td className="py-3 px-2.5 text-center whitespace-nowrap">
                      <span className="text-xs font-bold text-slate-200 bg-slate-900 border border-slate-700/80 px-2.5 py-1 rounded-md inline-block">
                        {uomLabel || '—'}
                      </span>
                    </td>

                    {/* Warehouse Recorded Quantity or Ordered Quantity (readOnly) */}
                    <td className="py-3 px-2.5 text-center whitespace-nowrap">
                      {readOnly ? (
                        <div className="font-mono font-black text-cyan-300 text-sm sm:text-base">
                          {orderedQty}
                        </div>
                      ) : (
                        <div className="font-mono font-black text-cyan-300 text-sm sm:text-base">
                          {displayWarehouseQty ?? '—'}
                        </div>
                      )}
                    </td>

                    {/* Confirmed / Received Quantity */}
                    <td className="py-3 px-2.5 text-center whitespace-nowrap">
                      {readOnly ? (
                        <span className="font-mono font-black text-emerald-300 text-sm sm:text-base bg-emerald-950/60 border border-emerald-700/60 px-3 py-1 rounded-lg inline-block">
                          {displayConfirmedQty ?? '—'}
                        </span>
                      ) : (
                        <div className="flex items-center justify-center">
                          <input
                            id={`site-qty-${key}`}
                            type="number"
                            min="0"
                            step="any"
                            value={val}
                            onChange={(e) => onQuantityChange?.(key, e.target.value)}
                            placeholder="0"
                            title={isReviewer ? 'الكمية المعتمدة بالمراجعة الفنية' : 'الكمية المعتمدة ميدانياً'}
                            className="w-24 sm:w-28 h-9 text-center font-mono font-black text-emerald-200 bg-slate-950 border-2 border-emerald-500/70 hover:border-emerald-400 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/30 rounded-xl text-sm sm:text-base transition-all outline-none shadow-inner"
                          />
                        </div>
                      )}
                    </td>

                    {/* Notes Action or Display */}
                    <td className="py-3 px-2.5 text-center whitespace-nowrap">
                      {readOnly ? (
                        item.notes ? (
                          <span
                            className="text-xs text-amber-300 bg-amber-950/70 border border-amber-800/60 px-2.5 py-1 rounded-lg inline-flex items-center gap-1 max-w-[160px] truncate"
                            title={item.notes}
                          >
                            <span>📝</span>
                            <span className="truncate">{item.notes}</span>
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )
                      ) : (
                        <div className="flex flex-col items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setActiveNoteItemId(isNoteOpen ? null : item.id)
                            }
                            title="إضافة ملاحظة على هذا البند"
                            className={`text-xs px-2.5 py-1 rounded-lg border transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                              noteVal
                                ? 'bg-amber-950/90 border-amber-500/80 text-amber-200 font-bold shadow-xs'
                                : 'bg-slate-900/90 border-slate-700/70 text-slate-300 hover:text-white hover:border-slate-500'
                            }`}
                          >
                            <span>{noteVal ? '📝' : '💬'}</span>
                            <span className="text-[11px] font-bold">
                              {noteVal ? 'تعديل' : '+ ملاحظة'}
                            </span>
                          </button>
                          {noteVal && (
                            <span
                              className="text-[10px] text-amber-300 max-w-[120px] truncate"
                              title={noteVal}
                            >
                              {noteVal}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>

                  {/* ── Expanded Full Details Drawer ── */}
                  {isExpanded && (
                    <tr className="bg-slate-900/90 border-b border-slate-800">
                      <td colSpan={7} className="p-4 space-y-2.5">
                        <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
                          <span className="font-bold text-emerald-300 text-xs sm:text-sm">
                            📋 تفاصيل البند كاملة:
                          </span>
                          <button
                            type="button"
                            onClick={() => setExpandedItemId(null)}
                            className="text-slate-400 hover:text-slate-200 text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
                          >
                            ✕ إغلاق
                          </button>
                        </div>

                        <p className="text-slate-100 font-bold text-sm whitespace-normal leading-relaxed">
                          {itemName}
                        </p>

                        <div className="flex items-center gap-2.5 flex-wrap text-xs text-slate-300 pt-1">
                          {parcel && (
                            <span className="bg-cyan-950/80 border border-cyan-800/70 px-2.5 py-1 rounded-lg text-cyan-300 font-mono font-bold">
                              🏷️ قطعة الأرض: <strong>{parcel}</strong>
                            </span>
                          )}
                          {region && (
                            <span className="bg-amber-950/80 border border-amber-800/70 px-2.5 py-1 rounded-lg text-amber-300 font-bold">
                              📍 المنطقة: <strong>{region}</strong>
                            </span>
                          )}
                          {poItem?.quantity && (
                            <span className="bg-slate-900 border border-slate-700 px-2.5 py-1 rounded-lg text-slate-200">
                              📋 الكمية المطلوبة بأمر الشراء: <strong className="text-cyan-300 font-mono">{poItem.quantity} {uomLabel}</strong>
                            </span>
                          )}
                          {poItem?.shipment_group && (
                            <span className="bg-amber-950/80 border border-amber-700/70 px-2.5 py-1 rounded-lg text-amber-300 font-bold">
                              🚚 رقم الشحنة: {poItem.shipment_group.group_number}
                            </span>
                          )}
                          {item.notes && (
                            <span className="bg-slate-950 border border-amber-600/50 px-2.5 py-1 rounded-lg text-amber-300">
                              📝 ملاحظة سابقة: {item.notes}
                            </span>
                          )}
                        </div>

                        {!readOnly && (
                          <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-300 shrink-0">
                              {isReviewer ? 'ملاحظة المراجع:' : 'ملاحظة على الاستلام:'}
                            </span>
                            <input
                              type="text"
                              value={noteVal}
                              onChange={(e) =>
                                onItemNoteChange?.(key, e.target.value)
                              }
                              placeholder={
                                isReviewer
                                  ? 'اكتب ملاحظتك الفنية على هذا الصنف...'
                                  : 'اكتب ملاحظتك على استلام هذا الصنف...'
                              }
                              className="flex-1 h-8 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
                            />
                          </div>
                        )}
                      </td>
                    </tr>
                  )}

                  {/* ── Inline Note Input Row (when toggled from notes button) ── */}
                  {isNoteOpen && !readOnly && (
                    <tr className="bg-slate-900/95 border-b border-slate-800 animate-fade-in">
                      <td colSpan={7} className="p-3">
                        <div className="flex items-center gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                          <span className="text-xs font-bold text-slate-300 shrink-0 flex items-center gap-1.5">
                            <span>📝</span>
                            <span>{isReviewer ? 'ملاحظة المراجع الفني:' : 'ملاحظة مهندس الموقع:'}</span>
                          </span>
                          <input
                            type="text"
                            value={noteVal}
                            onChange={(e) =>
                              onItemNoteChange?.(key, e.target.value)
                            }
                            placeholder={
                              isReviewer
                                ? 'اكتب ملاحظتك الفنية على هذا الصنف...'
                                : 'اكتب ملاحظتك على استلام هذا الصنف...'
                            }
                            className="flex-1 h-8 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => setActiveNoteItemId(null)}
                            className="text-xs text-emerald-400 hover:text-emerald-300 font-bold px-3 py-1 bg-emerald-950/70 border border-emerald-600/60 rounded-lg cursor-pointer transition-colors"
                          >
                            تم ✓
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Helper text */}
      <p className="text-[11px] text-slate-400 text-right flex items-center gap-1.5 flex-wrap select-none px-1">
        <span>💡</span>
        <span>اضغط على اسم أي بند لعرض التفاصيل الكاملة (قطعة الأرض، المنطقة، رقم الشحنة)، أو انقر على «+ ملاحظة» لكتابة ملاحظة خاصة بالبند.</span>
      </p>
    </div>
  );
};

export default SiteReceiptItemsTable;
