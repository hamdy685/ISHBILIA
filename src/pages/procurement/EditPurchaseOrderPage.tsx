import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  getPurchaseOrderApi,
  updatePurchaseOrderApi,
  finalizeActualPurchaseOrderApi,
  submitPurchaseOrderApi
} from '../../api/purchaseOrders';
import { getSuppliersApi } from '../../api/suppliers';
import { PurchaseOrder, المورد, FinalizeActualPoItemPayload } from '../../types/purchaseOrder';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import { parseApiError } from '../../utils/apiError';
import { SupplierSelectWithQuickAdd } from '../../components/common/SupplierSelectWithQuickAdd';
import { formatCleanNumber } from '../../utils/numberFormat';
import PurchaseOrderStatusBadge from '../../components/procurement/PurchaseOrderStatusBadge';
import { getUnitLabel, getUnitOptions, DEFAULT_PR_UNIT_CODES } from '../../utils/units';

const UNIT_OPTIONS = getUnitOptions(DEFAULT_PR_UNIT_CODES);

interface EditableItem {
  id?: number;
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
}

export const EditPurchaseOrderPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [suppliers, setSuppliers] = useState<المورد[]>([]);

  // Header State
  const [supplierId, setSupplierId] = useState<string>('');
  const [oneTimeSupplierName, setOneTimeSupplierName] = useState<string>('');
  const [paymentTerms, setPaymentTerms] = useState<string>('');
  const [deliveryDate, setDeliveryDate] = useState<string>('');
  const [budgetCode, setBudgetCode] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [finalizationNotes, setFinalizationNotes] = useState<string>('');

  // Items State (Local editable array for reactive & fast editing)
  const [items, setItems] = useState<EditableItem[]>([]);

  // Add Item Inputs
  const [newItemDesc, setNewItemDesc] = useState<string>('');
  const [newItemReference, setNewItemReference] = useState<string>('');
  const [newItemRegion, setNewItemRegion] = useState<string>('');
  const [newItemQty, setNewItemQty] = useState<number>(1);
  const [newItemPrice, setNewItemPrice] = useState<number>(0);
  const [newItemUom, setNewItemUom] = useState<string>('PCS');
  const [newItemSpecs, setNewItemSpecs] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

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
        setFinalizationNotes(poData.finalization_notes || '');

        // Map PO items to local editable state
        const mappedItems: EditableItem[] = (poData.items || []).map((it) => {
          const qty = Number(it.quantity || 0);
          const price = Number(it.unit_price || 0);
          return {
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
            supplier_id: it.supplier_id ?? null,
          };
        });
        setItems(mappedItems);
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
    return <LoadingSpinner message="جاري تحميل تفاصيل أمر الشراء ومحرر البنود..." />;
  }

  if (!po) {
    return (
      <div className="p-8 text-center bg-slate-950 border border-slate-800 text-slate-400 text-xs rounded-xl" dir="rtl">
        لم يتم العثور على أمر الشراء المطلوب للتعديل.
      </div>
    );
  }

  const isPendingActualPo = po.status === 'PENDING_ACTUAL_PO';
  const isDraftOrReturned = ['PO_DRAFT', 'RETURNED_TO_PROCUREMENT'].includes(po.status);
  const isEditable = po.status !== 'REJECTED';

  // Calculate live Grand Total
  const calculatedGrandTotal = items.reduce((acc, it) => acc + (it.quantity * it.unit_price), 0);

  // Helper to find received quantity from linked GRN receipts
  const getReceivedQtyForPoItem = (poItemId?: number): number | null => {
    if (!poItemId || !po.receipts || !po.receipts.length) return null;
    let totalReceived = 0;
    let found = false;
    po.receipts.forEach((r) => {
      if (r.status === 'APPROVED' || r.status === 'PENDING_SITE_ENGINEER') {
        r.items?.forEach((ri) => {
          if (ri.purchase_order_item_id === poItemId) {
            totalReceived += Number(ri.received_quantity || 0);
            found = true;
          }
        });
      }
    });
    return found ? totalReceived : null;
  };

  // Update item field locally
  const handleItemFieldChange = (index: number, field: keyof EditableItem, value: any) => {
    setItems((prev) => {
      const copy = [...prev];
      const item = { ...copy[index], [field]: value };
      if (field === 'quantity' || field === 'unit_price') {
        const q = field === 'quantity' ? Number(value) : item.quantity;
        const p = field === 'unit_price' ? Number(value) : item.unit_price;
        item.line_total = Math.round(q * p * 100) / 100;
      }
      copy[index] = item;
      return copy;
    });
  };

  // Match item quantity with GRN received quantity
  const handleApplyGrnQty = (index: number, grnQty: number) => {
    handleItemFieldChange(index, 'quantity', grnQty);
  };

  // Match all items with GRN received quantities
  const handleMatchAllWithGrn = () => {
    setItems((prev) =>
      prev.map((it) => {
        const grnQty = getReceivedQtyForPoItem(it.id);
        if (grnQty !== null && grnQty > 0) {
          const lineTotal = Math.round(grnQty * it.unit_price * 100) / 100;
          return { ...it, quantity: grnQty, line_total: lineTotal };
        }
        return it;
      })
    );
    setSuccessMsg('تمت مطابقة كميات البنود مع الكميات المستلمة فعلياً في إذن الاستلام.');
  };

  // Add Item to local list
  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemDesc.trim() || !newItemReference.trim() || !newItemRegion.trim() || newItemQty <= 0) {
      setError('وصف البند، رقم قطعة الأرض، المنطقة، والكمية حقول مطلوبة.');
      return;
    }
    const lineTotal = Math.round(newItemQty * newItemPrice * 100) / 100;
    const newItem: EditableItem = {
      item_description: newItemDesc.trim(),
      item_reference: newItemReference.trim(),
      region: newItemRegion.trim(),
      quantity: newItemQty,
      uom: newItemUom.trim() || 'PCS',
      unit_price: newItemPrice,
      line_total: lineTotal,
      specifications: newItemSpecs.trim() || undefined,
    };
    setItems((prev) => [...prev, newItem]);
    setNewItemDesc('');
    setNewItemReference('');
    setNewItemRegion('');
    setNewItemQty(1);
    setNewItemPrice(0);
    setNewItemSpecs('');
    setError(null);
  };

  // Remove Item from local list
  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
      setError('يجب أن يحتوي أمر الشراء على بند واحد على الأقل.');
      return;
    }
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Build items payload for saving
  const buildItemsPayload = () => {
    return items.map((it) => ({
      id: it.id,
      item_id: it.item_id,
      pr_item_id: it.pr_item_id,
      item_description: it.item_description,
      item_reference: it.item_reference,
      region: it.region,
      quantity: Number(it.quantity),
      uom: it.uom,
      unit_price: Number(it.unit_price),
      specifications: it.specifications,
      supplier_id: it.supplier_id || (supplierId ? Number(supplierId) : po.supplier_id),
    }));
  };

  // Save All Changes (Header + Line Items) - Full autonomy for Procurement Manager
  const handleSaveAllChanges = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (items.length === 0) {
      setError('يجب أن يحتوي أمر الشراء على بند واحد على الأقل.');
      return;
    }
    const hasInvalid = items.some(
      (it) => it.quantity <= 0 || !it.item_description.trim() || !it.item_reference.trim() || !it.region.trim()
    );
    if (hasInvalid) {
      setError('يرجى التأكد من ملء حقول (الوصف، رقم قطعة الأرض، المنطقة، والكمية أكبر من صفر) لجميع البنود.');
      return;
    }

    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const payloadItems = buildItemsPayload();
      const updated = await updatePurchaseOrderApi(po.id, {
        supplier_id: supplierId ? Number(supplierId) : undefined,
        one_time_supplier_name: oneTimeSupplierName.trim() || undefined,
        payment_terms: paymentTerms || undefined,
        delivery_date: deliveryDate || undefined,
        budget_code: budgetCode || undefined,
        notes: notes || undefined,
        finalization_notes: finalizationNotes || undefined,
        items: payloadItems,
      });
      setPo(updated);
      setSuccessMsg('✅ تم حفظ كافة تعديلات أمر الشراء وبيانات البنود والأسعار بنجاح.');
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed.message);
    } finally {
      setBusy(false);
    }
  };

  // Submit Draft to Site/Warehouse
  const handleSubmitDraftToSite = async () => {
    if (!confirm('هل أنت متأكد من حفظ التعديلات وإرسال أمر الشراء المبدئي للاستلام والتوريد بالموقع؟')) return;
    setBusy(true);
    setError(null);
    try {
      const payloadItems = buildItemsPayload();
      await updatePurchaseOrderApi(po.id, {
        supplier_id: supplierId ? Number(supplierId) : undefined,
        one_time_supplier_name: oneTimeSupplierName.trim() || undefined,
        payment_terms: paymentTerms || undefined,
        delivery_date: deliveryDate || undefined,
        budget_code: budgetCode || undefined,
        notes: notes || undefined,
        items: payloadItems,
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

  // Finalize Actual PO & Send to Accounting
  const handleFinalizeActualPo = async () => {
    if (items.length === 0) {
      setError('لا يمكن إصدار أمر شراء فعلي بدون بنود.');
      return;
    }
    const hasInvalid = items.some((it) => it.quantity <= 0 || !it.item_description || !it.item_reference || !it.region);
    if (hasInvalid) {
      setError('يرجى التحقق من صحة جميع البنود (الكمية، الوصف، رقم قطعة الأرض، والمنطقة).');
      return;
    }

    if (!confirm('هل أنت متأكد من إصدار أمر الشراء الفعلي بعد اعتماد الاستلام وإرساله رسميًا للإدارة المالية والحسابات؟')) return;

    setBusy(true);
    setError(null);
    try {
      // First update header if supplier or dates changed
      if (supplierId && Number(supplierId) !== po.supplier_id) {
        await updatePurchaseOrderApi(po.id, {
          supplier_id: Number(supplierId),
          payment_terms: paymentTerms || undefined,
          delivery_date: deliveryDate || undefined,
          notes: notes || undefined,
        });
      }

      const payloadItems: FinalizeActualPoItemPayload[] = items.map((it) => ({
        id: it.id,
        item_id: it.item_id,
        pr_item_id: it.pr_item_id,
        item_description: it.item_description,
        item_reference: it.item_reference,
        region: it.region,
        quantity: Number(it.quantity),
        uom: it.uom,
        unit_price: Number(it.unit_price),
        specifications: it.specifications,
        supplier_id: it.supplier_id || (supplierId ? Number(supplierId) : po.supplier_id),
      }));

      await finalizeActualPurchaseOrderApi(po.id, {
        items: payloadItems,
        notes: finalizationNotes.trim() || undefined,
      });

      alert(`✅ تم إصدار أمر الشراء الفعلي (${po.po_number}) بنجاح وإرساله للإدارة المالية.`);
      navigate(`/procurement/purchase-orders/${po.id}`);
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed.message);
    } finally {
      setBusy(false);
    }
  };

  const latestReceipt = po.receipts && po.receipts.length > 0 ? po.receipts[0] : null;

  return (
    <div className="procurement-reference-page space-y-6 pb-20 animate-fade-in" dir="rtl">
      {/* ── Header Bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-slate-100 font-mono">{po.po_number}</h1>
            <PurchaseOrderStatusBadge status={po.status} />
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {isPendingActualPo
              ? '⚡ إصدار أمر الشراء الفعلي — مطابقة وتعديل الكميات والأسعار بعد اعتماد إذن الاستلام بالموقع'
              : 'تحديث الشروط التجاريّة والبنود لأمر الشراء'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/procurement/purchase-orders/${po.id}`}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs px-4 py-2 rounded-lg font-semibold transition-colors"
          >
            ← العودة للتفاصيل
          </Link>

          {isEditable && (
            <button
              type="button"
              onClick={handleSaveAllChanges}
              disabled={busy}
              className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs px-5 py-2.5 rounded-lg shadow-lg shadow-cyan-600/30 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <span>💾 حفظ كافة التعديلات</span>
            </button>
          )}

          {isPendingActualPo && (
            <button
              type="button"
              onClick={handleFinalizeActualPo}
              disabled={busy}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs px-5 py-2.5 rounded-lg shadow-lg shadow-emerald-900/40 flex items-center gap-2 transition-all cursor-pointer"
            >
              <span>💰 اعتماد وإرسال للإدارة المالية</span>
            </button>
          )}

          {isDraftOrReturned && (
            <button
              type="button"
              onClick={handleSubmitDraftToSite}
              disabled={busy}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-5 py-2.5 rounded-lg shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
            >
              حفظ وإرسال للاستلام بالموقع
            </button>
          )}
        </div>
      </div>

      {error && <ErrorMessage error={error} />}

      {successMsg && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200 shadow-lg shadow-emerald-950/40">
          <div className="flex items-center gap-2">
            <span className="text-lg">✅</span>
            <span className="font-bold">{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-400 hover:text-emerald-200 text-xs font-bold px-2 py-1 rounded"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Procurement Autonomy Banner (When not PENDING_ACTUAL_PO) ── */}
      {!isPendingActualPo && (
        <div className="rounded-xl border border-cyan-800/40 bg-gradient-to-r from-cyan-950/30 via-slate-900 to-slate-950 p-4 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 text-cyan-300">
            <span className="text-xl">💼</span>
            <div>
              <p className="font-bold text-slate-100">
                صلاحية تعديل كاملة ومستقلة لمدير المشتريات
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                يمكنك تعديل أي بيانات في أمر الشراء (الكميات، الأسعار، المورد، شروط الدفع، وحذف أو إضافة بنود) مباشرة في أي وقت دون الحاجة لطلب إرجاع أو اعتماد إضافي.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSaveAllChanges}
            disabled={busy}
            className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-4 py-2 rounded-lg shadow-md transition-all cursor-pointer self-start sm:self-auto whitespace-nowrap"
          >
            {busy ? 'جاري الحفظ...' : '💾 حفظ التعديلات'}
          </button>
        </div>
      )}

      {/* ── Actual PO Callout Banner (When PENDING_ACTUAL_PO) ── */}
      {isPendingActualPo && (
        <div className="rounded-2xl border-2 border-indigo-500/50 bg-gradient-to-r from-indigo-950/40 via-slate-900 to-slate-950 p-5 shadow-2xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="text-3xl">📦</span>
              <div>
                <h3 className="text-base font-black text-indigo-300">
                  مرحلة إصدار أمر الشراء الفعلي (Actual PO Workflow)
                </h3>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  تم توريد البضاعة واعتماد إذن الاستلام (GRN) في الموقع. بصفتك إدارة المشتريات، لديك الصلاحية الكاملة لتعديل الكميات والأسعار وإضافة أو حذف أي بنود لتعكس الواقع الفعلي تماماً، ثم إرسال الملف النهائي للإدارة المالية.
                </p>
                {latestReceipt && (
                  <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-slate-400 bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                    <span>إذن الاستلام: <strong className="text-cyan-300 font-mono">{latestReceipt.receipt_number}</strong></span>
                    <span>•</span>
                    <span>أمين المخزن: <strong className="text-slate-200">{latestReceipt.warehouse_keeper?.name || '—'}</strong></span>
                    <span>•</span>
                    <span>مهندس الموقع: <strong className="text-slate-200">{latestReceipt.site_engineer?.name || '—'}</strong></span>
                    {latestReceipt.received_at && (
                      <>
                        <span>•</span>
                        <span>تاريخ الاستلام: <strong className="text-slate-200 font-mono">{latestReceipt.received_at}</strong></span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={handleMatchAllWithGrn}
              className="shrink-0 bg-indigo-700/80 hover:bg-indigo-600 text-white font-bold text-xs px-4 py-2.5 rounded-xl border border-indigo-500/50 shadow-md transition-all flex items-center gap-2 cursor-pointer"
            >
              <span>⚡ مطابقة كافة الكميات مع إذن الاستلام</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Commercial Header Form ── */}
      <form onSubmit={handleSaveAllChanges} className="bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            البيانات التجارية والرئيسية
          </h3>
          {isEditable && (
            <button
              type="submit"
              disabled={busy}
              className="bg-slate-800 hover:bg-slate-700 text-cyan-400 font-bold text-xs px-3.5 py-1.5 rounded-lg border border-slate-700 cursor-pointer"
            >
              💾 حفظ البيانات
            </button>
          )}
        </div>

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
            <label className="block text-xs font-semibold text-slate-300 mb-1">تاريخ التوريد الفعلي / المتوقع</label>
            <input
              type="date"
              disabled={!isEditable}
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:border-cyan-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">شروط الدفع والتعاقد</label>
            <input
              type="text"
              disabled={!isEditable}
              placeholder="مثال: نقدي عند الاستلام / آجل 30 يوم"
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:border-cyan-500"
            />
          </div>
        </div>
      </form>

      {/* ── Line Items Section ── */}
      <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
          <div>
            <h3 className="text-sm font-black text-slate-100">
              بنود أمر الشراء والأسعار التنافسية ({items.length} بند)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              يمكنك تعديل الكمية أو السعر مباشرة، وسيتم تحديث الإجمالي تلقائياً
            </p>
          </div>

          {isPendingActualPo && (
            <button
              type="button"
              onClick={handleMatchAllWithGrn}
              className="text-xs font-bold text-indigo-300 hover:text-indigo-200 bg-indigo-950/60 hover:bg-indigo-900/60 px-3 py-1.5 rounded-lg border border-indigo-700/60 transition-colors flex items-center gap-1 self-start sm:self-auto cursor-pointer"
            >
              <span>⚡ مطابقة الكل مع إذن الاستلام</span>
            </button>
          )}
        </div>

        {/* Existing Items Table (Desktop) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-900 text-slate-400 font-bold uppercase border-b border-slate-800">
              <tr>
                <th className="p-3 w-10">#</th>
                <th className="p-3">رقم قطعة الأرض *</th>
                <th className="p-3">المنطقة *</th>
                <th className="p-3">الوصف والمواصفات</th>
                {isPendingActualPo && <th className="p-3 text-center">المستلم في GRN</th>}
                <th className="p-3 w-28">الكمية الفعلية *</th>
                <th className="p-3 w-20">الوحدة</th>
                <th className="p-3 w-32">سعر الوحدة (ج.م) *</th>
                <th className="p-3 w-32">الإجمالي</th>
                {isEditable && <th className="p-3 text-center w-14">حذف</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {items.map((item, idx) => {
                const grnQty = getReceivedQtyForPoItem(item.id);
                const isDifferentFromGrn = grnQty !== null && Number(item.quantity) !== Number(grnQty);

                return (
                  <tr key={`item-row-${item.id || idx}`} className="hover:bg-slate-900/50 transition-colors">
                    <td className="p-3 font-mono text-slate-500 text-center">{idx + 1}</td>

                    {/* Parcel Reference */}
                    <td className="p-3">
                      <input
                        type="text"
                        required
                        disabled={!isEditable || busy}
                        value={item.item_reference}
                        onChange={(e) => handleItemFieldChange(idx, 'item_reference', e.target.value)}
                        dir="ltr"
                        className="w-28 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-200 focus:border-cyan-500"
                      />
                    </td>

                    {/* Region */}
                    <td className="p-3">
                      <input
                        type="text"
                        required
                        disabled={!isEditable || busy}
                        value={item.region}
                        onChange={(e) => handleItemFieldChange(idx, 'region', e.target.value)}
                        className="w-28 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:border-cyan-500"
                      />
                    </td>

                    {/* Description */}
                    <td className="p-3">
                      <input
                        type="text"
                        required
                        disabled={!isEditable || busy}
                        value={item.item_description}
                        onChange={(e) => handleItemFieldChange(idx, 'item_description', e.target.value)}
                        className="w-full min-w-[180px] bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:border-cyan-500"
                      />
                      {item.specifications && (
                        <p className="text-[10px] text-slate-400 mt-1">{item.specifications}</p>
                      )}
                    </td>

                    {/* GRN Received Quantity Hint */}
                    {isPendingActualPo && (
                      <td className="p-3 text-center">
                        {grnQty !== null ? (
                          <div className="flex flex-col items-center gap-1">
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-bold ${
                              isDifferentFromGrn
                                ? 'bg-amber-950/80 text-amber-300 border border-amber-700/60'
                                : 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/60'
                            }`}>
                              📦 {grnQty}
                            </span>
                            {isDifferentFromGrn && (
                              <button
                                type="button"
                                onClick={() => handleApplyGrnQty(idx, grnQty)}
                                className="text-[10px] text-indigo-400 hover:text-indigo-200 underline font-semibold cursor-pointer"
                              >
                                تطبيق
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-500">—</span>
                        )}
                      </td>
                    )}

                    {/* Actual Quantity */}
                    <td className="p-3">
                      <input
                        type="number"
                        min="0.001"
                        step="any"
                        required
                        disabled={!isEditable || busy}
                        value={item.quantity}
                        onChange={(e) => handleItemFieldChange(idx, 'quantity', Number(e.target.value))}
                        className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-slate-100 focus:border-cyan-500 text-center"
                      />
                    </td>

                    {/* UOM */}
                    <td className="p-3">
                      {isEditable ? (
                        <select
                          disabled={busy}
                          value={item.uom || ''}
                          onChange={(e) => handleItemFieldChange(idx, 'uom', e.target.value)}
                          className="w-28 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:border-cyan-500 font-medium cursor-pointer"
                          title="تعديل وحدة القياس"
                        >
                          {item.uom && !DEFAULT_PR_UNIT_CODES.includes(item.uom) && (
                            <option value={item.uom}>{getUnitLabel(item.uom)}</option>
                          )}
                          {UNIT_OPTIONS.map((u) => (
                            <option key={u.value} value={u.value}>
                              {u.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="px-2 py-1 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-300 font-mono">
                          {getUnitLabel(item.uom)}
                        </span>
                      )}
                    </td>

                    {/* Unit Price */}
                    <td className="p-3">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        disabled={!isEditable || busy}
                        value={item.unit_price}
                        onChange={(e) => handleItemFieldChange(idx, 'unit_price', Number(e.target.value))}
                        className="w-28 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-cyan-300 focus:border-cyan-500 text-center"
                      />
                    </td>

                    {/* Line Total */}
                    <td className="p-3 font-mono font-bold text-emerald-400 text-xs">
                      {formatCleanNumber(item.line_total)} ج.م
                    </td>

                    {/* Delete Action */}
                    {isEditable && (
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="text-rose-400 hover:text-rose-300 font-bold p-1 text-sm transition-colors cursor-pointer"
                          title="حذف هذا البند"
                        >
                          ✕
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Existing Items Cards (Mobile) */}
        <div className="space-y-3 md:hidden">
          {items.map((item, idx) => {
            const grnQty = getReceivedQtyForPoItem(item.id);
            const isDifferentFromGrn = grnQty !== null && Number(item.quantity) !== Number(grnQty);

            return (
              <article key={`mobile-item-${item.id || idx}`} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-slate-300">
                      بند {idx + 1}
                    </span>
                    <span className="font-bold text-slate-200 text-xs">{item.item_description}</span>
                  </div>
                  {isEditable && (
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      className="text-rose-400 hover:text-rose-300 font-bold text-sm"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-0.5">رقم قطعة الأرض</label>
                    <input
                      type="text"
                      disabled={!isEditable || busy}
                      value={item.item_reference}
                      onChange={(e) => handleItemFieldChange(idx, 'item_reference', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-0.5">المنطقة</label>
                    <input
                      type="text"
                      disabled={!isEditable || busy}
                      value={item.region}
                      onChange={(e) => handleItemFieldChange(idx, 'region', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                    />
                  </div>
                </div>

                {isPendingActualPo && grnQty !== null && (
                  <div className="flex items-center justify-between bg-slate-950/70 p-2 rounded-lg border border-slate-800 text-xs">
                    <span className="text-slate-400">المستلم في GRN:</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-cyan-300">{grnQty} {getUnitLabel(item.uom)}</span>
                      {isDifferentFromGrn && (
                        <button
                          type="button"
                          onClick={() => handleApplyGrnQty(idx, grnQty)}
                          className="text-[10px] text-indigo-400 underline font-semibold"
                        >
                          تطبيق الكمية
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-0.5">الكمية الفعلية</label>
                    <input
                      type="number"
                      step="any"
                      disabled={!isEditable || busy}
                      value={item.quantity}
                      onChange={(e) => handleItemFieldChange(idx, 'quantity', Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-0.5">الوحدة</label>
                    {isEditable ? (
                      <select
                        disabled={busy}
                        value={item.uom || ''}
                        onChange={(e) => handleItemFieldChange(idx, 'uom', e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-xs text-slate-200"
                      >
                        {item.uom && !DEFAULT_PR_UNIT_CODES.includes(item.uom) && (
                          <option value={item.uom}>{getUnitLabel(item.uom)}</option>
                        )}
                        {UNIT_OPTIONS.map((u) => (
                          <option key={u.value} value={u.value}>
                            {u.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="p-1 text-xs text-slate-300 font-mono">{getUnitLabel(item.uom)}</div>
                    )}
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-0.5">سعر الوحدة</label>
                    <input
                      type="number"
                      step="0.01"
                      disabled={!isEditable || busy}
                      value={item.unit_price}
                      onChange={(e) => handleItemFieldChange(idx, 'unit_price', Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-cyan-300"
                    />
                  </div>
                </div>

                <div className="flex justify-between items-center bg-slate-950/60 p-2 rounded-lg border border-slate-800">
                  <span className="text-xs text-slate-400">إجمالي البند:</span>
                  <span className="font-mono font-bold text-emerald-400 text-sm">
                    {formatCleanNumber(item.line_total)} ج.م
                  </span>
                </div>
              </article>
            );
          })}
        </div>

        {/* ── Add New Item Row ── */}
        {isEditable && (
          <form onSubmit={handleAddItem} className="bg-slate-900/70 p-4 rounded-xl border border-dashed border-slate-700 space-y-3">
            <h4 className="text-xs font-bold text-slate-300">+ إضافة بند جديد إلى أمر الشراء</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-2 md:col-span-3">
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">وصف البند الجديد *</label>
                <input
                  type="text"
                  placeholder="وصف البند الجديد *"
                  value={newItemDesc}
                  onChange={(e) => setNewItemDesc(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">رقم قطعة الأرض *</label>
                <input
                  type="text"
                  required
                  placeholder="رقم قطعة الأرض *"
                  value={newItemReference}
                  onChange={(e) => setNewItemReference(e.target.value)}
                  dir="ltr"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">المنطقة *</label>
                <input
                  type="text"
                  required
                  placeholder="المنطقة *"
                  value={newItemRegion}
                  onChange={(e) => setNewItemRegion(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                />
              </div>

              <div className="md:col-span-1">
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">الكمية</label>
                <input
                  type="number"
                  min="0.001"
                  step="any"
                  value={newItemQty}
                  onChange={(e) => setNewItemQty(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono text-center"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">السعر (ج.م)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newItemPrice}
                  onChange={(e) => setNewItemPrice(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono text-center"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">الوحدة</label>
                <select
                  value={newItemUom}
                  onChange={(e) => setNewItemUom(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 cursor-pointer"
                >
                  {newItemUom && !DEFAULT_PR_UNIT_CODES.includes(newItemUom) && (
                    <option value={newItemUom}>{getUnitLabel(newItemUom)}</option>
                  )}
                  {UNIT_OPTIONS.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2 md:col-span-12 flex justify-end">
                <button
                  type="submit"
                  disabled={busy}
                  className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs px-4 py-2 rounded-lg cursor-pointer"
                >
                  + إضافة البند
                </button>
              </div>
            </div>
          </form>
        )}

        {/* ── Finalization Notes & Calculated Totals Box ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end pt-4 border-t border-slate-800">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              {isPendingActualPo ? 'ملاحظات وتوجيهات الحسابات لأمر الشراء الفعلي' : 'ملاحظات أمر الشراء'}
            </label>
            <textarea
              rows={3}
              value={isPendingActualPo ? finalizationNotes : notes}
              onChange={(e) => isPendingActualPo ? setFinalizationNotes(e.target.value) : setNotes(e.target.value)}
              placeholder={isPendingActualPo ? 'اكتب أي توضيحات للإدارة المالية بشأن فروق الكميات أو الأسعار أو استلامات الموقع...' : 'أي ملاحظات إضافية...'}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-cyan-500"
            />
          </div>

          <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-2">
            <div className="flex justify-between text-xs text-slate-400">
              <span>عدد البنود:</span>
              <span className="font-bold text-slate-200">{items.length}</span>
            </div>
            <div className="flex justify-between items-center border-t border-slate-800 pt-2 text-sm">
              <span className="font-bold text-slate-300">الإجمالي الكلي الفعلي:</span>
              <span className="font-mono font-black text-emerald-400 text-lg">
                {formatCleanNumber(calculatedGrandTotal)} ج.م
              </span>
            </div>
          </div>
        </div>

        {/* ── Submit Action ── */}
        <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-slate-800">
          {isEditable && (
            <button
              type="button"
              onClick={handleSaveAllChanges}
              disabled={busy}
              className="w-full sm:w-auto bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-sm px-7 py-3 rounded-xl shadow-lg shadow-cyan-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <span>💾 حفظ كافة التعديلات</span>
            </button>
          )}

          {isPendingActualPo && (
            <button
              type="button"
              onClick={handleFinalizeActualPo}
              disabled={busy}
              className="w-full sm:w-auto bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-black text-sm px-8 py-3 rounded-xl shadow-xl shadow-emerald-950/50 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <span>💰 اعتماد وإرسال للإدارة المالية</span>
            </button>
          )}

          {isDraftOrReturned && (
            <button
              type="button"
              onClick={handleSubmitDraftToSite}
              disabled={busy}
              className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm px-6 py-3 rounded-xl shadow-lg shadow-indigo-600/20 cursor-pointer"
            >
              حفظ وإرسال للاستلام بالموقع
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default EditPurchaseOrderPage;
