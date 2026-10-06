import React from 'react';
import { createPortal } from 'react-dom';
import { ApprovedReceipt } from '../../api/supplierFinance';
import { PurchaseOrder } from '../../types/purchaseOrder';
import { printDocumentOnly } from '../../utils/print';
import { CombinedPrintTemplate } from '../procurement/CombinedPrintTemplate';
import { shareReceiptOnWhatsApp } from '../../utils/whatsapp';

interface ThreeWayMatchPrintModalProps {
  receipt?: ApprovedReceipt | null;
  po?: PurchaseOrder | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ThreeWayMatchPrintModal: React.FC<ThreeWayMatchPrintModalProps> = ({
  receipt: propsReceipt,
  po: propsPo,
  isOpen,
  onClose,
}) => {
  // Top-Level Hooks: Must be called unconditionally at the very top of the component
  const [isGeneratingPdf, setIsGeneratingPdf] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Derived state
  const po = propsPo || propsReceipt?.purchase_order || null;
  const receipt = propsReceipt || (po?.receipts?.[0] as any) || null;

  // Early return: ONLY after all hooks have been declared
  if (!isOpen || (!propsReceipt && !propsPo)) {
    return null;
  }

  const handleWhatsAppShare = async () => {
    if (!receipt || isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    try {
      const docEl = document.querySelector<HTMLElement>('.three-way-print-container .print-document');
      await shareReceiptOnWhatsApp(receipt, undefined, {
        po: po,
        sourceElement: docEl,
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handlePrint = () => {
    printDocumentOnly('.three-way-print-container .print-document', {
      orientation: 'portrait',
      title: `الدورة_المستندية_${po?.po_number || 'مستند'}`,
      pageMargin: '4mm',
    });
  };

  return createPortal(
    <div
      className="three-way-print-container print-container fixed inset-0 z-[9999] flex min-h-screen items-center justify-center overflow-y-auto bg-slate-950/85 p-2 sm:p-4 print:static print:block print:bg-white print:p-0"
      dir="rtl"
    >
      <div className="flex min-h-0 max-h-[calc(100dvh-1rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl print:block print:max-w-none print:max-h-none print:border-none print:shadow-none">
        {/* Modal Controls (Hidden in Print) */}
        <div className="print:hidden flex items-center justify-between gap-3 border-b border-slate-700 bg-slate-800 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-lg">📑</span>
            <div>
              <h2 className="text-xs sm:text-sm font-bold text-slate-100">
                طباعة الدورة المستندية (طلب شراء • أمر شراء فعلي • إذن استلام)
              </h2>
              <p className="text-[10.5px] text-slate-400">
                أمر الشراء الفعلي: <strong className="font-mono text-cyan-300">{po?.po_number || '---'}</strong>
                {receipt?.receipt_number && (
                  <> • إذن الاستلام: <strong className="font-mono text-amber-300">{receipt.receipt_number}</strong></>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {receipt && (
              <button
                type="button"
                disabled={isGeneratingPdf}
                onClick={() => void handleWhatsAppShare()}
                className="flex items-center gap-1.5 rounded-lg bg-green-600 hover:bg-green-500 px-3.5 py-1.5 text-xs font-bold text-white transition-colors shadow-md cursor-pointer disabled:opacity-50"
                title="توليد ملف PDF واختيار جهة الاتصال عبر واتساب"
              >
                <span>💬</span> {isGeneratingPdf ? 'جاري تجهيز PDF...' : 'واتساب'}
              </button>
            )}
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-1.5 text-xs font-bold text-white transition-colors shadow-md cursor-pointer"
            >
              <span>🖨️</span> طباعة المستند
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-600 bg-slate-700 text-lg font-black text-white hover:bg-slate-600 cursor-pointer"
              title="إغلاق"
            >
              ×
            </button>
          </div>
        </div>

        {/* Printable Document Viewport */}
        <div className="flex-1 overflow-y-auto bg-slate-900 p-2 sm:p-4 print:overflow-visible print:bg-white print:p-0">
          <div className="mx-auto max-w-4xl bg-white p-4 sm:p-6 text-black print:max-w-none print:p-0 shadow-lg print:shadow-none">
            <CombinedPrintTemplate po={po} receipt={receipt} />
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ThreeWayMatchPrintModal;
