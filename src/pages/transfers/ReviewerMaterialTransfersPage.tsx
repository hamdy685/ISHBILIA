import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  getReviewerPendingMaterialTransfersApi,
  approveReviewerMaterialTransferApi,
  rejectReviewerMaterialTransferApi,
  returnReviewerMaterialTransferApi,
} from '../../api/materialTransfers';
import { MaterialTransferRequest } from '../../types/materialTransfer';
import { PrintableMaterialTransfer } from '../../components/transfers/PrintableMaterialTransfer';
import { Modal } from '../../components/ui/Modal';
import { toast } from '../../utils/toast';
import { formatCleanNumber } from '../../utils/numberFormat';

export const ReviewerMaterialTransfersPage: React.FC = () => {
  const [requests, setRequests] = useState<MaterialTransferRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');

  // Modals state
  const [selectedRequest, setSelectedRequest] = useState<MaterialTransferRequest | null>(null);
  const [previewOpen, setPreviewOpen] = useState<boolean>(false);
  const [actionType, setActionType] = useState<'APPROVE' | 'REJECT' | 'RETURN' | null>(null);
  const [actionTarget, setActionTarget] = useState<MaterialTransferRequest | null>(null);
  const [actionNotes, setActionNotes] = useState<string>('');
  const [submittingAction, setSubmittingAction] = useState<boolean>(false);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getReviewerPendingMaterialTransfersApi({
        search: search || undefined,
      });
      setRequests(res.data);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'تعذر تحميل طلبات المراجعة.');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const handleOpenAction = (type: 'APPROVE' | 'REJECT' | 'RETURN', req: MaterialTransferRequest) => {
    setActionType(type);
    setActionTarget(req);
    setActionNotes('');
  };

  const handleConfirmAction = async () => {
    if (!actionTarget || !actionType) return;

    if ((actionType === 'REJECT' || actionType === 'RETURN') && !actionNotes.trim()) {
      toast.error(actionType === 'REJECT' ? 'يرجى كتابة سبب الرفض.' : 'يرجى كتابة سبب الإعادة للتعديل.');
      return;
    }

    setSubmittingAction(true);
    try {
      if (actionType === 'APPROVE') {
        await approveReviewerMaterialTransferApi(actionTarget.id, actionNotes.trim() || undefined);
        toast.success(`✅ تم اعتماد طلب نقل الخامات (${actionTarget.request_number}) وإحالته مباشرة إلى الحسابات.`);
      } else if (actionType === 'REJECT') {
        await rejectReviewerMaterialTransferApi(actionTarget.id, actionNotes.trim());
        toast.success(`تم رفض طلب نقل الخامات (${actionTarget.request_number}).`);
      } else if (actionType === 'RETURN') {
        await returnReviewerMaterialTransferApi(actionTarget.id, actionNotes.trim());
        toast.success(`تمت إعادة طلب نقل الخامات (${actionTarget.request_number}) للمهندس مقدم الطلب للتعديل.`);
      }

      setActionType(null);
      setActionTarget(null);
      setActionNotes('');
      loadRequests();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'حدث خطأ أثناء معالجة الإجراء.');
    } finally {
      setSubmittingAction(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6" dir="rtl">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <Link to="/reviewer" className="hover:text-amber-400 transition-colors">
              لوحة المراجعة
            </Link>
            <span>/</span>
            <span className="text-amber-400 font-semibold">مراجعة طلبات نقل الخامات</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2.5">
            <span className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20 text-lg">
              🔍
            </span>
            <span>صندوق مراجعة طلبات نقل الخامات</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            مراجعة واعتماد طلبات نقل الخامات المقدمة من المهندسين وتحويلها إلى الحسابات
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            to="/material-transfers/archive"
            className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-cyan-400 hover:text-cyan-300 font-bold text-xs rounded-xl border border-cyan-800/40 transition-all shadow-sm"
          >
            <span>📂</span>
            <span>أرشيف المنقولات</span>
          </Link>
          <Link
            to="/material-transfers/create"
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-amber-500/20 transition-all cursor-pointer active:scale-95"
          >
            <span>➕</span>
            <span>إنشاء طلب نقل (بصفتي مراجع)</span>
          </Link>
        </div>
      </div>

      {/* ── Search & Filter ── */}
      <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl flex items-center gap-3 shadow-md">
        <div className="relative flex-1">
          <span className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-500 text-sm">
            🔍
          </span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="بحث برقم الطلب، اسم المهندس مقدم الطلب، المشروع، بيان الصنف..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-9 pl-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
          />
        </div>
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="text-xs text-slate-400 hover:text-white px-3 py-2 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            مسح
          </button>
        )}
      </div>

      {/* ── Queue List ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] text-slate-400 gap-3">
          <div className="w-9 h-9 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
          <span className="text-xs font-bold">جاري تحميل طلبات النقل الواردة للمراجعة...</span>
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-12 text-center space-y-3">
          <span className="text-4xl block">✨</span>
          <h3 className="text-base font-bold text-slate-200">صندوق المراجعة فارغ تماماً</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            لا توجد أي طلبات نقل خامات بانتظار المراجعة والاعتماد حالياً.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map(req => (
            <div
              key={req.id}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 shadow-xl space-y-4 transition-all"
            >
              {/* Row 1: Header Info */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 font-mono font-black text-sm">
                    {req.request_number}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-950/70 text-amber-300 border border-amber-600/40">
                    بانتظار مراجعتك ⏳
                  </span>
                </div>

                <div className="flex items-center gap-4 text-xs text-slate-400">
                  <span>📅 تاريخ النقل: <strong className="text-slate-200">{req.transfer_date}</strong></span>
                  <span>✍️ المهندس مقدم الطلب: <strong className="text-amber-300">{req.user?.name || 'غير محدد'}</strong></span>
                </div>
              </div>

              {/* Row 2: Projects & Driver Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                {/* From Project */}
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
                  <span className="text-slate-400 block mb-0.5 font-bold">○ من مشروع:</span>
                  <span className="text-sm font-bold text-white">{req.from_project}</span>
                </div>

                {/* To Project */}
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
                  <span className="text-emerald-400 block mb-0.5 font-bold">● إلى مشروع:</span>
                  <span className="text-sm font-bold text-white">{req.to_project}</span>
                </div>

                {/* Driver & Vehicle */}
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
                  <span className="text-slate-400 block mb-0.5 font-bold">🚛 بيانات الناقل:</span>
                  <span className="text-slate-200 font-medium">
                    {req.driver_name || 'السائق غير محدد'} {req.vehicle_plate_number ? `(${req.vehicle_plate_number})` : ''}
                  </span>
                </div>
              </div>

              {/* Row 3: Items Table Preview */}
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400">
                      <th className="py-2 px-3 w-10 text-center font-bold">م</th>
                      <th className="py-2 px-3 font-bold">نوع الخامة / بيان الصنف</th>
                      <th className="py-2 px-3 w-28 font-bold">الوحدة</th>
                      <th className="py-2 px-3 w-32 font-bold">العدد / الكمية</th>
                      <th className="py-2 px-3 font-bold">ملاحظات / حالة الخامة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {req.items?.map((it, idx) => (
                      <tr key={idx} className="hover:bg-slate-900/50">
                        <td className="py-2 px-3 text-center font-mono text-slate-400 font-bold">{idx + 1}</td>
                        <td className="py-2 px-3 font-semibold text-white">{it.item_description}</td>
                        <td className="py-2 px-3 text-slate-300">{it.uom}</td>
                        <td className="py-2 px-3 font-mono font-bold text-amber-400">{formatCleanNumber(it.quantity)}</td>
                        <td className="py-2 px-3 text-slate-400">{it.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {req.general_notes && (
                <div className="text-xs text-slate-400 bg-slate-950/50 p-2.5 rounded-xl border border-slate-800">
                  <strong className="text-slate-300">ملاحظات مقدم الطلب: </strong>
                  <span>{req.general_notes}</span>
                </div>
              )}

              {/* Row 4: Review Actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedRequest(req);
                    setPreviewOpen(true);
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span>🖨️</span>
                  <span>معاينة / طباعة النموذج الرسمي</span>
                </button>

                <div className="flex items-center gap-2">
                  {/* Reject */}
                  <button
                    type="button"
                    onClick={() => handleOpenAction('REJECT', req)}
                    className="px-3.5 py-2 bg-rose-950/30 hover:bg-rose-900/40 text-rose-300 border border-rose-800/50 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95"
                  >
                    <span>❌ رفض</span>
                  </button>

                  {/* Return */}
                  <button
                    type="button"
                    onClick={() => handleOpenAction('RETURN', req)}
                    className="px-3.5 py-2 bg-orange-950/30 hover:bg-orange-900/40 text-orange-300 border border-orange-800/50 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95"
                  >
                    <span>↩️ إعادة للتعديل</span>
                  </button>

                  {/* Approve */}
                  <button
                    type="button"
                    onClick={() => handleOpenAction('APPROVE', req)}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl text-xs shadow-lg shadow-emerald-900/30 transition-all cursor-pointer active:scale-95 flex items-center gap-1.5"
                  >
                    <span>✅</span>
                    <span>موافقة وإحالة للحسابات</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Action Confirmation Dialog Modal ── */}
      {actionType && actionTarget && (
        <Modal
          isOpen={Boolean(actionType)}
          onClose={() => {
            setActionType(null);
            setActionTarget(null);
            setActionNotes('');
          }}
          title={
            actionType === 'APPROVE'
              ? `تأكيد اعتماد طلب نقل الخامات (${actionTarget.request_number})`
              : actionType === 'RETURN'
              ? `إعادة طلب نقل الخامات (${actionTarget.request_number}) للتعديل`
              : `رفض طلب نقل الخامات (${actionTarget.request_number})`
          }
          size="md"
        >
          <div className="space-y-4 text-xs" dir="rtl">
            <p className="text-slate-300">
              {actionType === 'APPROVE'
                ? 'عند الموافقة على الطلب، سينتقل تلقائياً ومباشرة إلى الإدارة المالية والحسابات لاتخاذ الإجراء المحاسبي والأرشفة.'
                : actionType === 'RETURN'
                ? 'يرجى كتابة أسباب إعادة الطلب بوضوح لكي يتمكن المهندس مقدم الطلب من تعديله وإعادة إرساله.'
                : 'يرجى كتابة سبب رفض الطلب.'}
            </p>

            <div>
              <label className="block text-slate-300 font-bold mb-1.5">
                {actionType === 'APPROVE' ? 'ملاحظات وتوجيهات المراجع (اختياري):' : 'السبب (إلزامي):'}
              </label>
              <textarea
                rows={3}
                value={actionNotes}
                onChange={e => setActionNotes(e.target.value)}
                placeholder={
                  actionType === 'APPROVE'
                    ? 'أي ملاحظات للمحاسب أو الموقع...'
                    : 'اكتب السبب بالتفصيل هنا...'
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 resize-none"
                required={actionType !== 'APPROVE'}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setActionType(null);
                  setActionTarget(null);
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={submittingAction}
                onClick={handleConfirmAction}
                className={`px-5 py-2 font-black rounded-xl text-xs transition-all cursor-pointer disabled:opacity-50 ${
                  actionType === 'APPROVE'
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : actionType === 'RETURN'
                    ? 'bg-orange-600 hover:bg-orange-500 text-white'
                    : 'bg-rose-600 hover:bg-rose-500 text-white'
                }`}
              >
                {submittingAction
                  ? 'جاري التنفيذ...'
                  : actionType === 'APPROVE'
                  ? 'تأكيد الموافقة والإحالة'
                  : actionType === 'RETURN'
                  ? 'تأكيد الإعادة للتعديل'
                  : 'تأكيد الرفض'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Official Print Modal ── */}
      {previewOpen && selectedRequest && (
        <Modal
          isOpen={previewOpen}
          onClose={() => {
            setPreviewOpen(false);
            setSelectedRequest(null);
          }}
          title={`استمارة طلب نقل خامات - رقم ${selectedRequest.request_number}`}
          size="2xl"
        >
          <PrintableMaterialTransfer
            request={selectedRequest}
            onClose={() => {
              setPreviewOpen(false);
              setSelectedRequest(null);
            }}
          />
        </Modal>
      )}
    </div>
  );
};
