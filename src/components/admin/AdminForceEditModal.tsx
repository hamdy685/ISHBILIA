import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../ui/Button';
import LoadingSpinner from '../LoadingSpinner';
import ErrorMessage from '../ErrorMessage';
import { parseApiError } from '../../utils/apiError';
import { formatCleanNumber, formatCleanQty } from '../../utils/numberFormat';
import {
  getOrderMasterDetailsApi,
  forceUpdateOrderApi,
  ForceUpdateItemPayload,
} from '../../api/admin/masterOrders';

interface AdminForceEditModalProps {
  orderId: number | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ItemDraft {
  id?: number | null;
  item_description: string;
  item_reference: string;
  region: string;
  quantity: number | string;
  uom: string;
  unit_price: number | string;
  specifications: string;
  delete?: boolean;
}

export const AdminForceEditModal: React.FC<AdminForceEditModalProps> = ({
  orderId,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Loaded data
  const [orderData, setOrderData] = useState<any>(null);
  const [availableSuppliers, setAvailableSuppliers] = useState<any[]>([]);
  const [allowedStatuses, setAllowedStatuses] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [showAuditLogs, setShowAuditLogs] = useState<boolean>(false);

  // Form states
  const [status, setStatus] = useState<string>('ISSUED');
  const [supplierId, setSupplierId] = useState<number | ''>('');
  const [isActualPo, setIsActualPo] = useState<boolean>(false);
  const [deliveryDate, setDeliveryDate] = useState<string>('');
  const [actualDeliveryDate, setActualDeliveryDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [financialNotes, setFinancialNotes] = useState<string>('');
  const [adminReason, setAdminReason] = useState<string>('');
  const [syncReceipt, setSyncReceipt] = useState<boolean>(true);
  const [syncPr, setSyncPr] = useState<boolean>(true);
  const [items, setItems] = useState<ItemDraft[]>([]);

  useEffect(() => {
    if (!isOpen || !orderId) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onClose();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    loadOrderDetails();

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, orderId]);

  const loadOrderDetails = async () => {
    if (!orderId) return;
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await getOrderMasterDetailsApi(orderId);
      const po = res.data.order;
      setOrderData(po);
      setAvailableSuppliers(res.data.available_suppliers || []);
      setAllowedStatuses(res.data.allowed_statuses || []);
      setAuditLogs(res.data.audit_logs || []);

      setStatus(po.status || 'ISSUED');
      setSupplierId(po.supplier_id || '');
      setIsActualPo(Boolean(po.finalized_at || res.data.cycle_stage?.stage === 'ACTUAL_PO_ISSUED' || res.data.cycle_stage?.stage === 'INVOICED'));
      setDeliveryDate(po.delivery_date ? String(po.delivery_date).slice(0, 10) : '');
      setActualDeliveryDate(po.actual_delivery_date ? String(po.actual_delivery_date).slice(0, 10) : '');
      setNotes(po.notes || '');
      setFinancialNotes(po.financial_notes || '');
      setAdminReason('');

      // Populate items
      const draftItems: ItemDraft[] = (po.items || []).map((it: any) => ({
        id: it.id,
        item_description: it.item_description || '',
        item_reference: it.item_reference || '',
        region: it.region || '',
        quantity: it.quantity ?? 1,
        uom: it.uom || 'UNIT',
        unit_price: it.unit_price ?? 0,
        specifications: it.specifications || '',
        delete: false,
      }));
      setItems(draftItems);
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      setError(parsed.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !orderId) return null;

  const handleItemChange = (index: number, field: keyof ItemDraft, value: any) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: null,
        item_description: '',
        item_reference: items[0]?.item_reference || '',
        region: items[0]?.region || '',
        quantity: 1,
        uom: 'TON',
        unit_price: 0,
        specifications: '',
        delete: false,
      },
    ]);
  };

  const handleDeleteItem = (index: number) => {
    setItems((prev) => {
      const item = prev[index];
      if (!item.id) {
        // Not yet saved in DB, just remove
        return prev.filter((_, i) => i !== index);
      }
      // Toggle soft delete flag
      const next = [...prev];
      next[index] = { ...next[index], delete: !next[index].delete };
      return next;
    });
  };

  // Live recalculations
  const activeItems = items.filter((it) => !it.delete);
  const grandTotal = activeItems.reduce((acc, it) => {
    const q = Number(it.quantity) || 0;
    const p = Number(it.unit_price) || 0;
    return acc + Math.round(q * p * 100) / 100;
  }, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminReason.trim()) {
      setError('يرجى كتابة سبب التدخل الإداري الاستثنائي (إلزامي للتوثيق في سجل النظام).');
      return;
    }
    if (activeItems.length === 0) {
      setError('يجب الإبقاء على بند واحد على الأقل في أمر الشراء.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const formattedItems: ForceUpdateItemPayload[] = items.map((it) => ({
        id: it.id,
        item_description: it.item_description,
        item_reference: it.item_reference || null,
        region: it.region || null,
        quantity: Number(it.quantity),
        uom: it.uom,
        unit_price: Number(it.unit_price),
        specifications: it.specifications || null,
        delete: it.delete || false,
      }));

      const payload = {
        status,
        supplier_id: supplierId ? Number(supplierId) : null,
        is_actual_po: isActualPo,
        delivery_date: deliveryDate || null,
        actual_delivery_date: actualDeliveryDate || null,
        notes: notes || null,
        financial_notes: financialNotes || null,
        admin_reason: adminReason.trim(),
        sync_receipt: syncReceipt,
        sync_pr: syncPr,
        items: formattedItems,
      };

      const res = await forceUpdateOrderApi(orderId, payload);
      setSuccessMsg(res.message);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      setError(parsed.message);
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex min-h-screen items-center justify-center overflow-y-auto bg-slate-950/90 p-2 sm:p-4 backdrop-blur-sm"
      dir="rtl"
    >
      <div className="flex min-h-0 max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border-2 border-amber-500/50 bg-slate-900 shadow-2xl shadow-amber-950/40 animate-fade-in">
        {/* Header with Sovereign Authority styling */}
        <div className="flex items-center justify-between gap-3 border-b border-amber-500/30 bg-gradient-to-r from-slate-900 via-amber-950/40 to-slate-900 px-5 py-3.5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-400/40 bg-amber-500/10 text-xl shadow-inner">
              👑
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-amber-300">
                  التعديل السيادي الشامل (Super Admin Override)
                </h2>
                <span className="rounded-md border border-amber-500/30 bg-amber-500/20 px-2 py-0.5 text-[11px] font-mono font-bold text-amber-200">
                  {orderData?.po_number || `PO #${orderId}`}
                </span>
              </div>
              <p className="text-xs text-slate-300 font-medium mt-0.5">
                تجاوز قيود وحالات سير العمل (Status Guards Bypass) مع تسجيل تدقيق رسمي
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Warning Alert */}
        <div className="bg-amber-950/40 border-b border-amber-500/20 px-5 py-2.5 flex items-center justify-between gap-3 text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <span className="text-amber-400 font-bold">⚠️ تنبيه إداري:</span>
            <span>
              أي تعديل تقوم به هنا سيتم تثبيته فوراً في قاعدة البيانات وسينعكس على الحسابات والتقارير بغض النظر عن المرحلة الحالية.
            </span>
          </div>
          {auditLogs.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAuditLogs(!showAuditLogs)}
              className="text-xs underline text-amber-300 hover:text-white whitespace-nowrap font-bold"
            >
              {showAuditLogs ? 'إخفاء سجل التعديلات السابقة' : `عرض سجل التعديلات (${auditLogs.length})`}
            </button>
          )}
        </div>

        {/* Audit Log Drawer if toggled */}
        {showAuditLogs && auditLogs.length > 0 && (
          <div className="border-b border-slate-800 bg-slate-950 p-4 max-h-48 overflow-y-auto space-y-2 text-xs">
            <h4 className="font-bold text-slate-300 flex items-center gap-1.5">
              <span>📜</span> سجل التدخلات السابقة على هذا المستند:
            </h4>
            <div className="space-y-1.5">
              {auditLogs.map((log) => (
                <div key={`log-${log.id}`} className="rounded border border-slate-800 bg-slate-900/60 p-2 flex items-center justify-between text-slate-300">
                  <div>
                    <span className="font-bold text-amber-300 ml-2">{log.actor?.name || 'مدير النظام'}</span>
                    <span>{log.description}</span>
                  </div>
                  <span className="text-slate-400 font-mono text-[10px]">
                    {new Date(log.occurred_at || log.created_at).toLocaleString('ar-EG')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 text-slate-200">
          {loading ? (
            <LoadingSpinner message="جاري جلب كافة تفاصيل أمر الشراء وبنوده وبيانات الاستلام..." />
          ) : (
            <form id="admin-force-edit-form" onSubmit={handleSubmit} className="space-y-6">
              {error && <ErrorMessage error={error} />}
              {successMsg && (
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-3 text-emerald-300 font-bold text-sm text-center">
                  ✅ {successMsg}
                </div>
              )}

              {/* 1. Status & Lifecycle Stage Override */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-4">
                <h3 className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <span className="text-cyan-400">⚡</span> 1. التحكم في الحالة ودورة المستند
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-400 font-bold mb-1.5">حالة أمر الشراء (Status Override):</label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 font-bold focus:border-amber-400 focus:outline-none"
                    >
                      {allowedStatuses.map((st) => (
                        <option key={st.value} value={st.value}>
                          {st.label} ({st.value})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 font-bold mb-1.5">المورد المعتمد للطلب:</label>
                    <select
                      value={supplierId}
                      onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : '')}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 font-bold focus:border-amber-400 focus:outline-none"
                    >
                      <option value="">— اختر المورد —</option>
                      {availableSuppliers.map((sup) => (
                        <option key={sup.id} value={sup.id}>
                          {sup.company_name || sup.name} {sup.code ? `(${sup.code})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col justify-end">
                    <label className="flex items-center gap-2 cursor-pointer rounded-lg border border-slate-800 bg-slate-900/80 p-2.5 hover:border-cyan-500/50 transition-colors">
                      <input
                        type="checkbox"
                        checked={isActualPo}
                        onChange={(e) => setIsActualPo(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
                      />
                      <span className="font-bold text-slate-200 text-xs">
                        تثبيت كـ أمر شراء فعلي معتمد (Actual PO)
                      </span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-1">
                  <div>
                    <label className="block text-slate-400 font-bold mb-1.5">تاريخ التوريد المتفق عليه:</label>
                    <input
                      type="date"
                      value={deliveryDate}
                      onChange={(e) => setDeliveryDate(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 font-bold mb-1.5">تاريخ الاستلام والتوريد الفعلي بالموقع:</label>
                    <input
                      type="date"
                      value={actualDeliveryDate}
                      onChange={(e) => setActualDeliveryDate(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* 2. Items Table Override */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <span className="text-emerald-400">📦</span> 2. بنود أمر الشراء والكميات والأسعار الفعلية
                  </h3>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleAddItem}
                    className="text-xs h-8 px-3 border-emerald-500/40 text-emerald-300 hover:border-emerald-400"
                  >
                    + إضافة بند جديد للأمر
                  </Button>
                </div>

                <div className="overflow-x-auto rounded-lg border border-slate-800">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-950 text-slate-400 font-bold border-b border-slate-800">
                      <tr>
                        <th className="p-2.5">اسم الصنف والتوصيف</th>
                        <th className="p-2.5 w-28">رقم القطعة</th>
                        <th className="p-2.5 w-24">المنطقة</th>
                        <th className="p-2.5 w-24">الكمية</th>
                        <th className="p-2.5 w-20">الوحدة</th>
                        <th className="p-2.5 w-28">سعر الوحدة</th>
                        <th className="p-2.5 w-28 text-left">إجمالي البند</th>
                        <th className="p-2.5 w-12 text-center">إجراء</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 bg-slate-900/40">
                      {items.map((it, idx) => {
                        const lineTotal = Math.round((Number(it.quantity) || 0) * (Number(it.unit_price) || 0) * 100) / 100;
                        return (
                          <tr key={`item-${it.id || idx}`} className={it.delete ? 'opacity-40 bg-rose-950/20 line-through' : ''}>
                            <td className="p-2">
                              <input
                                type="text"
                                value={it.item_description}
                                onChange={(e) => handleItemChange(idx, 'item_description', e.target.value)}
                                disabled={it.delete}
                                placeholder="وصف البند..."
                                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100 font-bold focus:border-amber-400 focus:outline-none"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={it.item_reference}
                                onChange={(e) => handleItemChange(idx, 'item_reference', e.target.value)}
                                disabled={it.delete}
                                placeholder="رقم القطعة..."
                                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-cyan-300 font-mono focus:border-amber-400 focus:outline-none"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={it.region}
                                onChange={(e) => handleItemChange(idx, 'region', e.target.value)}
                                disabled={it.delete}
                                placeholder="المنطقة..."
                                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200 focus:border-amber-400 focus:outline-none"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                step="any"
                                value={it.quantity}
                                onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                                disabled={it.delete}
                                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-cyan-200 font-mono font-bold text-center focus:border-amber-400 focus:outline-none"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={it.uom}
                                onChange={(e) => handleItemChange(idx, 'uom', e.target.value)}
                                disabled={it.delete}
                                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200 text-center focus:border-amber-400 focus:outline-none"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                step="any"
                                value={it.unit_price}
                                onChange={(e) => handleItemChange(idx, 'unit_price', e.target.value)}
                                disabled={it.delete}
                                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100 font-mono font-bold text-center focus:border-amber-400 focus:outline-none"
                              />
                            </td>
                            <td className="p-2 text-left font-mono font-black text-emerald-300">
                              {formatCleanNumber(lineTotal)} ج.م
                            </td>
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleDeleteItem(idx)}
                                title={it.delete ? 'استعادة البند' : 'حذف البند'}
                                className={`text-base p-1 rounded hover:bg-slate-800 ${it.delete ? 'text-amber-400' : 'text-rose-400'}`}
                              >
                                {it.delete ? '↩️' : '🗑️'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Grand Total Summary */}
                <div className="flex items-center justify-between rounded-lg bg-slate-950 p-3 border border-slate-800">
                  <span className="text-xs text-slate-400 font-bold">
                    إجمالي أمر الشراء بعد التعديل السيادي ({activeItems.length} بنود نشطة):
                  </span>
                  <div className="text-lg font-mono font-black text-emerald-400">
                    {formatCleanNumber(grandTotal)} ج.م
                  </div>
                </div>
              </div>

              {/* 3. Synchronization Options & Notes */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-4">
                <h3 className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <span className="text-purple-400">🔄</span> 3. مزامنة المستندات المرتبطة
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <label className="flex items-center gap-2.5 cursor-pointer rounded-lg border border-slate-800 bg-slate-900/60 p-2.5 hover:border-slate-700">
                    <input
                      type="checkbox"
                      checked={syncReceipt}
                      onChange={(e) => setSyncReceipt(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-purple-500 focus:ring-purple-500"
                    />
                    <div>
                      <span className="font-bold text-slate-200 block">مزامنة أذونات الاستلام (GRN Sync)</span>
                      <span className="text-slate-400 text-[11px]">تحديث كميات محضر الاستلام بالموقع لتطابق أمر الشراء تلقائياً.</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer rounded-lg border border-slate-800 bg-slate-900/60 p-2.5 hover:border-slate-700">
                    <input
                      type="checkbox"
                      checked={syncPr}
                      onChange={(e) => setSyncPr(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-purple-500 focus:ring-purple-500"
                    />
                    <div>
                      <span className="font-bold text-slate-200 block">مزامنة طلب الشراء المرتبط (PR Sync)</span>
                      <span className="text-slate-400 text-[11px]">تحديث التكلفة الإجمالية في طلب الشراء الأصلي.</span>
                    </div>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-1">
                  <div>
                    <label className="block text-slate-400 font-bold mb-1">ملاحظات عامة:</label>
                    <textarea
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="أي ملاحظات فنية أو إدارية..."
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 font-bold mb-1">ملاحظات مالية:</label>
                    <textarea
                      rows={2}
                      value={financialNotes}
                      onChange={(e) => setFinancialNotes(e.target.value)}
                      placeholder="شروط الدفع أو خصومات أو ملاحظات للحسابات..."
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* 4. Mandatory Reason for Audit Log */}
              <div className="rounded-xl border-2 border-amber-500/40 bg-amber-950/20 p-4 space-y-2">
                <label className="block text-xs font-black text-amber-300">
                  ⚠️ سبب التدخل الإداري الاستثنائي (إلزامي للتوثيق في سجل النظام):
                </label>
                <textarea
                  rows={2}
                  required
                  value={adminReason}
                  onChange={(e) => setAdminReason(e.target.value)}
                  placeholder="اكتب سبب قيامك بهذا التعديل السيادي (مثال: تصحيح خطأ إدخال بالكميات بعد توقيع الموقع، أو تعديل سعر الوحدة بقرار الإدارة)..."
                  className="w-full rounded-lg border border-amber-500/50 bg-slate-950 px-3 py-2 text-xs text-amber-100 placeholder:text-amber-300/40 focus:border-amber-400 focus:outline-none font-medium"
                />
                <p className="text-[11px] text-amber-400/80">
                  * سيتم تسجيل اسمك وتاريخ وتوقيت التدخل والبيانات القديمة والجديدة كاملة في سجل الأحداث الرقابية (Audit Trail).
                </p>
              </div>
            </form>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-800 bg-slate-950 px-5 py-3">
          <div className="text-xs text-slate-400">
            {orderData?.createdBy?.name && (
              <span>أنشئ بواسطة: <strong className="text-slate-300">{orderData.createdBy.name}</strong></span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onClose}
              disabled={submitting}
              className="text-xs"
            >
              إلغاء التعديل
            </Button>
            <Button
              type="submit"
              form="admin-force-edit-form"
              variant="warning"
              size="sm"
              isLoading={submitting}
              loadingText="جاري الحفظ والتثبيت السيادي..."
              className="text-xs font-black px-6 border-amber-400/60"
            >
              👑 حفظ وتثبيت التعديل السيادي فوراً
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
