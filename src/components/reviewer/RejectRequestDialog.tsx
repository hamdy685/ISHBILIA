import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { FormField, Textarea } from '../ui/FormField';
import { ActionConfirmationModal } from '../common/ActionConfirmationModal';

interface Props {
  isOpen: boolean;
  requestNumber: string;
  isRejecting: boolean;
  onConfirm: (comment: string) => void;
  onCancel: () => void;
}

export const RejectRequestDialog: React.FC<Props> = ({
  isOpen,
  requestNumber,
  isRejecting,
  onConfirm,
  onCancel,
}) => {
  const [comment, setComment] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  React.useEffect(() => {
    if (!isOpen) {
      setComment('');
      setValidationError(null);
      setIsConfirmModalOpen(false);
    }
  }, [isOpen]);

  const handleCancel = () => {
    setComment('');
    setValidationError(null);
    setIsConfirmModalOpen(false);
    onCancel();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isRejecting) return;
    if (!comment.trim() || comment.trim().length < 3) {
      setValidationError('يرجى إدخال سبب الرفض (3 حروف على الأقل)(min 3 chars).');
      return;
    }
    setValidationError(null);
    setIsConfirmModalOpen(true);
  };

  const handleFinalConfirm = () => {
    setIsConfirmModalOpen(false);
    onConfirm(comment.trim());
  };

  return (
    <>
      <Modal
      isOpen={isOpen}
      onClose={handleCancel}
      title="رفض طلب الشراء"
      subtitle={`طلب رقم ${requestNumber}`}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={handleCancel} disabled={isRejecting}>
            إلغاء
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={handleSubmit}
            isLoading={isRejecting}
            disabled={isRejecting}
          >
            تأكيد الرفض
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <p className="text-slate-200">
          هل أنت متأكد من رفض طلب الشراء <strong className="text-rose-400 font-mono">{requestNumber}</strong>؟ يجب ذكر سبب الرفض ليظهر للموظف.
        </p>

        {validationError && (
          <div className="text-xs text-rose-300 font-semibold bg-rose-950/60 p-2.5 rounded-lg border border-rose-800/80">
            {validationError}
          </div>
        )}

        <FormField label="سبب الرفض" required>
          <Textarea
            rows={3}
            required
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="يرجى كتابة سبب عدم قبول الطلب بشكل واضح..."
          />
        </FormField>
      </form>
    </Modal>

    <ActionConfirmationModal
      isOpen={isConfirmModalOpen}
      onClose={() => setIsConfirmModalOpen(false)}
      onConfirm={handleFinalConfirm}
      isLoading={isRejecting}
      title="مراجعة وتأكيد رفض طلب الشراء"
      subtitle={`طلب شراء رقم ${requestNumber}`}
      confirmLabel="حسناً، تأكيد الرفض نهائياً"
      cancelLabel="رجوع للتعديل"
      confirmVariant="danger"
      documentType="PURCHASE_REQUEST"
      documentCode={requestNumber}
      customRows={[
        { label: 'القرار المتخذ:', value: 'رفض طلب الشراء وإعادته لصاحب الطلب', highlight: true },
        { label: 'سبب الرفض المسجل:', value: comment },
      ]}
      alerts={[
        {
          type: 'warning',
          title: 'تنبيه إيقاف إجراءات الشراء',
          message: 'سيتم تغيير حالة الطلب إلى (مرفوض) وإرسال إشعار لصاحب الطلب بسبب الرفض، ولن يتم استكمال دورة الشراء.'
        }
      ]}
      promptQuestion={`أنت على وشك رفض طلب الشراء رقم (${requestNumber}) نهائياً، هل أنت متأكد من المتابعة؟`}
    />
  </>
  );
};

export default RejectRequestDialog;
