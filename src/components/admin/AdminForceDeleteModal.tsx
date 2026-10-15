import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../ui/Button';
import LoadingSpinner from '../LoadingSpinner';
import ErrorMessage from '../ErrorMessage';
import { parseApiError } from '../../utils/apiError';
import { formatCleanNumber } from '../../utils/numberFormat';
import { MasterOrderRow, forceDeleteMasterOrderApi } from '../../api/admin/masterOrders';

interface AdminForceDeleteModalProps {
  order: MasterOrderRow | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (deletedKey: string, message: string) => void;
}

export const AdminForceDeleteModal: React.FC<AdminForceDeleteModalProps> = ({
  order,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<string>('طلب خاطئ / تجريبي');
  const [confirmInput, setConfirmInput] = useState<string>('');

  if (!isOpen || !order) return null;

  const isConfirmed = confirmInput.trim() === 'إلغاء' || confirmInput.trim().toUpperCase() === 'CONFIRM';
  const targetId = order.order_id ?? order.request_id;
  const entityType = order.order_id ? 'order' : 'request';

  const handleConfirmDelete = async () => {
    if (!targetId || !isConfirmed || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await forceDeleteMasterOrderApi(targetId, {
        reason: reason.trim() || 'إلغاء إداري سيادي من لوحة التحكم مع الاحتفاظ بالسجل التاريخي',
        entity_type: entityType,
      });

      onSuccess(order.unique_key, res.message || 'تم إلغاء المعاملة ودورتها المستندية بأمان وتوثيقها في سجل التدقيق.');
      onClose();
    } catch (err: unknown) {
      console.error('[AdminForceDeleteModal] Error executing safe cancel:', err);
      const parsed = parseApiError(err);
      const anyErr = err as any;
      const detailed = anyErr?.response?.data?.message || anyErr?.response?.data?.error || parsed.message;
      setError(detailed);
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto"
      dir="rtl"
    >
      <div className="relative w-full max-w-lg bg-slate-900 border-2 border-amber-500/70 rounded-2xl shadow-2xl shadow-amber-950/80 p-6 text-slate-100 space-y-5 animate-scale-in">
        {/* ── Header ── */}
        <div className="flex items-start gap-4 pb-4 border-b border-slate-800">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-500/50 bg-amber-950/60 text-2xl shadow-inner text-amber-300">
            🛡️
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-black text-amber-300 flex items-center gap-2">
              الإلغاء الإداري الآمن للمعاملة (Safe Cancellation)
            </h3>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              حظر الحذف الفيزيائي — تحويل لحالة ملغاة مع الاحتفاظ الكامل بالسجل والتدقيق التاريخي
            </p>
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

        {/* ── Warning Alert ── */}
        <div className="rounded-xl border border-amber-500/60 bg-amber-950/40 p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-300 font-black text-sm">
            <span>🔒</span>
            <span>سياسة حظر الحذف الفيزيائي والنزاهة التاريخية:</span>
          </div>
          <p className="text-xs text-amber-200/90 leading-relaxed font-medium">
            تطبيقاً لقواعد الرقابة الإدارية والمالية، <strong>لن يتم حذف أي سجل من قاعدة البيانات</strong>. سيتم تحويل حالة هذه المعاملة والمستندات المرتبطة بها غير المكتملة إلى حالة (ملغاة CANCELLED / VOIDED)، مع إغلاق المهام المفتوحة وتوثيق الإجراء بالكامل باسمك في سجل الرقابة والتدقيق غير القابل للتعديل.
          </p>
        </div>

        {/* ── Order Summary Card ── */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-2 text-xs">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <span className="text-slate-400 font-medium">رقم أمر الشراء:</span>
            <span className="font-mono font-black text-cyan-300">{order.po_number}</span>
          </div>
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <span className="text-slate-400 font-medium">رقم طلب الشراء:</span>
            <span className="font-mono font-bold text-slate-200">{order.pr_number}</span>
          </div>
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <span className="text-slate-400 font-medium">القسم / الموقع:</span>
            <span className="font-bold text-slate-200">
              {order.department?.name} — {order.project_site?.parcel_reference || '—'}
            </span>
          </div>
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <span className="text-slate-400 font-medium">المورد:</span>
            <span className="font-bold text-slate-300">{order.supplier?.name || 'لم يحدد بعد'}</span>
          </div>
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <span className="text-slate-400 font-medium">الإجمالي المالي:</span>
            <span className="font-mono font-black text-emerald-300 text-sm">
              {formatCleanNumber(order.grand_total)} ج.م
            </span>
          </div>
          <div className="flex items-center justify-between pt-0.5">
            <span className="text-slate-400 font-medium">المرحلة الحالية:</span>
            <span className="font-bold text-amber-300">{order.cycle_stage_label}</span>
          </div>
        </div>

        {/* ── Reason Input (Audit Log) ── */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
            <span>سبب الحذف (يُسجل إلزامياً في سجل الرقابة الأمني Audit Log):</span>
            <span className="text-[10px] text-amber-400 font-medium">إلزامي للتوثيق في Audit Log</span>
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={submitting}
            placeholder="مثال: طلب خاطئ / توريد تم إلغاؤه إدارياً"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>

        {/* ── Security Confirm Input ── */}
        <div className="space-y-1.5 rounded-xl border border-amber-900/60 bg-amber-950/20 p-3">
          <label className="text-xs font-bold text-amber-300 block">
            لتأكيد الإلغاء الآمن، يرجى كتابة كلمة <strong className="text-white bg-amber-900/80 px-1.5 py-0.5 rounded font-mono">إلغاء</strong> أو <strong className="text-white bg-amber-900/80 px-1.5 py-0.5 rounded font-mono">CONFIRM</strong> أدناه:
          </label>
          <input
            type="text"
            value={confirmInput}
            onChange={(e) => setConfirmInput(e.target.value)}
            disabled={submitting}
            placeholder='اكتب: إلغاء أو CONFIRM'
            className="w-full rounded-xl border border-amber-500/50 bg-slate-950 px-3 py-2 text-xs font-bold text-amber-200 placeholder-slate-600 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
          />
        </div>

        {/* ── Error Box ── */}
        {error && <ErrorMessage error={error} />}

        {/* ── Footer Actions ── */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={submitting}
            className="text-xs h-9 px-4 font-bold"
          >
            إغلاق وتراجع
          </Button>

          <Button
            type="button"
            variant="danger"
            onClick={handleConfirmDelete}
            disabled={!isConfirmed || submitting}
            className="text-xs h-9 px-5 font-black bg-amber-600 hover:bg-amber-500 text-white border-amber-500 shadow-lg shadow-amber-950/60 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {submitting ? (
              <>
                <LoadingSpinner size="sm" />
                <span>جارٍ الإلغاء الآمن...</span>
              </>
            ) : (
              <>
                <span>🛡️</span>
                <span>تأكيد الإلغاء وتحديث السجل</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
};
