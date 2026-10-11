import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { FormField, Textarea } from '../ui/FormField';
import { confirmOfficeReceiptApi } from '../../api/purchaseReceipts';
import ErrorMessage from '../ErrorMessage';
import { ApiError } from '../../types/api';
import { parseApiError } from '../../utils/apiError';

interface Props {
  isOpen: boolean;
  purchaseOrderId: number;
  poNumber: string;
  supplierName?: string;
  items?: Array<{ id: number; item_description: string; quantity: string | number; uom?: string | null }>;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export const OfficeReceiptModal: React.FC<Props> = ({
  isOpen,
  purchaseOrderId,
  poNumber,
  supplierName,
  items = [],
  onClose,
  onSuccess,
}) => {
  const [notes, setNotes] = useState<string>('تم استلام جميع الأصناف بحالة ممتازة ومطابقة للمواصفات في مقر الشركة.');
  const [itemQuantities, setItemQuantities] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {};
    items.forEach((it) => {
      initial[it.id] = String(it.quantity ?? 1);
    });
    return initial;
  });
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<ApiError | null>(null);

  // Sync itemQuantities whenever items prop changes
  React.useEffect(() => {
    const updated: Record<number, string> = {};
    items.forEach((it) => {
      updated[it.id] = String(it.quantity ?? 1);
    });
    setItemQuantities(updated);
  }, [items]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate quantities
    const payloadItems = items.map((it) => {
      const qVal = Number(itemQuantities[it.id] ?? it.quantity);
      return {
        purchase_order_item_id: it.id,
        received_quantity: qVal,
      };
    });

    if (payloadItems.some((it) => Number.isNaN(it.received_quantity) || it.received_quantity < 0)) {
      setError({ message: 'يرجى إدخال كميات مستلمة صحيحة وغير سالبة لجميع الأصناف.' } as ApiError);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await confirmOfficeReceiptApi(purchaseOrderId, {
        notes: notes.trim() || undefined,
        items: payloadItems,
      });
      onSuccess(res.message || 'تم تأكيد استلام المستلزمات المكتبية بنجاح وإحالة الأمر لإدارة المشتريات لإصدار أمر الشراء الفعلي.');
      onClose();
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in" dir="rtl">
      <div className="relative w-full max-w-lg rounded-2xl border border-indigo-500/40 bg-slate-900 shadow-2xl shadow-indigo-950/50 p-6 space-y-5">
        <div className="flex items-start justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-xl">
              🏢
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">تأكيد استلام المستلزمات المكتبية</h3>
              <p className="text-xs text-indigo-300">أمر الشراء: <span className="font-mono font-bold text-slate-200">{poNumber}</span></p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-lg p-1 rounded-lg hover:bg-slate-800"
          >
            ✕
          </button>
        </div>

        <ErrorMessage error={error} onDismiss={() => setError(null)} />

        <div className="rounded-xl border border-indigo-900/60 bg-indigo-950/30 p-3.5 text-xs text-indigo-200 leading-relaxed">
          <span>ℹ️ </span>
          بصفتك مقدم الطلب والمستلم الفعلي، يمكنك فحص الأصناف وتعديل الكمية المستلمة فعلياً في مقر الشركة قبل تأكيد الاستلام لإحالة أمر الشراء إلى إدارة المشتريات لإصدار أمر الشراء الفعلي تمهيداً للحسابات.
        </div>

        {supplierName && (
          <div className="text-xs text-slate-400 flex items-center gap-1.5">
            <span>المورد:</span>
            <strong className="text-slate-200">{supplierName}</strong>
          </div>
        )}

        {items.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-300">الأصناف والكميات المستلمة فعلياً:</label>
              <span className="text-[11px] text-indigo-300 font-medium">يمكنك تعديل الكمية المستلمة</span>
            </div>
            <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 space-y-2 text-xs">
              {items.map((item, idx) => (
                <div key={item.id || idx} className="flex items-center justify-between py-2 border-b border-slate-800/60 last:border-0 gap-3">
                  <div className="flex-1 min-w-0">
                    <span className="text-slate-200 font-medium block truncate">{item.item_description}</span>
                    <span className="text-[10px] text-slate-400">الكمية بأمر الشراء: {item.quantity} {item.uom || ''}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <label htmlFor={`office-qty-${item.id}`} className="text-[11px] text-indigo-300 font-bold">المستلم:</label>
                    <input
                      id={`office-qty-${item.id}`}
                      type="number"
                      min="0"
                      step="any"
                      value={itemQuantities[item.id] ?? item.quantity}
                      onChange={(e) => setItemQuantities({ ...itemQuantities, [item.id]: e.target.value })}
                      className="w-20 px-2 py-1 text-center font-mono font-bold text-xs bg-slate-900 border border-indigo-500/50 rounded-lg text-indigo-200 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500"
                    />
                    <span className="text-[11px] text-slate-400 font-bold min-w-[28px]">{item.uom || ''}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="ملاحظات الاستلام">
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="اكتب أي ملاحظات حول حالة المواد أو مكان استلامها..."
            />
          </FormField>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSubmitting}
              className="bg-indigo-600 hover:bg-indigo-500 border-indigo-500 text-white font-bold px-4"
            >
              {isSubmitting ? 'جاري التأكيد...' : '✓ تأكيد الاستلام الفعلي'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default OfficeReceiptModal;
