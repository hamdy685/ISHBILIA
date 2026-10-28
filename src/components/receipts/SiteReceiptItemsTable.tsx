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
  const [activeNoteItemId, setActiveNoteItemId] = useState<number | null>(null);
  const [expandedItemId, setExpandedItemId] = useState<number | null>(null);

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

  return (
    <div className="w-full space-y-2">
      {/* Table Container with Horizontal Scroll for Mobile */}
      <div className="overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-950/90 shadow-md scrollbar-thin">
        <table className="w-full text-right text-xs sm:text-sm border-collapse min-w-[680px]">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/90 text-slate-300 font-bold select-none">
              <th className="py-2.5 px-3 w-10 text-center text-slate-400">#</th>
              <th className="py-2.5 px-3">البند والمواصفات</th>
              <th className="py-2.5 px-3 text-center whitespace-nowrap">القطعة / المنطقة</th>
              <th className="py-2.5 px-3 text-center whitespace-nowrap">الوحدة</th>
              <th className="py-2.5 px-3 text-center whitespace-nowrap">
                {readOnly
                  ? 'الكمية المطلوبة'
                  : receipt.receipt_type === 'REQUESTER_OFFICE'
                  ? 'كمية أمر الشراء'
                  : receipt.receipt_type === 'SITE_DIRECT'
                  ? 'كمية التوريد المباشر'
                  : 'كمية المخزن'}
              </th>
              <th className="py-2.5 px-3 text-center whitespace-nowrap">
                {readOnly
                  ? 'الكمية المستلمة'
                  : receipt.receipt_type === 'REQUESTER_OFFICE'
                  ? 'الكمية المستلمة فعلياً'
                  : 'الكمية المعتمدة ميدانياً'}
              </th>
              {!readOnly && (
                <th className="py-2.5 px-3 text-center w-24 whitespace-nowrap">ملاحظات</th>
              )}
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

              const poQty = Number(poItem?.quantity || 0);
              const prQty = Number(prItem?.quantity || 0);
              const isDiffUom = Boolean(
                prItem?.uom &&
                  poItem?.uom &&
                  prItem.uom !== poItem.uom &&
                  poQty > 0 &&
                  prQty > 0
              );

              const displayReceivedQty = isDiffUom
                ? Number(item.received_quantity) > poQty * 2
                  ? Number(item.received_quantity)
                  : Math.round(Number(item.received_quantity) * (prQty / poQty))
                : item.received_quantity;

              const siteUom = prItem?.uom || poItem?.uom || '';
              const uomLabel = getUnitLabel(siteUom);

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

              const isNoteOpen = activeNoteItemId === item.id;
              const isExpanded = expandedItemId === item.id;

              return (
                <React.Fragment key={item.id}>
                  <tr className="hover:bg-slate-900/50 transition-colors group">
                    {/* Index */}
                    <td className="py-2.5 px-3 text-center font-mono text-xs text-slate-400 font-bold whitespace-nowrap">
                      {idx + 1}
                    </td>

                    {/* Item Name (Single line with nowrap & ellipsis) */}
                    <td className="py-2.5 px-3 whitespace-nowrap max-w-[240px] sm:max-w-[340px] lg:max-w-[420px]">
                      <div className="flex items-center gap-1.5 overflow-hidden">
                        <span
                          onClick={() =>
                            setExpandedItemId(isExpanded ? null : item.id)
                          }
                          title={`${itemName} (انقر لعرض التفاصيل)`}
                          className="font-bold text-slate-100 hover:text-emerald-300 truncate cursor-pointer select-none transition-colors"
                        >
                          {itemName}
                        </span>

                        {/* Supplementary Badge */}
                        <SupplementItemBadge
                          isSupplementary={poItem?.is_supplementary}
                          batchNumber={poItem?.supplement_batch}
                        />

                        {/* Shipment Badge */}
                        {poItem?.shipment_group && (
                          <span className="text-[10px] font-bold text-amber-300 bg-amber-950/80 border border-amber-600/60 px-1.5 py-0.5 rounded shrink-0">
                            🚚 شحنة {poItem.shipment_group.group_number}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Parcel / Region */}
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      {parcel || region ? (
                        <div className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-cyan-200 bg-cyan-950/70 border border-cyan-800/60 px-2 py-0.5 rounded-md">
                          {parcel && <span>🏷️ {parcel}</span>}
                          {region && <span className="text-amber-300 font-sans">({region})</span>}
                        </div>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>

                    {/* UOM */}
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <span className="inline-block text-xs font-bold text-slate-300 bg-slate-900/80 border border-slate-800 px-2.5 py-1 rounded-md">
                        {uomLabel || '—'}
                      </span>
                    </td>

                    {/* Recorded / Ordered Quantity */}
                    <td className="py-2.5 px-3 text-center whitespace-nowrap font-mono font-black text-cyan-300 text-sm">
                      {readOnly ? (
                        <span>
                          {item.ordered_quantity ?? poItem?.quantity ?? '—'}
                        </span>
                      ) : (
                        <span>{displayReceivedQty ?? '—'}</span>
                      )}
                    </td>

                    {/* Confirmed Quantity (Input or ReadOnly) */}
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      {readOnly ? (
                        <span className="inline-block font-mono font-black text-emerald-300 text-sm bg-emerald-950/50 border border-emerald-800/60 px-3 py-1 rounded-md">
                          {displayReceivedQty ?? '—'}
                        </span>
                      ) : (
                        <div className="inline-flex items-center justify-center">
                          <input
                            id={`site-qty-${key}`}
                            type="number"
                            min="0"
                            step="any"
                            value={val}
                            onChange={(e) =>
                              onQuantityChange?.(key, e.target.value)
                            }
                            placeholder="0"
                            className="w-24 sm:w-28 h-8 sm:h-9 text-center font-mono font-black text-emerald-200 bg-slate-950 border border-emerald-500/70 hover:border-emerald-400 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/30 rounded-lg text-sm transition-all outline-none"
                            title="أدخل الكمية المعتمدة"
                          />
                        </div>
                      )}
                    </td>

                    {/* Notes Action Column (Editable mode only) */}
                    {!readOnly && (
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() =>
                            setActiveNoteItemId(isNoteOpen ? null : item.id)
                          }
                          className={`text-xs px-2 py-1 rounded-md border transition-all cursor-pointer inline-flex items-center gap-1 ${
                            noteVal
                              ? 'bg-amber-950/80 border-amber-600/70 text-amber-300 font-bold'
                              : 'bg-slate-900/80 border-slate-700/60 text-slate-400 hover:text-slate-200 hover:border-slate-600'
                          }`}
                          title={noteVal ? `الملاحظة: ${noteVal}` : 'إضافة ملاحظة على هذا البند'}
                        >
                          <span>{noteVal ? '📝' : '💬'}</span>
                          <span className="text-[11px]">
                            {noteVal ? 'ملاحظة' : '+ ملاحظة'}
                          </span>
                        </button>
                      </td>
                    )}
                  </tr>

                  {/* Inline Expanded Details Drawer (if clicked) */}
                  {isExpanded && (
                    <tr className="bg-slate-900/80 border-b border-slate-800/80">
                      <td colSpan={readOnly ? 6 : 7} className="p-3 text-xs space-y-1.5">
                        <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
                          <span className="font-bold text-emerald-300">
                            📋 تفاصيل البند كاملة:
                          </span>
                          <button
                            type="button"
                            onClick={() => setExpandedItemId(null)}
                            className="text-slate-400 hover:text-slate-200 text-xs"
                          >
                            ✕ إغلاق
                          </button>
                        </div>
                        <p className="text-slate-100 font-bold whitespace-normal leading-relaxed">
                          {itemName}
                        </p>
                        <div className="flex items-center gap-3 flex-wrap text-slate-400 pt-1">
                          {parcel && <span>🏷️ قطعة الأرض: <strong className="text-cyan-300">{parcel}</strong></span>}
                          {region && <span>📍 المنطقة: <strong className="text-amber-300">{region}</strong></span>}
                          {poItem?.quantity && (
                            <span>📋 الكمية المطلوبة بأمر الشراء: <strong className="text-slate-200">{poItem.quantity} {uomLabel}</strong></span>
                          )}
                          {item.notes && (
                            <span className="text-amber-300">📝 ملاحظة سابقة: {item.notes}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* Inline Item Note Input Row (if toggled) */}
                  {isNoteOpen && !readOnly && (
                    <tr className="bg-slate-900/90 border-b border-slate-800/80 animate-fade-in">
                      <td colSpan={7} className="p-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-300 shrink-0">
                            {isReviewer ? 'ملاحظة المراجع الفني:' : 'ملاحظة مهندس الموقع:'}
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
                            className="flex-1 h-8 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => setActiveNoteItemId(null)}
                            className="text-xs text-emerald-400 hover:text-emerald-300 font-bold px-2.5 py-1 bg-emerald-950/60 border border-emerald-700/60 rounded-lg cursor-pointer"
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
    </div>
  );
};

export default SiteReceiptItemsTable;
