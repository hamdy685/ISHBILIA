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

  const warehouseQtyLabel =
    receipt.receipt_type === 'REQUESTER_OFFICE'
      ? 'كمية أمر الشراء'
      : receipt.receipt_type === 'SITE_DIRECT'
      ? 'كمية التوريد'
      : 'كمية المخزن';

  const confirmedQtyLabel = readOnly
    ? 'الكمية المستلمة'
    : receipt.receipt_type === 'REQUESTER_OFFICE'
    ? 'الكمية المستلمة'
    : 'الكمية المعتمدة';

  return (
    <div className="w-full" dir="rtl">
      {/*
        ┌──────────────────────────────────────────────────────────────────┐
        │  STRICT 4-COLUMN LAYOUT — NO HORIZONTAL SCROLL                   │
        │  RTL order: البند | كمية المخزن | الكمية المعتمدة | الوحدة       │
        │  Columns use table-layout: fixed + percentage widths             │
        └──────────────────────────────────────────────────────────────────┘
      */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-950/90 shadow-sm">
        <table
          className="w-full text-right text-xs border-collapse"
          style={{ tableLayout: 'fixed' }}
        >
          {/* Column width distribution (total = 100%):
              البند: 46% — widest to show item name
              كمية المخزن: 17%
              الكمية المعتمدة: 22%
              الوحدة: 15%
          */}
          <colgroup>
            <col style={{ width: '46%' }} />
            <col style={{ width: '17%' }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: '15%' }} />
          </colgroup>

          <thead>
            <tr className="border-b border-slate-700/80 bg-slate-900/95 text-slate-400">
              {/* عمود: البند */}
              <th className="py-2 px-2.5 text-right font-bold text-xs">
                البند والمواصفات
              </th>
              {/* عمود: كمية المخزن */}
              <th className="py-2 px-2 text-center font-bold text-xs whitespace-nowrap">
                {warehouseQtyLabel}
              </th>
              {/* عمود: الكمية المعتمدة */}
              <th className="py-2 px-2 text-center font-bold text-xs whitespace-nowrap">
                {confirmedQtyLabel}
              </th>
              {/* عمود: الوحدة — أقصى اليسار */}
              <th className="py-2 px-2 text-center font-bold text-xs">
                الوحدة
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-800/50">
            {receiptItems.map((item, idx) => {
              const key = resolveKey(item.id);
              const val = quantities[key] ?? String(item.received_quantity ?? '');

              const poItem = item.purchase_order_item;
              const prItem = poItem?.pr_item;
              const itemName =
                poItem?.item_description || poItem?.item?.name || 'بند استلام';

              /* UOM resolution */
              const siteUom = prItem?.uom || poItem?.uom || '';
              const uomLabel = getUnitLabel(siteUom) || siteUom || '—';

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

              /* In read-only (archive) mode display confirmed qty */
              const displayConfirmedQty = displayWarehouseQty;

              /* Supplementary info for tooltip/drawer */
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
              const noteVal = (itemNotes[key] ?? item.notes) || '';

              /* Build full tooltip text */
              const tooltipText = [
                itemName,
                parcel ? `قطعة: ${parcel}` : null,
                region ? `المنطقة: ${region}` : null,
                noteVal ? `ملاحظة: ${noteVal}` : null,
              ]
                .filter(Boolean)
                .join(' | ');

              return (
                <React.Fragment key={item.id}>
                  {/* ── Main row ── */}
                  <tr
                    className={`transition-colors ${
                      isExpanded
                        ? 'bg-emerald-950/20'
                        : idx % 2 === 0
                        ? 'bg-transparent hover:bg-slate-900/40'
                        : 'bg-slate-900/25 hover:bg-slate-900/50'
                    }`}
                  >
                    {/* ① البند — single line, truncated, clickable for full details */}
                    <td className="py-2 px-2.5 align-middle" style={{ maxWidth: 0 }}>
                      <div
                        className="flex items-center gap-1 overflow-hidden"
                        style={{ minWidth: 0 }}
                      >
                        {/* Row index badge */}
                        <span className="text-slate-500 font-mono text-[10px] shrink-0 w-4 text-center">
                          {idx + 1}
                        </span>

                        {/* Item name — single line, ellipsis */}
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedItemId(isExpanded ? null : item.id)
                          }
                          title={tooltipText}
                          className="flex-1 text-right font-bold text-slate-100 hover:text-emerald-300 transition-colors text-xs leading-tight cursor-pointer"
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

                        {/* Supplementary badge — shrinks, never breaks line */}
                        <SupplementItemBadge
                          isSupplementary={poItem?.is_supplementary}
                          batchNumber={poItem?.supplement_batch}
                        />
                      </div>
                    </td>

                    {/* ② كمية المخزن */}
                    <td className="py-2 px-2 text-center align-middle whitespace-nowrap">
                      <span className="font-mono font-black text-cyan-300 text-sm">
                        {displayWarehouseQty ?? '—'}
                      </span>
                    </td>

                    {/* ③ الكمية المعتمدة مدنياً */}
                    <td className="py-2 px-1.5 text-center align-middle whitespace-nowrap">
                      {readOnly ? (
                        <span className="font-mono font-black text-emerald-300 text-sm bg-emerald-950/40 border border-emerald-800/50 px-2 py-0.5 rounded-md inline-block">
                          {displayConfirmedQty ?? '—'}
                        </span>
                      ) : (
                        <input
                          id={`site-qty-${key}`}
                          type="number"
                          min="0"
                          step="any"
                          value={val}
                          onChange={(e) => onQuantityChange?.(key, e.target.value)}
                          placeholder="0"
                          title={isReviewer ? 'الكمية المعتمدة بالمراجعة الفنية' : 'الكمية المعتمدة مدنياً'}
                          className="w-full h-8 text-center font-mono font-black text-emerald-200 bg-slate-950 border border-emerald-500/60 hover:border-emerald-400 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/25 rounded-lg text-sm transition-all outline-none"
                          style={{ minWidth: 0 }}
                        />
                      )}
                    </td>

                    {/* ④ الوحدة — far left */}
                    <td className="py-2 px-2 text-center align-middle whitespace-nowrap">
                      <span className="text-[11px] font-bold text-slate-300 bg-slate-900/70 border border-slate-700/60 px-1.5 py-0.5 rounded inline-block">
                        {uomLabel}
                      </span>
                    </td>
                  </tr>

                  {/* ── Expanded details drawer — collapses inline ── */}
                  {isExpanded && (
                    <tr className="bg-slate-950/70 border-b border-slate-800/60">
                      <td colSpan={4} className="px-3 py-2.5">
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <span className="text-[11px] font-black text-emerald-400 flex items-center gap-1">
                            📋 تفاصيل البند:
                          </span>
                          <button
                            type="button"
                            onClick={() => setExpandedItemId(null)}
                            className="text-[10px] text-slate-500 hover:text-slate-300 font-bold shrink-0"
                          >
                            ✕ إغلاق
                          </button>
                        </div>

                        {/* Full item name */}
                        <p className="text-xs font-bold text-slate-100 whitespace-normal leading-snug mb-1.5">
                          {itemName}
                        </p>

                        {/* Metadata chips */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          {parcel && (
                            <span className="text-[11px] font-mono text-cyan-300 bg-cyan-950/60 border border-cyan-800/50 px-2 py-0.5 rounded">
                              🏷️ {parcel}
                            </span>
                          )}
                          {region && (
                            <span className="text-[11px] text-amber-300 bg-amber-950/60 border border-amber-800/50 px-2 py-0.5 rounded">
                              📍 {region}
                            </span>
                          )}
                          {poItem?.quantity && (
                            <span className="text-[11px] text-slate-300 bg-slate-900/60 border border-slate-700/50 px-2 py-0.5 rounded">
                              📋 مطلوب: {poItem.quantity} {uomLabel}
                            </span>
                          )}
                          {poItem?.shipment_group && (
                            <span className="text-[11px] font-bold text-amber-300 bg-amber-950/60 border border-amber-700/50 px-2 py-0.5 rounded">
                              🚚 شحنة {poItem.shipment_group.group_number}
                            </span>
                          )}
                          {noteVal && (
                            <span className="text-[11px] text-amber-200 bg-amber-950/40 border border-amber-900/40 px-2 py-0.5 rounded">
                              📝 {noteVal}
                            </span>
                          )}
                        </div>

                        {/* Note input in editable mode */}
                        {!readOnly && (
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-[11px] font-bold text-slate-400 shrink-0">
                              {isReviewer ? 'ملاحظة المراجع:' : 'ملاحظة:'}
                            </span>
                            <input
                              type="text"
                              value={noteVal}
                              onChange={(e) =>
                                onItemNoteChange?.(key, e.target.value)
                              }
                              placeholder={
                                isReviewer
                                  ? 'ملاحظة فنية على هذا الصنف...'
                                  : 'ملاحظة على استلام هذا الصنف...'
                              }
                              className="flex-1 h-7 rounded-md border border-slate-700 bg-slate-900 px-2.5 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none"
                            />
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Hint text */}
      <p className="text-[10px] text-slate-500 mt-1.5 text-right">
        💡 اضغط على اسم أي بند لعرض التفاصيل الكاملة وإضافة ملاحظة.
      </p>
    </div>
  );
};

export default SiteReceiptItemsTable;
