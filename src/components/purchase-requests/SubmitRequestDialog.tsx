import React from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

interface Props {
  isOpen: boolean;
  requestNumber: string;
  isSubmitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const SubmitRequestDialog: React.FC<Props> = ({
  isOpen,
  requestNumber,
  isSubmitting,
  onConfirm,
  onCancel,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title="إرسال طلب الشراء"
      subtitle={`طلب رقم ${requestNumber}`}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={isSubmitting}>
            إلغاء
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onConfirm}
            isLoading={isSubmitting}
            disabled={isSubmitting}
          >
            تقديم
          </Button>
        </>
      }
    >
      <div className="space-y-2 text-xs">
        <p className="text-slate-200">
          هل أنت متأكد من تقديم طلب الشراء <strong className="text-cyan-400 font-mono">{requestNumber}</strong> للمراجعة؟ بعد الإرسال، لن تتمكن من التعديل إلا إذا تمت إعادته.
        </p>
        <p className="text-slate-400 text-[11px]">
          Are you sure you want to submit request <strong className="font-mono">{requestNumber}</strong> for review? Once submitted, it cannot be modified.
        </p>
      </div>
    </Modal>
  );
};

export default SubmitRequestDialog;
