import React, { useState } from 'react';
import { PurchaseRequest } from '../../types/purchaseRequest';
import { CreateSupplementItemPayload, CreateSupplementPayload } from '../../types/supplement';
import { createSupplementApi } from '../../api/supplements';
import { ItemAutocompleteInput } from '../common/ItemAutocompleteInput';

const COMMON_UNITS = [
  'طن',
  'متر مكعب',
  'متر طولي',
  'كيلوجرام',
  'قطعة',
  'شكارة',
  'لفة',
  'لوح',
  'علبة',
  'طرد',
  'ساعة',
  'يوم',
];

interface CreateSupplementModalProps {
  request: PurchaseRequest;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface SupplementFormItem {
  item_id?: number;
  item_description: string;
  quantity: number | string;
  uom: string;
  specifications: string;
  notes: string;
}

export const CreateSupplementModal: React.FC<CreateSupplementModalProps> = ({
  request,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<SupplementFormItem[]>([
    {
      item_description: '',
      quantity: '',
      uom: 'قطعة',
      specifications: '',
      notes: '',
    },
  ]);
  const [selectedPrItemIds, setSelectedPrItemIds] = useState<(number | null)[]>([null]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        item_description: '',
        quantity: '',
        uom: 'قطعة',
        specifications: '',
        notes: '',
      },
    ]);
    setSelectedPrItemIds((prev) => [...prev, null]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length === 1) return;
    setItems((prev) => prev.filter((_, idx) => idx !== index));
    setSelectedPrItemIds((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleItemChange = (index: number, field: keyof SupplementFormItem, value: any) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleSelectExistingPrItem = (index: number, prItemIdStr: string) => {
    if (!prItemIdStr) {
      setSelectedPrItemIds((prev) => {
        const u = [...prev];
        u[index] = null;
        return u;
      });
      return;
    }
    const selectedId = Number(prItemIdStr);
    const foundPrItem = (request.items || []).find((i) => i.id === selectedId);
    if (foundPrItem) {
      setSelectedPrItemIds((prev) => {
        const u = [...prev];
        u[index] = foundPrItem.id;
        return u;
      });
      setItems((prev) => {
        const updated = [...prev];
        updated[index] = {
          ...updated[index],
          item_id: foundPrItem.item_id || undefined,
          item_description: foundPrItem.item_description,
          quantity: '', // إفراغ الكمية لإجبار المهندس على كتابة رقم الكمية بنفسه
          uom: foundPrItem.uom || 'قطعة',
          specifications: foundPrItem.specifications || updated[index].specifications || '',
        };
        return updated;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // التحقق من حقل سبب التكملة (إلزامي)
    if (!notes.trim()) {
      setError('يرجى كتابة سبب التكملة ومبرر الاحتياج الميداني قبل إرسال الطلب.');
      return;
    }

    // Validate items
    for (let i = 0; i < items.length; i++) {
      if (!items[i].item_description.trim()) {
        setError(`يرجى كتابة وصف الصنف للبند رقم ${i + 1}`);
        return;
      }
      const rawQty = String(items[i].quantity).trim();
      const numQty = Number(rawQty);
      if (!rawQty || isNaN(numQty) || numQty <= 0) {
        setError(`الكمية يجب أن تكون أكبر من صفر للبند رقم ${i + 1}`);
        return;
      }
    }

    try {
      setLoading(true);
      const payload: CreateSupplementPayload = {
        notes: notes.trim(),
        items: items.map((itm) => ({
          ...itm,
          quantity: Number(itm.quantity),
          estimated_unit_price: 0, // Pricing is exclusively set by procurement
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
      <div className="relative w-full max-w-3xl max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden rounded-2xl bg-white shadow-2xl transition-all dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 p-4 sm:p-6 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold">
                ➕
              </span>
              <h3 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-white">
                طلب كمالة جديد على الطلب ({request.request_number})
              </h3>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              إضافة كميات تكميلية لنفس بنود الطلب المفتوح — التسعير وتحديد المورد يتم من المشتريات
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {/* PR Info Header Banner - Prominently highlighting Parcel & Region */}
        <div className="bg-gradient-to-r from-amber-500/15 via-amber-950/20 to-slate-900 border-b border-amber-500/30 px-6 py-3.5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div className="bg-amber-950/40 p-2 rounded-xl border border-amber-500/30">
              <span className="text-amber-400 block text-[11px] font-bold">🏷️ رقم قطعة الأرض:</span>
              <strong className="font-mono text-base font-black text-amber-300 block mt-0.5">
                {request.parcel_reference || 'عام / غير محددة'}
              </strong>
            </div>
            <div className="bg-amber-950/40 p-2 rounded-xl border border-amber-500/30">
              <span className="text-copper-400 block text-[11px] font-bold">📍 المشروع / المنطقة:</span>
              <strong className="text-base font-black text-slate-100 block mt-0.5">
                {request.region || 'المركز الرئيسي'}
              </strong>
            </div>
            <div className="bg-slate-950/50 p-2 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-[11px] font-semibold">🏢 القسم:</span>
              <strong className="text-slate-200 text-sm font-bold block mt-0.5">
                {request.department?.name || '—'}
              </strong>
            </div>
            <div className="bg-slate-950/50 p-2 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-[11px] font-semibold">📦 حالة الاستلام:</span>
              <strong className="text-emerald-400 text-sm font-bold block mt-0.5">
                لم يتم الاستلام بعد
              </strong>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6">
          {error && (
            <div className="mb-4 rounded-lg bg-rose-50 p-4 text-sm text-rose-600 dark:bg-rose-950/30 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50">
              {error}
            </div>
          )}

          {/* Info: pricing handled by procurement */}
          <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-300">
            <div className="flex items-start gap-2">
              <span className="text-base">💡</span>
              <span>يمكنك اختيار البند من بنود الطلب القائمة وتحديد الكمية الإضافية، كما يمكنك تعديل وحدة القياس بحرية.</span>
            </div>
          </div>

          {/* Supplement Notes */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              سبب التكملة / مبرر الاحتياج الميداني <span className="text-rose-500 font-bold">*</span>
            </label>
            <input
              type="text"
              required
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثال: حاجة إضافية للموقع لاستكمال صب اللبشة المسلحة..."
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
                + إضافة بند كمالة آخر
              </button>
            </div>

            <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
              {items.map((item, idx) => {
                const linkedPrItem = (request.items || []).find((i) => i.id === selectedPrItemIds[idx]);

                return (
                  <div
                    key={idx}
                    className="rounded-xl border border-slate-200 p-4 bg-slate-50/50 dark:border-slate-700/60 dark:bg-slate-800/40 relative space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
                        بند كمالة #{idx + 1}
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

                    {/* Quick Picker from PR items */}
                    {(request.items || []).length > 0 && (
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                          اختر من بنود الطلب الأصلي لزيادة كميته:
                        </label>
                        <select
                          value={selectedPrItemIds[idx] || ''}
                          onChange={(e) => handleSelectExistingPrItem(idx, e.target.value)}
                          className="w-full rounded-lg border border-amber-300 bg-amber-50/50 px-3 py-1.5 text-xs font-semibold text-slate-800 focus:border-amber-500 focus:outline-none dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-200"
                        >
                          <option value="">-- أو أدخل صنفاً يدوياً جديداً --</option>
                          {(request.items || []).map((prItm) => (
                            <option key={prItm.id} value={prItm.id}>
                              {prItm.item_description} (الكمية الحالية بالطلب: {prItm.quantity} {prItm.uom || ''})
                            </option>
                          ))}
                        </select>
                        {linkedPrItem && (
                          <div className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                            ✓ مرتبط بالبند الأصلي (الكمية السابقة: {linkedPrItem.quantity} {linkedPrItem.uom}) — أدخل كمية الزيادة بالأسفل
                          </div>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                      <div className="sm:col-span-6">
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                          وصف الصنف *
                        </label>
                        <ItemAutocompleteInput
                          required
                          value={item.item_description}
                          onChange={(val) => handleItemChange(idx, 'item_description', val)}
                          placeholder="اسم المادة أو الصنف"
                        />
                      </div>

                      <div className="sm:col-span-3">
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                          كمية الكمالة <span className="text-rose-500 font-bold">*</span>
                        </label>
                        <input
                          type="number"
                          step="any"
                          min="0.001"
                          required
                          value={item.quantity}
                          onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                          placeholder="أدخل كمية الزيادة"
                        />
                      </div>

                      <div className="sm:col-span-3">
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                          الوحدة (قابلة للتغيير)
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            list={`units-list-${idx}`}
                            value={item.uom || ''}
                            onChange={(e) => handleItemChange(idx, 'uom', e.target.value)}
                            placeholder="طن / م3 / حبة"
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                          />
                          <datalist id={`units-list-${idx}`}>
                            {COMMON_UNITS.map((u) => (
                              <option key={u} value={u} />
                            ))}
                          </datalist>
                        </div>
                      </div>
                    </div>

                    <div>
                      <input
                        type="text"
                        value={item.specifications || ''}
                        onChange={(e) => handleItemChange(idx, 'specifications', e.target.value)}
                        placeholder="مواصفات إضافية أو مقاسات (اختياري)..."
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer with action buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-slate-100 pt-4 dark:border-slate-800">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              <span>عدد البنود: <strong className="text-slate-700 dark:text-slate-200">{items.length}</strong></span>
              <span className="mx-2">•</span>
              <span>سيتم التسعير بواسطة إدارة المشتريات</span>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="w-full sm:w-auto min-h-[44px] sm:min-h-0 rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={loading}
                className="w-full sm:w-auto min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-amber-600/30 hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none transition-all cursor-pointer"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>جارٍ الحفظ...</span>
                  </>
                ) : (
                  'إرسال طلب الكمالة'
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
