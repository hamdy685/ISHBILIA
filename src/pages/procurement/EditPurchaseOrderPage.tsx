import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getPurchaseOrderApi,
  updatePurchaseOrderApi,
  updatePurchaseOrderItemApi,
  addPurchaseOrderItemApi,
  removePurchaseOrderItemApi,
  submitPurchaseOrderApi
} from '../../api/purchaseOrders';
import { getSuppliersApi } from '../../api/suppliers';
import { PurchaseOrder, المورد } from '../../types/purchaseOrder';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import { parseApiError } from '../../utils/apiError';
import { SupplierSelectWithQuickAdd } from '../../components/common/SupplierSelectWithQuickAdd';
import { formatCleanNumber } from '../../utils/numberFormat';

export const EditPurchaseOrderPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [suppliers, setSuppliers] = useState<المورد[]>([]);

  const [supplierId, setSupplierId] = useState<string>('');
  const [oneTimeSupplierName, setOneTimeSupplierName] = useState<string>('');
  const [paymentTerms, setPaymentTerms] = useState<string>('');
  const [deliveryDate, setDeliveryDate] = useState<string>('');
  const [budgetCode, setBudgetCode] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // إضافة Item State
  const [newItemDesc, setNewItemDesc] = useState<string>('');
  const [newItemReference, setNewItemReference] = useState<string>('');
  const [newItemRegion, setNewItemRegion] = useState<string>('');
  const [newItemQty, setNewItemQty] = useState<number>(1);
  const [newItemPrice, setNewItemPrice] = useState<number>(0);
  const [newItemUom, setNewItemUom] = useState<string>('PCS');

  const [loading, setLoading] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [poData, sups] = await Promise.all([
        getPurchaseOrderApi(Number(id)),
        getSuppliersApi()
      ]);
      setPo(poData);
      setSuppliers(sups || []);

      if (poData) {
        setSupplierId(String(poData.supplier_id || ''));
        setPaymentTerms(poData.payment_terms || '');
        setDeliveryDate(poData.delivery_date || '');
        setBudgetCode(poData.budget_code || '');
        setNotes(poData.notes || '');
      }
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  if (loading) {
    return <LoadingSpinner message="جاري تحميل محرّر أمر الشراء..." />;
  }

  if (!po) {
    return (
      <div className="p-8 text-center bg-slate-950 border border-slate-800 text-slate-400 text-xs rounded-xl" dir="rtl">
        لم يتم العثور على أمر الشراء المطلوب للتعديل.
      </div>
    );
  }

  const isEditable = ['PO_DRAFT', 'RETURNED_TO_PROCUREMENT'].includes(po.status);

  const handleUpdateItemField = async (itemId: number, field: string, value: any) => {
    if (!isEditable) return;
    setBusy(true);
    try {
      const normalizedValue = field === 'item_reference' || field === 'region' ? String(value) : Number(value);
      const updatedPo = await updatePurchaseOrderItemApi(po.id, itemId, { [field]: normalizedValue });
      setPo(updatedPo);
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed.message);
    } finally {
      setBusy(false);
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemDesc.trim() || !newItemReference.trim() || !newItemRegion.trim() || newItemQty <= 0) {
      setError('وصف البند ورقم قطعة الأرض والمنطقة والكمية مطلوبة.');
      return;
    }
    setBusy(true);
    try {
      const updatedPo = await addPurchaseOrderItemApi(po.id, {
        item_description: newItemDesc,
        item_reference: newItemReference.trim(),
        region: newItemRegion.trim(),
        quantity: newItemQty,
        unit_price: newItemPrice,
        uom: newItemUom
      });
      setPo(updatedPo);
      setNewItemDesc('');
      setNewItemReference('');
      setNewItemRegion('');
      setNewItemQty(1);
      setNewItemPrice(0);
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveItem = async (itemId: number) => {
    if (!confirm('هل أنت متأكد من حذف هذا البند من أمر الشراء؟')) return;
    setBusy(true);
    try {
      const updatedPo = await removePurchaseOrderItemApi(po.id, itemId);
      setPo(updatedPo);
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveHeader = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const updated = await updatePurchaseOrderApi(po.id, {
        supplier_id: supplierId ? Number(supplierId) : undefined,
        one_time_supplier_name: oneTimeSupplierName.trim() || undefined,
        payment_terms: paymentTerms || undefined,
        delivery_date: deliveryDate || undefined,
        budget_code: budgetCode || undefined,
        notes: notes || undefined,
      });
      setPo(updated);
      navigate(`/procurement/purchase-orders/${po.id}`);
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitToAccounting = async () => {
    if (!confirm('هل أنت متأكد من حفظ التعديلات وإرسال أمر الشراء للاستلام والتوريد؟')) return;
    setBusy(true);
    setError(null);
    try {
      await updatePurchaseOrderApi(po.id, {
        supplier_id: supplierId ? Number(supplierId) : undefined,
        one_time_supplier_name: oneTimeSupplierName.trim() || undefined,
        payment_terms: paymentTerms || undefined,
        delivery_date: deliveryDate || undefined,
        budget_code: budgetCode || undefined,
        notes: notes || undefined,
      });
      await submitPurchaseOrderApi(po.id);
      navigate('/procurement/purchase-orders');
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="procurement-reference-page space-y-6" dir="rtl">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-100 font-mono">تعديل {po.po_number}</h1>
          <p className="text-xs text-slate-400 mt-1">تحديث الشروط التجاريّة والتعديل المالي للبنود</p>
        </div>

        <div className="flex items-center space-x-2 space-x-reverse">
          <button
            type="button"
            onClick={() => navigate(`/procurement/purchase-orders/${po.id}`)}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs px-4 py-2 rounded-lg"
          >
            إلغاء
          </button>
          {isEditable && (
            <button
              type="button"
              onClick={handleSubmitToAccounting}
              disabled={busy}
              className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs px-5 py-2 rounded-lg shadow-lg shadow-cyan-600/20"
            >
              حفظ وإرسال للاستلام
            </button>
          )}
        </div>
      </div>

      {error && <ErrorMessage error={error} />}

      {/* Header Form */}
      <form onSubmit={handleSaveHeader} className="bg-slate-950 p-6 rounded-xl border border-slate-800 space-y-4 shadow-xl">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">البيانات التجارية والرئيسية لأمر الشراء</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <SupplierSelectWithQuickAdd
              suppliers={suppliers}
              selectedSupplierId={supplierId}
              onSelectSupplierId={(val) => setSupplierId(val)}
              oneTimeSupplierName={oneTimeSupplierName}
              onChangeOneTimeSupplierName={(name) => setOneTimeSupplierName(name)}
              onSupplierCreated={(newSup) => {
                setSuppliers((prev) => [...prev, newSup]);
                setSupplierId(String(newSup.id));
                setOneTimeSupplierName('');
              }}
              disabled={!isEditable}
              label="المورد المعتمد"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">شروط الدفع</label>
            <input
              type="text"
              disabled={!isEditable}
              value={paymentTerms}
              onChange={e => setPaymentTerms(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">تاريخ التوريد</label>
            <input
              type="date"
              disabled={!isEditable}
              value={deliveryDate}
              onChange={e => setDeliveryDate(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:border-cyan-500 font-mono"
            />
          </div>
        </div>

        {isEditable && (
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={busy}
              className="bg-slate-800 hover:bg-slate-700 text-cyan-400 font-bold text-xs px-4 py-2 rounded-lg border border-slate-700"
            >
              حفظ البيانات الرئيسية
            </button>
          </div>
        )}
      </form>

      {/* البنود Section */}
      <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 space-y-4 shadow-xl">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">بنود أمر الشراء والأسعار التنافسية</h3>

        {/* إضافة New Line Item Row */}
        {isEditable && (
          <form onSubmit={handleAddItem} className="bg-slate-900 p-4 rounded-xl border border-slate-800 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-2 md:col-span-3">
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">وصف البند الجديد *</label>
              <input
                type="text"
                placeholder="وصف البند الجديد *"
                value={newItemDesc}
                onChange={e => setNewItemDesc(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-2 text-xs text-slate-200 min-h-10"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">رقم قطعة الأرض *</label>
              <input
                type="text"
                required
                placeholder="رقم قطعة الأرض *"
                value={newItemReference}
                onChange={e => setNewItemReference(e.target.value)}
                dir="ltr"
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-2 text-xs text-slate-200 font-mono min-h-10"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">المنطقة *</label>
              <input
                type="text"
                required
                placeholder="المنطقة *"
                value={newItemRegion}
                onChange={e => setNewItemRegion(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-2 text-xs text-slate-200 min-h-10"
              />
            </div>
            <div className="md:col-span-1">
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">الكمية</label>
              <input
                type="number"
                min="1"
                placeholder="الكمية"
                value={newItemQty}
                onChange={e => setNewItemQty(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-2 text-xs text-slate-200 font-mono min-h-10"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">السعر</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="السعر"
                value={newItemPrice}
                onChange={e => setNewItemPrice(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-2 text-xs text-slate-200 font-mono min-h-10"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">الوحدة</label>
              <input
                type="text"
                placeholder="الوحدة"
                value={newItemUom}
                onChange={e => setNewItemUom(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-2 text-xs text-slate-200 min-h-10"
              />
            </div>
            <div className="sm:col-span-2 md:col-span-12 text-left mt-2">
              <button
                type="submit"
                disabled={busy}
                className="w-full sm:w-auto bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs px-5 py-2.5 rounded-lg min-h-10"
              >
                + إضافة بند
              </button>
            </div>
          </form>
        )}

        {/* Existing البنود Table (Desktop) */}
        <div className="hidden min-w-0 md:block overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-900 text-slate-400 font-bold uppercase border-b border-slate-800">
              <tr>
                <th className="p-3">#</th>
                <th className="p-3">رقم قطعة الأرض</th>
                <th className="p-3">المنطقة</th>
                <th className="p-3">الوصف</th>
                <th className="p-3">الكمية</th>
                <th className="p-3">سعر الوحدة</th>
                <th className="p-3">الإجمالي</th>
                {isEditable && <th className="p-3 text-center">حذف</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {po.items?.map((item, idx) => (
                <tr key={item.id}>
                  <td className="p-3 font-mono text-slate-400">{idx + 1}</td>
                  <td className="p-3">
                    <input
                      type="text"
                      required
                      disabled={!isEditable || busy}
                      defaultValue={item.item_reference || ''}
                      onBlur={e => handleUpdateItemField(item.id, 'item_reference', e.target.value)}
                      dir="ltr"
                      className="w-32 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-slate-200"
                    />
                  </td>
                  <td className="p-3">
                    <input
                      type="text"
                      required
                      disabled={!isEditable || busy}
                      defaultValue={item.region || ''}
                      onBlur={e => handleUpdateItemField(item.id, 'region', e.target.value)}
                      className="w-32 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                    />
                  </td>
                  <td className="p-3 text-slate-200 font-medium">{item.item_description}</td>
                  <td className="p-3">
                    <input
                      type="number"
                      disabled={!isEditable || busy}
                      defaultValue={item.quantity}
                      onBlur={e => handleUpdateItemField(item.id, 'quantity', e.target.value)}
                      className="w-20 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-slate-200"
                    />
                  </td>
                  <td className="p-3">
                    <input
                      type="number"
                      step="0.01"
                      disabled={!isEditable || busy}
                      defaultValue={item.unit_price}
                      onBlur={e => handleUpdateItemField(item.id, 'unit_price', e.target.value)}
                      className="w-24 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-slate-200"
                    />
                  </td>
                  <td className="p-3 font-mono font-bold text-cyan-400">{formatCleanNumber(item.line_total)} ج.م</td>
                  {isEditable && (
                    <td className="p-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.id)}
                        className="text-rose-400 hover:text-rose-300 font-bold p-2"
                      >
                        ✕
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Existing البنود Mobile Cards */}
        <div className="space-y-3 md:hidden">
          {po.items?.map((item, idx) => (
            <article key={`mobile-edit-po-item-${item.id}`} className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
              <div className="flex min-w-0 items-start justify-between gap-3 border-b border-slate-800 pb-3">
                <span className="shrink-0 rounded-md bg-slate-800 px-2 py-1 text-[11px] font-bold text-slate-300">
                  بند {idx + 1}
                </span>
                <span className="min-w-0 break-normal font-bold text-slate-200 text-xs">
                  {item.item_description}
                </span>
                {isEditable && (
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(item.id)}
                    className="shrink-0 text-rose-400 hover:text-rose-300 font-bold p-1 text-sm"
                    aria-label="حذف البند"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="mt-3 space-y-3">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">رقم قطعة الأرض</label>
                  <input
                    type="text"
                    required
                    disabled={!isEditable || busy}
                    defaultValue={item.item_reference || ''}
                    onBlur={e => handleUpdateItemField(item.id, 'item_reference', e.target.value)}
                    dir="ltr"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 min-h-10"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">المنطقة</label>
                  <input
                    type="text"
                    required
                    disabled={!isEditable || busy}
                    defaultValue={item.region || ''}
                    onBlur={e => handleUpdateItemField(item.id, 'region', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 min-h-10"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">الكمية</label>
                    <input
                      type="number"
                      disabled={!isEditable || busy}
                      defaultValue={item.quantity}
                      onBlur={e => handleUpdateItemField(item.id, 'quantity', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 min-h-10"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">سعر الوحدة</label>
                    <input
                      type="number"
                      step="0.01"
                      disabled={!isEditable || busy}
                      defaultValue={item.unit_price}
                      onBlur={e => handleUpdateItemField(item.id, 'unit_price', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 min-h-10"
                    />
                  </div>
                </div>
                <div className="flex justify-between items-center bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                  <span className="text-xs text-slate-400">الإجمالي:</span>
                  <span className="font-mono font-bold text-cyan-400 text-sm">{formatCleanNumber(item.line_total)} ج.م</span>
                </div>
              </div>
            </article>
          ))}
        </div>

        {/* Calculated Totals Box */}
        <div className="flex justify-between items-center bg-slate-900 p-4 rounded-xl border border-slate-800 mt-4">
          <div className="text-xs text-slate-400">الإجمالي الكلي المحسوب:</div>
          <div className="text-lg font-extrabold text-cyan-400 font-mono">
            {formatCleanNumber(po.grand_total)} ج.م
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditPurchaseOrderPage;
