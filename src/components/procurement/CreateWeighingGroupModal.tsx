import React, { useEffect, useState, useMemo } from 'react';
import { getEligibleSteelItemsApi, createWeighingGroupApi } from '../../api/weighingGroup';
import { EligibleSteelItem } from '../../types/weighingGroup';
import { formatCleanNumber, formatCleanQty } from '../../utils/numberFormat';
import { toast } from '../../utils/toast';

interface Props {
  isOpen: boolean;
  poId: number;
  poNumber?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateWeighingGroupModal: React.FC<Props> = ({
  isOpen,
  poId,
  poNumber,
  onClose,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<EligibleSteelItem[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!isOpen || !poId) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    getEligibleSteelItemsApi(poId)
      .then((res) => {
        if (!isMounted) return;
        const fetchedItems = res.items || [];
        setItems(fetchedItems);
        // By default select all eligible items
        setSelectedItemIds(fetchedItems.map((i) => i.id));
      })
      .catch((err: any) => {
        if (!isMounted) return;
        const msg = err?.response?.data?.message || 'تعذر تحميل بنود الحديد المؤهلة للتجميع.';
        setError(msg);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, poId]);

  // Selected items calculation
  const selectedItems = useMemo(() => {
    return items.filter((it) => selectedItemIds.includes(it.id));
  }, [items, selectedItemIds]);

  const totalOrderedWeight = useMemo(() => {
    return selectedItems.reduce((sum, it) => sum + (Number(it.weight_in_tons) || 0), 0);
  }, [selectedItems]);

  const totalValue = useMemo(() => {
    return selectedItems.reduce((sum, it) => sum + (Number(it.line_total) || 0), 0);
  }, [selectedItems]);

  const uniqueSuppliers = useMemo(() => {
    return Array.from(new Set(selectedItems.map((it) => it.supplier_id)));
  }, [selectedItems]);

  const isDifferentSuppliers = uniqueSuppliers.length > 1;

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
    if (selectedItemIds.length === 0) {
      setError('يرجى اختيار بند واحد على الأقل للتجميع.');
      return;
    }

    if (isDifferentSuppliers) {
      setError('لا يمكن تجميع البنود لأن المورد مختلف. يجب أن تتبع جميع بنود الوزنة نفس المورد.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await createWeighingGroupApi({
        purchase_order_id: poId,
        item_ids: selectedItemIds,
        notes: notes.trim() || undefined,
      });

      toast.success('تم تجميع وزنة الحديد بنجاح وجاهزة للاستلام بالموقع كوزنة واحدة ⚖️');
      onSuccess();
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.message
        || err?.response?.data?.errors?.supplier?.[0]
        || err?.response?.data?.errors?.items?.[0]
        || 'حدث خطأ أثناء تجميع الوزنة.';
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
              ⚖️
            </div>
            <div>
              <h2 className="text-base font-black text-white">تجميع وزنة حديد (ميزان بسكول)</h2>
              <p className="text-xs text-slate-400">
                أمر الشراء: <span className="font-mono font-bold text-amber-400">{poNumber || `PO-${poId}`}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-2">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
              <span className="w-8 h-8 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
              <span className="text-xs font-bold">جاري فحص بنود الحديد المؤهلة في أمر الشراء...</span>
            </div>
          ) : items.length === 0 ? (
            <div className="py-8 text-center text-slate-400 space-y-2">
              <div className="text-3xl">📦</div>
              <p className="text-xs font-bold text-slate-300">
                لا توجد بنود حديد مؤهلة للتجميع في هذا الأمر حالياً.
              </p>
              <p className="text-[11px] text-slate-500">
                إما أن البنود تم تجميعها أو استلامها بالفعل، أو لا يحتوي الأمر على بنود مصنفة كحديد تسليح.
              </p>
            </div>
          ) : (
            <>
              {/* Mandatory System Warning */}
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs leading-relaxed space-y-1.5">
                <div className="font-black text-amber-300 flex items-center gap-1.5">
                  <span>🛡️</span>
                  <span>تنبيه هام ومحاسبي:</span>
                </div>
                <p>
                  سيتم إرسال البنود المختارة إلى الاستلام كوزنة واحدة لميزان البسكول،
                  <strong> مع الاحتفاظ الكامل بتفاصيل كل بند ومقاس وسعر وقطعة أرض وعدم فقدان أي بيانات.</strong>
                </p>
              </div>

              {/* Items List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                  <span className="font-bold text-slate-300">بنود الحديد المؤهلة للتجميع:</span>
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-amber-400 hover:text-amber-300 font-bold transition-colors text-[11px]"
                  >
                    {selectedItemIds.length === items.length ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
                  </button>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {items.map((it) => {
                    const isSelected = selectedItemIds.includes(it.id);
                    return (
                      <div
                        key={it.id}
                        onClick={() => toggleItem(it.id)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                          isSelected
                            ? 'bg-amber-950/20 border-amber-500/40 text-white'
                            : 'bg-slate-800/40 border-slate-750 text-slate-400 hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}} // handled by div
                            className="w-4 h-4 rounded border-slate-700 text-amber-500 focus:ring-amber-400 cursor-pointer"
                          />
                          <div>
                            <div className="text-xs font-bold text-slate-100 flex items-center gap-2">
                              <span>{it.item_description}</span>
                              {it.size_or_diameter && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-amber-300 font-mono border border-slate-700">
                                  {it.size_or_diameter}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 flex items-center gap-3 mt-0.5">
                              <span>المورد: <strong className="text-slate-300">{it.supplier_name}</strong></span>
                              {it.land_plot_number && <span>ق: {it.land_plot_number}</span>}
                              {it.region && <span>م: {it.region}</span>}
                            </div>
                          </div>
                        </div>

                        <div className="text-left font-mono shrink-0">
                          <div className="text-xs font-bold text-amber-300">
                            {formatCleanQty(it.weight_in_tons)} طن
                          </div>
                          <div className="text-[10px] text-slate-400">
                            سعر الطن: {formatCleanNumber(it.unit_price)} ج.م
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-2.5 p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-center">
                <div className="p-2">
                  <div className="text-[10px] text-slate-400 font-bold">عدد المقاسات</div>
                  <div className="text-sm font-black text-white font-mono mt-0.5">
                    {selectedItems.length}
                  </div>
                </div>
                <div className="p-2 border-x border-slate-800">
                  <div className="text-[10px] text-slate-400 font-bold">إجمالي وزن الشحنة</div>
                  <div className="text-sm font-black text-amber-400 font-mono mt-0.5">
                    {formatCleanQty(totalOrderedWeight)} طن
                  </div>
                </div>
                <div className="p-2">
                  <div className="text-[10px] text-slate-400 font-bold">إجمالي القيمة التقديرية</div>
                  <div className="text-sm font-black text-emerald-400 font-mono mt-0.5">
                    {formatCleanNumber(totalValue)} ج.م
                  </div>
                </div>
              </div>

              {/* Notes input */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-300">
                  ملاحظات للوزنة (اختياري):
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="مثال: توريد شحنة حديد دفعة واحدة على تريلا رقم ..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-amber-400"
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-950 px-6 py-4 border-t border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-bold transition-all"
          >
            إلغاء
          </button>

          {items.length > 0 && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || selectedItemIds.length === 0 || isDifferentSuppliers}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-950 border-t-transparent animate-spin" />
                  <span>جاري تجميع الوزنة...</span>
                </>
              ) : (
                <>
                  <span>تأكيد تجميع الوزنة</span>
                  <span>⚖️</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreateWeighingGroupModal;
