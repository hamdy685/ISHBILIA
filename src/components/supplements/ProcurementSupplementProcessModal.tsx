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
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl rounded-2xl bg-white shadow-2xl transition-all dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 p-6 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold">
                🏢
              </span>
              <h3 className="text-xl font-bold text-slate-800 dark:text-white">
                توجيه وتسعير الكمالة (دفعة #{supplement.batch_number})
              </h3>
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              تحديد المورد (نفس المورد أو مورد مختلف) وإصدار أمر الشراء التكميلي
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

        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="mb-4 rounded-lg bg-rose-50 p-4 text-sm text-rose-600 dark:bg-rose-950/30 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50">
              {error}
            </div>
          )}

          {/* Supplier Selection Strategy */}
          <div className="mb-6 rounded-xl border border-blue-100 bg-blue-50/50 p-4 dark:border-blue-900/30 dark:bg-blue-950/20">
            <h4 className="text-sm font-bold text-slate-800 dark:text-white mb-3">
              خيار إسناد المورد للكمالة:
            </h4>

            <div className="flex flex-col sm:flex-row gap-4 mb-4">
              {originalSupplier && (
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    name="supplier_choice"
                    checked={!useDifferentSupplier}
                    onChange={() => {
                      setUseDifferentSupplier(false);
                      setSelectedSupplierId(originalSupplier.id);
                    }}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span>نفس المورد الأصلي: <strong>{originalSupplier.company_name}</strong></span>
                </label>
              )}

              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="radio"
                  name="supplier_choice"
                  checked={useDifferentSupplier || !originalSupplier}
                  onChange={() => {
                    setUseDifferentSupplier(true);
                    setMergeToExistingPo(false);
                  }}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span>إسناد الكمالة <strong>لمورد مختلف</strong></span>
              </label>
            </div>

            {/* Dropdown if different supplier selected */}
            {(useDifferentSupplier || !originalSupplier) && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  اختر المورد المنفذ للكمالة:
                </label>
                <select
                  value={selectedSupplierId || ''}
                  onChange={(e) => setSelectedSupplierId(Number(e.target.value))}
                  required
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="">-- اختر المورد --</option>
                  {suppliers.map((sup) => (
                    <option key={sup.id} value={sup.id}>
                      {sup.company_name || sup.name} ({sup.code})
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-blue-700 dark:text-blue-300">
                  ℹ️ سيتم إصدار أمر شراء تكميلي جديد لهذا المورد مرتبط بنفس الطلب ومسار الاستلام.
                </p>
              </div>
            )}
          </div>

          {/* Pricing Table */}
          <div className="mb-6">
            <h4 className="text-sm font-bold text-slate-800 dark:text-white mb-2">
              تسعير بنود الكمالة (سعر الوحدة النهائي من المورد):
            </h4>

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-right text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="p-3">الصنف</th>
                    <th className="p-3">الكمية</th>
                    <th className="p-3">الوحدة</th>
                    <th className="p-3">سعر الوحدة (ج.م) *</th>
                    <th className="p-3">الإجمالي (ج.م)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(supplement.items || []).map((item) => {
                    const price = pricing[item.id] || 0;
                    const lineTotal = (Number(item.quantity) || 0) * price;
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                        <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">
                          {item.item_description}
                        </td>
                        <td className="p-3 text-slate-600 dark:text-slate-400">
                          {item.quantity}
                        </td>
                        <td className="p-3 text-slate-500 dark:text-slate-400">
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
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                          />
                        </td>
                        <td className="p-3 font-bold text-slate-900 dark:text-white">
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
          <div className="mb-6">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              ملاحظات المشتريات / شروط التوريد للكمالة:
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثال: التوريد خلال 48 ساعة بنفس شروط الدفع..."
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          {/* Footer */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-slate-100 pt-4 dark:border-slate-800">
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400 block">إجمالي أمر التوريد للكمالة:</span>
              <strong className="text-blue-600 dark:text-blue-400 font-bold text-lg">
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
                className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {loading ? 'جارٍ المعالجة...' : 'تأكيد وإصدار أمر الشراء'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
