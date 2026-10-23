import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  getAccountingPendingMaterialTransfersApi,
  processAndArchiveMaterialTransferApi,
} from '../../api/materialTransfers';
import { MaterialTransferRequest } from '../../types/materialTransfer';
import { PrintableMaterialTransfer } from '../../components/transfers/PrintableMaterialTransfer';
import { Modal } from '../../components/ui/Modal';
import { toast } from '../../utils/toast';
import { formatCleanNumber } from '../../utils/numberFormat';

export const AccountingMaterialTransfersPage: React.FC = () => {
  const [requests, setRequests] = useState<MaterialTransferRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');

  // Modals state
  const [selectedRequest, setSelectedRequest] = useState<MaterialTransferRequest | null>(null);
  const [previewOpen, setPreviewOpen] = useState<boolean>(false);
  const [archiveTarget, setArchiveTarget] = useState<MaterialTransferRequest | null>(null);
  const [accountingNotes, setAccountingNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAccountingPendingMaterialTransfersApi({
        search: search || undefined,
      });
      setRequests(res.data);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'تعذر تحميل طلبات الحسابات.');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const handleOpenArchive = (req: MaterialTransferRequest) => {
    setArchiveTarget(req);
    setAccountingNotes('');
  };

  const handleConfirmArchive = async () => {
    if (!archiveTarget) return;

    setSubmitting(true);
    try {
      await processAndArchiveMaterialTransferApi(
        archiveTarget.id,
        accountingNotes.trim() || undefined
      );
      toast.success(
        `📂 تمت المعالجة المحاسبية وأرشفة طلب نقل الخامات (${archiveTarget.request_number}) في أرشيف المنقولات بنجاح.`
      );
      setArchiveTarget(null);
      setAccountingNotes('');
      loadRequests();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'حدث خطأ أثناء أرشفة الطلب.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6" dir="rtl">
      {/* ── Top Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <Link to="/accounting" className="hover:text-cyan-400 transition-colors">
              لوحة المحاسبة
            </Link>
            <span>/</span>
            <span className="text-cyan-400 font-semibold">طلبات نقل الخامات الواردة</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2.5">
            <span className="p-2 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/20 text-lg">
              💰
            </span>
            <span>معالجة طلبات نقل الخامات (الحسابات)</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            مراجعة الخامات المنقولة بين المشروعات وتسجيل التوجيه المحاسبي وإتمام الأرشفة الرسمية
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            to="/material-transfers/archive"
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-black text-xs rounded-xl shadow-lg shadow-cyan-900/30 transition-all cursor-pointer active:scale-95"
          >
            <span>📂</span>
            <span>الانتقال إلى أرشيف المنقولات</span>
          </Link>
        </div>
      </div>

      {/* ── Search Bar ── */}
      <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl flex items-center gap-3 shadow-md">
        <div className="relative flex-1">
          <span className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-500 text-sm">
            🔍
          </span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="بحث برقم الطلب، المشروع، مقدم الطلب، بيان الخامة..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-9 pl-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
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

      {/* ── List of Pending Accounting Requests ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] text-slate-400 gap-3">
          <div className="w-9 h-9 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
          <span className="text-xs font-bold">جاري تحميل طلبات النقل الواردة للحسابات...</span>
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-12 text-center space-y-3">
          <span className="text-4xl block">✨</span>
          <h3 className="text-base font-bold text-slate-200">لا توجد طلبات معلقة بالحسابات</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            كافة طلبات نقل الخامات المعتمدة تمت معالجتها وأرشفتها في أرشيف المنقولات بنجاح.
          </p>
          <Link
            to="/material-transfers/archive"
            className="inline-flex items-center gap-1.5 mt-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-xl text-xs font-bold border border-slate-700"
          >
            <span>📂 استعراض أرشيف المنقولات</span>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map(req => (
            <div
              key={req.id}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 shadow-xl space-y-4 transition-all"
            >
              {/* Header Info */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono font-black text-sm">
                    {req.request_number}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-cyan-950/70 text-cyan-300 border border-cyan-600/40">
                    بانتظار المعالجة والأرشفة 💰
                  </span>
                </div>

                <div className="flex items-center gap-4 text-xs text-slate-400">
                  <span>📅 تاريخ النقل: <strong className="text-slate-200">{req.transfer_date}</strong></span>
                  <span>✍️ مقدم الطلب: <strong className="text-amber-300">{req.user?.name || 'غير محدد'}</strong></span>
                </div>
              </div>

              {/* Approval Lifecycle Stamp */}
              <div className="bg-emerald-950/20 border border-emerald-800/30 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 text-emerald-300">
                  <span>✅</span>
                  <span>
                    <strong>اعتماد المراجع: </strong>
                    {req.reviewer?.name || 'اعتماد مباشر (مقدم الطلب مراجع معتمد)'}
                  </span>
                </div>
                {req.reviewed_at && (
                  <span className="text-[11px] text-slate-400 font-mono">
                    {new Date(req.reviewed_at).toLocaleString('ar-EG')}
                  </span>
                )}
                {req.review_notes && (
                  <div className="w-full text-slate-300 text-xs border-t border-emerald-800/30 pt-1 mt-1">
                    <span className="text-slate-400">توجيه المراجع: </span>
                    {req.review_notes}
                  </div>
                )}
              </div>

              {/* Projects & Driver Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
                  <span className="text-slate-400 block mb-0.5 font-bold">○ من مشروع:</span>
                  <span className="text-sm font-bold text-white">{req.from_project}</span>
                </div>

                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
                  <span className="text-emerald-400 block mb-0.5 font-bold">● إلى مشروع:</span>
                  <span className="text-sm font-bold text-white">{req.to_project}</span>
                </div>

                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
                  <span className="text-slate-400 block mb-0.5 font-bold">🚛 بيانات الناقل:</span>
                  <span className="text-slate-200 font-medium">
                    {req.driver_name || 'السائق غير محدد'} {req.vehicle_plate_number ? `(${req.vehicle_plate_number})` : ''}
                  </span>
                </div>
              </div>

              {/* Items Table */}
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
                        <td className="py-2 px-3 font-mono font-bold text-cyan-400">{formatCleanNumber(it.quantity)}</td>
                        <td className="py-2 px-3 text-slate-400">{it.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Action Buttons */}
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

                <button
                  type="button"
                  onClick={() => handleOpenArchive(req)}
                  className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black rounded-xl text-xs shadow-lg shadow-emerald-900/30 transition-all cursor-pointer active:scale-95 flex items-center gap-2"
                >
                  <span>📂</span>
                  <span>إتمام المعالجة والأرشفة في أرشيف المنقولات</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Accounting Processing & Archive Modal ── */}
      {archiveTarget && (
        <Modal
          isOpen={Boolean(archiveTarget)}
          onClose={() => {
            setArchiveTarget(null);
            setAccountingNotes('');
          }}
          title={`المعالجة المحاسبية وأرشفة طلب نقل الخامات (${archiveTarget.request_number})`}
          size="md"
        >
          <div className="space-y-4 text-xs" dir="rtl">
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">من مشروع:</span>
                <span className="text-white font-bold">{archiveTarget.from_project}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">إلى مشروع:</span>
                <span className="text-white font-bold">{archiveTarget.to_project}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">عدد بنود الخامات:</span>
                <span className="text-amber-400 font-bold">{archiveTarget.items?.length || 0} أصناف</span>
              </div>
            </div>

            <div>
              <label className="block text-slate-300 font-bold mb-1.5">
                التوجيه المحاسبي والملاحظات (مراكز التكلفة / القيد / المستند):
              </label>
              <textarea
                rows={3}
                value={accountingNotes}
                onChange={e => setAccountingNotes(e.target.value)}
                placeholder="مثال: تم التوجيه على مركز تكلفة المشروع المستلم وتخفيض رصيد المشروع المنقول منه، وقيد اليومية برقم..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 resize-none"
              />
            </div>

            <p className="text-slate-400 leading-relaxed text-[11px]">
              ⚠️ عند الضغط على تأكيد الأرشفة، ستكتمل دورة عمل الطلب وينتقل نهائياً إلى <strong>«أرشيف المنقولات»</strong> مع تسجيل توقيت المعالجة وهوية المحاسب القائم بالأرشفة في السجل الرقمي المعتمد.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setArchiveTarget(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleConfirmArchive}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl text-xs transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-lg shadow-emerald-900/30"
              >
                <span>📂</span>
                <span>{submitting ? 'جاري الأرشفة...' : 'تأكيد المعالجة والأرشفة'}</span>
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
