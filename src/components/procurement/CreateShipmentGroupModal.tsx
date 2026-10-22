import React, { useEffect, useState, useMemo } from 'react';
import { getEligibleShipmentItemsApi, createShipmentGroupApi } from '../../api/shipmentGroup';
import { EligibleShipmentItem } from '../../types/shipmentGroup';
import { formatCleanNumber, formatCleanQty } from '../../utils/numberFormat';
import { toast } from '../../utils/toast';

interface Props {
  isOpen: boolean;
  poId: number;
  poNumber?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateShipmentGroupModal: React.FC<Props> = ({
  isOpen,
  poId,
  poNumber,
  onClose,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<EligibleShipmentItem[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);
  const [groupName, setGroupName] = useState('');
  const [vehiclePlateNumber, setVehiclePlateNumber] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!isOpen || !poId) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    getEligibleShipmentItemsApi(poId)
      .then((res) => {
        if (!isMounted) return;
        const fetchedItems = res.items || [];
        setItems(fetchedItems);
        // By default select all eligible items
        setSelectedItemIds(fetchedItems.map((i) => i.id));
      })
      .catch((err: any) => {
        if (!isMounted) return;
        const msg = err?.response?.data?.message || 'تعذر تحميل بنود أمر الشراء المؤهلة للدمج كشحنة مشتركة.';
        setError(msg);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, poId]);

  const selectedItems = useMemo(() => {
    return items.filter((it) => selectedItemIds.includes(it.id));
  }, [items, selectedItemIds]);

  const totalValue = useMemo(() => {
    return selectedItems.reduce((sum, it) => sum + (Number(it.line_total) || 0), 0);
  }, [selectedItems]);

  const toggleItem = (id: number) => {
    setSelectedItemIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedItemIds.length === items.length) {
      setSelectedItemIds([]);
    } else {
      setSelectedItemIds(items.map((i) => i.id));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedItemIds.length < 1) {
      setError('يرجى اختيار بند واحد على الأقل للتجميع كشحنة مشتركة.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await createShipmentGroupApi({
        purchase_order_id: poId,
        item_ids: selectedItemIds,
        group_name: groupName.trim() || undefined,
        vehicle_plate_number: vehiclePlateNumber.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      toast.success('تم إنشاء مجموعة الشحنة المشتركة بنجاح وجاهزة للتوريد كشحنة واحدة 🚚');
      onSuccess();
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.message
        || err?.response?.data?.errors?.items?.[0]
        || err?.response?.data?.errors?.supplier?.[0]
        || 'حدث خطأ أثناء دمج الشحنة.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <div
        className="w-full max-w-2xl bg-slate-900 border border-amber-500/30 rounded-2xl shadow-2xl overflow-hidden my-8 text-right"
        dir="rtl"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-950/80 via-slate-900 to-slate-900 px-6 py-4 border-b border-amber-500/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-xl text-amber-400">
              🚚
            </div>
            <div>
              <h2 className="text-base font-black text-white">دمج كشحنة واحدة (مواد مشتركة على نفس النقلة)</h2>
              <p className="text-xs text-slate-400">
                أمر الشراء: <span className="font-mono font-bold text-amber-400">{poNumber || `PO-${poId}`}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white text-lg p-1 transition-colors"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3.5 bg-rose-950/60 border border-rose-500/40 rounded-xl text-xs text-rose-300 font-bold flex items-center gap-2">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <div className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-3.5 text-xs text-amber-200/90 leading-relaxed">
            💡 <strong>تجميع الشحنة المشتركة:</strong> يتيح تجميع أصناف ومواد مختلفة (مثل الرمل والسن) التي تصل معاً على نفس السيارة / النقلة، ليتعامل معها المستلم كوحدة شحنة واحدة مع الحفاظ التام على استقلالية كل بند وكميته وسعره.
          </div>

          {/* Group Name & Vehicle Plate */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                اسم أو وصف الشحنة (اختياري):
              </label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="مثال: شحنة رمل وسن نقلة 1"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:border-amber-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                رقم لوحة السيارة / النقلة (اختياري):
              </label>
              <input
                type="text"
                value={vehiclePlateNumber}
                onChange={(e) => setVehiclePlateNumber(e.target.value)}
                placeholder="مثال: ط س ر 1234"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:border-amber-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Eligible Items Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-slate-200 flex items-center gap-2">
                <span>📦</span>
                <span>اختر البنود المراد ضمها للشحنة المشتركة ({selectedItemIds.length} من {items.length} محدد):</span>
              </label>
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-[11px] text-amber-400 hover:text-amber-300 font-bold underline cursor-pointer"
                >
                  {selectedItemIds.length === items.length ? 'إلغاء تحديد الكل' : 'تحديد كافة البنود'}
                </button>
              )}
            </div>

            {loading ? (
              <div className="p-8 text-center text-xs text-slate-400">جاري تحميل البنود المؤهلة...</div>
            ) : items.length === 0 ? (
              <div className="p-6 text-center bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-slate-400">
                لا توجد بنود متاحة للدمج كشحنة مشتركة (ربما تم دمج جميع البنود أو استلامها مسبقاً).
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                {items.map((it) => {
                  const isChecked = selectedItemIds.includes(it.id);
                  return (
                    <div
                      key={it.id}
                      onClick={() => toggleItem(it.id)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 text-xs ${
                        isChecked
                          ? 'border-amber-500/60 bg-amber-950/20 text-white'
                          : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleItem(it.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 rounded border-slate-700 text-amber-500 focus:ring-0 cursor-pointer"
                        />
                        <div>
                          <div className="font-bold text-slate-200">{it.item_description}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            الكمية: <strong className="text-amber-300 font-mono">{formatCleanQty(it.quantity)} {it.uom}</strong>
                            {it.land_plot_number && <span> | قطعة: {it.land_plot_number}</span>}
                            {it.region && <span> ({it.region})</span>}
                          </div>
                        </div>
                      </div>
                      <div className="text-left font-mono shrink-0">
                        <div className="text-amber-300 font-bold">{formatCleanNumber(it.line_total)} ج.م</div>
                        <div className="text-[10px] text-slate-500">{formatCleanNumber(it.unit_price)} ج.م/{it.uom}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">
              ملاحظات الشحنة:
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="أي ملاحظات خاصة بالتوريد أو تعليمات لمسؤول الاستلام بالموقع..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 placeholder:text-slate-600 focus:border-amber-400 focus:outline-none resize-none"
            />
          </div>

          {/* Summary Footer */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between text-xs">
            <span className="text-slate-400">إجمالي قيمة البنود المحددة:</span>
            <span className="font-mono font-black text-amber-400 text-sm">
              {formatCleanNumber(totalValue)} ج.م
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={submitting || selectedItemIds.length === 0}
              className="px-6 py-2.5 rounded-xl text-xs font-black bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-lg shadow-amber-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2"
            >
              {submitting ? 'جاري الحفظ...' : `حفظ وتأكيد دمج (${selectedItemIds.length}) بنود كشحنة واحدة ←`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateShipmentGroupModal;
