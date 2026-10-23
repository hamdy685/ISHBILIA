import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  getMyMaterialTransfersApi,
  deleteMaterialTransferApi,
  submitMaterialTransferApi,
} from '../../api/materialTransfers';
import { MaterialTransferRequest } from '../../types/materialTransfer';
import { PrintableMaterialTransfer } from '../../components/transfers/PrintableMaterialTransfer';
import { Modal } from '../../components/ui/Modal';
import { toast } from '../../utils/toast';
import { formatCleanNumber } from '../../utils/numberFormat';

export const MyMaterialTransfersPage: React.FC = () => {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<MaterialTransferRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedRequest, setSelectedRequest] = useState<MaterialTransferRequest | null>(null);
  const [previewOpen, setPreviewOpen] = useState<boolean>(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMyMaterialTransfersApi({
        search: search || undefined,
        status: statusFilter || undefined,
      });
      setRequests(res.data);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'تعذر تحميل طلبات نقل الخامات.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const handleDelete = async (id: number) => {
    if (!window.confirm('هل أنت متأكد من رغبتك في حذف هذه المسودة؟')) return;
    setBusyId(id);
    try {
      await deleteMaterialTransferApi(id);
      toast.success('تم حذف الطلب بنجاح.');
      loadRequests();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'تعذر حذف الطلب.');
    } finally {
      setBusyId(null);
    }
  };

  const handleSubmitDraft = async (id: number) => {
    setBusyId(id);
    try {
      await submitMaterialTransferApi(id);
      toast.success('🚀 تم إرسال طلب نقل الخامات للاعتماد بنجاح.');
      loadRequests();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'تعذر إرسال الطلب.');
    } finally {
      setBusyId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700">
            مسودة 📝
          </span>
        );
      case 'PENDING_REVIEWER':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-950/70 text-amber-300 border border-amber-600/50 animate-pulse">
            بانتظار المراجع ⏳
          </span>
        );
      case 'PENDING_ACCOUNTING':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-cyan-950/70 text-cyan-300 border border-cyan-600/50">
            بانتظار الحسابات 💰
          </span>
        );
      case 'ARCHIVED':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-950/70 text-emerald-300 border border-emerald-600/50">
            مؤرشف ومعتمد 📂
          </span>
        );
      case 'RETURNED':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-orange-950/70 text-orange-300 border border-orange-600/50">
            مُعاد للتعديل ↩️
          </span>
        );
      case 'REJECTED':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-950/70 text-rose-300 border border-rose-600/50">
            مرفوض ❌
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-300">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6" dir="rtl">
      {/* ── Top Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2.5">
            <span className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20 text-lg">
              🚚
            </span>
            <span>طلبات نقل الخامات</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            إدارة ومتابعة طلبات نقل الخامات بين المشروعات ومراحل اعتمادها حتى الأرشفة
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
            className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-amber-500/20 transition-all cursor-pointer active:scale-95"
          >
            <span>➕</span>
            <span>طلب نقل جديد</span>
          </Link>
        </div>
      </div>

      {/* ── Search & Filter Controls ── */}
      <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl flex flex-col md:flex-row items-center gap-3 shadow-md">
        <div className="relative flex-1 w-full">
          <span className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-500 text-sm">
            🔍
          </span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="بحث برقم الطلب، اسم المشروع، السائق، بيان الخامة..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-9 pl-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500 transition-colors w-full md:w-44"
          >
            <option value="">كافة الحالات</option>
            <option value="DRAFT">مسودة</option>
            <option value="PENDING_REVIEWER">بانتظار المراجع</option>
            <option value="PENDING_ACCOUNTING">بانتظار الحسابات</option>
            <option value="ARCHIVED">مؤرشف ومعتمد</option>
            <option value="RETURNED">مُعاد للتعديل</option>
            <option value="REJECTED">مرفوض</option>
          </select>

          {(search || statusFilter) && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setStatusFilter('');
              }}
              className="text-xs text-slate-400 hover:text-white px-2.5 py-2 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              إعادة ضبط
            </button>
          )}
        </div>
      </div>

      {/* ── Content List ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] text-slate-400 gap-3">
          <div className="w-9 h-9 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
          <span className="text-xs font-bold">جاري تحميل الطلبات...</span>
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-12 text-center space-y-3">
          <span className="text-4xl block">📦</span>
          <h3 className="text-base font-bold text-slate-200">لا توجد طلبات نقل خامات مطابقة</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            لم يتم العثور على أي طلبات مسجلة بالبحث الحالي. يمكنك البدء بإنشاء طلب نقل خامات جديد.
          </p>
          <Link
            to="/material-transfers/create"
            className="inline-flex items-center gap-2 mt-2 px-4 py-2 bg-amber-500 text-slate-950 font-bold text-xs rounded-xl shadow-md hover:bg-amber-400 transition-all"
          >
            <span>➕</span>
            <span>إنشاء أول طلب نقل خامات</span>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {requests.map(req => {
            const isBusy = busyId === req.id;
            return (
              <div
                key={req.id}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-lg transition-all hover:shadow-xl space-y-4"
              >
                {/* Header: Number & Status */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-black text-sm text-amber-400 tracking-wider">
                      {req.request_number}
                    </span>
                    {getStatusBadge(req.status)}
                  </div>

                  {/* Date & Projects */}
                  <div className="text-xs space-y-1.5 pt-1">
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <span>📅</span>
                      <span>التاريخ: {req.transfer_date}</span>
                    </div>

                    <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/80 space-y-1">
                      <div className="flex items-start gap-1.5 text-slate-300">
                        <span className="text-amber-400 shrink-0">من:</span>
                        <span className="font-semibold text-white">{req.from_project}</span>
                      </div>
                      <div className="flex items-start gap-1.5 text-slate-300">
                        <span className="text-emerald-400 shrink-0">إلى:</span>
                        <span className="font-semibold text-white">{req.to_project}</span>
                      </div>
                    </div>
                  </div>

                  {/* Driver / Equipment */}
                  {(req.driver_name || req.vehicle_plate_number) && (
                    <div className="text-[11px] text-slate-400 flex items-center justify-between border-t border-slate-800/60 pt-2">
                      <span>🚛 السائق: {req.driver_name || 'غير محدد'}</span>
                      <span>المعدة: {req.vehicle_plate_number || '-'}</span>
                    </div>
                  )}

                  {/* Items summary */}
                  <div className="text-xs text-slate-300 border-t border-slate-800/60 pt-2">
                    <span className="text-slate-400 font-semibold">
                      البنود ({req.items?.length || 0}):{' '}
                    </span>
                    <span className="text-slate-200">
                      {req.items?.slice(0, 2).map(it => `${it.item_description} (${formatCleanNumber(it.quantity)} ${it.uom})`).join('، ')}
                      {req.items && req.items.length > 2 ? ' ...' : ''}
                    </span>
                  </div>

                  {/* Return or Rejection Reason Notice */}
                  {req.status === 'RETURNED' && req.return_reason && (
                    <div className="bg-orange-950/30 border border-orange-500/40 rounded-xl p-2.5 text-xs text-orange-200">
                      <span className="font-bold block mb-0.5">سبب الإعادة للتعديل:</span>
                      <span>{req.return_reason}</span>
                    </div>
                  )}
                  {req.status === 'REJECTED' && req.rejection_reason && (
                    <div className="bg-rose-950/30 border border-rose-500/40 rounded-xl p-2.5 text-xs text-rose-200">
                      <span className="font-bold block mb-0.5">سبب الرفض:</span>
                      <span>{req.rejection_reason}</span>
                    </div>
                  )}
                </div>

                {/* Card Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRequest(req);
                      setPreviewOpen(true);
                    }}
                    className="flex-1 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1"
                  >
                    <span>🖨️</span>
                    <span>معاينة / طباعة</span>
                  </button>

                  {/* Edit / Resubmit button if DRAFT or RETURNED */}
                  {req.can_edit && (
                    <Link
                      to={`/material-transfers/${req.id}/edit`}
                      className="py-2 px-3 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1"
                    >
                      <span>✏️</span>
                      <span>تعديل</span>
                    </Link>
                  )}

                  {req.status === 'DRAFT' && (
                    <>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleSubmitDraft(req.id)}
                        className="py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                        title="إرسال للاعتماد"
                      >
                        <span>🚀 إرسال</span>
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleDelete(req.id)}
                        className="p-2 text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 rounded-xl border border-rose-900/40 transition-colors cursor-pointer"
                        title="حذف المسودة"
                      >
                        <span>🗑️</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
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
