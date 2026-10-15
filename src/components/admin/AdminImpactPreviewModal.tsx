import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../ui/Button';
import LoadingSpinner from '../LoadingSpinner';
import ErrorMessage from '../ErrorMessage';
import { ImpactPreview } from '../../api/admin/controlCenter';
import { getWorkflowStatusLabel } from '../../utils/statusLabels';

interface AdminImpactPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  impact: ImpactPreview | null;
  loading: boolean;
  onConfirm: (reason: string, isExceptional?: boolean) => Promise<void>;
  actionTitle?: string;
}

export const AdminImpactPreviewModal: React.FC<AdminImpactPreviewModalProps> = ({
  isOpen,
  onClose,
  impact,
  loading,
  onConfirm,
  actionTitle = 'تأكيد العملية الإدارية',
}) => {
  const [reason, setReason] = useState<string>('');
  const [confirmText, setConfirmText] = useState<string>('');
  const [isExceptionalConfirmed, setIsExceptionalConfirmed] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !impact) return null;

  const requiresTyping = impact.requires_confirm_text || impact.is_financial_locked;
  const isTypedValid = !requiresTyping || 
    ['CONFIRM', 'تأكيد', 'إلغاء'].includes(confirmText.trim().toUpperCase()) ||
    confirmText.trim() === 'CONFIRM';

  const isReasonValid = reason.trim().length >= 5;
  const isExceptionValid = !impact.requires_exception || isExceptionalConfirmed;
  const canSubmit = isTypedValid && isReasonValid && isExceptionValid && !submitting && !loading;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(reason.trim(), impact.requires_exception ? isExceptionalConfirmed : false);
      onClose();
    } catch (err: any) {
      console.error('[AdminImpactPreviewModal] Error executing action:', err);
      const msg = err?.response?.data?.message || err?.message || 'حدث خطأ أثناء تنفيذ الإجراء.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto"
      dir="rtl"
    >
      <div className="relative w-full max-w-xl bg-slate-900 border-2 border-gold-500/50 rounded-3xl shadow-2xl shadow-gold-950/70 p-6 text-slate-100 space-y-5 animate-scale-in">
        {/* ── Header ── */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-gold-500/40 bg-gold-950/60 text-2xl shadow-inner text-gold-300">
              ⚡
            </span>
            <div>
              <h3 className="text-lg font-black text-gold-300 flex items-center gap-2">
                <span>معاينة وفحص أثر الإجراء:</span>
                <span className="font-mono text-cyan-300 bg-cyan-950/70 px-2 py-0.5 rounded-lg border border-cyan-800/50 text-sm">
                  {impact.entity_label}
                </span>
              </h3>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                {actionTitle} — فحص استباقي لمنع كسر دورة المشتريات والحسابات
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-slate-400 hover:text-slate-200 text-lg font-bold p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* ── Impact Grid Summary ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          {/* Status Change */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3.5 space-y-1.5">
            <span className="text-[11px] font-bold text-slate-400 block">انتقال حالة المستند:</span>
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs px-2.5 py-1 rounded bg-slate-800 text-slate-200 border border-slate-700">
                {getWorkflowStatusLabel(impact.current_status)}
              </span>
              <span className="text-gold-400 font-bold">⬅️</span>
              <span className="font-bold text-xs px-2.5 py-1 rounded bg-gold-950 text-gold-300 border border-gold-700">
                {impact.proposed_status ? getWorkflowStatusLabel(impact.proposed_status) : 'نفس الحالة'}
              </span>
            </div>
          </div>

          {/* Owner Change */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3.5 space-y-1.5">
            <span className="text-[11px] font-bold text-slate-400 block">مالك الإجراء / المستلم:</span>
            <div className="flex items-center gap-2">
              <span className="truncate max-w-[110px] text-slate-300 font-medium">
                {impact.current_owner?.name || 'غير محدد'}
              </span>
              <span className="text-cyan-400 font-bold">⬅️</span>
              <span className="truncate max-w-[110px] text-cyan-300 font-bold">
                {impact.proposed_owner?.name || 'لا تغيير'}
              </span>
            </div>
          </div>
        </div>

        {/* ── Linked Documents Summary ── */}
        {impact.linked_documents && (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3 text-xs space-y-2">
            <span className="text-slate-400 font-bold block">المستندات المرتبطة المتأثرة:</span>
            <div className="flex flex-wrap gap-2">
              {impact.linked_documents.purchase_orders?.map((po, idx) => (
                <span key={idx} className="bg-cyan-950/60 border border-cyan-800/40 text-cyan-300 px-2 py-0.5 rounded font-mono">
                  أمر شراء: {po}
                </span>
              ))}
              {impact.linked_documents.receipts?.map((rec, idx) => (
                <span key={idx} className="bg-emerald-950/60 border border-emerald-800/40 text-emerald-300 px-2 py-0.5 rounded font-mono">
                  إذن استلام: {rec}
                </span>
              ))}
              {impact.linked_documents.invoices_count ? (
                <span className="bg-amber-950/60 border border-amber-800/40 text-amber-300 px-2 py-0.5 rounded font-bold">
                  فواتير موردين: {impact.linked_documents.invoices_count}
                </span>
              ) : null}
            </div>
          </div>
        )}

        {/* ── Warnings & Lock Box ── */}
        {impact.warnings?.length > 0 && (
          <div className="rounded-2xl border border-rose-500/50 bg-rose-950/30 p-3.5 space-y-2 text-xs">
            <div className="flex items-center gap-2 text-rose-300 font-black">
              <span>⚠️</span>
              <span>تحذيرات الأثر والقيود النظامية:</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-rose-200/90 font-medium leading-relaxed">
              {impact.warnings.map((w, idx) => (
                <li key={idx}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Exceptional Transition Notice ── */}
        {impact.requires_exception && (
          <div className="rounded-2xl border border-amber-500/50 bg-amber-950/30 p-3.5 space-y-2 text-xs">
            <div className="flex items-center gap-2 text-amber-300 font-black">
              <span>🛡️</span>
              <span>انتقال استثنائي غير مسجل بالمسار العادي:</span>
            </div>
            <p className="text-amber-200/90 font-medium">
              {impact.transition_message || 'يتطلب هذا الإجراء تفعيل اعتماد إداري استثنائي وتوثيقه في سجل التدقيق.'}
            </p>
            <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isExceptionalConfirmed}
                onChange={(e) => setIsExceptionalConfirmed(e.target.checked)}
                className="rounded border-amber-500 bg-slate-900 text-amber-500 focus:ring-amber-400 h-4 w-4"
              />
              <span className="font-bold text-amber-200 text-xs">
                أقر بصفتي مديراً للنظام بمسؤوليتي عن هذا التدخل الإداري الاستثنائي
              </span>
            </label>
          </div>
        )}

        {/* ── Reason Input (Mandatory) ── */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
            <span>مبرر وسبب الإجراء (إلزامي — يُسجل في Audit Log):</span>
            <span className="text-[10px] text-gold-400 font-mono">* لا يقل عن 5 أحرف</span>
          </label>
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={submitting}
            placeholder="اكتب التبرير الإداري أو سبب التدخل..."
            className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
          />
        </div>

        {/* ── Confirm Text Verification ── */}
        {requiresTyping && (
          <div className="space-y-1.5 rounded-2xl border border-gold-500/40 bg-gold-950/20 p-3.5">
            <label className="text-xs font-bold text-gold-300 block">
              لتأكيد الإجراء، يرجى كتابة كلمة <strong className="text-white bg-gold-900/80 px-1.5 py-0.5 rounded font-mono">CONFIRM</strong> أو <strong className="text-white bg-gold-900/80 px-1.5 py-0.5 rounded font-mono">تأكيد</strong> أدناه:
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={submitting}
              placeholder="اكتب: CONFIRM أو تأكيد"
              className="w-full rounded-xl border border-gold-500/50 bg-slate-950 px-3 py-2 text-xs font-bold text-gold-200 placeholder-slate-600 focus:border-gold-400 focus:outline-none focus:ring-1 focus:ring-gold-400"
            />
          </div>
        )}

        {/* ── Error Box ── */}
        {error && <ErrorMessage error={error} />}

        {/* ── Action Buttons ── */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={submitting}
            className="text-xs h-9 px-4 font-bold"
          >
            تراجع وإلغاء
          </Button>

          <Button
            type="button"
            variant={impact.action === 'CANCEL' ? 'danger' : 'primary'}
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="text-xs h-9 px-5 font-black shadow-lg"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <LoadingSpinner size="sm" />
                <span>جاري التنفيذ والتسجيل...</span>
              </span>
            ) : (
              <span>اعتماد وتنفيذ الإجراء 🛡️</span>
            )}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
};
