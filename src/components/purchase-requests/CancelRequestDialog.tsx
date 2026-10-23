import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

interface Props {
  isOpen: boolean;
  requestNumber: string;
  isCancelling: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export const CancelRequestDialog: React.FC<Props> = ({
  isOpen,
  requestNumber,
  isCancelling,
  onConfirm,
  onCancel,
}) => {
  const [reason, setReason] = useState<string>('');

  const handleConfirm = () => {
    onConfirm(reason.trim());
  };

  const handleClose = () => {
    if (!isCancelling) {
      setReason('');
      onCancel();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="إلغاء طلب الشراء"
      subtitle={`طلب رقم ${requestNumber}`}
      size="md"
      footer={
        <div className="flex w-full items-center justify-end gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleClose}
            disabled={isCancelling}
            className="px-3 py-1.5 text-xs font-bold"
          >
            تراجع
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={handleConfirm}
            isLoading={isCancelling}
            disabled={isCancelling}
            className="px-4 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/40"
          >
            تأكيد إلغاء الطلب
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        <div className="rounded-xl border border-rose-500/20 bg-rose-950/20 p-3.5 space-y-1.5">
          <div className="flex items-center gap-2 text-rose-300 font-bold text-sm">
            <span>⚠️</span>
            <span>تأكيد إلغاء الطلب</span>
          </div>
          <p className="text-slate-300 leading-relaxed">
            هل أنت متأكد من رغبتك في إلغاء طلب الشراء <strong className="font-mono text-rose-300">{requestNumber}</strong> والاستغناء عنه نهائياً؟
          </p>
          <p className="text-slate-400 text-[11px]">
            سيتم تحويل حالة الطلب إلى (ملغي)، مع الاحتفاظ الكامل بسجل المراجعات والرفض وتاريخ الطلب لأغراض التدقيق.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="cancel-reason" className="block text-slate-300 font-medium">
            سبب الإلغاء (اختياري):
          </label>
          <textarea
            id="cancel-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={isCancelling}
            placeholder="مثال: تم الاستغناء عن الشراء لعدم الحاجة أو توفير البديل داخلياً..."
            className="w-full rounded-xl border border-white/10 bg-slate-900/90 px-3 py-2 text-slate-100 placeholder-slate-500 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 text-xs transition-colors"
          />
        </div>
      </div>
    </Modal>
  );
};

export default CancelRequestDialog;
