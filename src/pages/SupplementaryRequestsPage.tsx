import React, { useEffect, useState } from 'react';
import { PurchaseRequest } from '../types/purchaseRequest';
import { PurchaseRequestSupplement } from '../types/supplement';
import {
  approveSupplementReviewerApi,
  getEligibleRequestsForSupplementApi,
  getSupplementsForPrApi,
} from '../api/supplements';
import { useAuth } from '../context/AuthContext';
import { CreateSupplementModal } from '../components/supplements/CreateSupplementModal';
import { ProcurementSupplementProcessModal } from '../components/supplements/ProcurementSupplementProcessModal';
import { PrDetailsModal } from '../components/procurement/PrDetailsModal';

export const SupplementaryRequestsPage: React.FC = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Modals state
  const [selectedPrForCreate, setSelectedPrForCreate] = useState<PurchaseRequest | null>(null);
  const [previewPr, setPreviewPr] = useState<PurchaseRequest | null>(null);
  const [selectedForProcess, setSelectedForProcess] = useState<{
    request: PurchaseRequest;
    supplement: PurchaseRequestSupplement;
  } | null>(null);

  // Supplements drawer/expanded state per PR
  const [expandedPrId, setExpandedPrId] = useState<number | null>(null);
  const [prSupplements, setPrSupplements] = useState<Record<number, PurchaseRequestSupplement[]>>({});
  const [loadingSupplements, setLoadingSupplements] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isReviewer = Boolean(
    user?.roles?.some((r) => (typeof r === 'string' ? r : r.slug) === 'reviewer')
  );
  const isProcurement = Boolean(
    user?.roles?.some((r) => ['procurement_manager', 'admin'].includes(typeof r === 'string' ? r : r.slug))
  );

  const loadRequests = async (targetPage = 1) => {
    try {
      setLoading(true);
      setError(null);
      const res = await getEligibleRequestsForSupplementApi(targetPage, 15);
      setRequests(res.data || []);
      setTotalPages(res.last_page || 1);
      setTotalCount(res.total || 0);
      setPage(res.current_page || 1);
    } catch (err: any) {
      setError(err.response?.data?.message || 'حدث خطأ أثناء تحميل الطلبات المؤهلة للكمالة.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRequests(1);
  }, []);

  const loadSupplementsForPr = async (prId: number) => {
    try {
      setLoadingSupplements(true);
      const res = await getSupplementsForPrApi(prId);
      setPrSupplements((prev) => ({
        ...prev,
        [prId]: res.data || [],
      }));
    } catch {
      // Fallback
    } finally {
      setLoadingSupplements(false);
    }
  };

  const handleToggleExpand = (prId: number) => {
    if (expandedPrId === prId) {
      setExpandedPrId(null);
    } else {
      setExpandedPrId(prId);
      if (!prSupplements[prId]) {
        void loadSupplementsForPr(prId);
      }
    }
  };

  const handleReviewerApprove = async (supplementId: number, prId: number) => {
    if (!window.confirm('هل أنت متأكد من اعتماد بنود هذا الملحق وإرسالها للمشتريات؟')) return;
    try {
      setActionLoading(true);
      await approveSupplementReviewerApi(supplementId);
      setSuccessMessage('تم اعتماد طلب الكمالة بنجاح وتوجيهه لمدير المشتريات.');
      void loadSupplementsForPr(prId);
      void loadRequests(page);
    } catch (err: any) {
      alert(err.response?.data?.message || 'حدث خطأ أثناء الاعتماد.');
    } finally {
      setActionLoading(false);
    }
  };

  const filteredRequests = requests.filter((r) => {
    const q = search.toLowerCase();
    return (
      (r.request_number || '').toLowerCase().includes(q) ||
      (r.parcel_reference || '').toLowerCase().includes(q) ||
      (r.region || '').toLowerCase().includes(q) ||
      (r.department?.name || '').toLowerCase().includes(q) ||
      (r.purchase_orders || []).some((po: any) => (po.po_number || '').toLowerCase().includes(q))
    );
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Page Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 text-2xl font-bold shadow-inner">
              ➕
            </span>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">
                طلبات الكمالة (الملاحق التكميلية)
              </h1>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                إضافة بنود جديدة للطلبات الجارية قبل اعتماد إذن الاستلام في الموقع
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => void loadRequests(page)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <span>🔄</span> تحديث
          </button>
        </div>
      </div>

      {/* Info Alert Box */}
      <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50/80 via-orange-50/50 to-amber-50/80 p-4 text-sm text-amber-900 shadow-sm dark:border-amber-900/40 dark:from-amber-950/30 dark:via-orange-950/20 dark:to-amber-950/30 dark:text-amber-200">
        <div className="flex items-start gap-3">
          <span className="text-xl">💡</span>
          <div>
            <h2 className="text-sm font-bold text-amber-900 dark:text-amber-200">
              قواعد طلب الكمالة:
            </h2>
            <ul className="mt-1 list-disc pr-5 space-y-1 text-xs text-amber-800/90 dark:text-amber-300/90">
              <li>تظهر هنا الطلبات الصادرة التي <strong>لم يكتمل استلامها بعد</strong> ولم يُعتمد لها إذن استلام نهائي.</li>
              <li>البنود التكميلية تُدرج تحت <strong>نفس رقم الطلب الأصلي</strong> وتحتفظ برابط قطعة الأرض والمنطقة.</li>
              <li>يمر طلب الكمالة بالاعتماد: <strong>مقدم الطلب ➜ المراجع ➜ مدير المشتريات ➜ الاستلام والحسابات</strong>.</li>
              <li>يمكن لمدير المشتريات إسناد الكمالة <strong>لنفس المورد أو لمورد مختلف</strong> بحسب طبيعة البنود المضافة.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Success Notification */}
      {successMessage && (
        <div className="flex items-center justify-between rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
          <span>{successMessage}</span>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 font-bold hover:text-emerald-700">
            ✕
          </button>
        </div>
      )}

      {/* Search Bar */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="البحث برقم الطلب، القطعة، المنطقة، أو القسم..."
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 pr-10 text-sm text-slate-800 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
          />
          <span className="absolute right-3.5 top-3 text-slate-400">🔍</span>
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
          العدد المتاح: <strong>{totalCount}</strong> طلب
        </div>
      </div>

      {/* Main List */}
      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent"></div>
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
              جارٍ تحميل الطلبات المؤهلة للكمالة...
            </span>
          </div>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-600 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-400">
          <p className="font-semibold">{error}</p>
          <button
            onClick={() => void loadRequests(page)}
            className="mt-3 inline-flex items-center rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700"
          >
            إعادة المحاولة
          </button>
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
          <span className="text-4xl mb-3">📦</span>
          <h2 className="text-base font-bold text-slate-800 dark:text-white">
            لا توجد طلبات مؤهلة لطلب كمالة حالياً
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-sm">
            كافة الطلبات إما لم تصدر بعد كأوامر شراء، أو تم تأكيد استلامها بالكامل في الموقع بالفعل.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRequests.map((pr) => {
            const hasSupplements = (pr.supplements && pr.supplements.length > 0) || Boolean(prSupplements[pr.id]?.length);
            const activeSupplements = prSupplements[pr.id] || pr.supplements || [];
            const isExpanded = expandedPrId === pr.id;

            return (
              <div
                key={pr.id}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:border-amber-300 dark:border-slate-800 dark:bg-slate-900"
              >
                {/* Request Header Card */}
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 p-5">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-black text-slate-900 dark:text-white text-base">
                        {pr.request_number}
                      </span>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        جاهز للكمالة (لم يُستلم بعد)
                      </span>
                      {pr.purchase_orders && pr.purchase_orders.length > 0 && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-900/50">
                          أمر الشراء: {pr.purchase_orders.map((p: any) => p.po_number).join(', ')}
                        </span>
                      )}
                      {hasSupplements && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300">
                          يحتوي ملاحق ({activeSupplements.length})
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                      <div>
                        <span className="text-slate-400 dark:text-slate-500">القطعة: </span>
                        <strong className="text-slate-700 dark:text-slate-300">{pr.parcel_reference || 'عام'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 dark:text-slate-500">المنطقة: </span>
                        <strong className="text-slate-700 dark:text-slate-300">{pr.region || 'المركز الرئيسي'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 dark:text-slate-500">مقدم الطلب: </span>
                        <strong className="text-slate-700 dark:text-slate-300">{pr.requester?.name || '—'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 dark:text-slate-500">الإجمالي الحالي: </span>
                        <strong className="text-slate-900 dark:text-white font-bold">
                          {Number(pr.total_estimated_cost || 0).toLocaleString('en-US')} ج.م
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewPr(pr)}
                      className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      عرض تفاصيل الطلب
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleExpand(pr.id)}
                      className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      {isExpanded ? 'إخفاء الملاحق ▲' : 'سجل ملاحق الكمالة ▼'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedPrForCreate(pr)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-extrabold text-white shadow-md shadow-amber-600/20 hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      <span>➕</span> عمل طلب كمالة
                    </button>
                  </div>
                </div>

                {/* Expanded Supplements Drawer */}
                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-950/50">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        ملاحق الكمالة التابعة لهذا الطلب ({activeSupplements.length})
                      </h3>
                      {loadingSupplements && (
                        <span className="text-xs text-slate-400 animate-pulse">جارٍ التحديث...</span>
                      )}
                    </div>

                    {activeSupplements.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-400 dark:border-slate-700">
                        لم يتم تسجيل أي طلبات كمالة على هذا الطلب حتى الآن. يمكنك الضغط على "عمل طلب كمالة" لإضافة بنود.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {activeSupplements.map((supp) => {
                          const isProcurementReady = supp.status === 'REVIEWER_APPROVED';
                          const isReviewerPending = supp.status === 'SUBMITTED';

                          return (
                            <div
                              key={supp.id}
                              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                                <div className="flex items-center gap-2">
                                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-100 text-amber-800 font-bold text-xs dark:bg-amber-950 dark:text-amber-300">
                                    #{supp.batch_number}
                                  </span>
                                  <strong className="text-sm font-bold text-slate-800 dark:text-slate-200">
                                    ملحق كمالة (دفعة #{supp.batch_number})
                                  </strong>
                                  <span className="text-xs text-slate-400">
                                    بواسطة: {supp.requester?.name || 'مستخدم'} ({new Date(supp.created_at).toLocaleDateString('ar-EG')})
                                  </span>
                                </div>

                                <div className="flex items-center gap-2">
                                  {supp.status === 'SUBMITTED' && (
                                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-900">
                                      بانتظار مراجعة القسم
                                    </span>
                                  )}
                                  {supp.status === 'REVIEWER_APPROVED' && (
                                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
                                      معتمد من المراجع ➜ بانتظار المشتريات
                                    </span>
                                  )}
                                  {supp.status === 'PROCUREMENT_PROCESSED' && (
                                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900">
                                      تم إصدار أمر الشراء (المورد: {supp.supplier?.company_name || '—'})
                                    </span>
                                  )}

                                  {/* Action Buttons inside Drawer */}
                                  {isReviewer && isReviewerPending && (
                                    <button
                                      type="button"
                                      disabled={actionLoading}
                                      onClick={() => handleReviewerApprove(supp.id, pr.id)}
                                      className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                                    >
                                      اعتماد المراجع
                                    </button>
                                  )}

                                  {isProcurement && isProcurementReady && (
                                    <button
                                      type="button"
                                      onClick={() => setSelectedForProcess({ request: pr, supplement: supp })}
                                      className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-bold text-white hover:bg-blue-700"
                                    >
                                      توجيه وتسعير المشتريات
                                    </button>
                                  )}
                                </div>
                              </div>

                              {supp.notes && (
                                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2 italic">
                                  "{supp.notes}"
                                </p>
                              )}

                              {/* Supplementary Items Table */}
                              <div className="overflow-x-auto rounded-lg border border-slate-100 dark:border-slate-800">
                                <table className="w-full text-right text-xs">
                                  <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500">
                                    <tr>
                                      <th className="p-2">الصنف</th>
                                      <th className="p-2">الكمية</th>
                                      <th className="p-2">الوحدة</th>
                                      <th className="p-2">السعر التقديري</th>
                                      <th className="p-2">المواصفات</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {(supp.items || []).map((item) => (
                                      <tr key={item.id}>
                                        <td className="p-2 font-semibold text-slate-800 dark:text-slate-200">
                                          {item.item_description}
                                        </td>
                                        <td className="p-2 text-slate-600 dark:text-slate-300">
                                          {item.quantity}
                                        </td>
                                        <td className="p-2 text-slate-500">
                                          {item.uom || '—'}
                                        </td>
                                        <td className="p-2 text-slate-600 dark:text-slate-300">
                                          {item.estimated_unit_price ? `${item.estimated_unit_price} ج.م` : '—'}
                                        </td>
                                        <td className="p-2 text-slate-400">
                                          {item.specifications || '—'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <button
                disabled={page <= 1}
                onClick={() => void loadRequests(page - 1)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold disabled:opacity-50 dark:border-slate-800"
              >
                السابق
              </button>
              <span className="text-xs text-slate-500">
                صفحة {page} من {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => void loadRequests(page + 1)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold disabled:opacity-50 dark:border-slate-800"
              >
                التالي
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal: Create Supplement */}
      {selectedPrForCreate && (
        <CreateSupplementModal
          request={selectedPrForCreate}
          isOpen={Boolean(selectedPrForCreate)}
          onClose={() => setSelectedPrForCreate(null)}
          onSuccess={() => {
            setSuccessMessage('تم إنشاء طلب الكمالة بنجاح.');
            void loadRequests(page);
            if (selectedPrForCreate) {
              void loadSupplementsForPr(selectedPrForCreate.id);
              setExpandedPrId(selectedPrForCreate.id);
            }
          }}
        />
      )}

      {/* Modal: Procurement Processing */}
      {selectedForProcess && (
        <ProcurementSupplementProcessModal
          request={selectedForProcess.request}
          supplement={selectedForProcess.supplement}
          isOpen={Boolean(selectedForProcess)}
          onClose={() => setSelectedForProcess(null)}
          onSuccess={() => {
            setSuccessMessage('تمت معالجة الكمالة وإصدار أمر الشراء بنجاح.');
            void loadRequests(page);
            if (selectedForProcess) {
              void loadSupplementsForPr(selectedForProcess.request.id);
            }
          }}
        />
      )}

      {/* Modal: Preview PR Details */}
      {previewPr && (
        <PrDetailsModal
          pr={previewPr}
          isOpen={Boolean(previewPr)}
          onClose={() => setPreviewPr(null)}
        />
      )}
    </div>
  );
};
