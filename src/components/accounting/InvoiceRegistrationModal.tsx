import React, { useState, useEffect, FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  ApprovedReceipt,
  createSupplierInvoiceApi,
  CreateSupplierInvoicePayload,
  getLandParcelsApi,
  LandParcel,
  getAccountingDepartmentsApi,
} from '../../api/supplierFinance';
import { formatCleanNumber } from '../../utils/numberFormat';
import { parseApiError } from '../../utils/apiError';
import { Button } from '../ui/Button';

interface InvoiceRegistrationModalProps {
  receipt: ApprovedReceipt | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export const InvoiceRegistrationModal: React.FC<InvoiceRegistrationModalProps> = ({
  receipt,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedParcelId, setSelectedParcelId] = useState<number | ''>('');
  const [parcels, setParcels] = useState<LandParcel[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load parcels when modal opens
  useEffect(() => {
    if (!isOpen) return;
    void getLandParcelsApi().then(setParcels).catch(() => []);
  }, [isOpen]);

  // Pre-fill amount from PO grand total or receipt value
  useEffect(() => {
    if (receipt && isOpen) {
      const po = receipt.purchase_order;
      const initialAmount = Number(po?.grand_total || 0) > 0
        ? Number(po?.grand_total)
        : (receipt.items || []).reduce((sum, item) => {
            const poItem = item.purchase_order_item;
            const q = Number(poItem?.quantity ?? item.ordered_quantity ?? item.received_quantity ?? 0);
            const p = Number(poItem?.unit_price || 0);
            return sum + Math.round(q * p * 100) / 100;
          }, 0);

      setAmount(initialAmount > 0 ? String(initialAmount) : '');
      setInvoiceNumber('');
      setInvoiceDate(new Date().toISOString().slice(0, 10));
      setDueDate('');
      setNotes('');
      setSelectedParcelId('');
      setError(null);
    }
  }, [receipt, isOpen]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, saving, onClose]);

  if (!isOpen || !receipt) return null;

  const po = receipt.purchase_order;
  const poId = receipt.purchase_order_id || po?.id;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!poId) {
      setError('بيانات أمر الشراء المرتبط غير متوفرة لهذا الإذن.');
      return;
    }

    const cleanAmount = Number(String(amount || '').replace(/,/g, '').trim());
    if (isNaN(cleanAmount) || cleanAmount <= 0) {
      setError('يرجى إدخال مبلغ صحيح أكبر من الصفر.');
      return;
    }

    if (dueDate && dueDate < invoiceDate) {
      setError('تاريخ الاستحقاق لا يمكن أن يسبق تاريخ الفاتورة.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const landAllocations = selectedParcelId
        ? [
            {
              land_parcel_id: Number(selectedParcelId),
              department_id: po?.purchase_request?.department?.id,
              amount: cleanAmount,
              notes: notes.trim() || undefined,
            },
          ]
        : undefined;

      const payload: CreateSupplierInvoicePayload = {
        purchase_order_id: poId,
        purchase_receipt_id: receipt.id,
        invoice_number: invoiceNumber.trim() || undefined,
        amount: cleanAmount,
        invoice_date: invoiceDate,
        due_date: dueDate || undefined,
        notes: notes.trim() || undefined,
        land_allocations: landAllocations,
      };

      await createSupplierInvoiceApi(payload);
      onSuccess(`تم تسجيل فاتورة المورد ${invoiceNumber.trim() ? `بالمستند #${invoiceNumber}` : ''} بنجاح ✅`);
      onClose();
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/85 p-2 sm:p-4 backdrop-blur-xs"
      dir="rtl"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex min-h-0 max-h-[calc(100dvh-1rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-cyan-800/80 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/70 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🧾</span>
            <div>
              <h2 className="text-sm sm:text-base font-black text-slate-100">
                تسجيل فاتورة المورد في نفس الصفحة
              </h2>
              <p className="text-[11px] text-slate-400">
                إذن استلام: <strong className="font-mono text-cyan-300">{receipt.receipt_number}</strong>
                {po?.po_number && (
                  <> • أمر الشراء الفعلي: <strong className="font-mono text-amber-300">{po.po_number}</strong></>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-lg font-black text-slate-300 hover:bg-slate-700 hover:text-white cursor-pointer"
            title="إغلاق"
          >
            ×
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {error && (
            <div className="rounded-xl border border-rose-800/60 bg-rose-950/40 p-3 text-xs font-bold text-rose-300">
              {error}
            </div>
          )}

          {/* Quick Summary Context */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs">
            <div>
              <span className="block text-[10px] text-slate-400">المورد</span>
              <strong className="text-slate-200 truncate block">
                {po?.supplier?.company_name || 'غير محدد'}
              </strong>
            </div>
            <div>
              <span className="block text-[10px] text-slate-400">القسم</span>
              <strong className="text-slate-300 truncate block">
                {po?.purchase_request?.department?.name || '—'}
              </strong>
            </div>
            <div>
              <span className="block text-[10px] text-slate-400">قيمة أمر الشراء الفعلي</span>
              <strong className="font-mono text-emerald-400 font-bold block">
                {formatCleanNumber(po?.grand_total || amount)} ج.م
              </strong>
            </div>
            <div>
              <span className="block text-[10px] text-slate-400">تاريخ الاستلام</span>
              <strong className="font-mono text-slate-300 block">
                {receipt.received_at ? String(receipt.received_at).slice(0, 10) : '—'}
              </strong>
            </div>
          </div>

          {/* Inputs Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                رقم فاتورة المورد <span className="text-slate-500 font-normal">(اختياري)</span>
              </label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="مثال: INV-2026-0012"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100 placeholder-slate-600 outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                المبلغ الإجمالي للفاتورة (ج.م) <span className="text-rose-400">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-xl border border-cyan-700/60 bg-slate-950 px-3 py-2 text-xs font-mono font-bold text-emerald-300 outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                تاريخ الفاتورة <span className="text-rose-400">*</span>
              </label>
              <input
                type="date"
                required
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                تاريخ الاستحقاق <span className="text-slate-500 font-normal">(اختياري)</span>
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          {/* Land Parcel Allocation (Optional) */}
          {parcels.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                تحميل المصروف على قطعة الأرض <span className="text-slate-500 font-normal">(اختياري)</span>
              </label>
              <select
                value={selectedParcelId}
                onChange={(e) => setSelectedParcelId(e.target.value ? Number(e.target.value) : '')}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-cyan-400"
              >
                <option value="">بدون تخصيص قطعة أرض مباشرة</option>
                {parcels.map((parcel) => (
                  <option key={parcel.id} value={parcel.id}>
                    {parcel.parcel_reference} — {parcel.region}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">
              ملاحظات الفاتورة <span className="text-slate-500 font-normal">(اختياري)</span>
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="أي ملاحظات محاسبية خاصة بالفاتورة..."
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-xs text-slate-100 placeholder-slate-600 outline-none focus:border-cyan-400"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={saving}
              onClick={onClose}
              className="text-xs font-bold"
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={saving}
              className="text-xs font-black bg-cyan-600 hover:bg-cyan-500 shadow-lg shadow-cyan-950/50"
            >
              {saving ? 'جاري الحفظ والتسجيل...' : 'حفظ وتسجيل الفاتورة ✅'}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
