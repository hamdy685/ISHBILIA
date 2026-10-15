import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../ui/Button';
import LoadingSpinner from '../LoadingSpinner';
import ErrorMessage from '../ErrorMessage';
import { rollbackWorkflowApi, forwardWorkflowApi, WorkflowTransitionRule } from '../../api/admin/controlCenter';
import { getWorkflowStatusLabel } from '../../utils/statusLabels';

interface AdminWorkflowTransitionModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: 'PURCHASE_REQUEST' | 'PURCHASE_ORDER' | 'PURCHASE_RECEIPT';
  entityId: number;
  entityLabel: string;
  currentStatus: string;
  direction: 'ROLLBACK' | 'FORWARD';
  allowedTransitions?: WorkflowTransitionRule[];
  onSuccess: (message: string) => void;
}

export const AdminWorkflowTransitionModal: React.FC<AdminWorkflowTransitionModalProps> = ({
  isOpen,
  onClose,
  entityType,
  entityId,
  entityLabel,
  currentStatus,
  direction,
  allowedTransitions = [],
  onSuccess,
}) => {
  const [targetStatus, setTargetStatus] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [isExceptional, setIsExceptional] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isRollback = direction === 'ROLLBACK';
  const title = isRollback ? 'إرجاع الطلب إلى مرحلة سابقة' : 'تقديم وتصعيد مسار الطلب';
  const minReasonLength = isRollback ? 10 : 5;

  const canSubmit = targetStatus && reason.trim().length >= minReasonLength && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        entity_type: entityType,
        entity_id: entityId,
        target_status: targetStatus,
        reason: reason.trim(),
        is_exceptional: isExceptional,
      };

      const res = isRollback 
        ? await rollbackWorkflowApi(payload)
        : await forwardWorkflowApi(payload);

      onSuccess(res.message || 'تم تحديث مسار المعاملة بنجاح.');
      onClose();
    } catch (err: any) {
      console.error('[AdminWorkflowTransitionModal] Error updating workflow:', err);
      const msg = err?.response?.data?.message || err?.message || 'تعذر تعديل مسار المعاملة.';
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
      <div className="relative w-full max-w-lg bg-slate-900 border-2 border-gold-500/50 rounded-3xl shadow-2xl shadow-gold-950/70 p-6 text-slate-100 space-y-5 animate-scale-in">
        {/* ── Header ── */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-gold-500/40 bg-gold-950/60 text-2xl shadow-inner text-gold-300">
              {isRollback ? '↩️' : '⏩'}
            </span>
            <div>
              <h3 className="text-lg font-black text-gold-300 flex items-center gap-2">
                <span>{title}:</span>
                <span className="font-mono text-cyan-300 bg-cyan-950/70 px-2 py-0.5 rounded-lg border border-cyan-800/50 text-sm">
                  {entityLabel}
                </span>
              </h3>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                توجيه المعاملة إدارياً مع فحص مصفوفة الانتقالات وسجل التدقيق
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

        {/* ── Current Status Display ── */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3.5 flex items-center justify-between text-xs">
          <span className="text-slate-400 font-medium">المرحلة / الحالة الحالية:</span>
          <span className="font-bold text-amber-300 bg-amber-950/70 px-2.5 py-1 rounded-lg border border-amber-800/60 flex items-center gap-1.5">
            <span>{getWorkflowStatusLabel(currentStatus)}</span>
            <span className="font-mono text-[10px] text-amber-500/80">({currentStatus})</span>
          </span>
        </div>

        {/* ── Target Status Selection ── */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-300 block">
            المرحلة / الحالة المستهدفة:
          </label>
          <select
            value={targetStatus}
            onChange={(e) => setTargetStatus(e.target.value)}
            disabled={submitting}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500 font-bold"
          >
            <option value="">-- اضغط لاختيار الحالة المستهدفة --</option>
            {allowedTransitions.map((t) => (
              <option key={t.id} value={t.to_status}>
                {getWorkflowStatusLabel(t.to_status)} ({t.to_status}) {t.description ? `— ${t.description}` : ''} {t.requires_exception ? '⚠️ [استثنائي]' : ''}
              </option>
            ))}
            {/* Common fallback options */}
            {isRollback && (
              <>
                <option value="DRAFT">DRAFT (إرجاع لمسودة الموظف)</option>
                <option value="RETURNED">RETURNED (إرجاع للتعديل)</option>
                <option value="PENDING_REVIEW">PENDING_REVIEW (إرجاع للمراجع)</option>
                <option value="PENDING_EXECUTIVE">PENDING_EXECUTIVE (إرجاع للمدير التنفيذي)</option>
                <option value="PENDING_PROCUREMENT_APPROVAL">PENDING_PROCUREMENT_APPROVAL (إرجاع لمدير المشتريات)</option>
                <option value="PENDING_ACCOUNTING_REVIEW">PENDING_ACCOUNTING_REVIEW (إرجاع للحسابات)</option>
              </>
            )}
            {!isRollback && (
              <>
                <option value="REVIEWER_APPROVED">REVIEWER_APPROVED (اعتماد المراجع)</option>
                <option value="APPROVED_BY_EXECUTIVE">APPROVED_BY_EXECUTIVE (اعتماد المدير التنفيذي)</option>
                <option value="APPROVED_BY_PROCUREMENT">APPROVED_BY_PROCUREMENT (اعتماد المشتريات)</option>
                <option value="APPROVED_BY_ACCOUNTING">APPROVED_BY_ACCOUNTING (اعتماد الحسابات)</option>
                <option value="FINAL_APPROVED">FINAL_APPROVED (الاعتماد النهائي)</option>
              </>
            )}
          </select>
        </div>

        {/* ── Exceptional Checkbox ── */}
        <div className="rounded-2xl border border-amber-500/40 bg-amber-950/20 p-3 space-y-1.5 text-xs">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isExceptional}
              onChange={(e) => setIsExceptional(e.target.checked)}
              className="rounded border-amber-500 bg-slate-900 text-amber-500 focus:ring-amber-400 h-4 w-4"
            />
            <span className="font-bold text-amber-200">
              تفعيل كـ "تصحيح إداري استثنائي" (إذا كان الانتقال غير مسجل بالمسار الطبيعي)
            </span>
          </label>
          <p className="text-[11px] text-slate-400 pr-6">
            سيتطلب كتابة تبرير إداري مفصل وتوثيق العملية في سجل التدقيق الأمني.
          </p>
        </div>

        {/* ── Reason Input ── */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
            <span>سبب وتبرير الانتقال (إلزامي للتوثيق):</span>
            <span className="text-[10px] text-gold-400 font-mono">* لا يقل عن {minReasonLength} أحرف</span>
          </label>
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={submitting}
            placeholder="اكتب سبب الإرجاع أو التقديم بدقة..."
            className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
          />
        </div>

        {/* ── Error Box ── */}
        {error && <ErrorMessage error={error} />}

        {/* ── Actions ── */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={submitting}
            className="text-xs h-9 px-4 font-bold"
          >
            إلغاء
          </Button>

          <Button
            type="button"
            variant="primary"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="text-xs h-9 px-5 font-black shadow-lg"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <LoadingSpinner size="sm" />
                <span>جاري معالجة المسار...</span>
              </span>
            ) : (
              <span>تأكيد تنفيذ الانتقال ⚡</span>
            )}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
};
