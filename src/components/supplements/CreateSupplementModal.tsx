import React, { useState } from 'react';
import { PurchaseRequest } from '../../types/purchaseRequest';
import { CreateSupplementItemPayload, CreateSupplementPayload } from '../../types/supplement';
import { createSupplementApi } from '../../api/supplements';

interface CreateSupplementModalProps {
  request: PurchaseRequest;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateSupplementModal: React.FC<CreateSupplementModalProps> = ({
  request,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<CreateSupplementItemPayload[]>([
    {
      item_description: '',
      quantity: 1,
      uom: 'قطعة',
      estimated_unit_price: 0,
      specifications: '',
      notes: '',
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        item_description: '',
        quantity: 1,
        uom: 'قطعة',
        estimated_unit_price: 0,
        specifications: '',
        notes: '',
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length === 1) return;
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleItemChange = (index: number, field: keyof CreateSupplementItemPayload, value: any) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const calculateTotal = () => {
    return items.reduce((acc, item) => {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.estimated_unit_price) || 0;
      return acc + qty * price;
    }, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate
    for (let i = 0; i < items.length; i++) {
      if (!items[i].item_description.trim()) {
        setError(`يرجى كتابة وصف الصنف للبند رقم ${i + 1}`);
        return;
      }
      if (Number(items[i].quantity) <= 0) {
        setError(`الكمية يجب أن تكون أكبر من صفر للبند رقم ${i + 1}`);
        return;
      }
    }

    try {
      setLoading(true);
      const payload: CreateSupplementPayload = {
        notes: notes.trim() || undefined,
        items: items.map((itm) => ({
          ...itm,
          quantity: Number(itm.quantity),
          estimated_unit_price: Number(itm.estimated_unit_price) || 0,
          item_reference: request.parcel_reference,
          region: request.region,
        })),
      };

      await createSupplementApi(request.id, payload);
      onSuccess();
      onClose();
    } catch (err: any) {
      const msg = err.response?.data?.message || 'حدث خطأ أثناء حفظ طلب الكمالة.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl rounded-2xl bg-white shadow-2xl transition-all dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 p-6 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold">
                ➕
              </span>
              <h3 className="text-xl font-bold text-slate-800 dark:text-white">
                طلب كمالة جديد على الطلب ({request.request_number})
              </h3>
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              إضافة بنود تكميلية لنفس الطلب قبل اعتماد إذن الاستلام في الموقع
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        {/* PR Info Header Banner */}
        <div className="bg-amber-50/70 border-b border-amber-100/80 px-6 py-3 dark:bg-amber-950/20 dark:border-amber-900/30">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-slate-500 dark:text-slate-400 block">القطعة:</span>
              <strong className="text-slate-800 dark:text-slate-200">{request.parcel_reference || 'عام'}</strong>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400 block">المنطقة:</span>
              <strong className="text-slate-800 dark:text-slate-200">{request.region || 'المركز الرئيسي'}</strong>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400 block">القسم:</span>
              <strong className="text-slate-800 dark:text-slate-200">{request.department?.name || '—'}</strong>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400 block">حالة الاستلام:</span>
              <strong className="text-emerald-600 dark:text-emerald-400">لم يتم الاستلام بعد</strong>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="mb-4 rounded-lg bg-rose-50 p-4 text-sm text-rose-600 dark:bg-rose-950/30 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50">
              {error}
            </div>
          )}

          {/* Supplement Notes */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              سبب التكملة / ملاحظات على الكمالة:
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثال: حاجة إضافية للأعمال الخرسانية بالقطعة..."
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-800 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          {/* Line Items */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-bold text-slate-800 dark:text-white">
                بنود الكمالة المطلوبة:
              </label>
              <button
                type="button"
                onClick={handleAddItem}
                className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 hover:text-amber-700 dark:text-amber-400"
              >
                + إضافة بند آخر
              </button>
            </div>

            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-slate-200 p-4 bg-slate-50/50 dark:border-slate-700/60 dark:bg-slate-800/40 relative"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
                      بند رقم #{idx + 1}
                    </span>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="text-xs text-rose-500 hover:text-rose-700 font-semibold"
                      >
                        حذف البند
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                    <div className="sm:col-span-5">
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        وصف الصنف *
                      </label>
                      <input
                        type="text"
                        required
                        value={item.item_description}
                        onChange={(e) => handleItemChange(idx, 'item_description', e.target.value)}
                        placeholder="اسم المادة أو الصنف"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        الكمية *
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0.01"
                        required
                        value={item.quantity}
                        onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        الوحدة
                      </label>
                      <input
                        type="text"
                        value={item.uom || ''}
                        onChange={(e) => handleItemChange(idx, 'uom', e.target.value)}
                        placeholder="طن / م3 / حبة"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        سعر تقديري (ج.م)
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={item.estimated_unit_price || ''}
                        onChange={(e) => handleItemChange(idx, 'estimated_unit_price', e.target.value)}
                        placeholder="0.00"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="mt-2">
                    <input
                      type="text"
                      value={item.specifications || ''}
                      onChange={(e) => handleItemChange(idx, 'specifications', e.target.value)}
                      placeholder="مواصفات إضافية أو مقاسات (اختياري)..."
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer with totals and action buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-slate-100 pt-4 dark:border-slate-800">
            <div className="text-sm">
              <span className="text-slate-500 dark:text-slate-400">إجمالي تقديري للكمالة: </span>
              <strong className="text-amber-600 dark:text-amber-400 font-bold text-base">
                {calculateTotal().toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م
              </strong>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={loading}
                className="rounded-xl bg-amber-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-amber-600/30 hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
              >
                {loading ? 'جارٍ الحفظ...' : 'إرسال طلب الكمالة'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
