import React from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

interface Props {
  isOpen: boolean;
  requestNumber: string;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteRequestDialog: React.FC<Props> = ({
  isOpen,
  requestNumber,
  isDeleting,
  onConfirm,
  onCancel,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title="حذف المسودة"
      subtitle={`طلب رقم ${requestNumber}`}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={isDeleting}>
            إلغاء
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={onConfirm}
            isLoading={isDeleting}
            disabled={isDeleting}
          >
            حذف
          </Button>
        </>
      }
    >
      <div className="space-y-2 text-xs">
        <p className="text-slate-200">
          هل أنت متأكد من رغبتك في حذف طلب الشراء <strong className="text-rose-400 font-mono">{requestNumber}</strong>؟ لا يمكن التراجع عن هذا الإجراء.
        </p>
        <p className="text-slate-400 text-[11px]">
          Are you sure you want to delete draft request <strong className="font-mono">{requestNumber}</strong>? This action cannot be undone.
        </p>
      </div>
    </Modal>
  );
};

export default DeleteRequestDialog;
