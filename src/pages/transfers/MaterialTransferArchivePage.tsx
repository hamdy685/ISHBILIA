import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getMaterialTransferArchiveApi } from '../../api/materialTransfers';
import { MaterialTransferRequest } from '../../types/materialTransfer';
import { PrintableMaterialTransfer } from '../../components/transfers/PrintableMaterialTransfer';
import { Modal } from '../../components/ui/Modal';
import { toast } from '../../utils/toast';
import { formatCleanNumber } from '../../utils/numberFormat';

export const MaterialTransferArchivePage: React.FC = () => {
  const [requests, setRequests] = useState<MaterialTransferRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Filters
  const [search, setSearch] = useState<string>('');
  const [fromProject, setFromProject] = useState<string>('');
  const [toProject, setToProject] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  // Modals
  const [selectedRequest, setSelectedRequest] = useState<MaterialTransferRequest | null>(null);
  const [previewOpen, setPreviewOpen] = useState<boolean>(false);
  const [detailsOpen, setDetailsOpen] = useState<boolean>(false);

  const loadArchive = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMaterialTransferArchiveApi({
        search: search || undefined,
        from_project: fromProject || undefined,
        to_project: toProject || undefined,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
      });
      setRequests(res.data);
      setTotalCount(res.meta?.total || res.data.length);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'تعذر تحميل أرشيف المنقولات.');
    } finally {
      setLoading(false);
    }
  }, [search, fromProject, toProject, fromDate, toDate]);

  useEffect(() => {
    loadArchive();
  }, [loadArchive]);

  const handleResetFilters = () => {
    setSearch('');
    setFromProject('');
    setToProject('');
    setFromDate('');
    setToDate('');
  };

  // Quick stats
  const totalItemsCount = requests.reduce((sum, r) => sum + (r.items?.length || 0), 0);
  const uniqueProjects = new Set([
    ...requests.map(r => r.from_project),
    ...requests.map(r => r.to_project),
  ]).size;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6" dir="rtl">
      {/* ── Top Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <Link to="/material-transfers" className="hover:text-amber-400 transition-colors">
              طلبات نقل الخامات
            </Link>
            <span>/</span>
            <span className="text-cyan-400 font-semibold">أرشيف المنقولات</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2.5">
            <span className="p-2 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 text-cyan-400 rounded-xl border border-cyan-500/30 text-lg">
              📂
            </span>
            <span>أرشيف المنقولات (طلبات نقل الخامات المؤرشفة)</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            الأرشيف المعتمد لجميع عمليات نقل الخامات بين المشروعات مع السجل الرقمي الكامل لمن أنشأ واعتمد وعالج وأرشف كل طلب
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            to="/material-transfers/create"
            className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-amber-500/20 transition-all cursor-pointer active:scale-95"
          >
            <span>➕</span>
            <span>طلب نقل جديد</span>
          </Link>
        </div>
      </div>

      {/* ── Key Stats Strip ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 block mb-1">إجمالي الطلبات المؤرشفة</span>
            <span className="text-2xl font-black text-cyan-400 font-mono">{totalCount}</span>
          </div>
          <span className="text-3xl p-3 bg-cyan-950/50 rounded-2xl border border-cyan-800/40">📂</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 block mb-1">إجمالي بنود الخامات المنقولة</span>
            <span className="text-2xl font-black text-amber-400 font-mono">{totalItemsCount}</span>
          </div>
          <span className="text-3xl p-3 bg-amber-950/50 rounded-2xl border border-amber-800/40">🧱</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 block mb-1">المشروعات النشطة بالتبادل</span>
            <span className="text-2xl font-black text-emerald-400 font-mono">{uniqueProjects}</span>
          </div>
          <span className="text-3xl p-3 bg-emerald-950/50 rounded-2xl border border-emerald-800/40">🏗️</span>
        </div>
      </div>

      {/* ── Filter & Search Toolbar ── */}
      <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl space-y-3 shadow-md">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Search bar */}
          <div className="md:col-span-4 relative">
            <span className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-500 text-sm">
              🔍
            </span>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="بحث برقم الطلب، السائق، بيان الخامة، المهندس..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-9 pl-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          {/* From Project */}
          <div className="md:col-span-2">
            <input
              type="text"
              value={fromProject}
              onChange={e => setFromProject(e.target.value)}
              placeholder="من مشروع..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          {/* To Project */}
          <div className="md:col-span-2">
            <input
              type="text"
              value={toProject}
              onChange={e => setToProject(e.target.value)}
              placeholder="إلى مشروع..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          {/* From Date */}
          <div className="md:col-span-2">
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          {/* To Date */}
          <div className="md:col-span-2 flex items-center gap-2">
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors"
            />
            {(search || fromProject || toProject || fromDate || toDate) && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-xs text-slate-400 hover:text-white px-2 py-2 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                title="إعادة ضبط"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Table & Results ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] text-slate-400 gap-3">
          <div className="w-9 h-9 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
          <span className="text-xs font-bold">جاري تحميل سجلات أرشيف المنقولات...</span>
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-12 text-center space-y-3">
          <span className="text-4xl block">📭</span>
          <h3 className="text-base font-bold text-slate-200">لا توجد طلبات نقل خامات مؤرشفة</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            تظهر في هذا الأرشيف كافة طلبات نقل الخامات التي استكملت دورتها الإجرائية واعتمدت فنيًا ومحاسبيًا.
          </p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400">
                  <th className="py-3 px-4 font-bold">رقم الطلب</th>
                  <th className="py-3 px-3 font-bold">تاريخ النقل</th>
                  <th className="py-3 px-3 font-bold">من مشروع</th>
                  <th className="py-3 px-3 font-bold">إلى مشروع</th>
                  <th className="py-3 px-3 font-bold">مقدم الطلب</th>
                  <th className="py-3 px-3 font-bold">المراجع المعتمد</th>
                  <th className="py-3 px-3 font-bold">مسؤول الحسابات</th>
                  <th className="py-3 px-3 font-bold text-center">الأصناف</th>
                  <th className="py-3 px-4 font-bold text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {requests.map(req => (
                  <tr key={req.id} className="hover:bg-slate-850 transition-colors">
                    {/* Request Number */}
                    <td className="py-3 px-4 font-mono font-black text-cyan-400">
                      {req.request_number}
                    </td>

                    {/* Date */}
                    <td className="py-3 px-3 text-slate-300 whitespace-nowrap">
                      {req.transfer_date}
                    </td>

                    {/* From Project */}
                    <td className="py-3 px-3 font-semibold text-white">
                      {req.from_project}
                    </td>

                    {/* To Project */}
                    <td className="py-3 px-3 font-semibold text-emerald-300">
                      {req.to_project}
                    </td>

                    {/* Requester */}
                    <td className="py-3 px-3 text-slate-300 whitespace-nowrap">
                      <div>{req.user?.name || '-'}</div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {req.created_at ? new Date(req.created_at).toLocaleDateString('ar-EG') : ''}
                      </div>
                    </td>

                    {/* Reviewer */}
                    <td className="py-3 px-3 text-slate-300 whitespace-nowrap">
                      <div className="text-emerald-400 font-medium">
                        {req.reviewer?.name || (req.reviewed_at ? 'اعتماد مباشر' : '-')}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {req.reviewed_at ? new Date(req.reviewed_at).toLocaleDateString('ar-EG') : ''}
                      </div>
                    </td>

                    {/* Accountant */}
                    <td className="py-3 px-3 text-slate-300 whitespace-nowrap">
                      <div className="text-cyan-300 font-medium">{req.accountant?.name || '-'}</div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {req.accounted_at ? new Date(req.accounted_at).toLocaleDateString('ar-EG') : ''}
                      </div>
                    </td>

                    {/* Items count badge */}
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-800 text-amber-300 border border-slate-700">
                        {req.items?.length || 0} بنود
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedRequest(req);
                            setDetailsOpen(true);
                          }}
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                          title="عرض التفاصيل والسجل الرقمي"
                        >
                          👁️ تفاصيل
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedRequest(req);
                            setPreviewOpen(true);
                          }}
                          className="px-2.5 py-1.5 bg-cyan-950/70 hover:bg-cyan-900/80 text-cyan-300 border border-cyan-800/60 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                          title="طباعة الاستمارة الرسمية"
                        >
                          🖨️ طباعة
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Details & Audit Trail Modal ── */}
      {detailsOpen && selectedRequest && (
        <Modal
          isOpen={detailsOpen}
          onClose={() => {
            setDetailsOpen(false);
            setSelectedRequest(null);
          }}
          title={`تفاصيل وسجل طلب نقل الخامات - ${selectedRequest.request_number}`}
          size="xl"
        >
          <div className="space-y-5 text-xs" dir="rtl">
            {/* Header badges */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="font-mono text-base font-black text-cyan-400">
                {selectedRequest.request_number}
              </span>
              <span className="px-3 py-1 rounded-full font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-600/50">
                مؤرشف ومعتمد رسمياً 📂
              </span>
            </div>

            {/* Audit Trail Timeline */}
            <div className="space-y-3">
              <h4 className="font-bold text-slate-200 flex items-center gap-1.5">
                <span>⏱️</span>
                <span>سجل دورة العمل وتوقيت الاعتمادات:</span>
              </h4>

              <div className="relative border-r-2 border-slate-800 pr-4 space-y-4 mr-2">
                {/* 1. Requester */}
                <div className="relative">
                  <span className="absolute -right-[23px] top-0.5 w-3 h-3 rounded-full bg-amber-400 border-2 border-slate-900" />
                  <div className="font-bold text-white">✍️ إنشاء الطلب</div>
                  <div className="text-slate-400">
                    بواسطة: <strong className="text-slate-200">{selectedRequest.user?.name || 'مقدم الطلب'}</strong>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    {selectedRequest.created_at ? new Date(selectedRequest.created_at).toLocaleString('ar-EG') : '-'}
                  </div>
                </div>

                {/* 2. Reviewer */}
                <div className="relative">
                  <span className="absolute -right-[23px] top-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-slate-900" />
                  <div className="font-bold text-white">✅ مراجعة واعتماد المراجع</div>
                  <div className="text-slate-400">
                    بواسطة: <strong className="text-emerald-300">{selectedRequest.reviewer?.name || 'اعتماد تلقائي (المراجع هو منشئ الطلب)'}</strong>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    {selectedRequest.reviewed_at ? new Date(selectedRequest.reviewed_at).toLocaleString('ar-EG') : '-'}
                  </div>
                  {selectedRequest.review_notes && (
                    <div className="text-xs text-slate-300 bg-slate-950 p-2 rounded-lg mt-1 border border-slate-800">
                      ملاحظات المراجع: {selectedRequest.review_notes}
                    </div>
                  )}
                </div>

                {/* 3. Accounting */}
                <div className="relative">
                  <span className="absolute -right-[23px] top-0.5 w-3 h-3 rounded-full bg-cyan-400 border-2 border-slate-900" />
                  <div className="font-bold text-white">📂 المعالجة المحاسبية والأرشفة</div>
                  <div className="text-slate-400">
                    بواسطة مسؤول الحسابات: <strong className="text-cyan-300">{selectedRequest.accountant?.name || '-'}</strong>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    {selectedRequest.accounted_at ? new Date(selectedRequest.accounted_at).toLocaleString('ar-EG') : '-'}
                  </div>
                  {selectedRequest.accounting_notes && (
                    <div className="text-xs text-amber-200 bg-amber-950/30 p-2 rounded-lg mt-1 border border-amber-800/40">
                      <strong>التوجيه المحاسبي: </strong> {selectedRequest.accounting_notes}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Projects & Driver details */}
            <div className="grid grid-cols-2 gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800">
              <div>
                <span className="text-slate-400 block mb-0.5">من مشروع:</span>
                <span className="font-bold text-white">{selectedRequest.from_project}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">إلى مشروع:</span>
                <span className="font-bold text-emerald-300">{selectedRequest.to_project}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">السائق / الناقل:</span>
                <span className="font-medium text-slate-200">{selectedRequest.driver_name || '-'}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">رقم السيارة / المعدة:</span>
                <span className="font-mono font-medium text-slate-200">{selectedRequest.vehicle_plate_number || '-'}</span>
              </div>
            </div>

            {/* Items Table */}
            <div>
              <h4 className="font-bold text-slate-200 mb-2">جدول الخامات المنقولة:</h4>
              <div className="border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                      <th className="p-2 w-8 text-center">م</th>
                      <th className="p-2">بيان الصنف</th>
                      <th className="p-2 w-20">الوحدة</th>
                      <th className="p-2 w-24">الكمية</th>
                      <th className="p-2">ملاحظات / حالة الخامة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {selectedRequest.items?.map((it, idx) => (
                      <tr key={idx}>
                        <td className="p-2 text-center text-slate-500 font-mono">{idx + 1}</td>
                        <td className="p-2 font-semibold text-white">{it.item_description}</td>
                        <td className="p-2">{it.uom}</td>
                        <td className="p-2 font-mono font-bold text-cyan-400">{formatCleanNumber(it.quantity)}</td>
                        <td className="p-2 text-slate-400">{it.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Actions footer */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setDetailsOpen(false);
                  setPreviewOpen(true);
                }}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <span>🖨️</span>
                <span>طباعة النموذج الرسمي</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDetailsOpen(false);
                  setSelectedRequest(null);
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                إغلاق
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
