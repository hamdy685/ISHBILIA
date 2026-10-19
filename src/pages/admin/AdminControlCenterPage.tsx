import React, { useState, useEffect, useMemo } from 'react';
import {
  searchAdminControlApi,
  getAdminAuditLogsApi,
  previewImpactApi,
  cancelDocumentSafelyApi,
  AdminControlSearchResult,
  AdminAuditLogEntry,
  ImpactPreview,
  WorkflowTransitionRule,
} from '../../api/admin/controlCenter';
import { AdminImpactPreviewModal } from '../../components/admin/AdminImpactPreviewModal';
import { AdminReassignReceiptModal } from '../../components/admin/AdminReassignReceiptModal';
import { AdminWorkflowTransitionModal } from '../../components/admin/AdminWorkflowTransitionModal';
import { AdminExcelGrid } from '../../components/admin/AdminExcelGrid';
import { Button } from '../../components/ui/Button';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import { formatCleanNumber } from '../../utils/numberFormat';
import { getWorkflowStatusBadge } from '../../utils/statusLabels';
import { toast } from '../../utils/toast';

type ActiveTab = 'WORKFLOW' | 'RECEIPTS' | 'EXCEL_GRID' | 'AUDIT_LOG';

export const AdminControlCenterPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('WORKFLOW');

  // Search State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [deptFilter, setDeptFilter] = useState<string>('');
  const [supplierFilter, setSupplierFilter] = useState<string>('');

  // Lookups & Data
  const [results, setResults] = useState<AdminControlSearchResult[]>([]);
  const [departments, setDepartments] = useState<Array<{ id: number; name: string }>>([]);
  const [suppliers, setSuppliers] = useState<Array<{ id: number; company_name: string; name: string }>>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successAlert, setSuccessAlert] = useState<string | null>(null);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AdminAuditLogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);
  const [selectedAuditLog, setSelectedAuditLog] = useState<AdminAuditLogEntry | null>(null);

  // Modals State
  const [previewModalOpen, setPreviewModalOpen] = useState<boolean>(false);
  const [currentImpact, setCurrentImpact] = useState<ImpactPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [pendingAction, setPendingAction] = useState<{
    entityType: string;
    entityId: number;
    action: string;
  } | null>(null);

  // Reassign Receipt Modal State
  const [reassignModalOpen, setReassignModalOpen] = useState<boolean>(false);
  const [selectedReceipt, setSelectedReceipt] = useState<any>(null);

  // Transition Modal State (Rollback / Forward)
  const [transitionModalOpen, setTransitionModalOpen] = useState<boolean>(false);
  const [transitionConfig, setTransitionConfig] = useState<{
    entityType: 'PURCHASE_REQUEST' | 'PURCHASE_ORDER' | 'PURCHASE_RECEIPT';
    entityId: number;
    entityLabel: string;
    currentStatus: string;
    direction: 'ROLLBACK' | 'FORWARD';
    allowedTransitions?: WorkflowTransitionRule[];
  } | null>(null);

  // Decision Columns Visibility Controls (Workflow Tab)
  const [visibleCols, setVisibleCols] = useState<{
    code: boolean;
    title: boolean;
    site: boolean;
    department: boolean;
    supplier: boolean;
    amount: boolean;
    status: boolean;
    pendingWith: boolean;
    fulfillment: boolean;
    elapsed: boolean;
  }>({
    code: true,
    title: true,
    site: true,
    department: true,
    supplier: true,
    amount: true,
    status: true,
    pendingWith: true,
    fulfillment: true,
    elapsed: true,
  });

  const [showColMenu, setShowColMenu] = useState<boolean>(false);

  // Receipts Tab Decision-Making Columns Visibility
  const [receiptCols, setReceiptCols] = useState<{
    code: boolean;
    poPr: boolean;
    location: boolean;
    supplierDept: boolean;
    items: boolean;
    amount: boolean;
    receiver: boolean;
    proof: boolean;
    status: boolean;
    accounting: boolean;
    elapsed: boolean;
  }>({
    code: true,
    poPr: true,
    location: true,
    supplierDept: true,
    items: true,
    amount: true,
    receiver: true,
    proof: true,
    status: true,
    accounting: true,
    elapsed: true,
  });

  const [showReceiptColMenu, setShowReceiptColMenu] = useState<boolean>(false);
  const [receiptFilterQuick, setReceiptFilterQuick] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'DELAYED' | 'WEIGHING' | 'WITH_PHOTO'>('ALL');

  // Preview Receipt Modal state
  const [previewReceiptItem, setPreviewReceiptItem] = useState<AdminControlSearchResult | null>(null);
  const [lightboxPhotoUrl, setLightboxPhotoUrl] = useState<string | null>(null);

  const receiptResults = useMemo(() => {
    return results.filter(r => r.entity_type === 'PURCHASE_RECEIPT');
  }, [results]);

  const receiptMetrics = useMemo(() => {
    const total = receiptResults.length;
    const pendingSite = receiptResults.filter(r => r.status === 'PENDING_SITE_ENGINEER').length;
    const approved = receiptResults.filter(r => r.status === 'APPROVED').length;
    const delayed = receiptResults.filter(r => (r.days_elapsed ?? 0) >= 3 && r.status === 'PENDING_SITE_ENGINEER').length;
    const totalAmount = receiptResults.reduce((acc, curr) => acc + (curr.amount || 0), 0);
    const withPhoto = receiptResults.filter(r => r.has_photo).length;
    const weighingCount = receiptResults.filter(r => !!r.weighing_group_id).length;

    return { total, pendingSite, approved, delayed, totalAmount, withPhoto, weighingCount };
  }, [receiptResults]);

  const filteredReceipts = useMemo(() => {
    return receiptResults.filter(r => {
      if (receiptFilterQuick === 'PENDING') return r.status === 'PENDING_SITE_ENGINEER';
      if (receiptFilterQuick === 'APPROVED') return r.status === 'APPROVED';
      if (receiptFilterQuick === 'DELAYED') return (r.days_elapsed ?? 0) >= 3 && r.status === 'PENDING_SITE_ENGINEER';
      if (receiptFilterQuick === 'WEIGHING') return !!r.weighing_group_id;
      if (receiptFilterQuick === 'WITH_PHOTO') return !!r.has_photo;
      return true;
    });
  }, [receiptResults, receiptFilterQuick]);

  const handleCopyCode = (code: string) => {
    if (!code) return;
    void navigator.clipboard.writeText(code);
    toast.success(`تم نسخ الكود: ${code}`);
  };

  const fetchSearchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await searchAdminControlApi({
        q: searchQuery.trim() || undefined,
        entity_type: entityTypeFilter !== 'ALL' ? entityTypeFilter : undefined,
        department_id: deptFilter || undefined,
        supplier_id: supplierFilter || undefined,
        status: statusFilter || undefined,
      });

      setResults(res.data || []);
      if (res.lookups) {
        setDepartments(res.lookups.departments || []);
        setSuppliers(res.lookups.suppliers || []);
      }
    } catch (err: any) {
      console.error('[AdminControlCenterPage] Search error:', err);
      setError(err?.response?.data?.message || 'تعذر تحميل بيانات البحث الشامل.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAuditLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await getAdminAuditLogsApi({ per_page: 50 });
      setAuditLogs(res.data || []);
    } catch (err: any) {
      console.error('[AdminControlCenterPage] Failed to load audit logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    fetchSearchData();
  }, [entityTypeFilter, deptFilter, supplierFilter, statusFilter]);

  useEffect(() => {
    if (activeTab === 'AUDIT_LOG') {
      fetchAuditLogs();
    }
  }, [activeTab]);

  // Debounced live search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSearchData();
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Trigger Dry-Run Preview
  const handleOpenPreview = async (entityType: string, entityId: number, action: string, payload: any = {}) => {
    setPreviewLoading(true);
    setPendingAction({ entityType, entityId, action });
    setError(null);

    try {
      const res = await previewImpactApi({
        entity_type: entityType,
        entity_id: entityId,
        action,
        payload,
      });

      setCurrentImpact(res.impact);
      setPreviewModalOpen(true);
    } catch (err: any) {
      console.error('[AdminControlCenterPage] Preview error:', err);
      setError(err?.response?.data?.message || 'تعذر استخراج كشف معاينة الأثر المسبق.');
    } finally {
      setPreviewLoading(false);
    }
  };

  // Execute Action from Preview Modal
  const handleExecutePreviewAction = async (reason: string) => {
    if (!pendingAction) return;

    if (pendingAction.action === 'CANCEL') {
      const res = await cancelDocumentSafelyApi({
        entity_type: pendingAction.entityType,
        entity_id: pendingAction.entityId,
        reason,
      });
      setSuccessAlert(res.message);
      fetchSearchData();
    }
  };

  // Open Reassign Modal for Receipt
  const handleOpenReassignReceipt = (row: AdminControlSearchResult) => {
    setSelectedReceipt({
      id: row.id,
      receipt_number: row.code,
      actual_receiver_name: row.receiver,
      supplier: { company_name: row.supplier },
      purchaseOrder: { po_number: row.title },
      weighing_group_id: row.weighing_group_id,
    });
    setReassignModalOpen(true);
  };

  // Open Transition Modal
  const handleOpenTransition = (row: AdminControlSearchResult, direction: 'ROLLBACK' | 'FORWARD') => {
    setTransitionConfig({
      entityType: row.entity_type,
      entityId: row.id,
      entityLabel: row.code,
      currentStatus: row.status,
      direction,
    });
    setTransitionModalOpen(true);
  };

  return (
    <div className="space-y-6 p-4 md:p-8 max-w-7xl mx-auto print:p-0 print:m-0 print:max-w-none" dir="rtl">
      {/* ── Sovereign Page Header ── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border-2 border-gold-500/40 p-6 md:p-8 shadow-2xl shadow-gold-950/40 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-950/80 border border-gold-500/50 text-2xl shadow-inner text-gold-300">
                🏛️
              </span>
              <div>
                <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-gold-200 via-amber-350 to-gold-400">
                  مركز تحكم دورة المشتريات (Admin Control Center)
                </h1>
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                  الرقابة الإدارية والسيادية الكاملة — إدارة المسارات، تعديل المستلمين، شبكة تقارير Excel، وسجل تدقيق حتمي
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1.5 rounded-xl border border-emerald-500/40 bg-emerald-950/60 text-emerald-300 text-xs font-bold flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>الحماية من الحذف: نشطة 🔒</span>
            </span>
            <span className="px-3 py-1.5 rounded-xl border border-gold-500/40 bg-gold-950/60 text-gold-300 text-xs font-bold font-mono">
              Audit Log Active
            </span>
          </div>
        </div>

        {/* ── Universal Multi-Entity Search Bar ── */}
        <div className="mt-6 pt-6 border-t border-slate-800/80">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            {/* Search Input */}
            <div className="md:col-span-5 relative">
              <span className="absolute right-3.5 top-3 text-slate-400 text-sm">🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث فوري في كل الحقول (PR, PO, REC, صنف, مورد, قطعة أرض)..."
                className="w-full bg-slate-950 border border-slate-700 rounded-2xl pr-10 pl-3 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-gold-500 font-medium"
              />
            </div>

            {/* Entity Type Filter */}
            <div className="md:col-span-2">
              <select
                value={entityTypeFilter}
                onChange={(e) => setEntityTypeFilter(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 rounded-2xl px-3 py-2.5 text-xs focus:outline-none focus:border-gold-500 font-bold"
              >
                <option value="ALL">كل أنواع المستندات</option>
                <option value="PURCHASE_REQUEST">طلبات الشراء (PR)</option>
                <option value="PURCHASE_ORDER">أوامر الشراء (PO)</option>
                <option value="PURCHASE_RECEIPT">أذونات الاستلام (REC)</option>
              </select>
            </div>

            {/* Department Filter */}
            <div className="md:col-span-2">
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 rounded-2xl px-3 py-2.5 text-xs focus:outline-none focus:border-gold-500 font-medium"
              >
                <option value="">كافة الأقسام</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Supplier Filter */}
            <div className="md:col-span-3">
              <select
                value={supplierFilter}
                onChange={(e) => setSupplierFilter(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 rounded-2xl px-3 py-2.5 text-xs focus:outline-none focus:border-gold-500 font-medium"
              >
                <option value="">كافة الموردين</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.company_name || s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ── Success Alert ── */}
      {successAlert && (
        <div className="rounded-2xl border border-emerald-500/60 bg-emerald-950/40 p-4 text-emerald-200 text-xs font-bold flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-2">
            <span>✅</span>
            <span>{successAlert}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessAlert(null)}
            className="text-emerald-400 hover:text-emerald-200"
          >
            ✕
          </button>
        </div>
      )}

      {error && <ErrorMessage error={error} />}

      {/* ── Tabs Navigation Header ── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3 print:hidden">
        <button
          type="button"
          onClick={() => setActiveTab('WORKFLOW')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'WORKFLOW'
              ? 'bg-gradient-to-r from-gold-500 to-amber-600 text-slate-950 font-black shadow-lg shadow-gold-950/50'
              : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-850 border border-slate-800'
          }`}
        >
          <span>📋</span>
          <span>مسار دورة المشتريات (PR & PO)</span>
          <span className="bg-slate-950/60 px-2 py-0.5 rounded-full text-[10px] font-mono">
            {results.length}
          </span>
        </button>

        <button
          type="button"
          data-testid="tab-receipts"
          onClick={() => setActiveTab('RECEIPTS')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'RECEIPTS'
              ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-black shadow-lg shadow-emerald-950/50'
              : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-850 border border-slate-800'
          }`}
        >
          <span>📦</span>
          <span>أذونات الاستلام ومواقع التوريد</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('EXCEL_GRID')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'EXCEL_GRID'
              ? 'bg-gradient-to-r from-cyan-600 to-blue-700 text-white font-black shadow-lg shadow-cyan-950/50'
              : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-850 border border-slate-800'
          }`}
        >
          <span>📊</span>
          <span>التقارير والتحليلات كأنها Excel</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('AUDIT_LOG')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'AUDIT_LOG'
              ? 'bg-gradient-to-r from-rose-600 to-red-700 text-white font-black shadow-lg shadow-rose-950/50'
              : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-850 border border-slate-800'
          }`}
        >
          <span>🛡️</span>
          <span>سجل التدقيق الإداري الحتمي (Audit Log)</span>
        </button>
      </div>

      {/* ── Tab Content ── */}
      {/* ── Tab Content ── */}
      {activeTab === 'WORKFLOW' && (
        <div className="space-y-3">
          <div className="border border-slate-800 bg-slate-900/70 rounded-2xl overflow-hidden backdrop-blur-md">
            {/* Table Action Bar with Column Customizer */}
            <div className="p-3 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-300">📊 معاملات مسار المشتريات ({results.length})</span>
                <span className="text-[11px] text-slate-500 font-medium">· كشف رقابي واتخاذ قرار فوري</span>
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowColMenu(!showColMenu)}
                  className="px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  <span>⚙️ تخصيص الأعمدة</span>
                  <span className="text-[10px]">{showColMenu ? '▲' : '▼'}</span>
                </button>
                {showColMenu && (
                  <div className="absolute left-0 mt-2 w-64 bg-slate-900 border border-slate-700 rounded-2xl p-3 shadow-2xl z-30 space-y-2 text-xs animate-scale-in">
                    <span className="font-black text-gold-300 block border-b border-slate-800 pb-1.5">
                      إظهار / إخفاء أعمدة القرار:
                    </span>
                    {[
                      { key: 'site', label: '📍 موقع المشروع / القطعة' },
                      { key: 'department', label: '🏢 القسم' },
                      { key: 'supplier', label: '🤝 المورد' },
                      { key: 'amount', label: '💰 القيمة الإجمالية' },
                      { key: 'status', label: '🏷️ الحالة الحالية' },
                      { key: 'pendingWith', label: '👤 المسؤول الحالي (Pending With)' },
                      { key: 'fulfillment', label: '🚚 حالة الاستلام والتوريد' },
                      { key: 'elapsed', label: '⏳ عمر المعاملة (SLA)' },
                    ].map((col) => (
                      <label key={col.key} className="flex items-center gap-2 text-slate-300 hover:text-white cursor-pointer select-none py-0.5">
                        <input
                          type="checkbox"
                          checked={visibleCols[col.key as keyof typeof visibleCols]}
                          onChange={(e) => setVisibleCols(prev => ({ ...prev, [col.key]: e.target.checked }))}
                          className="rounded bg-slate-950 border-slate-700 text-gold-500 focus:ring-0"
                        />
                        <span>{col.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center p-12 space-y-3">
                <LoadingSpinner size="lg" />
                <span className="text-xs text-gold-300 font-bold">جاري تحميل مسار المعاملات...</span>
              </div>
            ) : !results.length ? (
              <div className="p-12 text-center text-slate-500 font-medium text-xs">
                لا توجد معاملات مطابقة لمعايير البحث الحالية.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-950/80 text-slate-300 border-b border-slate-800 font-black">
                    <tr>
                      {visibleCols.code && <th className="p-3.5">النوع والكود</th>}
                      {visibleCols.title && <th className="p-3.5">البيان / المبرر</th>}
                      {visibleCols.site && <th className="p-3.5">الموقع / القطعة</th>}
                      {visibleCols.department && <th className="p-3.5">القسم</th>}
                      {visibleCols.supplier && <th className="p-3.5">المورد</th>}
                      {visibleCols.amount && <th className="p-3.5">القيمة الإجمالية</th>}
                      {visibleCols.status && <th className="p-3.5">الحالة الحالية</th>}
                      {visibleCols.pendingWith && <th className="p-3.5">المسؤول الحالي (Pending With)</th>}
                      {visibleCols.fulfillment && <th className="p-3.5">حالة التوريد والاستلام</th>}
                      {visibleCols.elapsed && <th className="p-3.5 text-center">عمر المعاملة (SLA)</th>}
                      <th className="p-3.5 text-center">إجراءات التحكم الآمن</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50 text-slate-300">
                    {results.map((row) => (
                      <tr key={`${row.entity_type}-${row.id}`} className="hover:bg-slate-800/40 transition-colors">
                        {visibleCols.code && (
                          <td className="p-3.5 whitespace-nowrap">
                            <span className="font-mono font-black text-cyan-300 bg-cyan-950/60 border border-cyan-800/40 px-2 py-0.5 rounded-md">
                              {row.code}
                            </span>
                          </td>
                        )}

                        {visibleCols.title && (
                          <td className="p-3.5 max-w-xs truncate font-medium text-slate-200">
                            {row.title}
                          </td>
                        )}

                        {visibleCols.site && (
                          <td className="p-3.5 whitespace-nowrap">
                            <span className="bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800 text-[11px] text-cyan-200 font-bold inline-flex items-center gap-1">
                              <span>📍</span>
                              <span>{row.project_site || '—'}</span>
                            </span>
                          </td>
                        )}

                        {visibleCols.department && (
                          <td className="p-3.5 whitespace-nowrap text-slate-400">
                            {row.department || '—'}
                          </td>
                        )}

                        {visibleCols.supplier && (
                          <td className="p-3.5 whitespace-nowrap font-medium text-amber-300">
                            {row.supplier || '—'}
                          </td>
                        )}

                        {visibleCols.amount && (
                          <td className="p-3.5 whitespace-nowrap font-mono font-bold text-emerald-400">
                            {row.amount ? `${formatCleanNumber(row.amount, 2)} ج.م` : '—'}
                          </td>
                        )}

                        {visibleCols.status && (
                          <td className="p-3.5 whitespace-nowrap">
                            {(() => {
                              const badge = getWorkflowStatusBadge(row.status);
                              return (
                                <span
                                  className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1.5 ${badge.bgClass} ${badge.borderClass} ${badge.textClass}`}
                                >
                                  {badge.icon && <span>{badge.icon}</span>}
                                  <span>{badge.label}</span>
                                </span>
                              );
                            })()}
                          </td>
                        )}

                        {visibleCols.pendingWith && (
                          <td className="p-3.5 whitespace-nowrap">
                            <span className="px-2.5 py-1 rounded-lg border border-amber-800/40 bg-amber-950/40 text-amber-200 text-[11px] font-bold inline-flex items-center gap-1.5 shadow-sm">
                              <span>👤</span>
                              <span>{row.pending_with || '—'}</span>
                            </span>
                          </td>
                        )}

                        {visibleCols.fulfillment && (
                          <td className="p-3.5 whitespace-nowrap">
                            {(() => {
                              const f = row.fulfillment_status || '—';
                              const isComplete = f.includes('تام') || f.includes('مستلم');
                              const isPartial = f.includes('جزئي') || f.includes('فحص');
                              return (
                                <span
                                  className={`px-2 py-0.5 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1.5 ${
                                    isComplete
                                      ? 'bg-emerald-950/60 border-emerald-600/50 text-emerald-300'
                                      : isPartial
                                      ? 'bg-amber-950/60 border-amber-600/50 text-amber-300'
                                      : 'bg-slate-950 border-slate-700 text-slate-400'
                                  }`}
                                >
                                  <span>{isComplete ? '🚚' : isPartial ? '📦' : '⏳'}</span>
                                  <span>{f}</span>
                                </span>
                              );
                            })()}
                          </td>
                        )}

                        {visibleCols.elapsed && (
                          <td className="p-3.5 whitespace-nowrap text-center">
                            {(() => {
                              const days = row.days_elapsed ?? 0;
                              const isDelayed = days >= 5;
                              return (
                                <div className="flex flex-col items-center">
                                  <span
                                    className={`font-mono font-bold text-[11px] px-2.5 py-0.5 rounded-md border ${
                                      isDelayed
                                        ? 'bg-rose-950/70 border-rose-600/60 text-rose-300 animate-pulse'
                                        : days > 2
                                        ? 'bg-amber-950/50 border-amber-700/50 text-amber-300'
                                        : 'bg-slate-950 border-slate-800 text-slate-400'
                                    }`}
                                  >
                                    {days === 0 ? 'اليوم' : `منذ ${days} ${days === 1 ? 'يوم' : days === 2 ? 'يومين' : 'أيام'}`}
                                  </span>
                                  {isDelayed && (
                                    <span className="text-[10px] text-rose-400 font-bold mt-0.5">⚠️ متأخر</span>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                        )}

                        <td className="p-3.5 whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Rollback Button */}
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => handleOpenTransition(row, 'ROLLBACK')}
                              title="إرجاع الطلب إلى مرحلة سابقة"
                              className="px-2 py-1 text-[11px] font-bold"
                            >
                              ↩️ إرجاع
                            </Button>

                            {/* Forward Button */}
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => handleOpenTransition(row, 'FORWARD')}
                              title="تقديم وتصعيد المسار"
                              className="px-2 py-1 text-[11px] font-bold"
                            >
                              ⏩ تقديم
                            </Button>

                            {/* Safe Cancel Button */}
                            <Button
                              type="button"
                              variant="danger"
                              size="sm"
                              onClick={() => handleOpenPreview(row.entity_type, row.id, 'CANCEL')}
                              title="إلغاء آمن دون حذف البيانات"
                              className="px-2 py-1 text-[11px] font-black bg-rose-600/80 hover:bg-rose-500"
                            >
                              ⛔ إلغاء
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Receipts Management Tab ── */}
      {activeTab === 'RECEIPTS' && (
        <div data-testid="receipts-tab-content" className="space-y-4">
          {/* Receipts Top KPI Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 shadow-sm backdrop-blur-md">
              <span className="text-[11px] text-slate-400 font-bold block">إجمالي أذونات الاستلام</span>
              <div className="text-lg font-black font-mono text-cyan-300 mt-1 flex items-baseline gap-1.5">
                <span>{receiptMetrics.total}</span>
                <span className="text-[10px] text-slate-500 font-normal">إذن مسجل</span>
              </div>
            </div>

            <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-3 shadow-sm backdrop-blur-md">
              <span className="text-[11px] text-amber-300 font-bold block">⌛ بانتظار فحص الموقع</span>
              <div className="text-lg font-black font-mono text-amber-400 mt-1 flex items-baseline gap-1.5">
                <span>{receiptMetrics.pendingSite}</span>
                <span className="text-[10px] text-amber-300/70 font-normal">إذن معلق</span>
              </div>
            </div>

            <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/20 p-3 shadow-sm backdrop-blur-md">
              <span className="text-[11px] text-emerald-300 font-bold block">✔️ معتمد ومطابق بالموقع</span>
              <div className="text-lg font-black font-mono text-emerald-400 mt-1 flex items-baseline gap-1.5">
                <span>{receiptMetrics.approved}</span>
                <span className="text-[10px] text-emerald-300/70 font-normal">إذن مستلم</span>
              </div>
            </div>

            <div className="rounded-xl border border-rose-800/40 bg-rose-950/20 p-3 shadow-sm backdrop-blur-md">
              <span className="text-[11px] text-rose-300 font-bold block">⚠️ أذونات متأخرة (&gt; يومين)</span>
              <div className="text-lg font-black font-mono text-rose-400 mt-1 flex items-baseline gap-1.5">
                <span>{receiptMetrics.delayed}</span>
                <span className="text-[10px] text-rose-300/70 font-normal">تحتاج متابعة</span>
              </div>
            </div>

            <div className="rounded-xl border border-cyan-800/40 bg-cyan-950/20 p-3 shadow-sm backdrop-blur-md">
              <span className="text-[11px] text-cyan-300 font-bold block">🔒 وزنات بسكول مجمعة</span>
              <div className="text-lg font-black font-mono text-cyan-400 mt-1 flex items-baseline gap-1.5">
                <span>{receiptMetrics.weighingCount}</span>
                <span className="text-[10px] text-cyan-300/70 font-normal">شحنة حديد</span>
              </div>
            </div>

            <div className="rounded-xl border border-emerald-700/40 bg-slate-900/90 p-3 shadow-sm backdrop-blur-md">
              <span className="text-[11px] text-emerald-300 font-bold block">💰 إجمالي القيمة المستلمة</span>
              <div className="text-sm font-black font-mono text-emerald-400 mt-1 truncate">
                {formatCleanNumber(receiptMetrics.totalAmount)} <span className="text-[10px]">ج.م</span>
              </div>
            </div>
          </div>

          <div className="border border-slate-800 bg-slate-900/70 rounded-2xl overflow-hidden backdrop-blur-md">
            {/* Header with Title and Customization */}
            <div className="p-4 border-b border-slate-800 bg-slate-950/70 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-emerald-300 flex items-center gap-2">
                  <span>📦 أذونات الاستلام ومواقع التوريد الميدانية الشاملة</span>
                  <span className="text-xs bg-emerald-950 border border-emerald-700/50 text-emerald-300 px-2 py-0.5 rounded-full font-mono">
                    {filteredReceipts.length} إذن
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  لوحة مراقبة واتخاذ القرار الميداني: ربط الإذن بأمر وطلب الشراء، القطعة والمنطقة، الأصناف المستلمة، التكلفة، والحالة المحاسبية.
                </p>
              </div>

              {/* Action Controls & Column Customizer */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Column Customizer Dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowReceiptColMenu(!showReceiptColMenu)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-xs font-bold text-slate-200 transition-colors shadow-sm"
                  >
                    <span>⚙️ تخصيص الأعمدة</span>
                    <span className="text-[10px] bg-slate-900 px-1.5 py-0.2 rounded text-cyan-300 font-mono">
                      {Object.values(receiptCols).filter(Boolean).length}/11
                    </span>
                    <span className="text-[10px]">▼</span>
                  </button>

                  {showReceiptColMenu && (
                    <div
                      className="absolute left-0 mt-2 w-64 rounded-2xl border border-slate-700 bg-slate-900/95 p-3 shadow-2xl backdrop-blur-xl z-50 text-xs space-y-2 animate-scale-in"
                      dir="rtl"
                    >
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <span className="font-black text-slate-200">الأعمدة المعروضة:</span>
                        <div className="flex gap-2 text-[10px]">
                          <button
                            type="button"
                            onClick={() =>
                              setReceiptCols({
                                code: true,
                                poPr: true,
                                location: true,
                                supplierDept: true,
                                items: true,
                                amount: true,
                                receiver: true,
                                proof: true,
                                status: true,
                                accounting: true,
                                elapsed: true,
                              })
                            }
                            className="text-cyan-400 hover:underline"
                          >
                            إظهار الكل
                          </button>
                        </div>
                      </div>

                      <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                        {[
                          { key: 'code', label: 'رقم الإذن والنوع' },
                          { key: 'poPr', label: 'أمر وطلب الشراء المرتبط' },
                          { key: 'location', label: 'الموقع والقطعة والمنطقة' },
                          { key: 'supplierDept', label: 'المورد والقسم' },
                          { key: 'items', label: 'الأصناف والكميات' },
                          { key: 'amount', label: 'القيمة المالية' },
                          { key: 'receiver', label: 'المستلم الميداني' },
                          { key: 'proof', label: 'إثبات الاستلام / الصورة' },
                          { key: 'status', label: 'حالة الاستلام بالموقع' },
                          { key: 'accounting', label: 'الحالة المحاسبية والفوترة' },
                          { key: 'elapsed', label: 'تاريخ الاستلام وعمر الإذن' },
                        ].map((col) => (
                          <label
                            key={col.key}
                            className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-slate-800/60"
                          >
                            <input
                              type="checkbox"
                              checked={receiptCols[col.key as keyof typeof receiptCols]}
                              onChange={(e) =>
                                setReceiptCols({ ...receiptCols, [col.key]: e.target.checked })
                              }
                              className="rounded border-slate-700 bg-slate-800 text-cyan-500 focus:ring-0"
                            />
                            <span className="text-slate-300 font-medium">{col.label}</span>
                          </label>
                        ))}
                      </div>

                      <div className="pt-2 border-t border-slate-800 flex justify-end">
                        <button
                          type="button"
                          onClick={() => setShowReceiptColMenu(false)}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 text-[11px] font-bold text-slate-300 hover:text-white"
                        >
                          تم
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Filter Tabs */}
            <div className="bg-slate-950/40 border-b border-slate-800 px-4 py-2.5 flex items-center gap-1.5 overflow-x-auto text-xs">
              <span className="text-slate-400 font-bold ml-2 shrink-0">تصفية سريعة:</span>
              {[
                { id: 'ALL', label: `الكل (${receiptMetrics.total})` },
                { id: 'PENDING', label: `⌛ بانتظار الموقع (${receiptMetrics.pendingSite})` },
                { id: 'APPROVED', label: `✔️ معتمد ومطابق (${receiptMetrics.approved})` },
                { id: 'DELAYED', label: `⚠️ متأخر (> يومين) (${receiptMetrics.delayed})` },
                { id: 'WEIGHING', label: `🔒 بسكول (${receiptMetrics.weighingCount})` },
                { id: 'WITH_PHOTO', label: `📷 به صورة (${receiptMetrics.withPhoto})` },
              ].map((btn) => (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => setReceiptFilterQuick(btn.id as any)}
                  className={`px-3 py-1 rounded-lg font-bold transition-all shrink-0 ${
                    receiptFilterQuick === btn.id
                      ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-950/50'
                      : 'bg-slate-800/60 text-slate-300 hover:bg-slate-800 border border-slate-700/60'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-950/80 text-slate-300 border-b border-slate-800 font-black">
                  <tr>
                    {receiptCols.code && <th className="p-3.5 whitespace-nowrap">رقم الإذن REC والنوع</th>}
                    {receiptCols.poPr && <th className="p-3.5 whitespace-nowrap">أمر وطلب الشراء</th>}
                    {receiptCols.location && <th className="p-3.5 whitespace-nowrap">الموقع والقطعة والمنطقة</th>}
                    {receiptCols.supplierDept && <th className="p-3.5 whitespace-nowrap">المورد والقسم</th>}
                    {receiptCols.items && <th className="p-3.5 whitespace-nowrap">الأصناف والكميات المستلمة</th>}
                    {receiptCols.amount && <th className="p-3.5 whitespace-nowrap text-left">القيمة المالية</th>}
                    {receiptCols.receiver && <th className="p-3.5 whitespace-nowrap">المستلم الميداني</th>}
                    {receiptCols.proof && <th className="p-3.5 whitespace-nowrap text-center">إثبات الاستلام</th>}
                    {receiptCols.status && <th className="p-3.5 whitespace-nowrap">حالة الاستلام بالموقع</th>}
                    {receiptCols.accounting && <th className="p-3.5 whitespace-nowrap">الحالة المحاسبية</th>}
                    {receiptCols.elapsed && <th className="p-3.5 whitespace-nowrap text-center">تاريخ وعمر الإذن</th>}
                    <th className="p-3.5 whitespace-nowrap text-center">إجراءات اتخاذ القرار</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50 text-slate-300">
                  {filteredReceipts.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="p-8 text-center text-slate-400 font-medium">
                        لا توجد أذونات استلام تطابق خيارات التصفية الحالية.
                      </td>
                    </tr>
                  ) : (
                    filteredReceipts.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-800/40 transition-colors">
                        {/* 1. REC Code & Type */}
                        {receiptCols.code && (
                          <td className="p-3.5 whitespace-nowrap">
                            <div className="flex flex-col gap-1 items-start">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-black text-cyan-300 bg-cyan-950/70 border border-cyan-800/50 px-2 py-0.5 rounded-md text-xs shadow-inner">
                                  {row.code}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyCode(row.code)}
                                  title="نسخ رقم الإذن"
                                  className="text-slate-400 hover:text-cyan-300 text-[11px]"
                                >
                                  📋
                                </button>
                              </div>
                              {row.weighing_group_id ? (
                                <span className="px-1.5 py-0.5 rounded border border-cyan-500/50 bg-cyan-950/80 text-cyan-300 text-[10px] font-black inline-flex items-center gap-1">
                                  <span>🔒</span>
                                  <span>بسكول مجمع</span>
                                </span>
                              ) : (
                                <span className="text-slate-500 text-[10px]">توريد مباشر</span>
                              )}
                            </div>
                          </td>
                        )}

                        {/* 2. PO & PR Linked */}
                        {receiptCols.poPr && (
                          <td className="p-3.5 whitespace-nowrap">
                            <div className="flex flex-col gap-1 text-[11px]">
                              {row.po_number ? (
                                <div className="flex items-center gap-1">
                                  <a
                                    href={`/procurement/orders/${row.po_id || ''}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    title="فتح أمر الشراء"
                                    className="font-mono font-bold text-purple-300 bg-purple-950/60 border border-purple-800/40 px-1.5 py-0.5 rounded hover:bg-purple-900/60 hover:text-purple-100 transition-colors inline-flex items-center gap-1"
                                  >
                                    <span>📑</span>
                                    <span>{row.po_number}</span>
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyCode(row.po_number!)}
                                    title="نسخ رقم أمر الشراء"
                                    className="text-slate-500 hover:text-purple-300 text-[10px]"
                                  >
                                    📋
                                  </button>
                                </div>
                              ) : (
                                <span className="text-slate-500 font-mono text-[10px]">بلا أمر شراء</span>
                              )}

                              {row.pr_number && (
                                <span className="text-slate-400 font-mono text-[10px]">
                                  طلب: {row.pr_number}
                                </span>
                              )}

                              {row.requester_name && row.requester_name !== '—' && (
                                <span className="text-[10px] text-slate-400 truncate max-w-[130px]" title={row.requester_name}>
                                  👤 {row.requester_name}
                                </span>
                              )}
                            </div>
                          </td>
                        )}

                        {/* 3. Location, Plot & Region */}
                        {receiptCols.location && (
                          <td className="p-3.5 whitespace-nowrap">
                            <div className="flex flex-col gap-1 items-start">
                              <span className="bg-slate-950/90 px-2 py-0.5 rounded-md border border-slate-800 text-[11px] text-cyan-200 font-bold inline-flex items-center gap-1">
                                <span>📍</span>
                                <span>{row.project_site || '—'}</span>
                              </span>
                              {(row.parcel_reference || row.region) && (
                                <div className="flex items-center gap-1 text-[10px] text-slate-400">
                                  {row.parcel_reference && (
                                    <span className="bg-slate-900 px-1.5 py-0.2 rounded border border-slate-700 font-mono text-amber-300 font-bold">
                                      قطعة {row.parcel_reference}
                                    </span>
                                  )}
                                  {row.region && (
                                    <span className="bg-slate-900 px-1.5 py-0.2 rounded border border-slate-700 text-slate-300">
                                      {row.region}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        )}

                        {/* 4. Supplier & Department */}
                        {receiptCols.supplierDept && (
                          <td className="p-3.5 whitespace-nowrap">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-bold text-amber-300 text-xs">
                                {row.supplier || '—'}
                              </span>
                              <span className="text-[11px] text-slate-400">
                                {row.department || '—'}
                              </span>
                            </div>
                          </td>
                        )}

                        {/* 5. Items & Quantities */}
                        {receiptCols.items && (
                          <td className="p-3.5 whitespace-nowrap max-w-xs">
                            <div className="flex flex-col gap-1 items-start">
                              <span className="font-bold text-slate-100 text-[11px] truncate max-w-[200px]" title={row.items_summary || undefined}>
                                {row.items_summary || '—'}
                              </span>
                              <div className="flex items-center gap-1.5">
                                {row.items_count !== undefined && row.items_count > 0 && (
                                  <span className="text-[10px] text-cyan-300 font-bold bg-cyan-950/80 border border-cyan-800/40 px-1.5 py-0.2 rounded">
                                    {row.items_count} {row.items_count === 1 ? 'بند' : 'بنود'}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setPreviewReceiptItem(row)}
                                  className="text-[10px] text-amber-300 hover:text-amber-200 underline font-bold cursor-pointer"
                                >
                                  👁️ معاينة البنود
                                </button>
                              </div>
                            </div>
                          </td>
                        )}

                        {/* 6. Financial Amount */}
                        {receiptCols.amount && (
                          <td className="p-3.5 whitespace-nowrap text-left">
                            <div className="font-mono font-black text-emerald-400 text-xs">
                              {formatCleanNumber(row.amount || 0)} <span className="text-[10px]">ج.م</span>
                            </div>
                          </td>
                        )}

                        {/* 7. Receiver Engineer */}
                        {receiptCols.receiver && (
                          <td className="p-3.5 whitespace-nowrap">
                            <div className="font-bold text-slate-200 text-xs flex items-center gap-1">
                              <span>👷</span>
                              <span>{row.receiver || 'غير محدد'}</span>
                            </div>
                          </td>
                        )}

                        {/* 8. Delivery Proof Photo */}
                        {receiptCols.proof && (
                          <td className="p-3.5 whitespace-nowrap text-center">
                            {row.has_photo && row.photo_url ? (
                              <button
                                type="button"
                                onClick={() => setLightboxPhotoUrl(row.photo_url!)}
                                className="px-2 py-1 rounded-lg border border-emerald-600/50 bg-emerald-950/70 hover:bg-emerald-900/80 text-emerald-300 font-bold text-[11px] inline-flex items-center gap-1 shadow-sm transition-all"
                                title="معاينة محضر الاستلام أو بون ميزان البسكول المرفوع من الموقع"
                              >
                                <span>📷</span>
                                <span>معاينة الإيصال</span>
                              </button>
                            ) : (
                              <span className="px-2 py-0.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-500 text-[10px] font-bold">
                                ⚠️ بلا صورة
                              </span>
                            )}
                          </td>
                        )}

                        {/* 9. Site Receipt Status */}
                        {receiptCols.status && (
                          <td className="p-3.5 whitespace-nowrap">
                            {(() => {
                              const badge = getWorkflowStatusBadge(row.status);
                              return (
                                <span
                                  className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1.5 ${badge.bgClass} ${badge.borderClass} ${badge.textClass}`}
                                >
                                  {badge.icon && <span>{badge.icon}</span>}
                                  <span>{badge.label}</span>
                                </span>
                              );
                            })()}
                          </td>
                        )}

                        {/* 10. Accounting & Invoicing Status */}
                        {receiptCols.accounting && (
                          <td className="p-3.5 whitespace-nowrap">
                            {(() => {
                              const st = row.invoice_status || 'PENDING_INVOICE';
                              const label = row.invoice_status_label || (st === 'RECORDED' ? 'مسقط بالحسابات' : 'بانتظار الفاتورة');
                              const isRecorded = st === 'RECORDED' || st === 'VERIFIED';
                              const isInvoiced = st === 'INVOICED';

                              return (
                                <span
                                  className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold inline-flex items-center gap-1 ${
                                    isRecorded
                                      ? 'bg-emerald-950/70 border-emerald-600/60 text-emerald-300'
                                      : isInvoiced
                                      ? 'bg-cyan-950/70 border-cyan-600/60 text-cyan-300'
                                      : 'bg-amber-950/60 border-amber-800/40 text-amber-300'
                                  }`}
                                >
                                  <span>{isRecorded ? '✔️' : isInvoiced ? '📄' : '⏳'}</span>
                                  <span>{label}</span>
                                </span>
                              );
                            })()}
                          </td>
                        )}

                        {/* 11. Date & Elapsed Aging */}
                        {receiptCols.elapsed && (
                          <td className="p-3.5 whitespace-nowrap text-center">
                            {(() => {
                              const days = row.days_elapsed ?? 0;
                              const isDelayed = days >= 3 && row.status === 'PENDING_SITE_ENGINEER';
                              return (
                                <div className="flex flex-col items-center gap-0.5">
                                  <span
                                    className={`font-mono font-bold text-[11px] px-2 py-0.5 rounded-md border ${
                                      isDelayed
                                        ? 'bg-rose-950/70 border-rose-600/60 text-rose-300 animate-pulse'
                                        : 'bg-slate-950 border-slate-800 text-slate-300'
                                    }`}
                                  >
                                    {days === 0 ? 'اليوم' : `منذ ${days} ${days === 1 ? 'يوم' : days === 2 ? 'يومين' : 'أيام'}`}
                                  </span>
                                  <span className="text-[10px] text-slate-500 font-mono">
                                    {row.received_at || row.date?.slice(0, 10)}
                                  </span>
                                </div>
                              );
                            })()}
                          </td>
                        )}

                        {/* 12. Decision Actions */}
                        <td className="p-3.5 whitespace-nowrap text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Reassign Receiver Button */}
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => handleOpenReassignReceipt(row)}
                              title="تغيير المهندس الميداني المستلم للإذن"
                              className="font-bold text-xs bg-emerald-950/60 border-emerald-500/60 text-emerald-300 hover:bg-emerald-900/80"
                            >
                              👷 تغيير المستلم
                            </Button>

                            {/* Quick Details / Inspect Modal Button */}
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => setPreviewReceiptItem(row)}
                              title="فحص ومعاينة بنود وكميات الإذن"
                              className="font-bold text-xs bg-cyan-950/60 border-cyan-600/50 text-cyan-300 hover:bg-cyan-900/70"
                            >
                              👁️ فحص البنود
                            </Button>

                            {/* View PO Link */}
                            {row.po_id && (
                              <a
                                href={`/procurement/orders/${row.po_id}`}
                                target="_blank"
                                rel="noreferrer"
                                title="عرض أمر الشراء المرتبط"
                              >
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  className="font-bold text-xs bg-purple-950/60 border-purple-600/50 text-purple-300 hover:bg-purple-900/70 px-2"
                                >
                                  📑
                                </Button>
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Quick Receipt Inspection & Details Modal ── */}
      {previewReceiptItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md">
          <div
            className="flex min-h-0 max-h-[calc(100dvh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border-2 border-cyan-500/50 bg-slate-900 shadow-2xl shadow-cyan-950/50 animate-fade-in text-xs text-slate-200"
            dir="rtl"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-cyan-500/30 bg-gradient-to-r from-slate-900 via-cyan-950/40 to-slate-900 px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-400/40 bg-cyan-500/10 text-lg">
                  📦
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black text-cyan-300">
                      معاينة وبيانات إذن الاستلام التفصيلي
                    </h3>
                    <span className="rounded-md border border-cyan-500/30 bg-cyan-500/20 px-2 py-0.5 text-xs font-mono font-bold text-cyan-200">
                      {previewReceiptItem.code}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    مراجعة البنود والكميات المستلمة وإثبات التوريد الميداني
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewReceiptItem(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Receipt Header Info Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">المورد:</span>
                  <span className="font-bold text-amber-300 truncate block mt-0.5">
                    {previewReceiptItem.supplier || '—'}
                  </span>
                </div>
                <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">الموقع والقطعة:</span>
                  <span className="font-bold text-cyan-200 truncate block mt-0.5">
                    {previewReceiptItem.project_site || '—'}
                  </span>
                </div>
                <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">أمر الشراء المرتبط:</span>
                  <span className="font-mono font-bold text-purple-300 truncate block mt-0.5">
                    {previewReceiptItem.po_number || 'بلا أمر شراء'}
                  </span>
                </div>
                <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">المستلم الميداني:</span>
                  <span className="font-bold text-slate-100 truncate block mt-0.5">
                    👷 {previewReceiptItem.receiver || 'غير محدد'}
                  </span>
                </div>
              </div>

              {/* Items Table */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden">
                <div className="p-3 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
                  <span className="font-bold text-slate-200">
                    📋 أصناف وبنود الاستلام ({previewReceiptItem.items_list?.length || previewReceiptItem.items_count || 0} بنود):
                  </span>
                  <div className="text-emerald-400 font-mono font-bold">
                    إجمالي القيمة: {formatCleanNumber(previewReceiptItem.amount || 0)} ج.م
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="p-2.5">#</th>
                        <th className="p-2.5">توصيف الصنف</th>
                        <th className="p-2.5">القطعة / المنطقة</th>
                        <th className="p-2.5 text-center">الكمية المطلوبة</th>
                        <th className="p-2.5 text-center">الكمية المستلمة</th>
                        <th className="p-2.5 text-center">الوحدة</th>
                        <th className="p-2.5 text-left">سعر الوحدة</th>
                        <th className="p-2.5 text-left">الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40 text-slate-300">
                      {previewReceiptItem.items_list && previewReceiptItem.items_list.length > 0 ? (
                        previewReceiptItem.items_list.map((it, idx) => (
                          <tr key={it.id || idx} className="hover:bg-slate-800/30">
                            <td className="p-2.5 text-slate-500 font-mono">{idx + 1}</td>
                            <td className="p-2.5 font-bold text-slate-100">{it.item_description}</td>
                            <td className="p-2.5 text-slate-400">
                              {it.item_reference ? `قطعة ${it.item_reference}` : '—'}
                              {it.region ? ` (${it.region})` : ''}
                            </td>
                            <td className="p-2.5 text-center font-mono text-slate-400">
                              {formatCleanNumber(it.ordered_quantity)}
                            </td>
                            <td className="p-2.5 text-center font-mono font-black text-cyan-300">
                              {formatCleanNumber(it.received_quantity)}
                            </td>
                            <td className="p-2.5 text-center text-slate-300">{it.uom}</td>
                            <td className="p-2.5 text-left font-mono text-slate-300">
                              {formatCleanNumber(it.unit_price || 0)} ج.م
                            </td>
                            <td className="p-2.5 text-left font-mono font-bold text-emerald-400">
                              {formatCleanNumber(it.line_total || 0)} ج.م
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={8} className="p-4 text-center text-slate-400">
                            {previewReceiptItem.items_summary || 'لا توجد بنود مسجلة لهذا الإذن.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Photo & Proof Section */}
              {previewReceiptItem.has_photo && previewReceiptItem.photo_url ? (
                <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/20 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-300 flex items-center gap-1.5">
                      <span>📷</span>
                      <span>إثبات التوريد / صورة محضر الاستلام أو بون ميزان البسكول:</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setLightboxPhotoUrl(previewReceiptItem.photo_url!)}
                      className="text-cyan-400 hover:text-cyan-300 font-bold underline text-xs"
                    >
                      تكبير بملء الشاشة 🔍
                    </button>
                  </div>
                  <div className="flex justify-center bg-slate-950/80 rounded-xl p-2 border border-slate-800 max-h-60 overflow-hidden cursor-pointer" onClick={() => setLightboxPhotoUrl(previewReceiptItem.photo_url!)}>
                    <img
                      src={previewReceiptItem.photo_url}
                      alt="إثبات الاستلام"
                      className="max-h-56 object-contain rounded-lg hover:scale-105 transition-transform"
                    />
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-slate-500 text-center">
                  ⚠️ لم يتم رفع صورة إيصال أو بون ميزان لهذا الإذن حتى الآن.
                </div>
              )}

              {/* Notes */}
              {(previewReceiptItem.site_engineer_notes || previewReceiptItem.warehouse_notes) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {previewReceiptItem.site_engineer_notes && (
                    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                      <span className="text-[10px] text-amber-400 font-bold block mb-0.5">ملاحظات مهندس الموقع:</span>
                      <p className="text-slate-300">{previewReceiptItem.site_engineer_notes}</p>
                    </div>
                  )}
                  {previewReceiptItem.warehouse_notes && (
                    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                      <span className="text-[10px] text-cyan-400 font-bold block mb-0.5">ملاحظات أمين المخزن:</span>
                      <p className="text-slate-300">{previewReceiptItem.warehouse_notes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-slate-800 bg-slate-950 px-5 py-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setPreviewReceiptItem(null)}
              >
                إغلاق المعاينة
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const row = previewReceiptItem;
                    setPreviewReceiptItem(null);
                    handleOpenReassignReceipt(row);
                  }}
                  className="font-bold text-xs bg-emerald-950/60 border-emerald-500/60 text-emerald-300"
                >
                  👷 تغيير المستلم
                </Button>

                {previewReceiptItem.po_id && (
                  <a
                    href={`/procurement/orders/${previewReceiptItem.po_id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Button
                      type="button"
                      variant="warning"
                      size="sm"
                      className="font-bold text-xs"
                    >
                      📑 فتح أمر الشراء
                    </Button>
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Photo Lightbox Modal ── */}
      {lightboxPhotoUrl && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-lg animate-fade-in"
          onClick={() => setLightboxPhotoUrl(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setLightboxPhotoUrl(null)}
              className="absolute -top-10 left-0 bg-slate-800/80 hover:bg-slate-700 text-white rounded-full p-2 text-sm font-bold z-10 transition-colors"
            >
              ✕ إغلاق
            </button>
            <img
              src={lightboxPhotoUrl}
              alt="صورة إثبات الاستلام"
              className="max-h-[80vh] w-auto object-contain rounded-2xl shadow-2xl border-2 border-slate-700"
            />
            <div className="mt-3 flex items-center gap-3">
              <a
                href={lightboxPhotoUrl}
                target="_blank"
                rel="noreferrer"
                download
                className="px-4 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition-colors shadow-md"
              >
                ⬇️ تنزيل الصورة
              </a>
              <button
                type="button"
                onClick={() => setLightboxPhotoUrl(null)}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Excel Grid Tab ── */}
      {activeTab === 'EXCEL_GRID' && <AdminExcelGrid />}

      {/* ── Immutable Audit Log Tab ── */}
      {activeTab === 'AUDIT_LOG' && (
        <div className="space-y-3">
          <div className="border border-slate-800 bg-slate-900/70 rounded-2xl overflow-hidden backdrop-blur-md p-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div>
                <h3 className="text-sm font-black text-rose-300 flex items-center gap-2">
                  <span>🛡️ سجل الرقابة والتدقيق غير القابل للتعديل (Immutable Admin Audit Log)</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  توثيق حتمي لكل عملية يقوم بها مدير النظام مع تسجيل عنوان IP والبيانات القديمة والجديدة
                </p>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={fetchAuditLogs} isLoading={loadingLogs}>
                🔄 تحديث السجل
              </Button>
            </div>

            {loadingLogs ? (
              <div className="flex justify-center p-10">
                <LoadingSpinner size="lg" />
              </div>
            ) : !auditLogs.length ? (
              <div className="p-10 text-center text-slate-500 text-xs">لا توجد حركات مسجلة حالياً.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-950/80 text-slate-300 border-b border-slate-800 font-black">
                    <tr>
                      <th className="p-3">#</th>
                      <th className="p-3">المستخدم المنفذ</th>
                      <th className="p-3">نوع الإجراء</th>
                      <th className="p-3">المستند</th>
                      <th className="p-3">سبب التدخل الإداري</th>
                      <th className="p-3">عنوان IP</th>
                      <th className="p-3">التاريخ والوقت</th>
                      <th className="p-3 text-center">التفاصيل</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40 text-slate-300">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="p-3 font-mono text-slate-500">{log.id}</td>
                        <td className="p-3 font-bold text-gold-300">{log.actor_name}</td>
                        <td className="p-3 font-mono font-bold text-cyan-300">{log.action}</td>
                        <td className="p-3 font-mono font-bold text-slate-200">{log.entity_label}</td>
                        <td className="p-3 max-w-sm truncate text-slate-300 font-medium">{log.reason}</td>
                        <td className="p-3 font-mono text-slate-400 text-[11px]">{log.ip_address || '—'}</td>
                        <td className="p-3 font-mono text-slate-400 text-[11px]">
                          {new Date(log.created_at).toLocaleString('ar-EG')}
                        </td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => setSelectedAuditLog(log)}
                            className="text-gold-400 hover:text-gold-200 text-xs font-bold underline"
                          >
                            عرض الفروقات
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Dry-Run Impact Preview Modal ── */}
      <AdminImpactPreviewModal
        isOpen={previewModalOpen}
        onClose={() => setPreviewModalOpen(false)}
        impact={currentImpact}
        loading={previewLoading}
        onConfirm={handleExecutePreviewAction}
        actionTitle="تأكيد إلغاء المعاملة الآمن"
      />

      {/* ── Reassign Receipt Modal ── */}
      <AdminReassignReceiptModal
        receipt={selectedReceipt}
        isOpen={reassignModalOpen}
        onClose={() => setReassignModalOpen(false)}
        onSuccess={(_, msg) => {
          setSuccessAlert(msg);
          fetchSearchData();
        }}
      />

      {/* ── Transition Modal (Rollback / Forward) ── */}
      {transitionConfig && (
        <AdminWorkflowTransitionModal
          isOpen={transitionModalOpen}
          onClose={() => setTransitionModalOpen(false)}
          entityType={transitionConfig.entityType}
          entityId={transitionConfig.entityId}
          entityLabel={transitionConfig.entityLabel}
          currentStatus={transitionConfig.currentStatus}
          direction={transitionConfig.direction}
          allowedTransitions={transitionConfig.allowedTransitions}
          onSuccess={(msg) => {
            setSuccessAlert(msg);
            fetchSearchData();
          }}
        />
      )}

      {/* ── Audit Log JSON Diff Modal ── */}
      {selectedAuditLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-2xl w-full p-6 space-y-4 animate-scale-in text-xs text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h4 className="text-sm font-black text-gold-300">
                🔍 تفاصيل وبيانات الحركة الإدارية #{selectedAuditLog.id}
              </h4>
              <button
                type="button"
                onClick={() => setSelectedAuditLog(null)}
                className="text-slate-400 hover:text-slate-200 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 max-h-[450px] overflow-y-auto">
              <div>
                <span className="font-bold text-slate-400 block mb-1">السبب المسجل:</span>
                <p className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-slate-200 font-medium">
                  {selectedAuditLog.reason}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="font-bold text-rose-400 block mb-1">القيم قبل الإجراء (Old Values):</span>
                  <pre className="bg-slate-950 p-3 rounded-xl border border-rose-900/40 text-[11px] font-mono text-rose-300 overflow-x-auto">
                    {JSON.stringify(selectedAuditLog.old_values, null, 2) || 'null'}
                  </pre>
                </div>
                <div>
                  <span className="font-bold text-emerald-400 block mb-1">القيم بعد الإجراء (New Values):</span>
                  <pre className="bg-slate-950 p-3 rounded-xl border border-emerald-900/40 text-[11px] font-mono text-emerald-300 overflow-x-auto">
                    {JSON.stringify(selectedAuditLog.new_values, null, 2) || 'null'}
                  </pre>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-800">
              <Button type="button" variant="secondary" size="sm" onClick={() => setSelectedAuditLog(null)}>
                إغلاق
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminControlCenterPage;
