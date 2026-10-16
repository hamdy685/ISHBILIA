import React from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { formatCleanNumber } from '../../utils/numberFormat';

export interface ConfirmationAlert {
  type: 'rebar' | 'grouped' | 'warning' | 'info';
  title: string;
  message: string;
  badge?: string;
}

export interface ConfirmationDetailRow {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
}

export interface ActionConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
  title?: string;
  subtitle?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'primary' | 'success' | 'danger' | 'warning';
  
  // Core Business Metadata
  documentType?: 'PURCHASE_ORDER' | 'PURCHASE_REQUEST' | 'DIRECT_PO' | 'GENERAL';
  documentCode?: string;
  department?: string;
  projectSite?: string;
  supplierName?: string;
  totalAmount?: number;
  tafqeetText?: string;
  itemsCount?: number;
  receiverName?: string;
  customRows?: ConfirmationDetailRow[];

  // Smart Alerts
  alerts?: ConfirmationAlert[];
  promptQuestion?: string;
}

export const ActionConfirmationModal: React.FC<ActionConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
  title = 'تأكيد الإجراء والبيانات',
  subtitle,
  confirmLabel = 'حسناً، تأكيد وتنفيذ',
  cancelLabel = 'رجوع للتعديل',
  confirmVariant = 'primary',
  documentCode,
  department,
  projectSite,
  supplierName,
  totalAmount,
  tafqeetText,
  itemsCount,
  receiverName,
  customRows,
  alerts = [],
  promptQuestion = 'أنت على وشك اعتماد وتنفيذ الإجراء التالي بالبيانات الموضحة أعلاه، هل ترغب في الاستمرار؟',
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={isLoading ? () => undefined : onClose}
      title={title}
      subtitle={subtitle || (documentCode ? `معاملة رقم ${documentCode}` : undefined)}
      size="lg"
      footer={(
        <div className="flex items-center justify-between w-full gap-3" dir="rtl">
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={onClose}
            disabled={isLoading}
            className="font-bold text-xs px-5 border-slate-700 hover:bg-slate-800"
          >
            {cancelLabel}
          </Button>

          <Button
            type="button"
            variant={confirmVariant}
            size="md"
            onClick={onConfirm}
            isLoading={isLoading}
            disabled={isLoading}
            className="font-black text-xs px-6 shadow-lg shadow-gold-950/40"
          >
            {confirmLabel}
          </Button>
        </div>
      )}
    >
      <div className="space-y-4 text-right" dir="rtl">
        {/* ── Prompt Banner ── */}
        <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl flex items-center gap-3">
          <div className="h-10 w-10 shrink-0 rounded-xl bg-gold-500/10 border border-gold-500/30 flex items-center justify-center text-lg text-gold-400">
            ℹ️
          </div>
          <div>
            <p className="text-xs font-bold text-slate-200">
              {promptQuestion}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              يرجى مراجعة ملخص البنود والتنبيهات أدناه قبل التعميد النهائي:
            </p>
          </div>
        </div>

        {/* ── Smart Alerts Callouts ── */}
        {alerts.length > 0 && (
          <div className="space-y-2.5">
            {alerts.map((alert, idx) => {
              if (alert.type === 'rebar') {
                return (
                  <div
                    key={idx}
                    className="rounded-2xl border-2 border-amber-500/70 bg-gradient-to-r from-amber-950/60 via-slate-900 to-amber-950/40 p-4 shadow-xl shadow-amber-950/30 animate-pulse-subtle"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl mt-0.5">🏗️</span>
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-black text-amber-300">
                            {alert.title || 'تنبيه وزنة حديد تسليح (مسار مستقل كامل)'}
                          </h4>
                          {alert.badge && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 border border-amber-500/40 text-amber-200">
                              {alert.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-bold text-amber-100/90 leading-relaxed">
                          {alert.message}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }

              if (alert.type === 'grouped') {
                return (
                  <div
                    key={idx}
                    className="rounded-2xl border border-cyan-500/50 bg-gradient-to-r from-cyan-950/50 via-slate-900 to-cyan-950/30 p-3.5 shadow-md"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-xl mt-0.5">📋</span>
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-black text-cyan-300">
                            {alert.title || 'تنبيه أوامر شراء مجمعة / متعددة'}
                          </h4>
                          {alert.badge && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-cyan-500/20 border border-cyan-500/40 text-cyan-200">
                              {alert.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-cyan-100 font-medium leading-relaxed">
                          {alert.message}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }

              // Default Warning / Info Alert
              return (
                <div
                  key={idx}
                  className={`rounded-2xl border p-3.5 flex items-start gap-3 ${
                    alert.type === 'warning'
                      ? 'border-rose-500/40 bg-rose-950/30 text-rose-200'
                      : 'border-slate-700 bg-slate-900/60 text-slate-300'
                  }`}
                >
                  <span className="text-lg mt-0.5">{alert.type === 'warning' ? '⚠️' : '💡'}</span>
                  <div className="space-y-0.5 flex-1">
                    <h4 className="text-xs font-bold">{alert.title}</h4>
                    <p className="text-xs leading-relaxed">{alert.message}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Key Decision Summary Cards Grid ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
          {documentCode && (
            <div className="bg-slate-900/80 border border-slate-800 p-2.5 rounded-xl">
              <span className="text-[10px] text-slate-400 block font-bold">رقم المعاملة:</span>
              <span className="font-mono font-black text-cyan-300 text-sm mt-0.5 block">{documentCode}</span>
            </div>
          )}

          {projectSite && (
            <div className="bg-slate-900/80 border border-slate-800 p-2.5 rounded-xl">
              <span className="text-[10px] text-slate-400 block font-bold">المشروع / قطعة الأرض:</span>
              <span className="font-bold text-amber-300 text-xs mt-0.5 block">{projectSite}</span>
            </div>
          )}

          {department && (
            <div className="bg-slate-900/80 border border-slate-800 p-2.5 rounded-xl">
              <span className="text-[10px] text-slate-400 block font-bold">القسم / الإدارة:</span>
              <span className="font-bold text-slate-200 text-xs mt-0.5 block">{department}</span>
            </div>
          )}

          {supplierName && (
            <div className="bg-slate-900/80 border border-slate-800 p-2.5 rounded-xl">
              <span className="text-[10px] text-slate-400 block font-bold">المورد المعتمد:</span>
              <span className="font-bold text-emerald-300 text-xs mt-0.5 block">{supplierName}</span>
            </div>
          )}

          {itemsCount !== undefined && (
            <div className="bg-slate-900/80 border border-slate-800 p-2.5 rounded-xl">
              <span className="text-[10px] text-slate-400 block font-bold">عدد البنود:</span>
              <span className="font-mono font-bold text-slate-200 text-xs mt-0.5 block">{itemsCount} صنف / بند</span>
            </div>
          )}

          {receiverName && (
            <div className="bg-slate-900/80 border border-slate-800 p-2.5 rounded-xl">
              <span className="text-[10px] text-slate-400 block font-bold">المستلم المعتمد بالموقع:</span>
              <span className="font-bold text-sky-300 text-xs mt-0.5 block">{receiverName}</span>
            </div>
          )}
        </div>

        {/* Custom Key-Value Rows */}
        {customRows && customRows.length > 0 && (
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-3 space-y-2 text-xs">
            {customRows.map((row, idx) => (
              <div key={idx} className="flex items-center justify-between border-b border-slate-800/60 pb-1.5 last:border-none last:pb-0">
                <span className="text-slate-400 font-medium">{row.label}</span>
                <span className={`font-bold ${row.highlight ? 'text-amber-300 font-mono text-sm' : 'text-slate-200'}`}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── Financial Total Strip ── */}
        {totalAmount !== undefined && totalAmount > 0 && (
          <div className="rounded-2xl border-2 border-gold-500/50 bg-gradient-to-r from-gold-950/70 via-slate-900 to-amber-950/60 p-4 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-[11px] text-gold-300 font-black block">إجمالي القيمة المالية المعتمدة:</span>
                {tafqeetText && (
                  <span className="text-[11px] text-slate-300 font-medium mt-0.5 block">
                    ({tafqeetText})
                  </span>
                )}
              </div>
              <div className="text-left font-mono">
                <span className="text-2xl font-black text-gold-300">
                  {formatCleanNumber(totalAmount, 2)}
                </span>
                <span className="text-xs font-bold text-gold-400 mr-1.5">ج.م</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ActionConfirmationModal;
