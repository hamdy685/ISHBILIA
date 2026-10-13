import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  getTrackerDetailApi,
  cancelRequestApi,
  archiveRequestApi,
  restoreRequestApi,
  reopenRequestApi,
  addAdminNoteApi,
  TrackerPrDetail,
} from '../../api/admin/requestTracker';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import { parseApiError } from '../../utils/apiError';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Modal } from '../../components/ui/Modal';

// ─── Stage Definitions for Workflow Timeline ─────────────

interface WorkflowStage {
  id: string;
  name: string;
  icon: string;
  description: string;
}

const WORKFLOW_STAGES: WorkflowStage[] = [
  { id: 'creation', name: 'الإنشاء', icon: '📝', description: 'مسودة الطلب وتجهيز البنود' },
  { id: 'review', name: 'مراجعة القسم', icon: '🔍', description: 'مراجعة المدقق المعين للقسم' },
  { id: 'executive', name: 'اعتماد الإدارة', icon: '🏛️', description: 'موافقة المدير التنفيذي' },
  { id: 'procurement', name: 'المشتريات', icon: '🛒', description: 'مراجعة وتنسيق مدير المشتريات' },
  { id: 'quotes', name: 'عروض الأسعار', icon: '📑', description: 'جمع عروض الأسعار والترسية' },
  { id: 'accounting', name: 'الاعتماد المالي', icon: '💰', description: 'المطابقة والاعتماد المالي' },
  { id: 'issued', name: 'أمر الشراء', icon: '📦', description: 'إصدار أمر الشراء المعتمد' },
  { id: 'receipt', name: 'الاستلام والموقع', icon: '🏗️', description: 'استلام البضائع وفحص المهندس' },
];

const STAGE_ORDER = ['creation', 'review', 'executive', 'procurement', 'quotes', 'accounting', 'issued', 'receipt'];

const PRIORITY_LABELS: Record<string, string> = {
  LOW: 'منخفض',
  NORMAL: 'عادي',
  HIGH: 'عالي',
  URGENT: 'عاجل',
};

const PRIORITY_BADGES: Record<string, string> = {
  LOW: 'bg-slate-800 text-slate-300 border-slate-700',
  NORMAL: 'bg-blue-950/60 text-blue-300 border-blue-800/50',
  HIGH: 'bg-amber-950/60 text-amber-300 border-amber-800/50',
  URGENT: 'bg-rose-950/60 text-rose-300 border-rose-800/50',
};

export const AdminRequestDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const prId = Number(id);

  const [pr, setPr] = useState<TrackerPrDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Modals state
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [archiveSubmitting, setArchiveSubmitting] = useState(false);

  const [restoreModalOpen, setRestoreModalOpen] = useState(false);
  const [restoreSubmitting, setRestoreSubmitting] = useState(false);

  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [reopenTargetStatus, setReopenTargetStatus] = useState('PENDING_PROCUREMENT_APPROVAL');
  const [reopenReason, setReopenReason] = useState('إلغاء الرفض الخاطئ وإعادة الطلب لمراجعة مدير المشتريات (أ. أحمد بدوي)');
  const [reopenSubmitting, setReopenSubmitting] = useState(false);
  const [reopenError, setReopenError] = useState<string | null>(null);

  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  // Tab state for Audit / History
  const [activeHistoryTab, setActiveHistoryTab] = useState<'approvals' | 'events'>('approvals');

  const loadData = useCallback(async () => {
    if (!prId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getTrackerDetailApi(prId);
      setPr(data);
    } catch (err: unknown) {
      setError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [prId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handlers
  const handleCancel = async () => {
    if (!cancelReason.trim() || cancelReason.trim().length < 5) {
      setCancelError('سبب الإلغاء إلزامي ويجب أن يكون 5 أحرف على الأقل.');
      return;
    }
    setCancelSubmitting(true);
    setCancelError(null);
    try {
      await cancelRequestApi(prId, cancelReason.trim());
      setCancelModalOpen(false);
      setCancelReason('');
      setActionSuccess('تم إلغاء الطلب بنجاح وتم تسجيل الإجراء في سجل النظام.');
      await loadData();
    } catch (err: unknown) {
      setCancelError(parseApiError(err).message);
    } finally {
      setCancelSubmitting(false);
    }
  };

  const handleArchive = async () => {
    setArchiveSubmitting(true);
    try {
      await archiveRequestApi(prId, 'أرشفة إدارية للمسودة');
      setArchiveModalOpen(false);
      setActionSuccess('تم أرشفة مسودة الطلب بنجاح.');
      await loadData();
    } catch (err: unknown) {
      setError(parseApiError(err).message);
    } finally {
      setArchiveSubmitting(false);
    }
  };

  const handleRestore = async () => {
    setRestoreSubmitting(true);
    try {
      await restoreRequestApi(prId);
      setRestoreModalOpen(false);
      setActionSuccess('تم استعادة الطلب المؤرشف بنجاح.');
      await loadData();
    } catch (err: unknown) {
      setError(parseApiError(err).message);
    } finally {
      setRestoreSubmitting(false);
    }
  };

  const handleReopen = async () => {
    setReopenSubmitting(true);
    setReopenError(null);
    try {
      await reopenRequestApi(prId, reopenTargetStatus, reopenReason.trim());
      setReopenModalOpen(false);
      setActionSuccess('تم إلغاء الرفض وإعادة الطلب بنجاح إلى مرحلة مراجعة مدير المشتريات.');
      await loadData();
    } catch (err: unknown) {
      setReopenError(parseApiError(err).message);
    } finally {
      setReopenSubmitting(false);
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim() || noteText.trim().length < 3) {
      setNoteError('الملاحظة يجب ألا تقل عن 3 أحرف.');
      return;
    }
    setNoteSubmitting(true);
    setNoteError(null);
    try {
      await addAdminNoteApi(prId, noteText.trim());
      setNoteModalOpen(false);
      setNoteText('');
      setActionSuccess('تمت إضافة الملاحظة الإدارية بنجاح.');
      await loadData();
    } catch (err: unknown) {
      setNoteError(parseApiError(err).message);
    } finally {
      setNoteSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3" dir="rtl">
        <LoadingSpinner />
        <p className="text-xs text-slate-400">جاري تحميل بيانات الطلب والـTimeline...</p>
      </div>
    );
  }

  if (error || !pr) {
    return (
      <div className="max-w-3xl mx-auto space-y-4 py-8" dir="rtl">
        <ErrorMessage error={error || 'تعذر العثور على الطلب.'} />
        <Button variant="outline" onClick={() => navigate('/admin/request-tracker')}>
          ← العودة لمركز متابعة الطلبات
        </Button>
      </div>
    );
  }

  // Calculate stage index
  const currentStageIndex = STAGE_ORDER.indexOf(pr.stage);
  const isTerminated = ['REJECTED', 'CANCELLED'].includes(pr.status);

  return (
    <div className="space-y-5 pb-12" dir="rtl">
      {/* ── Top Bar / Breadcrumb ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/admin/request-tracker"
            className="flex items-center justify-center w-8 h-8 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
            title="العودة للقائمة"
          >
            ←
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-black text-slate-100 font-mono tracking-wide">
                {pr.request_number}
              </h1>
              <StatusBadge status={pr.status} />
              {pr.is_archived && (
                <span className="rounded-md bg-gray-800 border border-gray-700 px-2 py-0.5 text-[10px] text-gray-400 font-bold">
                  مؤرشف (محذوف)
                </span>
              )}
              {pr.priority && (
                <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${PRIORITY_BADGES[pr.priority] || 'bg-slate-800 text-slate-300'}`}>
                  {PRIORITY_LABELS[pr.priority] || pr.priority}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              تاريخ الإنشاء: {pr.created_at ? new Date(pr.created_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setNoteModalOpen(true)}>
            📝 إضافة ملاحظة
          </Button>
          {pr.admin_actions.can_reopen && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setReopenModalOpen(true)}
              className="!bg-emerald-600 hover:!bg-emerald-500 text-white font-bold shadow-md shadow-emerald-950/40"
            >
              ↩️ إلغاء الرفض / استئناف الطلب
            </Button>
          )}
          {pr.admin_actions.can_restore && (
            <Button variant="secondary" size="sm" onClick={() => setRestoreModalOpen(true)}>
              ♻️ استعادة الطلب
            </Button>
          )}
          {pr.admin_actions.can_archive && (
            <Button variant="secondary" size="sm" onClick={() => setArchiveModalOpen(true)}>
              📁 أرشفة المسودة
            </Button>
          )}
          {pr.admin_actions.can_cancel && (
            <Button variant="danger" size="sm" onClick={() => setCancelModalOpen(true)}>
              ✕ إلغاء الطلب إدارياً
            </Button>
          )}
        </div>
      </div>

      {/* Success Banner */}
      {actionSuccess && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-800/60 bg-emerald-950/40 px-4 py-3 text-xs text-emerald-300">
          <span>✅ {actionSuccess}</span>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-400 hover:text-emerald-200 font-bold">✕</button>
        </div>
      )}

      {/* ── Status & Current Stoppage Highlight Banner ── */}
      <div className={`rounded-2xl border p-4 sm:p-5 backdrop-blur-md transition-all ${
        pr.status === 'CANCELLED'
          ? 'border-rose-900/60 bg-rose-950/30'
          : pr.status === 'REJECTED'
          ? 'border-rose-900/60 bg-rose-950/30'
          : pr.days_in_stage >= 7
          ? 'border-rose-800/50 bg-rose-950/20'
          : pr.days_in_stage >= 3
          ? 'border-amber-800/50 bg-amber-950/20'
          : 'border-slate-800/90 bg-slate-900/60'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800/90 border border-slate-700 flex items-center justify-center text-xl shrink-0">
              {pr.status === 'CANCELLED' ? '🚫' : pr.status === 'REJECTED' ? '❌' : pr.days_in_stage >= 3 ? '⏳' : '⚡'}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black text-slate-300">المسؤول الحالي عن الخطوة:</span>
                {pr.current_responsible ? (
                  <span className="text-xs font-black text-cyan-300 bg-cyan-950/60 border border-cyan-800/40 rounded-lg px-2 py-0.5">
                    {pr.current_responsible.name} ({pr.current_responsible.role})
                  </span>
                ) : (
                  <span className="text-xs text-slate-500 font-bold">لا يوجد (الطلب منتهي أو صادر)</span>
                )}
                {pr.admin_actions.can_reopen && (
                  <button
                    onClick={() => setReopenModalOpen(true)}
                    className="mr-2 text-[11px] font-bold text-emerald-400 hover:text-emerald-300 bg-emerald-950/80 border border-emerald-800/60 px-2.5 py-0.5 rounded-lg transition-colors flex items-center gap-1 shadow-sm"
                  >
                    <span>↩️</span>
                    <span>إلغاء الرفض وإعادة الطلب الآن</span>
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {pr.status === 'CANCELLED'
                  ? `الطلب تم إلغاؤه إدارياً. سبب الإلغاء: ${pr.rejection_reason || 'غير محدد'}`
                  : pr.status === 'REJECTED'
                  ? `الطلب مرفوض. سبب الرفض: ${pr.rejection_reason || 'غير محدد'}`
                  : pr.days_in_stage > 0
                  ? `الطلب متوقف عند هذه المرحلة منذ ${pr.days_in_stage} يوم بدون تحديث.`
                  : 'تم تحديث الطلب خلال الـ 24 ساعة الماضية.'}
              </p>
            </div>
          </div>
          <div className="text-left shrink-0">
            <span className="text-[10px] text-slate-500 block">مدة بقاء الطلب بالمرحلة</span>
            <span className={`text-base font-black font-mono ${
              pr.days_in_stage >= 7 ? 'text-rose-400' : pr.days_in_stage >= 3 ? 'text-amber-400' : 'text-emerald-400'
            }`}>
              {pr.days_in_stage > 0 ? `${pr.days_in_stage} يوم` : 'أقل من يوم'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Workflow Progression Timeline ── */}
      <Card className="!p-4 sm:!p-5">
        <h2 className="text-sm font-black text-slate-200 mb-4 flex items-center gap-2">
          <span>🔄</span> مسار دورة الطلب (Workflow Timeline)
        </h2>

        {/* Desktop Horizontal Timeline / Mobile Vertical */}
        <div className="hidden lg:grid grid-cols-8 gap-2">
          {WORKFLOW_STAGES.map((stg, idx) => {
            let state: 'completed' | 'current' | 'future' | 'failed' = 'future';

            if (isTerminated) {
              if (idx < currentStageIndex) state = 'completed';
              else if (idx === currentStageIndex) state = 'failed';
              else state = 'future';
            } else {
              if (idx < currentStageIndex) state = 'completed';
              else if (idx === currentStageIndex) state = 'current';
              else state = 'future';
            }

            return (
              <div
                key={stg.id}
                className={`relative rounded-xl border p-3 flex flex-col items-center text-center transition-all ${
                  state === 'completed'
                    ? 'border-emerald-800/60 bg-emerald-950/20 text-emerald-300'
                    : state === 'current'
                    ? 'border-cyan-500 bg-cyan-950/40 text-cyan-200 ring-2 ring-cyan-500/30'
                    : state === 'failed'
                    ? 'border-rose-800/60 bg-rose-950/30 text-rose-300'
                    : 'border-slate-800 bg-slate-900/40 text-slate-500'
                }`}
              >
                <div className="text-lg mb-1">{stg.icon}</div>
                <span className="text-xs font-bold leading-tight">{stg.name}</span>
                <span className="text-[9px] mt-1 line-clamp-1 opacity-70">{stg.description}</span>

                <div className="mt-2 text-[10px] font-bold">
                  {state === 'completed' && <span className="text-emerald-400">✓ تم</span>}
                  {state === 'current' && <span className="text-cyan-400 animate-pulse">● جاري</span>}
                  {state === 'failed' && <span className="text-rose-400">✕ متوقف</span>}
                  {state === 'future' && <span className="text-slate-600">لم يبدأ</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Mobile Vertical Timeline */}
        <div className="lg:hidden space-y-2">
          {WORKFLOW_STAGES.map((stg, idx) => {
            let state: 'completed' | 'current' | 'future' | 'failed' = 'future';
            if (isTerminated) {
              if (idx < currentStageIndex) state = 'completed';
              else if (idx === currentStageIndex) state = 'failed';
              else state = 'future';
            } else {
              if (idx < currentStageIndex) state = 'completed';
              else if (idx === currentStageIndex) state = 'current';
              else state = 'future';
            }

            return (
              <div
                key={stg.id}
                className={`flex items-center gap-3 p-2.5 rounded-xl border text-xs ${
                  state === 'completed'
                    ? 'border-emerald-800/50 bg-emerald-950/20 text-emerald-300'
                    : state === 'current'
                    ? 'border-cyan-500/60 bg-cyan-950/30 text-cyan-200'
                    : state === 'failed'
                    ? 'border-rose-800/50 bg-rose-950/20 text-rose-300'
                    : 'border-slate-800/60 bg-slate-900/30 text-slate-500'
                }`}
              >
                <span className="text-base">{stg.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold">{stg.name}</div>
                  <div className="text-[10px] opacity-70">{stg.description}</div>
                </div>
                <div className="text-[11px] font-bold shrink-0">
                  {state === 'completed' && '✓ مكتمل'}
                  {state === 'current' && '● المرحلة الحالية'}
                  {state === 'failed' && '✕ تم الإيقاف'}
                  {state === 'future' && '—'}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── Information Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Basic Info */}
        <Card className="!p-4 space-y-3">
          <h2 className="text-xs font-black text-slate-300 border-b border-slate-800 pb-2 flex items-center gap-1.5">
            <span>📋</span> معلومات الطلب الأساسية
          </h2>
          <div className="space-y-2 text-xs">
            <InfoItem label="مقدم الطلب" value={pr.requester ? `${pr.requester.name} (${pr.requester.email || ''})` : '—'} />
            <InfoItem label="القسم التابع له" value={pr.department?.name || '—'} />
            <InfoItem label="القسم المستهدف" value={pr.target_department?.name || '—'} />
            <InfoItem label="نوع الطلب" value={pr.request_type === 'OFFICE_SUPPLIES' ? 'مكتبيات ومستلزمات' : 'مشروع / موقع'} />
            <InfoItem label="مسار الشراء" value={pr.procurement_route || 'عادي'} />
            <InfoItem label="المشروع / القطعة" value={pr.land_parcel?.name || pr.parcel_reference || '—'} />
            <InfoItem label="المنطقة" value={pr.region || '—'} />
            <InfoItem label="تاريخ الحاجة" value={pr.date_needed || '—'} />
            <InfoItem
              label="إجمالي التقديري"
              value={pr.total_estimated_cost ? `${Number(pr.total_estimated_cost).toLocaleString('ar-EG')} ر.س` : '—'}
              highlight
            />
          </div>
        </Card>

        {/* Assigned Actors */}
        <Card className="!p-4 space-y-3">
          <h2 className="text-xs font-black text-slate-300 border-b border-slate-800 pb-2 flex items-center gap-1.5">
            <span>👥</span> المسؤوليات والتعيينات
          </h2>
          <div className="space-y-2 text-xs">
            <InfoItem label="المراجع المعين" value={pr.assigned_reviewer?.name || 'لم يعين مراجع بعد'} />
            <InfoItem label="مهندس الموقع" value={pr.site_engineer?.name || 'غير محدد'} />
            <InfoItem label="المورد المباشر الموصى به" value={pr.direct_supplier?.name || 'لا يوجد (عن طريق عروض أسعار)'} />
            <InfoItem
              label="المسؤول الحالي"
              value={pr.current_responsible ? `${pr.current_responsible.name} — ${pr.current_responsible.role}` : 'لا يوجد'}
              highlight
            />
            {pr.notes && (
              <div className="pt-2 border-t border-slate-800/80">
                <span className="text-[11px] text-slate-500 font-bold block mb-1">ملاحظات الطلب:</span>
                <p className="text-[11px] text-slate-300 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800 leading-relaxed">
                  {pr.notes}
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* Linked Orders & Receipts */}
        <Card className="!p-4 space-y-3">
          <h2 className="text-xs font-black text-slate-300 border-b border-slate-800 pb-2 flex items-center gap-1.5">
            <span>📦</span> أوامر الشراء المرتبطة ({pr.purchase_orders.length})
          </h2>
          {pr.purchase_orders.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">لم يتم إصدار أوامر شراء مرتبطة بهذا الطلب بعد.</p>
          ) : (
            <div className="space-y-2">
              {pr.purchase_orders.map(po => (
                <div key={po.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-2.5 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-cyan-300">{po.po_number}</span>
                    <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-300 font-bold">{po.status}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>المورد: {po.supplier || '—'}</span>
                    <span className="font-mono text-emerald-400 font-bold">{Number(po.grand_total).toLocaleString('ar-EG')} ر.س</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                    <span>أذونات الاستلام: {po.has_receipts ? '✅ متوفرة' : '⬜ لا يوجد'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ── Items Table ── */}
      <Card className="!p-4">
        <h2 className="text-sm font-black text-slate-200 mb-3 flex items-center gap-2">
          <span>📦</span> بنود الطلب والكميات ({pr.items.length})
        </h2>
        {pr.items.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-6">لا توجد بنود مسجلة لهذا الطلب.</p>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden sm:block w-full max-w-full min-w-0 overflow-x-auto overscroll-x-contain touch-pan-x [scrollbar-width:thin] rounded-xl border border-slate-800">
              <table style={{ minWidth: '700px' }} className="w-full text-right text-xs text-slate-200 border-collapse">
                <thead className="bg-slate-950 text-slate-400 font-bold border-b border-slate-800 whitespace-nowrap">
                  <tr>
                    <th className="px-3 py-2.5 whitespace-nowrap">#</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">وصف البند / الصنف</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">المواصفات الفنية</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">الكمية</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">الوحدة</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">السعر التقديري</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">الإجمالي التقديري</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {pr.items.map((it, idx) => {
                    const estPrice = Number(it.estimated_price || 0);
                    const qty = Number(it.quantity || 0);
                    const lineTotal = estPrice * qty;
                    return (
                      <tr key={it.id} className="hover:bg-slate-800/30">
                        <td className="px-3 py-2.5 text-slate-500 font-mono text-[10px] whitespace-nowrap">{idx + 1}</td>
                        <td className="px-3 py-2.5 font-bold text-slate-100">{it.item_description}</td>
                        <td className="px-3 py-2.5 text-slate-400 text-[11px] max-w-xs">{it.specifications || '—'}</td>
                        <td className="px-3 py-2.5 font-mono font-bold text-cyan-300 whitespace-nowrap">{it.quantity}</td>
                        <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">{it.uom || '—'}</td>
                        <td className="px-3 py-2.5 font-mono text-slate-300 whitespace-nowrap">
                          {estPrice > 0 ? `${estPrice.toLocaleString('ar-EG')} ر.س` : '—'}
                        </td>
                        <td className="px-3 py-2.5 font-mono font-bold text-emerald-400 whitespace-nowrap">
                          {lineTotal > 0 ? `${lineTotal.toLocaleString('ar-EG')} ر.س` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="space-y-2.5 sm:hidden">
              {pr.items.map((it, idx) => {
                const estPrice = Number(it.estimated_price || 0);
                const qty = Number(it.quantity || 0);
                const lineTotal = estPrice * qty;
                return (
                  <article
                    key={`mobile-admin-item-${it.id || idx}`}
                    className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs space-y-2"
                  >
                    <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                      <span className="font-mono text-[11px] font-bold text-cyan-400">بند #{idx + 1}</span>
                      <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-cyan-300 font-bold">
                        {it.quantity} {it.uom || ''}
                      </span>
                    </div>
                    <div className="font-bold text-slate-100 text-sm">{it.item_description}</div>
                    {it.specifications && (
                      <p className="text-[11px] text-slate-400 bg-slate-900/60 p-2 rounded border border-slate-800/80">
                        {it.specifications}
                      </p>
                    )}
                    {(estPrice > 0 || lineTotal > 0) && (
                      <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                        <div>
                          <span className="text-slate-500 block">السعر التقديري:</span>
                          <span className="font-mono text-slate-300">{estPrice > 0 ? `${estPrice.toLocaleString('ar-EG')} ر.س` : '—'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">الإجمالي التقديري:</span>
                          <span className="font-mono font-bold text-emerald-400">{lineTotal > 0 ? `${lineTotal.toLocaleString('ar-EG')} ر.س` : '—'}</span>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </>
        )}
      </Card>

      {/* ── Approval History & System Audit Events Tabs ── */}
      <Card className="!p-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveHistoryTab('approvals')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeHistoryTab === 'approvals'
                  ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              📋 سجل الموافقات والقرارات ({pr.approval_history.length})
            </button>
            <button
              onClick={() => setActiveHistoryTab('events')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeHistoryTab === 'events'
                  ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              🛡️ سجل تدقيق النظام (Audit Log) ({pr.system_events.length})
            </button>
          </div>
        </div>

        {/* Tab 1: Approval History */}
        {activeHistoryTab === 'approvals' && (
          <div>
            {pr.approval_history.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">لا يوجد سجل موافقات حتى الآن.</p>
            ) : (
              <div className="relative border-r-2 border-slate-800 mr-3 space-y-4">
                {pr.approval_history.map((ah, idx) => (
                  <div key={idx} className="relative pr-5">
                    {/* Bullet */}
                    <div className="absolute -right-[7px] top-1 w-3 h-3 rounded-full bg-cyan-500 border-2 border-slate-900" />
                    <div className="bg-slate-950/60 rounded-xl border border-slate-800 p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-slate-200">{ah.action}</span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {ah.created_at ? new Date(ah.created_at).toLocaleString('ar-EG') : '—'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        <span>المسؤول: <strong className="text-cyan-300">{ah.actor?.name || 'النظام'}</strong></span>
                        {ah.from_state && ah.to_state && (
                          <span>| من: <code className="text-slate-300">{ah.from_state}</code> ← إلى: <code className="text-emerald-400">{ah.to_state}</code></span>
                        )}
                      </div>
                      {ah.comments && (
                        <p className="text-[11px] text-slate-300 bg-slate-900/80 p-2 rounded border border-slate-800/80 mt-1">
                          {ah.comments}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: System Audit Events */}
        {activeHistoryTab === 'events' && (
          <div>
            {pr.system_events.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">لا توجد أحداث نظام مسجلة لهذا الطلب.</p>
            ) : (
              <div className="relative border-r-2 border-slate-800 mr-3 space-y-4">
                {pr.system_events.map(ev => (
                  <div key={ev.id} className="relative pr-5">
                    <div className="absolute -right-[7px] top-1 w-3 h-3 rounded-full bg-indigo-500 border-2 border-slate-900" />
                    <div className="bg-slate-950/60 rounded-xl border border-slate-800 p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-slate-200">{ev.action || ev.event_type}</span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {ev.occurred_at ? new Date(ev.occurred_at).toLocaleString('ar-EG') : '—'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300">{ev.description || '—'}</p>
                      <div className="text-[10px] text-slate-500">
                        المنفّذ: {ev.actor?.name || 'النظام الآلي'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ── Cancel Modal ── */}
      {cancelModalOpen && (
        <Modal
          isOpen={cancelModalOpen}
          onClose={() => !cancelSubmitting && setCancelModalOpen(false)}
          title="⚠️ تأكيد إلغاء الطلب إدارياً"
        >
          <div className="space-y-4 text-xs" dir="rtl">
            <div className="rounded-xl border border-rose-800/60 bg-rose-950/40 p-3 text-rose-200 space-y-1">
              <div className="font-bold">تحذير إجراء إداري حاسم:</div>
              <p>أنت على وشك إلغاء الطلب رقم <strong className="text-white font-mono">{pr.request_number}</strong> بشكل نهائي من دورة العمل.</p>
              {pr.admin_actions.cancel_warning && (
                <p className="text-amber-300 font-bold mt-1">⚠️ {pr.admin_actions.cancel_warning}</p>
              )}
            </div>

            {cancelError && <ErrorMessage error={cancelError} />}

            <div>
              <label className="block text-slate-300 font-bold mb-1">
                سبب الإلغاء الإداري <span className="text-rose-400">*</span>
              </label>
              <textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="اكتب سبب الإلغاء بالتفصيل (5 أحرف على الأقل)..."
                rows={3}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs text-slate-200 focus:border-rose-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCancelModalOpen(false)}
                disabled={cancelSubmitting}
              >
                تراجع
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleCancel}
                disabled={cancelSubmitting || cancelReason.trim().length < 5}
              >
                {cancelSubmitting ? 'جاري الإلغاء...' : 'تأكيد الإلغاء الإداري'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Archive Modal ── */}
      {archiveModalOpen && (
        <Modal
          isOpen={archiveModalOpen}
          onClose={() => !archiveSubmitting && setArchiveModalOpen(false)}
          title="📁 أرشفة مسودة الطلب"
        >
          <div className="space-y-4 text-xs" dir="rtl">
            <p className="text-slate-300">
              هل أنت متأكد من أرشفة مسودة الطلب <strong className="text-white font-mono">{pr.request_number}</strong>؟
              سيتم نقلها إلى الأرشيف ولن تظهر في القوائم النشطة.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <Button variant="outline" size="sm" onClick={() => setArchiveModalOpen(false)} disabled={archiveSubmitting}>
                إلغاء
              </Button>
              <Button variant="secondary" size="sm" onClick={handleArchive} disabled={archiveSubmitting}>
                {archiveSubmitting ? 'جاري الأرشفة...' : 'تأكيد الأرشفة'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Restore Modal ── */}
      {restoreModalOpen && (
        <Modal
          isOpen={restoreModalOpen}
          onClose={() => !restoreSubmitting && setRestoreModalOpen(false)}
          title="♻️ استعادة الطلب المؤرشف"
        >
          <div className="space-y-4 text-xs" dir="rtl">
            <p className="text-slate-300">
              هل تريد استعادة الطلب المؤرشف <strong className="text-white font-mono">{pr.request_number}</strong> وإعادته للعمل؟
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <Button variant="outline" size="sm" onClick={() => setRestoreModalOpen(false)} disabled={restoreSubmitting}>
                إلغاء
              </Button>
              <Button variant="primary" size="sm" onClick={handleRestore} disabled={restoreSubmitting}>
                {restoreSubmitting ? 'جاري الاستعادة...' : 'تأكيد الاستعادة'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Note Modal ── */}
      {noteModalOpen && (
        <Modal
          isOpen={noteModalOpen}
          onClose={() => !noteSubmitting && setNoteModalOpen(false)}
          title="📝 إضافة ملاحظة إدارية في سجل النظام"
        >
          <div className="space-y-4 text-xs" dir="rtl">
            {noteError && <ErrorMessage error={noteError} />}
            <div>
              <label className="block text-slate-300 font-bold mb-1">
                نص الملاحظة <span className="text-rose-400">*</span>
              </label>
              <textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder="أدخل الملاحظة الإدارية لتسجيلها في سجل أحداث النظام (Audit Log)..."
                rows={3}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <Button variant="outline" size="sm" onClick={() => setNoteModalOpen(false)} disabled={noteSubmitting}>
                إلغاء
              </Button>
              <Button variant="primary" size="sm" onClick={handleAddNote} disabled={noteSubmitting || noteText.trim().length < 3}>
                {noteSubmitting ? 'جاري الإضافة...' : 'حفظ الملاحظة'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Reopen / Un-reject Modal ── */}
      {reopenModalOpen && (
        <Modal
          isOpen={reopenModalOpen}
          onClose={() => !reopenSubmitting && setReopenModalOpen(false)}
          title="↩️ إلغاء الرفض وإعادة فتح الطلب"
        >
          <div className="space-y-4 text-xs" dir="rtl">
            {reopenError && <ErrorMessage error={reopenError} />}
            <p className="text-slate-300 leading-relaxed">
              يمكنك كمدير عام للنظام إلغاء حالة الرفض أو الإلغاء للطلب{' '}
              <strong className="text-white font-mono">{pr.request_number}</strong> وإعادته مباشرة إلى مسار العمل
              ليظهر في قائمة الانتظار للمسؤول المحدد.
            </p>

            <div>
              <label className="block text-slate-300 font-bold mb-1">
                المرحلة المستهدفة لإعادة الطلب إليها <span className="text-emerald-400">*</span>
              </label>
              <select
                value={reopenTargetStatus}
                onChange={e => setReopenTargetStatus(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
              >
                <option value="PENDING_PROCUREMENT_APPROVAL">
                  🛒 مدير المشتريات (أ. أحمد بدوي) — PENDING_PROCUREMENT_APPROVAL
                </option>
                <option value="PENDING_EXECUTIVE_APPROVAL">
                  🏛️ المدير التنفيذي — PENDING_EXECUTIVE_APPROVAL
                </option>
                <option value="SUBMITTED">
                  🔍 مراجع القسم — SUBMITTED
                </option>
                <option value="DRAFT">
                  📝 مسودة لمقدم الطلب — DRAFT
                </option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-bold mb-1">
                سبب إعادة الفتح / ملاحظة التراجع
              </label>
              <textarea
                value={reopenReason}
                onChange={e => setReopenReason(e.target.value)}
                placeholder="وضح سبب إعادة الفتح (مثلاً: تم الرفض بالخطأ ويتم استئناف دورة العمل)..."
                rows={3}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReopenModalOpen(false)}
                disabled={reopenSubmitting}
              >
                إلغاء
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleReopen}
                disabled={reopenSubmitting}
                className="!bg-emerald-600 hover:!bg-emerald-500 text-white font-bold"
              >
                {reopenSubmitting ? 'جاري إعادة فتح الطلب...' : 'تأكيد وإعادة الطلب'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── Helper Sub-Component ─────────────────────────────────

const InfoItem: React.FC<{ label: string; value: string; highlight?: boolean }> = ({ label, value, highlight }) => (
  <div className="flex items-center justify-between py-1 border-b border-slate-800/40 last:border-0">
    <span className="text-slate-500 font-bold">{label}</span>
    <span className={`font-semibold text-right ${highlight ? 'text-cyan-300 font-black' : 'text-slate-200'}`}>
      {value}
    </span>
  </div>
);

export default AdminRequestDetailsPage;
