import React, { useEffect, useState } from 'react';
import { PurchaseRequest } from '../../types/purchaseRequest';
import { PurchaseRequestSupplement } from '../../types/supplement';
import { getSuppliersAdminApi, SupplierAdmin } from '../../api/admin/suppliers';
import { processSupplementProcurementApi } from '../../api/supplements';

interface ProcurementSupplementProcessModalProps {
  request: PurchaseRequest;
  supplement: PurchaseRequestSupplement;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ProcurementSupplementProcessModal: React.FC<ProcurementSupplementProcessModalProps> = ({
  request,
  supplement,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [suppliers, setSuppliers] = useState<SupplierAdmin[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [useDifferentSupplier, setUseDifferentSupplier] = useState(false);
  const [mergeToExistingPo, setMergeToExistingPo] = useState(true);
  const [pricing, setPricing] = useState<Record<number, number>>({});
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Identify original supplier from POs
  const originalSupplier = request.purchase_orders?.[0]?.supplier || request.direct_supplier;

  useEffect(() => {
    if (isOpen) {
      void loadSuppliers();
      // Initialize pricing from estimated unit price
      const initialPricing: Record<number, number> = {};
      (supplement.items || []).forEach((itm) => {
        initialPricing[itm.id] = Number(itm.estimated_unit_price) || 0;
      });
      setPricing(initialPricing);

      if (originalSupplier?.id) {
        setSelectedSupplierId(originalSupplier.id);
        setUseDifferentSupplier(false);
      }
    }
  }, [isOpen, supplement]);

  const loadSuppliers = async () => {
    try {
      const data = await getSuppliersAdminApi();
      setSuppliers(data.filter((s) => s.is_active));
      if (!originalSupplier && data.length > 0) {
        setSelectedSupplierId(data[0].id);
      }
    } catch {
      // Fallback
    }
  };

  if (!isOpen) return null;

  const handlePriceChange = (prItemId: number, price: number) => {
    setPricing((prev) => ({
      ...prev,
      [prItemId]: price,
    }));
  };

  const calculateTotal = () => {
    return (supplement.items || []).reduce((acc, itm) => {
      const p = pricing[itm.id] || 0;
      return acc + (Number(itm.quantity) || 0) * p;
    }, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedSupplierId) {
      setError('يرجى تحديد المورد المسؤول عن توريد بنود الكمالة.');
      return;
    }

    // Validate pricing
    for (const itm of supplement.items || []) {
      const p = pricing[itm.id];
      if (p === undefined || p <= 0) {
        setError(`يرجى تحديد سعر توريد صحيح للبند: ${itm.item_description}`);
        return;
      }
    }

    try {
      setLoading(true);
      const itemsPricing = (supplement.items || []).map((itm) => ({
        pr_item_id: itm.id,
        unit_price: Number(pricing[itm.id]),
      }));

      await processSupplementProcurementApi(supplement.id, {
        supplier_id: selectedSupplierId,
        merge_to_existing_po: useDifferentSupplier ? false : mergeToExistingPo,
        notes: notes.trim() || undefined,
        items_pricing: itemsPricing,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      const msg = err.response?.data?.message || 'حدث خطأ أثناء معالجة الكمالة وإصدار أمر الشراء.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-3xl rounded-2xl bg-slate-950 shadow-2xl shadow-amber-900/20 transition-all border border-amber-500/30 ring-1 ring-amber-500/10">
        {/* Header - Luxury Gold */}
        <div className="flex items-center justify-between border-b border-amber-500/20 bg-gradient-to-r from-slate-950 via-amber-950/20 to-slate-950 p-6 rounded-t-2xl">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-700/20 border border-amber-500/40 text-amber-400 font-bold text-lg shadow-inner">
                ⚡
              </span>
              <h3 className="text-xl font-black text-amber-100">
                إصدار ملحق توريد سريع — دفعة #{supplement.batch_number}
              </h3>
            </div>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              تحديد المورد المنفذ وتسعير بنود الكمالة التكميلية لإصدار أمر شراء سريع مرتبط بالطلب الأصلي.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800 transition-all cursor-pointer"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Contextual UX Banner */}
          <div className="rounded-xl border border-amber-600/30 bg-gradient-to-r from-amber-950/30 via-slate-900 to-amber-950/20 p-4 text-right">
            <p className="text-sm text-amber-200 leading-7 font-medium">
              هذه الكمية تكميلية لطلب معتمد مسبقاً، سيتم إصدار أمر التوريد لنفس المورد{' '}
              {originalSupplier ? (
                <strong className="text-amber-100 bg-amber-500/10 px-1.5 py-0.5 rounded-md border border-amber-500/30">
                  {originalSupplier.company_name}
                </strong>
              ) : (
                <span className="text-slate-400">(سيتم اختياره أدناه)</span>
              )}{' '}
              لتسريع العمل بالموقع.
            </p>
          </div>

          {error && (
            <div className="rounded-xl bg-rose-950/40 p-4 text-sm text-rose-300 border border-rose-700/50 shadow-inner">
              ⚠️ {error}
            </div>
          )}

          {/* Supplier Selection Strategy */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5">
            <h4 className="text-sm font-black text-slate-100 mb-4 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              خيار إسناد المورد للكمالة:
            </h4>

            <div className="flex flex-col sm:flex-row gap-4 mb-4">
              {originalSupplier && (
                <label className="flex items-center gap-2.5 text-sm text-slate-300 cursor-pointer group">
                  <input
                    type="radio"
                    name="supplier_choice"
                    checked={!useDifferentSupplier}
                    onChange={() => {
                      setUseDifferentSupplier(false);
                      setSelectedSupplierId(originalSupplier.id);
                    }}
                    className="text-amber-500 focus:ring-amber-500 accent-amber-500"
                  />
                  <span className="group-hover:text-amber-200 transition-colors">
                    نفس المورد الأصلي:{' '}
                    <strong className="text-amber-300">{originalSupplier.company_name}</strong>
                  </span>
                </label>
              )}

              <label className="flex items-center gap-2.5 text-sm text-slate-300 cursor-pointer group">
                <input
                  type="radio"
                  name="supplier_choice"
                  checked={useDifferentSupplier || !originalSupplier}
                  onChange={() => {
                    setUseDifferentSupplier(true);
                    setMergeToExistingPo(false);
                  }}
                  className="text-amber-500 focus:ring-amber-500 accent-amber-500"
                />
                <span className="group-hover:text-amber-200 transition-colors">
                  إسناد الكمالة <strong className="text-slate-100">لمورد مختلف</strong>
                </span>
              </label>
            </div>

            {/* Dropdown if different supplier selected */}
            {(useDifferentSupplier || !originalSupplier) && (
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">
                  اختر المورد المنفذ للكمالة:
                </label>
                <select
                  value={selectedSupplierId || ''}
                  onChange={(e) => setSelectedSupplierId(Number(e.target.value))}
                  required
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                >
                  <option value="">-- اختر المورد --</option>
                  {suppliers.map((sup) => (
                    <option key={sup.id} value={sup.id}>
                      {sup.company_name || sup.name} ({sup.code})
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-amber-400/80">
                  ℹ️ سيتم إصدار أمر شراء تكميلي جديد لهذا المورد مرتبط بنفس الطلب ومسار الاستلام.
                </p>
              </div>
            )}
          </div>

          {/* Pricing Table */}
          <div>
            <h4 className="text-sm font-black text-slate-100 mb-3 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              تسعير بنود الكمالة (سعر الوحدة النهائي من المورد):
            </h4>

            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-right text-sm">
                <thead className="bg-slate-900 text-xs font-bold text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="p-3">الصنف</th>
                    <th className="p-3">الكمية</th>
                    <th className="p-3">الوحدة</th>
                    <th className="p-3">سعر الوحدة (ج.م) *</th>
                    <th className="p-3">الإجمالي (ج.م)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {(supplement.items || []).map((item) => {
                    const price = pricing[item.id] || 0;
                    const lineTotal = (Number(item.quantity) || 0) * price;
                    return (
                      <tr key={item.id} className="hover:bg-slate-800/50 transition-colors">
                        <td className="p-3 font-bold text-slate-200">
                          {item.item_description}
                        </td>
                        <td className="p-3 text-slate-400 font-mono">
                          {item.quantity}
                        </td>
                        <td className="p-3 text-slate-400">
                          {item.uom || '—'}
                        </td>
                        <td className="p-3 w-40">
                          <input
                            type="number"
                            step="any"
                            min="0.01"
                            required
                            value={price || ''}
                            onChange={(e) => handlePriceChange(item.id, Number(e.target.value))}
                            placeholder="0.00"
                            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm font-bold text-amber-200 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 focus:outline-none placeholder-slate-600"
                          />
                        </td>
                        <td className="p-3 font-bold text-amber-300 font-mono">
                          {lineTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1.5">
              ملاحظات المشتريات / شروط التوريد للكمالة:
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثال: التوريد خلال 48 ساعة بنفس شروط الدفع..."
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 focus:outline-none"
            />
          </div>

          {/* Footer */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-slate-800 pt-5">
            <div>
              <span className="text-xs text-slate-400 block">إجمالي أمر التوريد للكمالة:</span>
              <strong className="text-amber-400 font-black text-xl font-mono">
                {calculateTotal().toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م
              </strong>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-2.5 text-sm font-bold text-slate-300 hover:bg-slate-700 hover:text-white transition-all disabled:opacity-50 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={loading}
                className="rounded-xl bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 hover:from-amber-400 hover:via-amber-500 hover:to-amber-600 px-6 py-2.5 text-sm font-black text-slate-950 shadow-lg shadow-amber-600/30 focus:outline-none focus:ring-2 focus:ring-amber-500/40 disabled:opacity-50 transition-all cursor-pointer hover:-translate-y-0.5 active:translate-y-0"
              >
                {loading ? 'جارٍ المعالجة...' : '⚡ تأكيد وإصدار'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
