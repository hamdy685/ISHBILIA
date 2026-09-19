import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
    CostCenterCostSummaryItem,
    CostCenterReportSummaryData,
    CostCenterStatementData,
    CostCenterStatementMovement,
} from '../../types/accounting';
import {
    getCostCentersReportSummaryApi,
    getCostCenterStatementApi,
} from '../../api/accountingApi';
import { parseApiError } from '../../utils/apiError';

interface ToastMessage {
    type: 'success' | 'error' | 'info';
    text: string;
}

export const ProjectCostsReportPage: React.FC = () => {
    const [loading, setLoading] = useState<boolean>(true);
    const [refreshing, setRefreshing] = useState<boolean>(false);
    const [reportData, setReportData] = useState<CostCenterReportSummaryData | null>(null);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [sortBy, setSortBy] = useState<'cost_desc' | 'cost_asc' | 'code_asc' | 'name_asc'>('cost_desc');
    const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
    const [toast, setToast] = useState<ToastMessage | null>(null);

    // Auto-dismiss toast after 6 seconds
    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 6000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    // Statement Modal state
    const [selectedCostCenter, setSelectedCostCenter] = useState<CostCenterCostSummaryItem | null>(null);
    const [statementLoading, setStatementLoading] = useState<boolean>(false);
    const [statementData, setStatementData] = useState<CostCenterStatementData | null>(null);
    const [statementFilterText, setStatementFilterText] = useState<string>('');
    const [fromDate, setFromDate] = useState<string>('');
    const [toDate, setToDate] = useState<string>('');

    const fetchSummary = useCallback(async (isRefresh = false) => {
        if (isRefresh) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }

        try {
            const data = await getCostCentersReportSummaryApi({
                search: searchQuery.trim() ? searchQuery.trim() : undefined,
            });
            setReportData(data);
        } catch (err: unknown) {
            setToast({
                type: 'error',
                text: parseApiError(err).message || 'فشل تحميل تقرير تكاليف المشاريع',
            });
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [searchQuery]);

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchSummary();
        }, 200);
        return () => clearTimeout(timer);
    }, [fetchSummary]);

    const handleOpenStatement = async (costCenter: CostCenterCostSummaryItem) => {
        setSelectedCostCenter(costCenter);
        setStatementLoading(true);
        setStatementFilterText('');
        setFromDate('');
        setToDate('');

        try {
            const data = await getCostCenterStatementApi(costCenter.id);
            setStatementData(data);
        } catch (err: unknown) {
            setToast({
                type: 'error',
                text: parseApiError(err).message || 'فشل تحميل كشف حساب المشروع',
            });
        } finally {
            setStatementLoading(false);
        }
    };

    const handleApplyDateFilter = async () => {
        if (!selectedCostCenter) return;
        setStatementLoading(true);
        try {
            const data = await getCostCenterStatementApi(selectedCostCenter.id, {
                from_date: fromDate || undefined,
                to_date: toDate || undefined,
            });
            setStatementData(data);
        } catch (err: unknown) {
            setToast({
                type: 'error',
                text: parseApiError(err).message || 'فشل تصفية كشف الحساب بالتاريخ',
            });
        } finally {
            setStatementLoading(false);
        }
    };

    const handleCloseStatement = () => {
        setSelectedCostCenter(null);
        setStatementData(null);
    };

    // Filter and Sort Cost Centers
    const sortedCostCenters = useMemo(() => {
        if (!reportData?.cost_centers) return [];
        const items = [...reportData.cost_centers];

        switch (sortBy) {
            case 'cost_desc':
                return items.sort((a, b) => b.total_cost - a.total_cost);
            case 'cost_asc':
                return items.sort((a, b) => a.total_cost - b.total_cost);
            case 'code_asc':
                return items.sort((a, b) => a.code.localeCompare(b.code, 'ar'));
            case 'name_asc':
                return items.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
            default:
                return items;
        }
    }, [reportData, sortBy]);

    // Filtered Statement Movements
    const filteredMovements = useMemo(() => {
        if (!statementData?.movements) return [];
        const term = statementFilterText.trim().toLowerCase();
        if (!term) return statementData.movements;

        return statementData.movements.filter((m) => {
            return (
                (m.reference_number && m.reference_number.toLowerCase().includes(term)) ||
                (m.entry_description && m.entry_description.toLowerCase().includes(term)) ||
                (m.line_description && m.line_description.toLowerCase().includes(term)) ||
                (m.account_code && m.account_code.toLowerCase().includes(term)) ||
                (m.account_name && m.account_name.toLowerCase().includes(term))
            );
        });
    }, [statementData, statementFilterText]);

    const formatCurrency = (val: number | string | undefined | null): string => {
        const num = Number(val || 0);
        return new Intl.NumberFormat('ar-EG', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(num);
    };

    const totalExp = reportData?.summary.total_expenditure || 0;

    return (
        <div className="space-y-6 text-slate-100 font-sans pb-12" dir="rtl">
            {/* Toast Notification */}
            {toast && (
                <div
                    className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl border shadow-2xl transition-all duration-300 backdrop-blur-xl animate-in fade-in slide-in-from-top-4 max-w-lg w-full ${
                        toast.type === 'error'
                            ? 'bg-rose-950/95 border-rose-500/80 text-rose-100 shadow-rose-950/50'
                            : 'bg-emerald-950/95 border-emerald-500/80 text-emerald-100 shadow-emerald-950/50'
                    }`}
                >
                    <span className="text-xl select-none" aria-hidden="true">
                        {toast.type === 'error' ? '🛑' : '✅'}
                    </span>
                    <div className="flex-1">
                        <h4 className="text-xs font-black mb-0.5">
                            {toast.type === 'error' ? 'تنبيه النظام المالي' : 'تم الإجراء بنجاح'}
                        </h4>
                        <p className="text-xs leading-relaxed font-semibold">{toast.text}</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setToast(null)}
                        className="text-white/60 hover:text-white text-xs font-bold px-1 transition"
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-white/10 pb-5">
                <div>
                    <div className="flex items-center gap-3">
                        <span className="text-3xl select-none" aria-hidden="true">📊</span>
                        <div>
                            <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2.5">
                                تقرير تكاليف المشاريع ومراكز التكلفة
                                <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono font-bold">
                                    Accounting MVP
                                </span>
                            </h1>
                            <p className="text-sm text-slate-400 mt-1">
                                تحليل إجمالي المصروفات المنفذة على كل قطعة أرض ومشروع من واقع القيود اليومية المحاسبية المعتمدة
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => fetchSummary(true)}
                        disabled={loading || refreshing}
                        className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 text-xs font-bold transition shadow-sm disabled:opacity-50"
                        title="تحديث البيانات"
                    >
                        <span className={`text-base ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true">🔄</span>
                        <span>تحديث</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => window.print()}
                        className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 text-xs font-bold transition shadow-sm print:hidden"
                        title="طباعة التقرير"
                    >
                        <span className="text-base" aria-hidden="true">🖨️</span>
                        <span>طباعة</span>
                    </button>
                </div>
            </div>

            {/* KPI Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Total Expenditure */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900/90 to-amber-950/20 border border-amber-500/30 shadow-lg relative overflow-hidden">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-300/90 font-mono uppercase tracking-wider">
                            إجمالي تكاليف المشاريع
                        </span>
                        <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-lg">
                            💰
                        </div>
                    </div>
                    <div className="mt-3 flex items-baseline gap-1.5">
                        <span className="text-2xl font-black text-amber-400 font-mono tracking-tight">
                            {loading ? '...' : formatCurrency(reportData?.summary.total_expenditure)}
                        </span>
                        <span className="text-xs text-amber-400/80 font-bold">ج.م</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                        إجمالي المصروفات الفعلية المقيدة دفترياً
                    </p>
                </div>

                {/* 2. Top Consuming Project */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900/90 to-slate-800/60 border border-white/10 shadow-lg relative overflow-hidden">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                            أعلى مشروع استهلاكاً
                        </span>
                        <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-lg">
                            🏆
                        </div>
                    </div>
                    <div className="mt-3">
                        {loading ? (
                            <span className="text-sm text-slate-400 font-bold">جاري التحميل...</span>
                        ) : reportData?.summary.highest_project ? (
                            <>
                                <div className="text-sm font-black text-rose-300 truncate" title={reportData.summary.highest_project.name}>
                                    {reportData.summary.highest_project.name}
                                </div>
                                <div className="text-xs text-rose-400/90 font-mono mt-0.5">
                                    {formatCurrency(reportData.summary.highest_project.total_cost)} ج.م
                                </div>
                            </>
                        ) : (
                            <span className="text-xs text-slate-500 font-bold">لا توجد تكاليف مسجلة</span>
                        )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                        {reportData?.summary.highest_project?.code || '—'}
                    </p>
                </div>

                {/* 3. Active Projects Count */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900/90 to-slate-800/60 border border-white/10 shadow-lg relative overflow-hidden">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                            المشاريع النشطة
                        </span>
                        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-lg">
                            🏗️
                        </div>
                    </div>
                    <div className="mt-3 flex items-baseline gap-1.5">
                        <span className="text-2xl font-black text-emerald-400 font-mono tracking-tight">
                            {loading ? '...' : (reportData?.summary.total_projects ?? 0)}
                        </span>
                        <span className="text-xs text-slate-400">مركز تكلفة</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                        مشاريع قيد التشغيل والتنفيذ
                    </p>
                </div>

                {/* 4. Average Project Cost */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900/90 to-slate-800/60 border border-white/10 shadow-lg relative overflow-hidden">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                            متوسط تكلفة المشروع
                        </span>
                        <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-lg">
                            📈
                        </div>
                    </div>
                    <div className="mt-3 flex items-baseline gap-1.5">
                        <span className="text-2xl font-black text-sky-400 font-mono tracking-tight">
                            {loading ? '...' : formatCurrency(reportData?.summary.average_project_cost)}
                        </span>
                        <span className="text-xs text-sky-400/80 font-bold">ج.م</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                        متوسط الصرف لكل مشروع نشط
                    </p>
                </div>
            </div>

            {/* Filter & View Controls */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-2xl bg-slate-900/80 border border-white/5 shadow-inner">
                <div className="relative w-full sm:w-80">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="بحث بكود أو اسم المشروع..."
                        className="w-full pl-3 pr-9 py-2 rounded-xl bg-slate-950/80 border border-slate-700/80 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/50"
                    />
                    <span className="absolute right-3 top-2.5 text-slate-400 text-xs" aria-hidden="true">
                        🔍
                    </span>
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            className="absolute left-3 top-2.5 text-xs text-slate-400 hover:text-white"
                        >
                            ✕
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                    {/* Sort Selector */}
                    <div className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-400 font-bold hidden sm:inline">الترتيب:</span>
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as any)}
                            className="px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-700/80 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
                        >
                            <option value="cost_desc">الأعلى تكلفة أولاً</option>
                            <option value="cost_asc">الأقل تكلفة أولاً</option>
                            <option value="code_asc">كود المشروع (أ-ي)</option>
                            <option value="name_asc">اسم المشروع</option>
                        </select>
                    </div>

                    {/* View Switcher */}
                    <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
                        <button
                            type="button"
                            onClick={() => setViewMode('cards')}
                            className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                                viewMode === 'cards'
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                                    : 'text-slate-400 hover:text-white'
                            }`}
                        >
                            بطاقات
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('table')}
                            className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                                viewMode === 'table'
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                                    : 'text-slate-400 hover:text-white'
                            }`}
                        >
                            جدول
                        </button>
                    </div>
                </div>
            </div>

            {/* Content: Cards or Table */}
            {loading ? (
                <div className="py-20 flex flex-col items-center justify-center gap-3">
                    <div className="w-10 h-10 rounded-full border-2 border-amber-500/20 border-t-amber-400 animate-spin" />
                    <span className="text-xs font-mono text-slate-400">جاري تجميع وحساب تكاليف المشاريع...</span>
                </div>
            ) : sortedCostCenters.length === 0 ? (
                <div className="p-12 text-center rounded-2xl bg-slate-900/60 border border-white/5">
                    <span className="text-4xl block mb-2" aria-hidden="true">🏷️</span>
                    <h3 className="text-base font-bold text-white">لا توجد مشاريع أو مراكز تكلفة مطابقة</h3>
                    <p className="text-xs text-slate-400 mt-1">تأكد من كتابة اسم أو كود المشروع بشكل صحيح.</p>
                </div>
            ) : viewMode === 'cards' ? (
                /* Card View */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sortedCostCenters.map((cc) => {
                        const sharePercent = totalExp > 0 ? (cc.total_cost / totalExp) * 100 : 0;
                        return (
                            <div
                                key={cc.id}
                                className="group p-5 rounded-2xl bg-slate-900/80 border border-white/10 hover:border-amber-500/40 transition-all duration-200 shadow-lg hover:shadow-amber-500/5 flex flex-col justify-between"
                            >
                                <div>
                                    {/* Card Header */}
                                    <div className="flex items-center justify-between gap-2 mb-2.5">
                                        <div className="flex items-center gap-2">
                                            <span className="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20 font-mono text-[11px] font-bold">
                                                {cc.code}
                                            </span>
                                            <span className="w-2 h-2 rounded-full bg-emerald-400" title="مركز تكلفة نشط" />
                                        </div>
                                        <span className="text-[11px] text-slate-400 font-mono">
                                            {cc.movements_count} {cc.movements_count === 1 ? 'حركة' : 'حركات'}
                                        </span>
                                    </div>

                                    {/* Project Name */}
                                    <h3 className="text-base font-black text-white group-hover:text-amber-200 transition-colors line-clamp-2 min-h-[3rem]">
                                        {cc.name}
                                    </h3>

                                    {/* Cost Figure */}
                                    <div className="mt-4 p-3 rounded-xl bg-slate-950/70 border border-white/5 flex items-baseline justify-between">
                                        <span className="text-xs text-slate-400 font-bold">التكلفة الفعلية:</span>
                                        <div className="flex items-baseline gap-1 font-mono">
                                            <span className="text-xl font-black text-amber-400">
                                                {formatCurrency(cc.total_cost)}
                                            </span>
                                            <span className="text-[11px] text-amber-400/80">ج.م</span>
                                        </div>
                                    </div>

                                    {/* Spend Share Bar */}
                                    <div className="mt-3">
                                        <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1 font-mono">
                                            <span>نسبة الإنفاق من الإجمالي:</span>
                                            <span className="font-bold text-amber-300">
                                                {sharePercent.toFixed(1)}%
                                            </span>
                                        </div>
                                        <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-amber-500 to-amber-300 rounded-full transition-all duration-500"
                                                style={{ width: `${Math.min(100, Math.max(sharePercent, cc.total_cost > 0 ? 3 : 0))}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Action Button */}
                                <div className="mt-5 pt-3 border-t border-white/5">
                                    <button
                                        type="button"
                                        onClick={() => handleOpenStatement(cc)}
                                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold text-xs transition shadow-sm"
                                    >
                                        <span aria-hidden="true">📄</span>
                                        <span>كشف الحساب التفصيلي (Statement)</span>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                /* Table View */
                <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-900/80 shadow-xl">
                    <table className="w-full text-right text-xs">
                        <thead className="bg-slate-950/80 text-slate-300 border-b border-white/10">
                            <tr>
                                <th className="p-3.5 font-bold">كود المشروع</th>
                                <th className="p-3.5 font-bold">اسم المشروع / مركز التكلفة</th>
                                <th className="p-3.5 font-bold text-center">عدد الحركات</th>
                                <th className="p-3.5 font-bold">نسبة المشاركة %</th>
                                <th className="p-3.5 font-bold text-left">إجمالي التكلفة الفعلية</th>
                                <th className="p-3.5 font-bold text-center">الإجراءات</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {sortedCostCenters.map((cc) => {
                                const sharePercent = totalExp > 0 ? (cc.total_cost / totalExp) * 100 : 0;
                                return (
                                    <tr key={cc.id} className="hover:bg-white/[0.02] transition">
                                        <td className="p-3.5 font-mono font-bold text-amber-300">
                                            {cc.code}
                                        </td>
                                        <td className="p-3.5 font-bold text-white">
                                            {cc.name}
                                        </td>
                                        <td className="p-3.5 text-center font-mono text-slate-300">
                                            {cc.movements_count}
                                        </td>
                                        <td className="p-3.5">
                                            <div className="flex items-center gap-2">
                                                <div className="w-20 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                                                    <div
                                                        className="h-full bg-amber-400 rounded-full"
                                                        style={{ width: `${Math.min(100, Math.max(sharePercent, cc.total_cost > 0 ? 4 : 0))}%` }}
                                                    />
                                                </div>
                                                <span className="font-mono text-slate-400 text-[11px]">
                                                    {sharePercent.toFixed(1)}%
                                                </span>
                                            </div>
                                        </td>
                                        <td className="p-3.5 font-mono font-black text-amber-400 text-left text-sm">
                                            {formatCurrency(cc.total_cost)} ج.م
                                        </td>
                                        <td className="p-3.5 text-center">
                                            <button
                                                type="button"
                                                onClick={() => handleOpenStatement(cc)}
                                                className="px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold transition inline-flex items-center gap-1.5"
                                            >
                                                <span>📄</span>
                                                <span>كشف الحساب</span>
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Statement Modal */}
            {selectedCostCenter && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) handleCloseStatement();
                    }}
                >
                    <div className="relative w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl bg-slate-900 border border-white/10 shadow-2xl overflow-hidden">
                        {/* Modal Header */}
                        <div className="p-5 border-b border-white/10 flex items-start justify-between bg-slate-950/60">
                            <div>
                                <div className="flex items-center gap-2.5">
                                    <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 font-mono text-xs font-bold border border-amber-500/30">
                                        {selectedCostCenter.code}
                                    </span>
                                    <h2 className="text-lg font-black text-white">
                                        كشف حساب تحليلي: {selectedCostCenter.name}
                                    </h2>
                                </div>
                                <p className="text-xs text-slate-400 mt-1">
                                    سجل تفصيلي بكافة القيود اليومية والمستخلصات وتسويات العهد المنفذة على هذا المشروع
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={handleCloseStatement}
                                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-sm font-bold transition"
                                title="إغلاق"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Statement KPI Strip */}
                        {statementData && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-4 bg-slate-950/40 border-b border-white/5">
                                <div className="p-2.5 rounded-xl bg-slate-900/90 border border-white/5">
                                    <span className="text-[11px] text-slate-400 font-bold block">إجمالي المدين (Debits)</span>
                                    <span className="text-sm font-black text-emerald-400 font-mono">
                                        {formatCurrency(statementData.totals.total_debit)} ج.م
                                    </span>
                                </div>
                                <div className="p-2.5 rounded-xl bg-slate-900/90 border border-white/5">
                                    <span className="text-[11px] text-slate-400 font-bold block">إجمالي الدائن (Credits)</span>
                                    <span className="text-sm font-black text-rose-400 font-mono">
                                        {formatCurrency(statementData.totals.total_credit)} ج.م
                                    </span>
                                </div>
                                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                                    <span className="text-[11px] text-amber-300 font-bold block">صافي التكلفة (Net Cost)</span>
                                    <span className="text-base font-black text-amber-400 font-mono">
                                        {formatCurrency(statementData.totals.net_cost)} ج.م
                                    </span>
                                </div>
                                <div className="p-2.5 rounded-xl bg-slate-900/90 border border-white/5">
                                    <span className="text-[11px] text-slate-400 font-bold block">عدد الحركات المقيدة</span>
                                    <span className="text-sm font-black text-white font-mono">
                                        {statementData.totals.movements_count} حركة
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Search & Date Filters inside Modal */}
                        <div className="p-3 bg-slate-950/80 border-b border-white/5 flex flex-wrap items-center justify-between gap-3">
                            <div className="relative w-full sm:w-64">
                                <input
                                    type="text"
                                    value={statementFilterText}
                                    onChange={(e) => setStatementFilterText(e.target.value)}
                                    placeholder="بحث في سطور الكشف..."
                                    className="w-full pl-3 pr-8 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                                />
                                <span className="absolute right-2.5 top-2 text-slate-400 text-xs">🔍</span>
                            </div>

                            <div className="flex items-center gap-2 w-full sm:w-auto">
                                <span className="text-xs text-slate-400 font-bold">من:</span>
                                <input
                                    type="date"
                                    value={fromDate}
                                    onChange={(e) => setFromDate(e.target.value)}
                                    className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
                                />
                                <span className="text-xs text-slate-400 font-bold">إلى:</span>
                                <input
                                    type="date"
                                    value={toDate}
                                    onChange={(e) => setToDate(e.target.value)}
                                    className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
                                />
                                <button
                                    type="button"
                                    onClick={handleApplyDateFilter}
                                    className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-600 transition"
                                >
                                    تطبيق
                                </button>
                            </div>
                        </div>

                        {/* Movements Table */}
                        <div className="flex-1 overflow-y-auto p-4">
                            {statementLoading ? (
                                <div className="py-16 flex flex-col items-center justify-center gap-3">
                                    <div className="w-8 h-8 rounded-full border-2 border-amber-500/20 border-t-amber-400 animate-spin" />
                                    <span className="text-xs font-mono text-slate-400">جاري تحميل حركات المشروع...</span>
                                </div>
                            ) : filteredMovements.length === 0 ? (
                                <div className="p-12 text-center rounded-xl bg-slate-950/40 border border-white/5">
                                    <span className="text-3xl block mb-2">📜</span>
                                    <h4 className="text-sm font-bold text-white">لا توجد حركات مسجلة على هذا المشروع</h4>
                                    <p className="text-xs text-slate-500 mt-1">
                                        لم يتم تسجيل أي مستخلص مقاول أو تسوية عهدة معتمدة على هذا المركز حتى الآن.
                                    </p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto rounded-xl border border-white/10">
                                    <table className="w-full text-right text-xs">
                                        <thead className="bg-slate-950 text-slate-300 border-b border-white/10 font-bold">
                                            <tr>
                                                <th className="p-3">التاريخ</th>
                                                <th className="p-3">رقم السند / القيد</th>
                                                <th className="p-3">الحساب المحاسبي</th>
                                                <th className="p-3">بيان الحركة</th>
                                                <th className="p-3 text-left">المدين (منه)</th>
                                                <th className="p-3 text-left">الدائن (له)</th>
                                                <th className="p-3 text-left">الصافي</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5 font-mono">
                                            {filteredMovements.map((line: CostCenterStatementMovement) => (
                                                <tr key={line.id} className="hover:bg-white/[0.02] transition font-sans">
                                                    <td className="p-3 font-mono text-slate-300 whitespace-nowrap">
                                                        {line.date || '—'}
                                                    </td>
                                                    <td className="p-3 font-mono text-amber-300 whitespace-nowrap font-bold">
                                                        {line.reference_number || `#JE-${line.journal_entry_id}`}
                                                    </td>
                                                    <td className="p-3">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-bold">
                                                                {line.account_code}
                                                            </span>
                                                            <span className="text-xs text-white font-bold">
                                                                {line.account_name}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="p-3 text-slate-300 max-w-xs text-xs font-normal">
                                                        {line.line_description}
                                                    </td>
                                                    <td className="p-3 font-mono text-emerald-400 text-left font-bold whitespace-nowrap">
                                                        {line.debit > 0 ? `${formatCurrency(line.debit)} ج.م` : '—'}
                                                    </td>
                                                    <td className="p-3 font-mono text-rose-400 text-left font-bold whitespace-nowrap">
                                                        {line.credit > 0 ? `${formatCurrency(line.credit)} ج.م` : '—'}
                                                    </td>
                                                    <td className="p-3 font-mono text-amber-400 text-left font-black whitespace-nowrap">
                                                        {formatCurrency(line.net_amount)} ج.م
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 border-t border-white/10 bg-slate-950/60 flex items-center justify-between">
                            <span className="text-xs text-slate-400 font-mono">
                                إجمالي السطور المعروضة: {filteredMovements.length}
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => window.print()}
                                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition flex items-center gap-2"
                                >
                                    <span>🖨️</span>
                                    <span>طباعة الكشف</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={handleCloseStatement}
                                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition"
                                >
                                    إغلاق
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProjectCostsReportPage;
