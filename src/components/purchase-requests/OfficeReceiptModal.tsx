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
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<ApiError | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await confirmOfficeReceiptApi(purchaseOrderId, {
        notes: notes.trim() || undefined,
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
          بصفتك مقدم الطلب والمستلم الفعلي، يؤكد هذا الإجراء استلامك للأصناف في مقر الشركة، ويحوّل أمر الشراء إلى إدارة المشتريات لإصدار أمر الشراء الفعلي قبل إرساله للحسابات وصرف المستحقات.
        </div>

        {supplierName && (
          <div className="text-xs text-slate-400 flex items-center gap-1.5">
            <span>المورد:</span>
            <strong className="text-slate-200">{supplierName}</strong>
          </div>
        )}

        {items.length > 0 && (
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300">الأصناف المطلوب تأكيد استلامها:</label>
            <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 space-y-1.5 text-xs">
              {items.map((item, idx) => (
                <div key={item.id || idx} className="flex items-center justify-between py-1 border-b border-slate-800/60 last:border-0">
                  <span className="text-slate-200 font-medium">{item.item_description}</span>
                  <span className="font-mono font-bold text-indigo-300">{item.quantity} {item.uom || ''}</span>
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
