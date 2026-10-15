import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../ui/Button';
import LoadingSpinner from '../LoadingSpinner';
import ErrorMessage from '../ErrorMessage';
import { reassignReceiptRecipientApi } from '../../api/admin/controlCenter';
import apiClient from '../../api/client';

interface AdminReassignReceiptModalProps {
  receipt: any;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedReceipt: any, message: string) => void;
}

export const AdminReassignReceiptModal: React.FC<AdminReassignReceiptModalProps> = ({
  receipt,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [siteEngineers, setSiteEngineers] = useState<Array<{ id: number; name: string; email?: string }>>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | ''>('');
  const [reason, setReason] = useState<string>('');
  const [loadingUsers, setLoadingUsers] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setLoadingUsers(true);
    // Fetch site engineers and operational users
    apiClient
      .get('/api/v1/procurement/site-engineers')
      .then((res) => {
        const users = res.data?.data || res.data || [];
        setSiteEngineers(users);
      })
      .catch((err) => {
        console.error('[AdminReassignReceiptModal] Failed to load site engineers:', err);
      })
      .finally(() => setLoadingUsers(false));
  }, [isOpen]);

  if (!isOpen || !receipt) return null;

  const currentRecipientName = receipt.actual_receiver_name || 
    receipt.siteEngineer?.name || 
    receipt.receiver?.name || 
    'غير محدد';

  const isSteelGroup = Boolean(receipt.weighing_group_id);
  const canSubmit = selectedUserId && reason.trim().length >= 5 && !submitting;

  const handleReassign = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await reassignReceiptRecipientApi(receipt.id, {
        new_user_id: Number(selectedUserId),
        reason: reason.trim(),
      });

      onSuccess(res.receipt || receipt, res.message || 'تم تغيير مستلم إذن الاستلام بنجاح.');
      onClose();
    } catch (err: any) {
      console.error('[AdminReassignReceiptModal] Error reassigning recipient:', err);
      const msg = err?.response?.data?.message || err?.message || 'تعذر تغيير المستلم.';
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
      <div className="relative w-full max-w-lg bg-slate-900 border-2 border-emerald-500/50 rounded-3xl shadow-2xl shadow-emerald-950/70 p-6 text-slate-100 space-y-5 animate-scale-in">
        {/* ── Header ── */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/40 bg-emerald-950/60 text-2xl shadow-inner text-emerald-300">
              👷
            </span>
            <div>
              <h3 className="text-lg font-black text-emerald-300 flex items-center gap-2">
                <span>تغيير مستلم إذن الاستلام:</span>
                <span className="font-mono text-cyan-300 bg-cyan-950/70 px-2 py-0.5 rounded-lg border border-cyan-800/50 text-sm">
                  {receipt.receipt_number || `REC-${receipt.id}`}
                </span>
              </h3>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                إعادة توجيه مهام الفحص والاستلام الميداني لمهندس موقع آخر
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

        {/* ── Receipt Summary Card ── */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 space-y-2.5 text-xs">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <span className="text-slate-400 font-medium">المستلم الحالي:</span>
            <span className="font-bold text-amber-300">{currentRecipientName}</span>
          </div>
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <span className="text-slate-400 font-medium">المورد:</span>
            <span className="font-medium text-slate-200">{receipt.supplier?.company_name || receipt.purchaseOrder?.supplier?.company_name || '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400 font-medium">أمر الشراء المرتبط:</span>
            <span className="font-mono font-bold text-cyan-300">{receipt.purchaseOrder?.po_number || '—'}</span>
          </div>
        </div>

        {/* ── Steel Group Protection Notice ── */}
        {isSteelGroup && (
          <div className="rounded-2xl border border-cyan-500/50 bg-cyan-950/30 p-3.5 space-y-1.5 text-xs">
            <div className="flex items-center gap-2 text-cyan-300 font-bold">
              <span>🔒</span>
              <span>شحنة حديد مجمعة (ميزان بسكول):</span>
            </div>
            <p className="text-cyan-200/90 leading-relaxed font-medium">
              هذا الإذن يتبع شحنة حديد مجمعة بوزنة واحدة. تغيير المستلم ينقل مهام الفحص للمهندس الجديد مع الحفاظ الصارم على الوزن الإجمالي وسعر الطن وبون الميزان دون أي تفكيك للبنود.
            </p>
          </div>
        )}

        {/* ── New Recipient Select ── */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-300 block">
            اختر مهندس الموقع / المستلم الجديد:
          </label>
          {loadingUsers ? (
            <div className="flex items-center gap-2 text-xs text-slate-400 p-2">
              <LoadingSpinner size="sm" />
              <span>جاري تحميل قائمة المهندسين الميدانيين...</span>
            </div>
          ) : (
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value ? Number(e.target.value) : '')}
              disabled={submitting}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
            >
              <option value="">-- اضغط لاختيار المهندس المستلم --</option>
              {siteEngineers.map((eng) => (
                <option key={eng.id} value={eng.id}>
                  {eng.name} {eng.email ? `(${eng.email})` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* ── Reason Input ── */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
            <span>سبب تغيير المستلم (إلزامي للتوثيق):</span>
            <span className="text-[10px] text-emerald-400 font-mono">* لا يقل عن 5 أحرف</span>
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={submitting}
            placeholder="مثال: إجازة المهندس الأصلي / تكليف مهندس قطاع الروضة"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
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
            variant="success"
            onClick={handleReassign}
            disabled={!canSubmit}
            className="text-xs h-9 px-5 font-black shadow-lg shadow-emerald-950/60"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <LoadingSpinner size="sm" />
                <span>جاري الإسناد والتحديث...</span>
              </span>
            ) : (
              <span>حفظ وتعيين المستلم الجديد 👷</span>
            )}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
};
