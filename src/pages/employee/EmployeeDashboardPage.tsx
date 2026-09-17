import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ErrorMessage from '../../components/ErrorMessage';
import LoadingSpinner from '../../components/LoadingSpinner';
import PurchaseRequestTable from '../../components/purchase-requests/PurchaseRequestTable';
import DeleteRequestDialog from '../../components/purchase-requests/DeleteRequestDialog';
import SubmitRequestDialog from '../../components/purchase-requests/SubmitRequestDialog';
import { useAuth } from '../../context/AuthContext';
import {
  deletePurchaseRequestApi,
  getOwnPurchaseRequestsApi,
  submitPurchaseRequestApi,
} from '../../api/purchaseRequests';
import { ApiError } from '../../types/api';
import { PurchaseRequest } from '../../types/purchaseRequest';
import { parseApiError } from '../../utils/apiError';
import { KpiCard, KpiPill, KpiPillsBar } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import ActionRequiredInbox, { ActionInboxItem } from '../../components/dashboard/ActionRequiredInbox';
import QuickLauncherBar from '../../components/dashboard/QuickLauncherBar';

import { useRealtimeRefresh, emitAppDataUpdated } from '../../hooks/useRealtimeRefresh';

const EMPLOYEE_APPROVED_STATUSES = new Set([
  'APPROVED_BY_REVIEWER',
  'PENDING_EXECUTIVE_APPROVAL',
  'PENDING_PROCUREMENT_APPROVAL',
  'APPROVED_BY_PROCUREMENT',
  'PENDING_ACCOUNTING_APPROVAL',
  'APPROVED_BY_ACCOUNTING',
  'PENDING_QUOTE_RECOMMENDATIONS',
  'PENDING_EXECUTIVE_QUOTE_DECISION',
]);

export const EmployeeDashboardPage: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<ApiError | null>(null);

  // Modals
  const [selectedSubmitPr, setSelectedSubmitPr] = useState<PurchaseRequest | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [selectedDeletePr, setSelectedDeletePr] = useState<PurchaseRequest | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const fetchRequests = async (silent = false) => {
    if (!silent) setIsLoading(true);
    setError(null);
    try {
      const data = await getOwnPurchaseRequestsApi();
      setRequests(data);
    } catch (err) {
      if (!silent) setError(parseApiError(err));
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests(false);
  }, []);

  useRealtimeRefresh(() => { fetchRequests(true); });

  const totalCount = requests.length;
  const draftCount = requests.filter((r) => r.status === 'DRAFT').length;
  const pendingCount = requests.filter(
    (r) => r.status === 'SUBMITTED' || r.status === 'UNDER_REVIEW'
  ).length;
  const approvedCount = requests.filter((r) => EMPLOYEE_APPROVED_STATUSES.has(r.status)).length;
  const rejectedCount = requests.filter((r) => r.status === 'REJECTED').length;

  const [activeFilter, setActiveFilter] = useState<'ALL' | 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const filteredRequests = requests.filter((r) => {
    if (activeFilter === 'DRAFT' && r.status !== 'DRAFT') return false;
    if (activeFilter === 'PENDING' && (r.status !== 'SUBMITTED' && r.status !== 'UNDER_REVIEW')) return false;
    if (activeFilter === 'APPROVED' && !EMPLOYEE_APPROVED_STATUSES.has(r.status)) return false;
    if (activeFilter === 'REJECTED' && r.status !== 'REJECTED') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const numMatch = r.request_number?.toLowerCase().includes(q);
      const justMatch = r.justification?.toLowerCase().includes(q);
      const parcelMatch = r.items?.some((it) => it.item_reference?.toLowerCase().includes(q));
      const itemMatch = r.items?.some((it) => (it.item_description || it.item?.name || '').toLowerCase().includes(q));
      return numMatch || justMatch || parcelMatch || itemMatch;
    }
    return true;
  });

  const getFilterLabel = () => {
    switch (activeFilter) {
      case 'DRAFT': return 'المسودات';
      case 'PENDING': return 'قيد المراجعة';
      case 'APPROVED': return 'المعتمدة';
      case 'REJECTED': return 'المرفوضة';
      default: return 'جميع الطلبات';
    }
  };

  const handleConfirmSubmit = async () => {
    if (!selectedSubmitPr) return;
    setIsSubmitting(true);
    try {
      await submitPurchaseRequestApi(selectedSubmitPr.id);
      setSelectedSubmitPr(null);
      await fetchRequests();
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!selectedDeletePr) return;
    setIsDeleting(true);
    try {
      await deletePurchaseRequestApi(selectedDeletePr.id);
      setSelectedDeletePr(null);
      await fetchRequests();
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return <LoadingSpinner fullScreen message="تحميل لوحة معلومات الموظف..." />;
  }

  return (
    <div className="space-y-3.5" dir="rtl">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-2.5">
        <div>
          <h1 className="text-xl font-black text-slate-100 flex items-center gap-2 tracking-tight">
            <span>📊</span> لوحة الموظف
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            أهلاً بك، <strong className="text-cyan-400 font-bold">{user?.name}</strong> ({user?.department?.name || 'قسم الموظف'}). يمكنك إدارة طلبات الشراء الخاصة بك هنا.
          </p>
        </div>

        {hasPermission('purchase_request.create') && (
          <Link to="/employee/requests/create">
            <Button variant="primary" size="md">
              + إنشاء طلب شراء جديد
            </Button>
          </Link>
        )}
      </div>

      <ErrorMessage error={error} onDismiss={() => setError(null)} />

      {/* ── اختصارات الإجراءات السريعة (Quick Launcher Bar) ── */}
      <QuickLauncherBar className="mb-2" />

      {/* ── صندوق الإجراءات المطلوبة منك (Employee Action Inbox) ── */}
      {(() => {
        const employeeActionItems: ActionInboxItem[] = [
          ...requests
            .filter((r) => r.status === 'DRAFT')
            .map((r) => ({
              id: `req-draft-${r.id}`,
              rawId: r.id,
              type: 'PR' as const,
              code: r.request_number,
              title: r.justification || (r.request_type === 'OFFICE_SUPPLIES' ? 'مسودة مستلزمات مكتبية' : 'مسودة طلب مواد مشروعات'),
              subtitle: r.justification ? (r.request_type === 'OFFICE_SUPPLIES' ? 'مستلزمات مكتبية' : 'مشتريات مواقع') : undefined,
              department: r.department?.name,
              amount: undefined,
              urgency: 'HIGH' as const,
              reason: 'مسودة لم تُرسل بعد للمراجعة والاعتماد',
              actionUrl: `/employee/requests/${r.id}/edit`,
              actionLabel: 'فتح وتعديل المسودة',
              timeAgo: r.created_at ? r.created_at.slice(0, 10) : undefined,
              request_type: r.request_type,
              date_needed: r.date_needed || undefined,
              priority: r.priority,
              parcel_number: r.items?.[0]?.item_reference || undefined,
              region: r.items?.[0]?.region || undefined,
              items_count: r.items?.length || 0,
              items_list: r.items?.map((it) => ({
                description: it.item_description || it.item?.name || 'صنف',
                quantity: it.quantity,
                uom: it.uom,
              })),
              onDirectSubmit: async (_item: any) => {
                await submitPurchaseRequestApi(r.id);
                await fetchRequests(true);
              },
            })),
        ];

        if (employeeActionItems.length === 0) return null;

        return (
          <ActionRequiredInbox
            title="المهام والإجراءات العاجلة المطلوبة لطلباتك"
            description="الطلبات المسودة المطلوب إرسالها للمراجعة والاعتماد."
            roleName="لوحة الموظف"
            onItemActionComplete={() => fetchRequests(true)}
            items={employeeActionItems}
          />
        );
      })()}

      {/* Summary KPI Pills (Slim Horizontal Strip) */}
      <KpiPillsBar className="my-2">
        <KpiPill
          title="إجمالي الطلبات"
          value={totalCount}
          accentColor="cyan"
          icon={<span className="text-xs">📋</span>}
          isActive={activeFilter === 'ALL'}
          onClick={() => setActiveFilter('ALL')}
          clickableHint="عرض كل الطلبات"
        />
        <KpiPill
          title="مسودات"
          value={draftCount}
          accentColor="slate"
          icon={<span className="text-xs">✏️</span>}
          isActive={activeFilter === 'DRAFT'}
          onClick={() => setActiveFilter('DRAFT')}
          clickableHint="تصفية المسودات"
        />
        <KpiPill
          title="قيد المراجعة"
          value={pendingCount}
          accentColor="amber"
          icon={<span className="text-xs">⏳</span>}
          isActive={activeFilter === 'PENDING'}
          onClick={() => setActiveFilter('PENDING')}
          clickableHint="تصفية قيد المراجعة"
        />
        <KpiPill
          title="معتمدة"
          value={approvedCount}
          accentColor="emerald"
          icon={<span className="text-xs">✅</span>}
          isActive={activeFilter === 'APPROVED'}
          onClick={() => setActiveFilter('APPROVED')}
          clickableHint="تصفية المعتمدة"
        />
        <KpiPill
          title="مرفوضة"
          value={rejectedCount}
          accentColor="rose"
          icon={<span className="text-xs">❌</span>}
          isActive={activeFilter === 'REJECTED'}
          onClick={() => setActiveFilter('REJECTED')}
          clickableHint="تصفية المرفوضة"
        />
      </KpiPillsBar>

      {/* Recent Requests Section with Dynamic Filter Header */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-2xl border border-slate-800">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-bold text-slate-200">
              📋 {activeFilter === 'ALL' ? 'طلبات الشراء' : `طلبات (${getFilterLabel()})`}
            </h2>
            <span className="text-[11px] font-bold bg-cyan-950/80 border border-cyan-800/60 text-cyan-300 px-2 py-0.5 rounded-full">
              {filteredRequests.length} طلب
            </span>
            {activeFilter !== 'ALL' && (
              <button
                type="button"
                onClick={() => setActiveFilter('ALL')}
                className="text-[11px] bg-slate-800 hover:bg-slate-700 text-cyan-400 px-2 py-0.5 rounded-full border border-slate-700 transition-colors"
              >
                إلغاء التصفية ✕
              </button>
            )}
          </div>

          <div className="w-full sm:w-72">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="🔍 بحث بالرقم أو الصنف..."
              className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
          </div>
        </div>

        {filteredRequests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/40 p-6 py-8 text-center text-xs text-slate-400">
            لا توجد طلبات تطابق تصنيف &quot;{getFilterLabel()}&quot;.
          </div>
        ) : (
          <>
            <PurchaseRequestTable
              requests={filteredRequests.slice(0, 10)}
              onOpenSubmitModal={(pr) => setSelectedSubmitPr(pr)}
              onOpenDeleteModal={(pr) => setSelectedDeletePr(pr)}
            />
            {filteredRequests.length > 10 && (
              <div className="mt-3 text-center">
                <Link to="/employee/requests" className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-800/60 bg-cyan-950/30 px-4 py-2.5 text-xs font-bold text-cyan-300 hover:bg-cyan-900/40 hover:border-cyan-600 transition-all">
                  عرض كل الطلبات ({filteredRequests.length}) ←
                </Link>
              </div>
            )}
          </>
        )}
      </div>

      {/* Confirmation Dialogs */}
      <SubmitRequestDialog
        isOpen={!!selectedSubmitPr}
        requestNumber={selectedSubmitPr?.request_number || ''}
        isSubmitting={isSubmitting}
        onConfirm={handleConfirmSubmit}
        onCancel={() => setSelectedSubmitPr(null)}
      />

      <DeleteRequestDialog
        isOpen={!!selectedDeletePr}
        requestNumber={selectedDeletePr?.request_number || ''}
        isDeleting={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setSelectedDeletePr(null)}
      />
    </div>
  );
};

export default EmployeeDashboardPage;
