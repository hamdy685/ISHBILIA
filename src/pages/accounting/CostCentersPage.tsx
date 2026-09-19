import React, { useEffect, useState, useMemo } from "react";
import { getCostCentersApi } from "../../api/accountingApi";
import { CostCenter } from "../../types/accounting";
import { parseApiError } from "../../utils/apiError";

export const CostCentersPage: React.FC = () => {
    const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [showOnlyActive, setShowOnlyActive] = useState<boolean>(false);

    const fetchCostCenters = async () => {
        setLoading(true);
        setError(null);
        try {
            // Fetch all cost centers so we can show total vs active
            const data = await getCostCentersApi({ all: true });
            setCostCenters(data);
        } catch (err) {
            setError(parseApiError(err).message || "فشل في جلب مراكز التكلفة من الخادم.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCostCenters();
    }, []);

    // Filter cost centers based on search query and active toggle
    const filteredCostCenters = useMemo(() => {
        return costCenters.filter((cc) => {
            const matchesActive = showOnlyActive ? cc.is_active : true;
            if (!matchesActive) return false;

            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase();
            return cc.code.toLowerCase().includes(q) || cc.name.toLowerCase().includes(q);
        });
    }, [costCenters, searchQuery, showOnlyActive]);

    // Live Metrics
    const totalCount = costCenters.length;
    const activeCount = costCenters.filter((cc) => cc.is_active).length;
    const inactiveCount = totalCount - activeCount;

    return (
        <div className="space-y-6" dir="rtl">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 p-5 rounded-2xl border border-white/10 shadow-xl backdrop-blur-md">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-cyan-700/30 border border-cyan-500/40 text-cyan-300 text-xl shadow-lg">
                            🏷️
                        </span>
                        <div>
                            <h1 className="text-xl font-black text-white tracking-wide">
                                مراكز التكلفة وقطع الأراضي (Cost Centers)
                            </h1>
                            <p className="text-xs text-slate-400">
                                إدارة مراكز التكلفة التحليلية وتوزيع المصروفات والقيود المحاسبية على قطع الأراضي والمشاريع
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <span className="px-3 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-bold font-mono">
                        نظام مالي معزول (MVP)
                    </span>
                    <button
                        type="button"
                        className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-teal-600 hover:from-cyan-600 hover:to-teal-700 text-slate-950 text-xs font-black rounded-xl shadow-lg shadow-cyan-500/20 border border-cyan-400/40 transition-all flex items-center gap-2 cursor-pointer active:scale-95"
                        onClick={() => alert("سيتم تفعيل إنشاء مراكز التكلفة في المرحلة القادمة مع إمكانية ربطها بقطع الأراضي مباشرة.")}
                    >
                        <span>+</span>
                        <span>إضافة مركز تكلفة جديد</span>
                    </button>
                </div>
            </div>

            {/* Quick Metrics Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 backdrop-blur-sm flex items-center justify-between">
                    <div>
                        <span className="text-xs text-slate-400 font-bold block mb-1">إجمالي مراكز التكلفة</span>
                        <span className="text-2xl font-black text-white font-mono">
                            {loading ? "..." : totalCount}
                        </span>
                    </div>
                    <span className="text-2xl p-2.5 rounded-xl bg-slate-800/80 border border-slate-700">🏢</span>
                </div>
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 backdrop-blur-sm flex items-center justify-between">
                    <div>
                        <span className="text-xs text-slate-400 font-bold block mb-1">مراكز التكلفة النشطة</span>
                        <span className="text-2xl font-black text-emerald-400 font-mono">
                            {loading ? "..." : activeCount}
                        </span>
                    </div>
                    <span className="text-2xl p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-800/40">✅</span>
                </div>
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 backdrop-blur-sm flex items-center justify-between">
                    <div>
                        <span className="text-xs text-slate-400 font-bold block mb-1">مراكز متوقفة / مسلمة</span>
                        <span className="text-2xl font-black text-amber-400 font-mono">
                            {loading ? "..." : inactiveCount}
                        </span>
                    </div>
                    <span className="text-2xl p-2.5 rounded-xl bg-amber-950/40 border border-amber-800/40">⏸️</span>
                </div>
            </div>

            {/* Cost Centers Table Container */}
            <div className="bg-slate-900/70 rounded-2xl border border-white/10 shadow-2xl overflow-hidden backdrop-blur-md">
                {/* Search Bar & Filter Controls */}
                <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-950/50">
                    <div className="relative w-full sm:w-80">
                        <input
                            type="text"
                            placeholder="بحث بكود أو اسم مركز التكلفة..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 pr-4 pl-8 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
                        />
                        <span className="absolute left-3 top-2.5 text-xs text-slate-500">🔍</span>
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={showOnlyActive}
                                onChange={(e) => setShowOnlyActive(e.target.checked)}
                                className="rounded border-slate-700 bg-slate-800 text-cyan-500 focus:ring-cyan-500/30"
                            />
                            <span>النشطة فقط</span>
                        </label>

                        <button
                            type="button"
                            onClick={fetchCostCenters}
                            disabled={loading}
                            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all flex items-center gap-1.5 text-xs cursor-pointer"
                            title="تحديث البيانات"
                        >
                            <span className={loading ? "animate-spin" : ""}>🔄</span>
                            <span>تحديث</span>
                        </button>
                    </div>
                </div>

                {/* Error Banner */}
                {error && (
                    <div className="m-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span>⚠️</span>
                            <span className="text-xs font-semibold">{error}</span>
                        </div>
                        <button
                            type="button"
                            onClick={fetchCostCenters}
                            className="px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-bold transition-all cursor-pointer"
                        >
                            إعادة المحاولة
                        </button>
                    </div>
                )}

                {/* Loading Skeleton */}
                {loading && (
                    <div className="p-6 space-y-3">
                        {[1, 2, 3, 4].map((i) => (
                            <div
                                key={i}
                                className="h-14 rounded-xl bg-slate-800/40 border border-slate-800 animate-pulse flex items-center px-4 justify-between"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-16 h-6 rounded bg-slate-700/60" />
                                    <div className="w-48 h-6 rounded bg-slate-700/60" />
                                </div>
                                <div className="w-20 h-6 rounded bg-slate-700/60" />
                            </div>
                        ))}
                    </div>
                )}

                {/* Real Data Table */}
                {!loading && !error && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-right text-xs">
                            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-bold uppercase tracking-wider">
                                <tr>
                                    <th className="py-3.5 px-4">كود مركز التكلفة</th>
                                    <th className="py-3.5 px-4">الاسم / المشروع</th>
                                    <th className="py-3.5 px-4">الحالة</th>
                                    <th className="py-3.5 px-4">تاريخ الإنشاء</th>
                                    <th className="py-3.5 px-4 text-center">الإجراءات</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                                {filteredCostCenters.length > 0 ? (
                                    filteredCostCenters.map((center) => (
                                        <tr
                                            key={center.id}
                                            className="hover:bg-slate-800/40 transition-colors group"
                                        >
                                            <td className="py-3.5 px-4">
                                                <span className="font-mono font-bold px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-cyan-300 shadow-inner">
                                                    {center.code}
                                                </span>
                                            </td>
                                            <td className="py-3.5 px-4 font-semibold text-slate-200">
                                                {center.name}
                                            </td>
                                            <td className="py-3.5 px-4">
                                                <span
                                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                                                        center.is_active
                                                            ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                                                            : "bg-slate-800 text-slate-400 border-slate-700"
                                                    }`}
                                                >
                                                    <span
                                                        className={`w-1.5 h-1.5 rounded-full ${
                                                            center.is_active ? "bg-emerald-400" : "bg-slate-500"
                                                        }`}
                                                    />
                                                    <span>{center.is_active ? "نشط ومتاح للقيود" : "متوقف / مغلق"}</span>
                                                </span>
                                            </td>
                                            <td className="py-3.5 px-4 text-slate-400 font-mono">
                                                {center.created_at
                                                    ? new Date(center.created_at).toLocaleDateString("ar-EG")
                                                    : "—"}
                                            </td>
                                            <td className="py-3.5 px-4 text-center">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        alert(
                                                            `مركز التكلفة: ${center.name} (${center.code})\nالحالة: ${
                                                                center.is_active ? "نشط" : "متوقف"
                                                            }`
                                                        )
                                                    }
                                                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] font-bold transition-all cursor-pointer group-hover:border-cyan-500/40"
                                                >
                                                    عرض التفاصيل
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={5} className="py-16 text-center text-slate-400">
                                            <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-2xl mb-3">
                                                🏷️
                                            </div>
                                            <h3 className="text-sm font-bold text-slate-200 mb-1">
                                                لا توجد مراكز تكلفة مطابقة
                                            </h3>
                                            <p className="text-xs text-slate-400">
                                                جرب البحث بكلمة أخرى أو إلغاء تفعيل فلتر النشطة فقط
                                            </p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CostCentersPage;
