import React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  isLoading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
  isLoading = false,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={isLoading ? () => undefined : onClose}
    title={title}
    subtitle="هذا الإجراء قد يؤثر على بيانات النظام ولا يمكن التراجع عنه بسهولة."
    size="sm"
    footer={(
      <>
        <Button variant="secondary" size="sm" onClick={onClose} disabled={isLoading}>
          إلغاء
        </Button>
        <Button variant="danger" size="sm" onClick={onConfirm} isLoading={isLoading} disabled={isLoading}>
          {confirmLabel}
        </Button>
      </>
    )}
  >
    <div className="rounded-lg border border-rose-900/50 bg-rose-950/20 p-4 text-sm leading-7 text-slate-300">
      {message}
    </div>
  </Modal>
);

export default ConfirmDialog;
