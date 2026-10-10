import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import {
  PurchaseOrder,
  FinalizeActualPoItemPayload,
} from '../../types/purchaseOrder';
import {
  getPurchaseOrderApi,
  updatePurchaseOrderApi,
  finalizeActualPurchaseOrderApi,
} from '../../api/purchaseOrders';
import { LoadingSpinner } from '../LoadingSpinner';
import { SmartKgPricingInput } from '../common/SmartKgPricingInput';
import { SupplementItemBadge } from '../common/SupplementItemBadge';
import { getUnitLabel } from '../../utils/units';
import { toast } from '../../utils/toast';
import { formatCleanNumber } from '../../utils/numberFormat';
import { parseApiError } from '../../utils/apiError';
import { getSummaryParcels, getSummaryRegions } from '../../utils/formatRequestSummary';

export interface FinalizeActualPoModalProps {
  isOpen: boolean;
  poId: number | null;
  onClose: () => void;
  onSuccess?: (poNumber?: string) => void;
}

interface EditableModalItem {
  id?: number | null;
  item_id?: number | null;
  pr_item_id?: number | null;
  item_description: string;
  item_reference: string;
  region: string;
  quantity: number;
  uom: string;
  unit_price: number;
  line_total: number;
  specifications?: string;
  supplier_id?: number | null;
  is_supplementary?: boolean;
  supplement_batch?: number | null;
}

export const FinalizeActualPoModal: React.FC<FinalizeActualPoModalProps> = ({
  isOpen,
  poId,
  onClose,
  onSuccess,
}) => {
  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<EditableModalItem[]>([]);
  const [finalizationNotes, setFinalizationNotes] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [saveBusy, setSaveBusy] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen || !poId) {
      setPo(null);
      setItems([]);
      setFinalizationNotes('');
      setError(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    getPurchaseOrderApi(poId)
      .then((data) => {
        if (!isMounted) return;
        setPo(data);
        setFinalizationNotes(data.finalization_notes || '');

        const receipts = data.receipts || [];
        const rawItems = data.items || [];
        const mappedItems: EditableModalItem[] = [];

        rawItems.forEach((it) => {
          let qty = Number(it.quantity || 0);
          const price = Number(it.unit_price || 0);

          // Calculate actual received qty from approved receipts if available
          let totalReceived = 0;
          let foundInReceipt = false;
          receipts.forEach((r) => {
            if (r.status === 'APPROVED' || r.status === 'PENDING_SITE_ENGINEER') {
              r.items?.forEach((ri) => {
                if (ri.purchase_order_item_id === it.id) {
                  totalReceived += Number(ri.received_quantity || 0);
                  foundInReceipt = true;
                }
              });
            }
          });

          if (foundInReceipt) {
            qty = totalReceived;
          } else {
            qty = 0;
          }

          const isSupplementary = Boolean(
            it.is_supplementary ||
            (it.pr_item as any)?.is_supplementary ||
            ((data.purchase_request as any)?.supplements?.some((s: any) =>
              s.items?.some((si: any) => si.id === it.pr_item_id || si.item_description === it.item_description)
            ))
          );
          const supplementBatch = it.supplement_batch ?? (isSupplementary ? 1 : null);

          mappedItems.push({
            id: it.id,
            item_id: it.item_id ?? null,
            pr_item_id: it.pr_item_id ?? null,
            item_description: it.item_description || it.item_name || '',
            item_reference: it.item_reference || '',
            region: it.region || '',
            quantity: qty,
            uom: it.uom || 'PCS',
            unit_price: price,
            line_total: Math.round(qty * price * 100) / 100,
            specifications: it.specifications || '',
            supplier_id: it.supplier_id ?? data.supplier_id,
            is_supplementary: isSupplementary,
            supplement_batch: supplementBatch,
          });
        });

        setItems(mappedItems);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(parseApiError(err).message || 'تعذر تحميل بيانات أمر الشراء.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, poId]);

  // Live calculated grand total
  const calculatedGrandTotal = items.reduce(
    (acc, it) => acc + (Number(it.quantity || 0) * Number(it.unit_price || 0)),
    0
  );

  const handleItemFieldChange = (index: number, field: keyof EditableModalItem, value: any) => {
    setItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };
      if (field === 'quantity' || field === 'unit_price') {
        const qty = Number(field === 'quantity' ? value : item.quantity) || 0;
        const price = Number(field === 'unit_price' ? value : item.unit_price) || 0;
        item.line_total = Math.round(qty * price * 100) / 100;
      }
      updated[index] = item;
      return updated;
    });
    setError(null);
  };

  const handleSaveOnly = async () => {
    if (!po) return;
    if (items.length === 0) {
      setError('يجب أن يحتوي أمر الشراء على بند واحد على الأقل.');
      return;
    }

    setSaveBusy(true);
    setError(null);
    try {
      await updatePurchaseOrderApi(po.id, {
        finalization_notes: finalizationNotes || undefined,
        items: items.map((it) => ({
          id: it.id ? Number(it.id) : undefined,
          item_id: it.item_id ? Number(it.item_id) : undefined,
          pr_item_id: it.pr_item_id ? Number(it.pr_item_id) : undefined,
          item_description: it.item_description,
          item_reference: it.item_reference,
          region: it.region,
          quantity: Number(it.quantity),
          uom: it.uom,
          unit_price: Number(it.unit_price),
          specifications: it.specifications,
          supplier_id: it.supplier_id || po.supplier_id,
        })),
      });
      toast.success('✅ تم حفظ تعديلات أمر الشراء بنجاح.');
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setSaveBusy(false);
    }
  };

  const handleFinalize = async () => {
    if (!po) return;

    if (items.length === 0) {
      setError('يجب توفير بند واحد على الأقل لإصدار أمر الشراء الفعلي.');
      return;
    }

    const invalidItem = items.find(
      (it) => !it.item_description.trim() || Number(it.quantity) < 0 || Number(it.unit_price) < 0
    );
    if (invalidItem) {
      setError('يرجى التحقق من صحة جميع البنود (الكمية لا تقل عن صفر، الوصف، والسعر لا يقل عن صفر).');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const payloadItems: FinalizeActualPoItemPayload[] = items.map((it) => ({
        id: it.id ? Number(it.id) : undefined,
        item_id: it.item_id ? Number(it.item_id) : undefined,
        pr_item_id: it.pr_item_id ? Number(it.pr_item_id) : undefined,
        item_description: it.item_description,
        item_reference: it.item_reference,
        region: it.region,
        quantity: Number(it.quantity),
        uom: it.uom,
        unit_price: Number(it.unit_price),
        specifications: it.specifications,
        supplier_id: it.supplier_id || po.supplier_id,
      }));

      await finalizeActualPurchaseOrderApi(po.id, {
        items: payloadItems,
        notes: finalizationNotes.trim() || undefined,
      });

      toast.success(`✅ تم إصدار أمر الشراء الفعلي (${po.po_number}) واعتماده وإرساله للإدارة المالية بنجاح.`);
      onClose();
      onSuccess?.(po.po_number);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  const latestReceipt = po?.receipts && po.receipts.length > 0 ? po.receipts[0] : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      closeOnBackdrop={!busy && !saveBusy}
      closeOnEscape={!busy && !saveBusy}
      title={po ? `⚡ إصدار واعتماد أمر الشراء الفعلي — ${po.po_number}` : 'إصدار أمر الشراء الفعلي'}
      subtitle="مطابقة وتعديل الأسعار والكميات الفعلية بعد اعتماد إذن الاستلام بالموقع لإرسال الملف للإدارة المالية."
      size="2xl"
      footer={(
        <div className="flex flex-wrap items-center justify-between w-full gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={busy || saveBusy}
            className="cursor-pointer"
          >
            إلغاء والعودة
          </Button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveOnly}
              disabled={busy || saveBusy || loading}
              className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs sm:text-sm px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl shadow-lg shadow-cyan-600/30 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saveBusy ? (
                <>
                  <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  <span>جاري الحفظ...</span>
                </>
              ) : (
                <span>💾 حفظ كافة التعديلات</span>
              )}
            </button>

            <button
              type="button"
              onClick={handleFinalize}
              disabled={busy || saveBusy || loading}
              className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-black text-xs sm:text-sm px-5 sm:px-6 py-2 sm:py-2.5 rounded-xl shadow-xl shadow-emerald-950/50 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? (
                <>
                  <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  <span>جاري الاعتماد والإرسال...</span>
                </>
              ) : (
                <span>💰 اعتماد وإرسال للإدارة المالية</span>
              )}
            </button>
          </div>
        </div>
      )}
    >
      <div className="space-y-4 text-right" dir="rtl">
        {loading && (
          <div className="py-12">
            <LoadingSpinner message="جاري تحميل بنود أمر الشراء وإذن الاستلام المعتمد..." />
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-rose-500/50 bg-rose-950/30 px-4 py-3 text-xs font-bold leading-6 text-rose-200 shadow-md"
          >
            {error}
          </div>
        )}

        {!loading && po && (
          <>
            {/* ── Context & Summary Cards ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
              <div className="rounded-xl border border-cyan-500/30 bg-slate-950/70 p-3">
                <span className="text-slate-400 block text-[11px]">رقم أمر الشراء</span>
                <span className="font-mono font-black text-cyan-200 text-sm mt-0.5 block">{po.po_number}</span>
              </div>

              <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3">
                <span className="text-emerald-400 block text-[11px] font-semibold">المورد المعني</span>
                <span className="font-bold text-slate-100 text-sm mt-0.5 block truncate">
                  🏢 {po.supplier?.company_name || '—'}
                </span>
              </div>

              <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3">
                <span className="text-amber-400 block text-[11px] font-semibold">الموقع / المشروع</span>
                <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <span className="font-mono font-bold text-amber-200">قطعة {getSummaryParcels(po)}</span>
                  <span className="text-slate-500">•</span>
                  <span className="font-bold text-amber-300">{getSummaryRegions(po)}</span>
                </div>
              </div>

              <div className="rounded-xl border border-teal-500/30 bg-teal-950/20 p-3">
                <span className="text-teal-400 block text-[11px] font-semibold">إذن الاستلام المعتمد</span>
                <span className="font-mono font-bold text-teal-200 text-xs mt-0.5 block">
                  {latestReceipt ? `📦 ${latestReceipt.receipt_number || 'معتمد بالموقع'}` : 'تم الفحص بالموقع'}
                </span>
              </div>
            </div>

            {/* ── Instructions Banner ── */}
            <div className="rounded-xl border border-emerald-500/40 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-teal-950/30 p-3.5 text-xs text-emerald-200 flex items-start gap-3 shadow-md">
              <span className="text-xl shrink-0">💡</span>
              <div>
                <p className="font-bold text-emerald-100">
                  تم توريد البضاعة واعتماد إذن الاستلام في الموقع:
                </p>
                <p className="mt-0.5 text-[11px] text-slate-300">
                  راجِع الكميات الفعلية والأسعار وقم بتعديلها عند الحاجة، ثم اضغط على زر
                  <strong className="text-emerald-300 mx-1 font-bold">«اعتماد وإرسال للإدارة المالية»</strong>
                  لإغلاق النافذة وتحويل الملف مباشرة إلى الحسابات.
                </p>
              </div>
            </div>

            {/* ── Items Table (Desktop) ── */}
            <div className="hidden sm:block overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/80">
              <table className="w-full border-collapse text-right text-xs">
                <thead className="bg-slate-900 text-cyan-200">
                  <tr>
                    <th className="p-3 text-center w-10">#</th>
                    <th className="p-3">اسم الصنف والمواصفات</th>
                    <th className="p-3 text-center w-28">الكمية المستلمة</th>
                    <th className="p-3 text-center w-44">سعر الوحدة</th>
                    <th className="p-3 text-center w-32">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-rose-300 font-bold">
                        لا توجد بنود متاحة للإصدار الفعلي.
                      </td>
                    </tr>
                  ) : (
                    items.map((item, idx) => (
                      <tr key={item.id || idx} className="hover:bg-slate-900/50 transition-colors">
                        <td className="p-3 text-center font-mono text-slate-400 font-bold">{idx + 1}</td>
                        <td className="p-3 font-bold text-slate-100">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{item.item_description || '—'}</span>
                            <SupplementItemBadge
                              isSupplementary={item.is_supplementary}
                              batchNumber={item.supplement_batch}
                            />
                          </div>
                          {(item.item_reference || item.region) && (
                            <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400">
                              {item.item_reference && (
                                <span className="bg-slate-800/80 px-1.5 py-0.5 rounded text-amber-300">
                                  قطعة: {item.item_reference}
                                </span>
                              )}
                              {item.region && (
                                <span className="bg-slate-800/80 px-1.5 py-0.5 rounded text-copper-300">
                                  المنطقة: {item.region}
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.quantity ?? ''}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => handleItemFieldChange(idx, 'quantity', e.target.value)}
                              disabled={busy || saveBusy}
                              className="h-9 w-24 rounded-lg border border-cyan-500/60 bg-[#0b1424] px-2 text-center font-mono text-xs text-slate-100 outline-none focus:border-cyan-300 disabled:opacity-60"
                            />
                            <span className="text-[11px] font-bold text-amber-300">
                              {getUnitLabel(item.uom)}
                            </span>
                          </div>
                        </td>

                        <td className="p-3 text-center align-middle">
                          <SmartKgPricingInput
                            unitPrice={item.unit_price}
                            quantity={item.quantity}
                            uom={item.uom}
                            itemDescription={item.item_description}
                            disabled={busy || saveBusy}
                            onChangeUnitPrice={(newPrice) =>
                              handleItemFieldChange(idx, 'unit_price', newPrice)
                            }
                            onConvertToTon={(newQty, tonPrice) => {
                              handleItemFieldChange(idx, 'quantity', newQty);
                              handleItemFieldChange(idx, 'uom', 'TON');
                              handleItemFieldChange(idx, 'unit_price', tonPrice);
                            }}
                            onConvertToKgPrice={(newKgPrice) => {
                              handleItemFieldChange(idx, 'unit_price', newKgPrice);
                            }}
                          />
                        </td>

                        <td className="p-3 text-center font-mono font-black text-emerald-300 text-sm">
                          {formatCleanNumber(item.line_total, 2)} ج.م
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* ── Items Mobile Cards ── */}
            <div className="space-y-3 sm:hidden">
              {items.map((item, idx) => (
                <div
                  key={`mobile-${item.id || idx}`}
                  className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 space-y-3 text-xs"
                >
                  <div className="flex items-start justify-between gap-2 border-b border-slate-850 pb-2">
                    <div>
                      <span className="text-[10px] font-bold text-cyan-400">بند #{idx + 1}</span>
                      <p className="font-bold text-slate-100 text-sm mt-0.5">{item.item_description}</p>
                    </div>
                    <span className="text-[11px] font-bold bg-amber-950/50 text-amber-300 border border-amber-800/50 px-2 py-0.5 rounded shrink-0">
                      {getUnitLabel(item.uom)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">الكمية الفعلية:</label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={item.quantity ?? ''}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => handleItemFieldChange(idx, 'quantity', e.target.value)}
                        disabled={busy || saveBusy}
                        className="h-9 w-full rounded-lg border border-cyan-500/60 bg-[#0b1424] px-2 text-center font-mono text-xs text-slate-100 outline-none focus:border-cyan-300"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">سعر الوحدة:</label>
                      <SmartKgPricingInput
                        unitPrice={item.unit_price}
                        quantity={item.quantity}
                        uom={item.uom}
                        itemDescription={item.item_description}
                        disabled={busy || saveBusy}
                        onChangeUnitPrice={(newPrice) =>
                          handleItemFieldChange(idx, 'unit_price', newPrice)
                        }
                      />
                    </div>
                  </div>

                  <div className="flex justify-between items-center rounded-lg bg-emerald-950/30 border border-emerald-800/40 px-3 py-2">
                    <span className="text-slate-400 text-xs">إجمالي البند:</span>
                    <strong className="font-mono text-emerald-300 font-bold">
                      {formatCleanNumber(item.line_total, 2)} ج.م
                    </strong>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Grand Total Bar ── */}
            <div className="rounded-xl border border-slate-850 bg-slate-900/90 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
              <div className="text-xs text-slate-400 flex items-center gap-2">
                <span>عدد البنود الفعلية:</span>
                <strong className="text-slate-100 font-bold">{items.length}</strong>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs sm:text-sm font-bold text-slate-300">الإجمالي الكلي الفعلي:</span>
                <span className="font-mono font-black text-emerald-400 text-lg sm:text-xl">
                  {formatCleanNumber(calculatedGrandTotal, 2)} ج.م
                </span>
              </div>
            </div>

            {/* ── Finalization Notes for Finance ── */}
            <div className="space-y-1.5 pt-2 border-t border-slate-800">
              <label className="text-xs font-bold text-slate-300 block">
                ملاحظات وتوضيحات للإدارة المالية والحسابات (اختياري):
              </label>
              <textarea
                rows={2}
                value={finalizationNotes}
                onChange={(e) => setFinalizationNotes(e.target.value)}
                disabled={busy || saveBusy}
                placeholder="اكتب أي توضيحات للإدارة المالية بشأن فروق الكميات أو الأسعار أو استلامات الموقع..."
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyan-500 disabled:opacity-60"
              />
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

export default FinalizeActualPoModal;
