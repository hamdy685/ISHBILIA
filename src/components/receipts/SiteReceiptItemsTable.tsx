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
      <div className="p-3 text-center text-xs text-slate-400 bg-slate-950/60 rounded-xl border border-slate-800">
        لا توجد بنود مسجلة في هذا الإذن
      </div>
    );
  }

  const resolveKey = (itemId: number) => {
    if (getKey) return getKey(receipt.id, itemId);
    return `receipt-${receipt.id}-${itemId}`;
  };

  /*
    Exact 4-Column Layout (RTL: Right to Left)
    1. البند والمواصفات (43%)
    2. كمية المخزن (17%)
    3. الكمية المعتمدة مدنيًا (23%)
    4. الوحدة (17% - أقصى اليسار)

    The table carries `no-min-width` to opt out of the global mobile rule in
    index.css (`table:not(.no-min-width) { min-width: 650px }`), which otherwise
    widens it past its container and pushes the left columns out of view in RTL.
  */
  const warehouseQtyLabel =
    receipt.receipt_type === 'REQUESTER_OFFICE'
      ? 'كمية أمر الشراء'
      : receipt.receipt_type === 'SITE_DIRECT'
      ? 'كمية التوريد'
      : 'كمية المخزن';

  const confirmedQtyLabel = 'الكمية المعتمدة مدنيًا';

  return (
    <div className="w-full" dir="rtl">
      <div className="w-full rounded-xl border border-slate-800/80 bg-slate-950/90 shadow-xs overflow-hidden">
        <table
          className="no-min-width w-full text-right text-xs border-collapse"
          style={{ tableLayout: 'fixed', width: '100%', minWidth: 0 }}
        >
          {/* Strict 4-column width distribution totalling 100% */}
          <colgroup>
            <col style={{ width: '43%' }} />
            <col style={{ width: '17%' }} />
            <col style={{ width: '23%' }} />
            <col style={{ width: '17%' }} />
          </colgroup>

          <thead>
            <tr className="border-b border-slate-700/80 bg-slate-900/95 text-slate-300 font-bold select-none">
              {/* ① البند والمواصفات */}
              <th className="py-2 px-2 text-right font-bold text-xs align-bottom">
                البند والمواصفات
              </th>

              {/* ② كمية المخزن */}
              <th
                className="py-2 px-0.5 text-center font-bold text-[11px] sm:text-xs leading-tight align-bottom"
                style={{ whiteSpace: 'normal' }}
              >
                {warehouseQtyLabel}
              </th>

              {/* ③ الكمية المعتمدة مدنيًا */}
              <th
                className="py-2 px-0.5 text-center font-bold text-[11px] sm:text-xs leading-tight align-bottom"
                style={{ whiteSpace: 'normal' }}
              >
                {confirmedQtyLabel}
              </th>

              {/* ④ الوحدة (أقصى اليسار) */}
              <th
                className="py-2 px-0.5 text-center font-bold text-[11px] sm:text-xs leading-tight align-bottom"
                style={{ whiteSpace: 'normal' }}
              >
                الوحدة
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

              /* Confirmed quantity for read-only view */
              const displayConfirmedQty = displayWarehouseQty;

              const isExpanded = expandedItemId === item.id;
              const isNoteOpen = activeNoteItemId === item.id;

              /* Tooltip text for hover */
              const tooltipText = `${itemName}${
                poItem?.quantity ? ` | مطلوب: ${poItem.quantity} ${uomLabel}` : ''
              }${noteVal ? ` | ملاحظة: ${noteVal}` : ''}`;

              return (
                <React.Fragment key={item.id}>
                  {/* ── Main Single-Row ── */}
                  <tr
                    className={`transition-colors ${
                      isExpanded
                        ? 'bg-emerald-950/25'
                        : idx % 2 === 0
                        ? 'bg-transparent hover:bg-slate-900/40'
                        : 'bg-slate-900/20 hover:bg-slate-900/50'
                    }`}
                  >
                    {/* ① البند والمواصفات — Single line, ellipsis, max available width */}
                    <td className="py-2 px-2 align-middle" style={{ maxWidth: 0 }}>
                      <div className="flex items-center gap-1 min-w-0" style={{ minWidth: 0 }}>
                        <span className="text-[10px] font-mono text-slate-500 shrink-0 select-none">
                          {idx + 1}.
                        </span>
                        <button
                          type="button"
                          onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                          title={tooltipText}
                          className="font-bold text-slate-100 hover:text-emerald-300 transition-colors text-xs leading-tight text-right cursor-pointer select-none flex-1"
                          style={{
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                            textOverflow: 'ellipsis',
                            display: 'block',
                            minWidth: 0,
                          }}
                        >
                          {itemName}
                        </button>

                        {/* Supplementary badge */}
                        {poItem?.is_supplementary && (
                          <SupplementItemBadge
                            isSupplementary={poItem?.is_supplementary}
                            batchNumber={poItem?.supplement_batch}
                          />
                        )}

                        {/* Note toggle icon button */}
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => setActiveNoteItemId(isNoteOpen ? null : item.id)}
                            title="إضافة ملاحظة على هذا البند"
                            className={`p-1 rounded text-[11px] transition-colors shrink-0 ${
                              noteVal
                                ? 'text-amber-300 bg-amber-950/80 border border-amber-600/60'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {noteVal ? '📝' : '💬'}
                          </button>
                        )}
                      </div>
                    </td>

                    {/* ② كمية المخزن */}
                    <td className="py-2 px-0.5 text-center align-middle" style={{ wordBreak: 'break-all' }}>
                      <span className="font-mono font-black text-cyan-300 text-xs sm:text-sm">
                        {displayWarehouseQty ?? '—'}
                      </span>
                      {isDiffUom && (
                        <span className="block text-[10px] text-slate-400 font-normal leading-tight mt-0.5">
                          ({item.received_quantity} {getUnitLabel(poItem?.uom || '')})
                        </span>
                      )}
                    </td>

                    {/* ③ الكمية المعتمدة مدنيًا */}
                    <td className="py-2 px-0.5 text-center align-middle">
                      {readOnly ? (
                        <span
                          className="font-mono font-black text-emerald-300 text-xs sm:text-sm bg-emerald-950/40 border border-emerald-800/50 px-1.5 py-0.5 rounded-md inline-block max-w-full"
                          style={{ wordBreak: 'break-all' }}
                        >
                          {displayConfirmedQty ?? '—'}
                        </span>
                      ) : (
                        <div className="flex items-center justify-center min-w-0">
                          <input
                            id={`site-qty-${key}`}
                            type="number"
                            min="0"
                            step="any"
                            value={val}
                            onChange={(e) => onQuantityChange?.(key, e.target.value)}
                            placeholder="0"
                            title={isReviewer ? 'الكمية المعتمدة بالمراجعة الفنية' : 'الكمية المعتمدة مدنيًا'}
                            className="w-full min-w-0 max-w-[64px] sm:max-w-[80px] h-7 sm:h-8 text-center font-mono font-black text-emerald-200 bg-slate-950 border border-emerald-500/70 hover:border-emerald-400 focus:border-emerald-300 focus:ring-1 focus:ring-emerald-500/30 rounded-lg text-xs sm:text-sm transition-all outline-none p-0"
                          />
                        </div>
                      )}
                    </td>

                    {/* ④ الوحدة (أقصى اليسار) */}
                    <td className="py-2 px-0.5 text-center align-middle">
                      <span
                        className="text-[11px] sm:text-xs font-bold text-slate-300 bg-slate-900/80 border border-slate-700/60 px-1 py-0.5 rounded inline-block max-w-full leading-tight"
                        style={{ overflowWrap: 'anywhere' }}
                      >
                        {uomLabel || '—'}
                      </span>
                    </td>
                  </tr>

                  {/* ── Expanded Full Details Drawer (collapses inline, colSpan 4) ── */}
                  {isExpanded && (
                    <tr className="bg-slate-900/90 border-b border-slate-800">
                      <td colSpan={4} className="p-3 space-y-2 text-right">
                        <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
                          <span className="font-bold text-emerald-300 text-xs">
                            📋 تفاصيل البند كاملة:
                          </span>
                          <button
                            type="button"
                            onClick={() => setExpandedItemId(null)}
                            className="text-slate-400 hover:text-slate-200 text-xs font-bold px-2 py-0.5 rounded bg-slate-800 cursor-pointer"
                          >
                            ✕ إغلاق
                          </button>
                        </div>

                        <p className="text-slate-100 font-bold text-xs whitespace-normal leading-relaxed">
                          {itemName}
                        </p>

                        <div className="flex items-center gap-2 flex-wrap text-xs text-slate-300 pt-0.5">
                          {poItem?.quantity && (
                            <span className="bg-slate-900 border border-slate-700 px-2 py-0.5 rounded text-[11px] text-slate-200">
                              📋 الكمية المطلوبة بأمر الشراء: <strong className="text-cyan-300 font-mono">{poItem.quantity} {uomLabel}</strong>
                            </span>
                          )}
                          {poItem?.shipment_group && (
                            <span className="bg-amber-950/80 border border-amber-700/70 px-2 py-0.5 rounded text-[11px] text-amber-300 font-bold">
                              🚚 رقم الشحنة: {poItem.shipment_group.group_number}
                            </span>
                          )}
                          {item.notes && (
                            <span className="bg-slate-950 border border-amber-600/50 px-2 py-0.5 rounded text-[11px] text-amber-300">
                              📝 ملاحظة مسجلة: {item.notes}
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
                              className="flex-1 h-7 rounded-md border border-slate-700 bg-slate-950 px-2.5 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
                            />
                          </div>
                        )}
                      </td>
                    </tr>
                  )}

                  {/* ── Inline Note Input Row (when toggled from note button) ── */}
                  {isNoteOpen && !readOnly && (
                    <tr className="bg-slate-900/95 border-b border-slate-800">
                      <td colSpan={4} className="p-2.5">
                        <div className="flex items-center gap-1.5 bg-slate-950 p-2 rounded-lg border border-slate-800">
                          <span className="text-xs font-bold text-slate-300 shrink-0 flex items-center gap-1">
                            <span>📝</span>
                            <span className="hidden sm:inline">
                              {isReviewer ? 'ملاحظة المراجع:' : 'ملاحظة الموقع:'}
                            </span>
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
                            className="flex-1 h-7 rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none min-w-0"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => setActiveNoteItemId(null)}
                            className="text-xs text-emerald-400 hover:text-emerald-300 font-bold px-2 py-0.5 bg-emerald-950/70 border border-emerald-600/60 rounded cursor-pointer shrink-0"
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

      {/* Subtle hint */}
      <p className="text-[10px] text-slate-500 text-right px-1 select-none">
        💡 انقر على اسم أي بند لعرض التفاصيل الكاملة، أو انقر على 💬 لإضافة ملاحظة.
      </p>
    </div>
  );
};

export default SiteReceiptItemsTable;
