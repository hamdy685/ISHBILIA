import React, { useEffect, useState, useMemo, FormEvent } from "react";
import {
    getContractorInvoicesApi,
    createContractorInvoiceApi,
    deleteContractorInvoiceApi,
    approveContractorInvoiceApi,
    getCostCentersApi,
} from "../../api/accountingApi";
import {
    ContractorInvoice,
    ContractorInvoiceStatus,
    CostCenter,
    CreateContractorInvoicePayload,
} from "../../types/accounting";
import { parseApiError } from "../../utils/apiError";

interface ToastMessage {
    type: "success" | "error" | "info";
    text: string;
}

const STATUS_CONFIG: Record<
    ContractorInvoiceStatus,
    { label: string; badgeClass: string; dotClass: string }
> = {
    DRAFT: {
        label: "مسودة",
        badgeClass: "bg-slate-800 text-slate-300 border-slate-700",
        dotClass: "bg-slate-400",
    },
    PENDING_APPROVAL: {
        label: "بانتظار الاعتماد",
        badgeClass: "bg-amber-500/10 text-amber-300 border-amber-500/30",
        dotClass: "bg-amber-400",
    },
    APPROVED: {
        label: "معتمد (له قيد يومي)",
        badgeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
        dotClass: "bg-emerald-400 shadow-sm shadow-emerald-400/50",
    },
    PAID: {
        label: "مسدد بالكامل",
        badgeClass: "bg-cyan-500/15 text-cyan-300 border-cyan-500/40",
        dotClass: "bg-cyan-400",
    },
};

const money = (val: string | number | undefined | null) =>
    `${Number(val || 0).toLocaleString("ar-EG", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })} ج.م`;

export const ContractorInvoicesPage: React.FC = () => {
    const [invoices, setInvoices] = useState<ContractorInvoice[]>([]);
    const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [toast, setToast] = useState<ToastMessage | null>(null);

    // Filters
    const [statusFilter, setStatusFilter] = useState<string>("ALL");
    const [searchQuery, setSearchQuery] = useState<string>("");

    // Modal state for Create Invoice
    const [createModalOpen, setCreateModalOpen] = useState<boolean>(false);
    const [submitting, setSubmitting] = useState<boolean>(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [formData, setFormData] = useState<CreateContractorInvoicePayload>({
        cost_center_id: 0,
        contractor_name: "",
        invoice_number: "",
        date: new Date().toISOString().split("T")[0],
        amount: 0,
        description: "",
        status: "DRAFT",
    });

    // Approval in-flight state by invoice id
    const [approvingId, setApprovingId] = useState<number | null>(null);

    // View Journal Entry Modal
    const [selectedInvoiceForEntry, setSelectedInvoiceForEntry] = useState<ContractorInvoice | null>(null);

    // Auto-dismiss toast after 6 seconds
    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 6000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [invoicesData, costCentersData] = await Promise.all([
                getContractorInvoicesApi(),
                getCostCentersApi({ all: false }),
            ]);
            setInvoices(invoicesData);
            setCostCenters(costCentersData);
            if (costCentersData.length > 0 && formData.cost_center_id === 0) {
                setFormData((prev) => ({ ...prev, cost_center_id: costCentersData[0].id }));
            }
        } catch (err) {
            setError(parseApiError(err).message || "فشل في تحميل بيانات المستخلصات.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Filtered invoices
    const filteredInvoices = useMemo(() => {
        return invoices.filter((inv) => {
            const matchesStatus = statusFilter === "ALL" ? true : inv.status === statusFilter;
            if (!matchesStatus) return false;

            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase();
            return (
                inv.contractor_name.toLowerCase().includes(q) ||
                inv.invoice_number.toLowerCase().includes(q) ||
                (inv.description && inv.description.toLowerCase().includes(q)) ||
                (inv.cost_center?.name && inv.cost_center.name.toLowerCase().includes(q))
            );
        });
    }, [invoices, statusFilter, searchQuery]);

    // Live Metrics
    const totalCount = invoices.length;
    const totalAmount = invoices.reduce((sum, inv) => sum + Number(inv.amount || 0), 0);
    const approvedCount = invoices.filter((inv) => inv.status === "APPROVED" || inv.status === "PAID").length;
    const pendingCount = invoices.filter((inv) => inv.status === "PENDING_APPROVAL" || inv.status === "DRAFT").length;

    // Handle Create Submit
    const handleCreateSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setFormError(null);

        if (!formData.cost_center_id) {
            setFormError("يرجى اختيار مركز التكلفة (المشروع).");
            return;
        }
        if (!formData.contractor_name.trim()) {
            setFormError("يرجى إدخال اسم المقاول.");
            return;
        }
        if (!formData.invoice_number.trim()) {
            setFormError("يرجى إدخال رقم المستخلص.");
            return;
        }
        if (!formData.amount || Number(formData.amount) <= 0) {
            setFormError("يرجى إدخال قيمة صحيحة للمستخلص أكبر من صفر.");
            return;
        }

        setSubmitting(true);
        try {
            const created = await createContractorInvoiceApi({
                ...formData,
                amount: Number(formData.amount),
            });
            setInvoices((prev) => [created, ...prev]);
            setCreateModalOpen(false);
            setToast({
                type: "success",
                text: `تم إنشاء المستخلص رقم (${created.invoice_number}) للمقاول "${created.contractor_name}" بنجاح.`,
            });
            // Reset form
            setFormData({
                cost_center_id: costCenters[0]?.id || 0,
                contractor_name: "",
                invoice_number: "",
                date: new Date().toISOString().split("T")[0],
                amount: 0,
                description: "",
                status: "DRAFT",
            });
        } catch (err) {
            setFormError(parseApiError(err).message || "فشل في إنشاء المستخلص.");
        } finally {
            setSubmitting(false);
        }
    };

    // Handle Approval with Graceful 422 Toast Error Display
    const handleApprove = async (invoice: ContractorInvoice) => {
        const confirmApprove = window.confirm(
            `هل أنت متأكد من اعتماد مستخلص المقاول "${invoice.contractor_name}" بقيمة (${money(
                invoice.amount
            )})؟\n\nسيتم إنشاء قيد يومية متزن آلياً في دفتر اليومية العامة وتحميل القيمة على مركز التكلفة المحدد.`
        );
        if (!confirmApprove) return;

        setApprovingId(invoice.id);
        try {
            const updated = await approveContractorInvoiceApi(invoice.id);
            setInvoices((prev) => prev.map((inv) => (inv.id === invoice.id ? updated : inv)));
            setToast({
                type: "success",
                text: `تم اعتماد المستخلص رقم (${invoice.invoice_number}) بنجاح وتوليد قيد اليومية الآلي!`,
            });
        } catch (err) {
            const parsed = parseApiError(err);
            // Display graceful error message in prominent red toast
            setToast({
                type: "error",
                text: parsed.message || "حدث خطأ أثناء اعتماد المستخلص.",
            });
        } finally {
            setApprovingId(null);
        }
    };

    // Handle Delete
    const handleDelete = async (invoice: ContractorInvoice) => {
        if (!window.confirm(`هل أنت متأكد من حذف المستخلص (${invoice.invoice_number})؟`)) return;

        try {
            await deleteContractorInvoiceApi(invoice.id);
            setInvoices((prev) => prev.filter((inv) => inv.id !== invoice.id));
            setToast({
                type: "success",
                text: "تم حذف المستخلص بنجاح.",
            });
        } catch (err) {
            setToast({
                type: "error",
                text: parseApiError(err).message || "فشل في حذف المستخلص.",
            });
        }
    };

    return (
        <div className="space-y-6" dir="rtl">
            {/* Red / Green Toast Notification Floating Banner */}
            {toast && (
                <div
                    className={`fixed bottom-6 left-6 z-50 max-w-lg p-4 rounded-2xl shadow-2xl border flex items-start gap-3 transition-all transform animate-bounce-short ${
                        toast.type === "error"
                            ? "bg-rose-950/95 border-rose-500 text-rose-100 shadow-rose-950/50"
                            : "bg-emerald-950/95 border-emerald-500 text-emerald-100 shadow-emerald-950/50"
                    }`}
                >
                    <span className="text-xl">
                        {toast.type === "error" ? "🛑" : "✅"}
                    </span>
                    <div className="flex-1">
                        <h4 className="text-xs font-black mb-0.5">
                            {toast.type === "error" ? "تنبيه النظام المالي (خطأ 422)" : "تم الإجراء بنجاح"}
                        </h4>
                        <p className="text-xs leading-relaxed font-semibold">{toast.text}</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setToast(null)}
                        className="text-white/60 hover:text-white text-xs font-bold px-1"
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 p-5 rounded-2xl border border-white/10 shadow-xl backdrop-blur-md">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-700/30 border border-amber-500/40 text-amber-300 text-xl shadow-lg">
                            👷
                        </span>
                        <div>
                            <h1 className="text-xl font-black text-white tracking-wide">
                                مستخلصات المقاولين (Contractor Invoices)
                            </h1>
                            <p className="text-xs text-slate-400">
                                إدارة مصنعيات وأعمال المقاولين وربطها بمراكز التكلفة وقطع الأراضي مع القيود الآلية
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <span className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold font-mono">
                        نظام مالي معزول (MVP)
                    </span>
                    <button
                        type="button"
                        onClick={() => {
                            setFormError(null);
                            setCreateModalOpen(true);
                        }}
                        className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 text-xs font-black rounded-xl shadow-lg shadow-amber-500/20 border border-amber-400/40 transition-all flex items-center gap-2 cursor-pointer active:scale-95"
                    >
                        <span>+</span>
                        <span>إنشاء مستخلص جديد</span>
                    </button>
                </div>
            </div>

            {/* Quick Metrics Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 backdrop-blur-sm flex items-center justify-between">
                    <div>
                        <span className="text-xs text-slate-400 font-bold block mb-1">إجمالي المستخلصات</span>
                        <span className="text-2xl font-black text-white font-mono">
                            {loading ? "..." : totalCount}
                        </span>
                        <span className="text-[11px] text-amber-400/90 font-mono block mt-0.5">
                            {money(totalAmount)}
                        </span>
                    </div>
                    <span className="text-2xl p-2.5 rounded-xl bg-slate-800/80 border border-slate-700">🏗️</span>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 backdrop-blur-sm flex items-center justify-between">
                    <div>
                        <span className="text-xs text-slate-400 font-bold block mb-1">المستخلصات المعتمدة (لها قيد)</span>
                        <span className="text-2xl font-black text-emerald-400 font-mono">
                            {loading ? "..." : approvedCount}
                        </span>
                        <span className="text-[11px] text-emerald-400/80 block mt-0.5">
                            مرحلة في الحسابات العامة
                        </span>
                    </div>
                    <span className="text-2xl p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-800/40">✅</span>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 backdrop-blur-sm flex items-center justify-between">
                    <div>
                        <span className="text-xs text-slate-400 font-bold block mb-1">بانتظار الاعتماد / مسودات</span>
                        <span className="text-2xl font-black text-amber-400 font-mono">
                            {loading ? "..." : pendingCount}
                        </span>
                        <span className="text-[11px] text-amber-400/80 block mt-0.5">
                            جاهزة للمراجعة المحاسبية
                        </span>
                    </div>
                    <span className="text-2xl p-2.5 rounded-xl bg-amber-950/40 border border-amber-800/40">⏳</span>
                </div>
            </div>

            {/* Invoices Container */}
            <div className="bg-slate-900/70 rounded-2xl border border-white/10 shadow-2xl overflow-hidden backdrop-blur-md">
                {/* Filters and Search Toolbar */}
                <div className="p-4 border-b border-slate-800 flex flex-col md:flex-row items-center justify-between gap-3 bg-slate-950/50">
                    <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                        {["ALL", "DRAFT", "PENDING_APPROVAL", "APPROVED"].map((status) => (
                            <button
                                key={status}
                                type="button"
                                onClick={() => setStatusFilter(status)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                    statusFilter === status
                                        ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                                        : "bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800"
                                }`}
                            >
                                {status === "ALL"
                                    ? "الكل"
                                    : STATUS_CONFIG[status as ContractorInvoiceStatus]?.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-80">
                        <div className="relative w-full">
                            <input
                                type="text"
                                placeholder="بحث برقم المستخلص أو المقاول أو المشروع..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 pr-4 pl-8 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30"
                            />
                            <span className="absolute left-3 top-2.5 text-xs text-slate-500">🔍</span>
                        </div>
                        <button
                            type="button"
                            onClick={fetchData}
                            disabled={loading}
                            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all flex items-center gap-1.5 text-xs cursor-pointer flex-shrink-0"
                            title="تحديث البيانات"
                        >
                            <span className={loading ? "animate-spin" : ""}>🔄</span>
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
                            onClick={fetchData}
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
                                className="h-16 rounded-xl bg-slate-800/40 border border-slate-800 animate-pulse flex items-center px-4 justify-between"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-20 h-6 rounded bg-slate-700/60" />
                                    <div className="w-40 h-6 rounded bg-slate-700/60" />
                                    <div className="w-32 h-6 rounded bg-slate-700/60" />
                                </div>
                                <div className="w-24 h-6 rounded bg-slate-700/60" />
                            </div>
                        ))}
                    </div>
                )}

                {/* Data Table */}
                {!loading && !error && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-right text-xs">
                            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-bold uppercase tracking-wider">
                                <tr>
                                    <th className="py-3.5 px-4">رقم المستخلص</th>
                                    <th className="py-3.5 px-4">المقاول</th>
                                    <th className="py-3.5 px-4">المشروع / مركز التكلفة</th>
                                    <th className="py-3.5 px-4">التاريخ</th>
                                    <th className="py-3.5 px-4">القيمة المالية</th>
                                    <th className="py-3.5 px-4">الحالة والقيد</th>
                                    <th className="py-3.5 px-4 text-center">الإجراءات</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                                {filteredInvoices.length > 0 ? (
                                    filteredInvoices.map((inv) => {
                                        const statusCfg = STATUS_CONFIG[inv.status];
                                        const isApproved = inv.status === "APPROVED" || inv.status === "PAID";
                                        const isApproving = approvingId === inv.id;

                                        return (
                                            <tr
                                                key={inv.id}
                                                className="hover:bg-slate-800/40 transition-colors group"
                                            >
                                                {/* Invoice Number */}
                                                <td className="py-3.5 px-4">
                                                    <span className="font-mono font-bold px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-amber-300 shadow-inner">
                                                        {inv.invoice_number}
                                                    </span>
                                                </td>

                                                {/* Contractor Name */}
                                                <td className="py-3.5 px-4">
                                                    <span className="font-bold text-slate-100 block">
                                                        {inv.contractor_name}
                                                    </span>
                                                    {inv.description && (
                                                        <span className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">
                                                            {inv.description}
                                                        </span>
                                                    )}
                                                </td>

                                                {/* Cost Center */}
                                                <td className="py-3.5 px-4">
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-cyan-300 text-[11px] font-mono font-medium">
                                                        <span>🏷️</span>
                                                        <span>{inv.cost_center?.code}</span>
                                                        <span className="text-slate-500">|</span>
                                                        <span className="text-slate-300 truncate max-w-[150px]">
                                                            {inv.cost_center?.name}
                                                        </span>
                                                    </span>
                                                </td>

                                                {/* Date */}
                                                <td className="py-3.5 px-4 font-mono text-slate-400">
                                                    {inv.date}
                                                </td>

                                                {/* Amount */}
                                                <td className="py-3.5 px-4 font-mono font-black text-amber-400 text-sm">
                                                    {money(inv.amount)}
                                                </td>

                                                {/* Status & Journal Entry Link */}
                                                <td className="py-3.5 px-4">
                                                    <div className="flex flex-col gap-1 items-start">
                                                        <span
                                                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${statusCfg?.badgeClass}`}
                                                        >
                                                            <span className={`w-1.5 h-1.5 rounded-full ${statusCfg?.dotClass}`} />
                                                            <span>{statusCfg?.label}</span>
                                                        </span>

                                                        {inv.journal_entry_id && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setSelectedInvoiceForEntry(inv)}
                                                                className="text-[10px] text-cyan-400 hover:text-cyan-300 underline font-mono flex items-center gap-1 cursor-pointer"
                                                            >
                                                                <span>📑</span>
                                                                <span>قيد اليومية #{inv.journal_entry_id}</span>
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>

                                                {/* Actions */}
                                                <td className="py-3.5 px-4 text-center">
                                                    <div className="flex items-center justify-center gap-2">
                                                        {!isApproved ? (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleApprove(inv)}
                                                                    disabled={isApproving}
                                                                    className="px-3 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-slate-950 font-black text-xs rounded-xl shadow-md shadow-emerald-500/20 border border-emerald-400/40 transition-all flex items-center gap-1 cursor-pointer active:scale-95 disabled:opacity-50"
                                                                    title="اعتماد المستخلص وتوليد القيد المحاسبي"
                                                                >
                                                                    {isApproving ? (
                                                                        <span className="animate-spin">🔄</span>
                                                                    ) : (
                                                                        <span>✓</span>
                                                                    )}
                                                                    <span>اعتماد</span>
                                                                </button>

                                                                {inv.status === "DRAFT" && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleDelete(inv)}
                                                                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg border border-transparent hover:border-rose-800/40 transition-all cursor-pointer"
                                                                        title="حذف المستخلص"
                                                                    >
                                                                        🗑️
                                                                    </button>
                                                                )}
                                                            </>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => setSelectedInvoiceForEntry(inv)}
                                                                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-[11px] font-bold transition-all cursor-pointer"
                                                            >
                                                                عرض القيد
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan={7} className="py-16 text-center text-slate-400">
                                            <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-2xl mb-3">
                                                👷
                                            </div>
                                            <h3 className="text-sm font-bold text-slate-200 mb-1">
                                                لا توجد مستخلصات مقاولين
                                            </h3>
                                            <p className="text-xs text-slate-400">
                                                اضغط على زر "إنشاء مستخلص جديد" لإضافة أول مستخلص
                                            </p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal: Create Contractor Invoice */}
            {createModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
                    <div className="bg-slate-900 border border-white/15 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                            <div className="flex items-center gap-2">
                                <span className="text-xl">👷</span>
                                <h3 className="text-base font-black text-white">
                                    إنشاء مستخلص مقاول جديد
                                </h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setCreateModalOpen(false)}
                                className="text-slate-400 hover:text-white text-sm"
                            >
                                ✕
                            </button>
                        </div>

                        {formError && (
                            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold">
                                ⚠️ {formError}
                            </div>
                        )}

                        <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
                            {/* Cost Center / Project Select */}
                            <div>
                                <label className="block font-bold text-slate-300 mb-1.5">
                                    مركز التكلفة (المشروع / قطعة الأرض) *
                                </label>
                                <select
                                    value={formData.cost_center_id}
                                    onChange={(e) =>
                                        setFormData({ ...formData, cost_center_id: Number(e.target.value) })
                                    }
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-amber-500"
                                >
                                    {costCenters.map((cc) => (
                                        <option key={cc.id} value={cc.id}>
                                            {cc.code} - {cc.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Contractor Name */}
                            <div>
                                <label className="block font-bold text-slate-300 mb-1.5">
                                    اسم المقاول أو الشركة المنفذة *
                                </label>
                                <input
                                    type="text"
                                    placeholder="مثال: شركة النيل للخرسانات، مقاول بياض المحارة..."
                                    value={formData.contractor_name}
                                    onChange={(e) =>
                                        setFormData({ ...formData, contractor_name: e.target.value })
                                    }
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                {/* Invoice Number */}
                                <div>
                                    <label className="block font-bold text-slate-300 mb-1.5">
                                        رقم المستخلص *
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="مثال: INV-CTR-2026-001"
                                        value={formData.invoice_number}
                                        onChange={(e) =>
                                            setFormData({ ...formData, invoice_number: e.target.value })
                                        }
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white font-mono placeholder-slate-500 focus:outline-none focus:border-amber-500"
                                    />
                                </div>

                                {/* Date */}
                                <div>
                                    <label className="block font-bold text-slate-300 mb-1.5">
                                        تاريخ المستخلص *
                                    </label>
                                    <input
                                        type="date"
                                        value={formData.date}
                                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-amber-500"
                                    />
                                </div>
                            </div>

                            {/* Amount & Initial Status */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block font-bold text-slate-300 mb-1.5">
                                        قيمة المستخلص (ج.م) *
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0.01"
                                        placeholder="0.00"
                                        value={formData.amount || ""}
                                        onChange={(e) =>
                                            setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })
                                        }
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-amber-400 font-bold font-mono focus:outline-none focus:border-amber-500"
                                    />
                                </div>

                                <div>
                                    <label className="block font-bold text-slate-300 mb-1.5">
                                        الحالة المبدئية
                                    </label>
                                    <select
                                        value={formData.status}
                                        onChange={(e) =>
                                            setFormData({
                                                ...formData,
                                                status: e.target.value as "DRAFT" | "PENDING_APPROVAL",
                                            })
                                        }
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-amber-500"
                                    >
                                        <option value="DRAFT">مسودة (DRAFT)</option>
                                        <option value="PENDING_APPROVAL">بانتظار الاعتماد (PENDING)</option>
                                    </select>
                                </div>
                            </div>

                            {/* Description */}
                            <div>
                                <label className="block font-bold text-slate-300 mb-1.5">
                                    بيان الأعمال المنفذة
                                </label>
                                <textarea
                                    rows={3}
                                    placeholder="شرح وتفاصيل الأعمال المنجزة في هذا المستخلص..."
                                    value={formData.description}
                                    onChange={(e) =>
                                        setFormData({ ...formData, description: e.target.value })
                                    }
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                                />
                            </div>

                            {/* Actions */}
                            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                                <button
                                    type="button"
                                    onClick={() => setCreateModalOpen(false)}
                                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition-all cursor-pointer"
                                >
                                    إلغاء
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black shadow-lg shadow-amber-500/20 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                                >
                                    {submitting ? "جاري الحفظ..." : "حفظ المستخلص"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: View Generated Journal Entry */}
            {selectedInvoiceForEntry && selectedInvoiceForEntry.journal_entry && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
                    <div className="bg-slate-900 border border-cyan-500/30 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                            <div className="flex items-center gap-2">
                                <span className="text-xl">📑</span>
                                <div>
                                    <h3 className="text-base font-black text-white">
                                        تفاصيل قيد اليومية الآلي (Journal Entry)
                                    </h3>
                                    <span className="text-[11px] text-cyan-400 font-mono">
                                        رقم القيد: #{selectedInvoiceForEntry.journal_entry.id} | المرجع:{" "}
                                        {selectedInvoiceForEntry.journal_entry.reference_number}
                                    </span>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedInvoiceForEntry(null)}
                                className="text-slate-400 hover:text-white text-sm"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-xs text-slate-300">
                            <div className="flex justify-between mb-1">
                                <span className="text-slate-400">تاريخ القيد:</span>
                                <span className="font-mono text-white">
                                    {selectedInvoiceForEntry.journal_entry.date}
                                </span>
                            </div>
                            <div className="flex justify-between mb-1">
                                <span className="text-slate-400">حالة القيد:</span>
                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold text-[10px]">
                                    {selectedInvoiceForEntry.journal_entry.status}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400">شرح القيد:</span>
                                <span className="text-white">
                                    {selectedInvoiceForEntry.journal_entry.description}
                                </span>
                            </div>
                        </div>

                        {/* Lines Table */}
                        <div className="overflow-x-auto rounded-xl border border-slate-800">
                            <table className="w-full text-right text-xs">
                                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                                    <tr>
                                        <th className="p-2.5">الحساب</th>
                                        <th className="p-2.5">مركز التكلفة</th>
                                        <th className="p-2.5 text-emerald-400">مدين (Debit)</th>
                                        <th className="p-2.5 text-amber-400">دائن (Credit)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/80 bg-slate-900/50">
                                    {selectedInvoiceForEntry.journal_entry.lines?.map((line) => (
                                        <tr key={line.id}>
                                            <td className="p-2.5">
                                                <span className="font-mono text-amber-300 block font-bold">
                                                    {line.account?.code}
                                                </span>
                                                <span className="text-slate-200">
                                                    {line.account?.name}
                                                </span>
                                            </td>
                                            <td className="p-2.5">
                                                {line.cost_center_id ? (
                                                    <span className="px-2 py-0.5 rounded bg-cyan-950 border border-cyan-800 text-cyan-300 font-mono text-[10px]">
                                                        {selectedInvoiceForEntry.cost_center?.code}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-600">—</span>
                                                )}
                                            </td>
                                            <td className="p-2.5 font-mono font-bold text-emerald-400">
                                                {Number(line.debit) > 0 ? money(line.debit) : "—"}
                                            </td>
                                            <td className="p-2.5 font-mono font-bold text-amber-400">
                                                {Number(line.credit) > 0 ? money(line.credit) : "—"}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex justify-end pt-2">
                            <button
                                type="button"
                                onClick={() => setSelectedInvoiceForEntry(null)}
                                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all"
                            >
                                إغلاق
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ContractorInvoicesPage;
