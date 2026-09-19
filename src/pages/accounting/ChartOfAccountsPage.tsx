import React, { useEffect, useState, useMemo } from "react";
import { getAccountsTreeApi } from "../../api/accountingApi";
import { Account, AccountType } from "../../types/accounting";
import { parseApiError } from "../../utils/apiError";

interface AccountTypeConfig {
    key: string;
    label: string;
    icon: string;
    codePrefix: string;
    color: string;
    activeBg: string;
    badgeColor: string;
}

const ACCOUNT_TYPES: AccountTypeConfig[] = [
    {
        key: "all",
        label: "جميع الحسابات",
        icon: "📑",
        codePrefix: "",
        color: "text-slate-200",
        activeBg: "bg-slate-800 border-amber-500/60 shadow-amber-500/10",
        badgeColor: "bg-slate-800 text-slate-300 border-slate-700",
    },
    {
        key: "asset",
        label: "الأصول (Assets)",
        icon: "🏛️",
        codePrefix: "1",
        color: "text-emerald-400",
        activeBg: "bg-emerald-950/40 border-emerald-500/60 shadow-emerald-500/10",
        badgeColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    },
    {
        key: "liability",
        label: "الخصوم (Liabilities)",
        icon: "⚖️",
        codePrefix: "2",
        color: "text-amber-400",
        activeBg: "bg-amber-950/40 border-amber-500/60 shadow-amber-500/10",
        badgeColor: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    },
    {
        key: "equity",
        label: "حقوق الملكية (Equity)",
        icon: "💎",
        codePrefix: "3",
        color: "text-purple-400",
        activeBg: "bg-purple-950/40 border-purple-500/60 shadow-purple-500/10",
        badgeColor: "bg-purple-500/10 text-purple-400 border-purple-500/30",
    },
    {
        key: "revenue",
        label: "الإيرادات (Revenue)",
        icon: "📈",
        codePrefix: "4",
        color: "text-cyan-400",
        activeBg: "bg-cyan-950/40 border-cyan-500/60 shadow-cyan-500/10",
        badgeColor: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
    },
    {
        key: "expense",
        label: "المصروفات (Expenses)",
        icon: "📉",
        codePrefix: "5",
        color: "text-rose-400",
        activeBg: "bg-rose-950/40 border-rose-500/60 shadow-rose-500/10",
        badgeColor: "bg-rose-500/10 text-rose-400 border-rose-500/30",
    },
];

const getTypeBadge = (type: AccountType) => {
    switch (type) {
        case "asset":
            return { label: "أصول", color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" };
        case "liability":
            return { label: "خصوم", color: "bg-amber-500/15 text-amber-300 border-amber-500/30" };
        case "equity":
            return { label: "حقوق ملكية", color: "bg-purple-500/15 text-purple-300 border-purple-500/30" };
        case "revenue":
            return { label: "إيرادات", color: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30" };
        case "expense":
            return { label: "مصروفات", color: "bg-rose-500/15 text-rose-300 border-rose-500/30" };
        default:
            return { label: type, color: "bg-slate-700/40 text-slate-300 border-slate-600" };
    }
};

// Count total nodes recursively
const countAccountsRecursively = (nodes: Account[]): number => {
    let count = 0;
    for (const node of nodes) {
        count += 1;
        if (node.children && node.children.length > 0) {
            count += countAccountsRecursively(node.children);
        }
    }
    return count;
};

// Check if node or any of its descendants match search query
const nodeMatchesSearch = (node: Account, query: string): boolean => {
    if (!query) return true;
    const q = query.toLowerCase();
    const selfMatches = node.code.toLowerCase().includes(q) || node.name.toLowerCase().includes(q);
    if (selfMatches) return true;
    if (node.children && node.children.length > 0) {
        return node.children.some(child => nodeMatchesSearch(child, query));
    }
    return false;
};

// Filter tree based on search query
const filterTree = (nodes: Account[], query: string): Account[] => {
    if (!query) return nodes;
    const result: Account[] = [];
    for (const node of nodes) {
        if (nodeMatchesSearch(node, query)) {
            const filteredChildren = node.children ? filterTree(node.children, query) : [];
            result.push({
                ...node,
                children: filteredChildren,
            });
        }
    }
    return result;
};

// Recursive Account Tree Item Component
interface TreeNodeProps {
    node: Account;
    level: number;
    expandedMap: Record<number, boolean>;
    toggleExpand: (id: number) => void;
    searchQuery: string;
}

const AccountTreeNode: React.FC<TreeNodeProps> = ({
    node,
    level,
    expandedMap,
    toggleExpand,
    searchQuery,
}) => {
    const hasChildren = Boolean(node.children && node.children.length > 0);
    // Auto-expand if search query is present and this node has children
    const isExpanded = searchQuery.trim() ? true : Boolean(expandedMap[node.id]);
    const badge = getTypeBadge(node.type);

    const levelColors = [
        "border-r-4 border-r-amber-400 bg-slate-900/90 font-bold",
        "border-r-4 border-r-cyan-400/80 bg-slate-900/60 font-medium",
        "border-r-2 border-r-purple-400/60 bg-slate-900/40 text-slate-300",
        "border-r-2 border-r-slate-600 bg-slate-900/20 text-slate-400 text-xs",
    ];

    const currentLevelStyle = levelColors[Math.min(level - 1, levelColors.length - 1)];

    return (
        <div className="select-none transition-all duration-150">
            {/* Account Node Row */}
            <div
                className={`flex items-center justify-between p-3 my-1 rounded-xl border border-white/5 hover:border-white/15 hover:bg-slate-800/60 transition-all ${currentLevelStyle}`}
                style={{ marginRight: `${(level - 1) * 20}px` }}
            >
                {/* Right side: Expand toggle + Code + Name */}
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    {hasChildren ? (
                        <button
                            type="button"
                            onClick={() => toggleExpand(node.id)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-800/80 hover:bg-amber-500/20 hover:text-amber-300 text-slate-400 border border-slate-700/60 transition-all text-xs cursor-pointer active:scale-90"
                            title={isExpanded ? "طي الحسابات الفرعية" : "توسيع الحسابات الفرعية"}
                        >
                            {isExpanded ? "▼" : "◀"}
                        </button>
                    ) : (
                        <span className="w-7 h-7 flex items-center justify-center text-slate-600 text-xs">
                            •
                        </span>
                    )}

                    {/* Account Code in mono badge */}
                    <span className="font-mono text-xs font-black px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-amber-300 shadow-inner">
                        {node.code}
                    </span>

                    {/* Account Name */}
                    <span className="text-sm font-semibold text-slate-100 truncate">
                        {node.name}
                    </span>

                    {/* Sub-accounts count badge */}
                    {hasChildren && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400">
                            {node.children?.length} فرعي
                        </span>
                    )}
                </div>

                {/* Left side: Type badge + Level + Active status */}
                <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${badge.color}`}>
                        {badge.label}
                    </span>

                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800/60 border border-slate-700/50 text-slate-400 hidden sm:inline-block">
                        مستوى {level}
                    </span>

                    <span
                        className={`w-2.5 h-2.5 rounded-full ${
                            node.is_active ? "bg-emerald-400 shadow-sm shadow-emerald-400/50" : "bg-slate-600"
                        }`}
                        title={node.is_active ? "حساب نشط" : "حساب معطل"}
                    />
                </div>
            </div>

            {/* Render Children Recursively */}
            {hasChildren && isExpanded && (
                <div className="border-r border-slate-800/60 mr-3.5 pr-1">
                    {node.children!.map((child) => (
                        <AccountTreeNode
                            key={child.id}
                            node={child}
                            level={level + 1}
                            expandedMap={expandedMap}
                            toggleExpand={toggleExpand}
                            searchQuery={searchQuery}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export const ChartOfAccountsPage: React.FC = () => {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedType, setSelectedType] = useState<string>("all");
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [expandedMap, setExpandedMap] = useState<Record<number, boolean>>({});

    // Fetch accounts tree from backend API
    const fetchAccounts = async (typeFilter?: string) => {
        setLoading(true);
        setError(null);
        try {
            const effectiveType = typeFilter && typeFilter !== "all" ? typeFilter : undefined;
            const data = await getAccountsTreeApi({ type: effectiveType });
            setAccounts(data);

            // Initially auto-expand level 1 roots
            const initialMap: Record<number, boolean> = {};
            data.forEach((root) => {
                initialMap[root.id] = true;
                // Also expand level 2
                if (root.children) {
                    root.children.forEach(child => {
                        initialMap[child.id] = true;
                    });
                }
            });
            setExpandedMap(initialMap);
        } catch (err) {
            setError(parseApiError(err).message || "فشل في تحميل شجرة الحسابات من الخادم.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAccounts(selectedType);
    }, [selectedType]);

    // Filter tree according to search query
    const filteredAccounts = useMemo(() => {
        return filterTree(accounts, searchQuery);
    }, [accounts, searchQuery]);

    // Total counts metrics
    const totalAccountsCount = useMemo(() => {
        return countAccountsRecursively(accounts);
    }, [accounts]);

    const toggleExpand = (id: number) => {
        setExpandedMap((prev) => ({
            ...prev,
            [id]: !prev[id],
        }));
    };

    const expandAll = () => {
        const newMap: Record<number, boolean> = {};
        const expandRecursive = (nodes: Account[]) => {
            nodes.forEach((node) => {
                newMap[node.id] = true;
                if (node.children) expandRecursive(node.children);
            });
        };
        expandRecursive(accounts);
        setExpandedMap(newMap);
    };

    const collapseAll = () => {
        setExpandedMap({});
    };

    return (
        <div className="space-y-6" dir="rtl">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 p-5 rounded-2xl border border-white/10 shadow-xl backdrop-blur-md">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-700/30 border border-amber-500/40 text-amber-300 text-xl shadow-lg">
                            🌳
                        </span>
                        <div>
                            <h1 className="text-xl font-black text-white tracking-wide">
                                شجرة الحسابات (Chart of Accounts)
                            </h1>
                            <p className="text-xs text-slate-400">
                                إدارة الهيكل المالي والمحاسبي، المستويات الشجرية، والربط بالعمليات المحاسبية
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <span className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold font-mono">
                        نظام مالي معزول (MVP)
                    </span>
                    <button
                        type="button"
                        onClick={expandAll}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl border border-slate-700 transition-all cursor-pointer active:scale-95"
                    >
                        توسيع الكل ⊞
                    </button>
                    <button
                        type="button"
                        onClick={collapseAll}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl border border-slate-700 transition-all cursor-pointer active:scale-95"
                    >
                        طي الكل ⊟
                    </button>
                    <button
                        type="button"
                        className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 text-xs font-black rounded-xl shadow-lg shadow-amber-500/20 border border-amber-400/40 transition-all flex items-center gap-2 cursor-pointer active:scale-95"
                        onClick={() => alert("سيتم تفعيل إضافة وتعديل الحسابات في المرحلة القادمة مع شاشة تسجيل قيود اليومية.")}
                    >
                        <span>+</span>
                        <span>إضافة حساب جديد</span>
                    </button>
                </div>
            </div>

            {/* Account Type Filter Tabs */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {ACCOUNT_TYPES.map((type) => {
                    const isSelected = selectedType === type.key;
                    return (
                        <button
                            key={type.key}
                            type="button"
                            onClick={() => setSelectedType(type.key)}
                            className={`p-3 rounded-xl border text-right transition-all duration-200 flex flex-col justify-between cursor-pointer ${
                                isSelected
                                    ? `${type.activeBg} shadow-lg scale-[1.02]`
                                    : "bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-800/50"
                            }`}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-lg">{type.icon}</span>
                                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${type.badgeColor}`}>
                                    {type.codePrefix ? `بادئة ${type.codePrefix}` : "الكل"}
                                </span>
                            </div>
                            <span className={`text-xs font-bold block truncate ${isSelected ? type.color : "text-slate-300"}`}>
                                {type.label}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Tree Workspace Card */}
            <div className="bg-slate-900/70 rounded-2xl border border-white/10 shadow-2xl overflow-hidden backdrop-blur-md">
                {/* Workspace Toolbar */}
                <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-950/50">
                    <div className="relative w-full sm:w-80">
                        <input
                            type="text"
                            placeholder="بحث برقم الحساب أو الاسم في الشجرة..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 pr-4 pl-8 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30"
                        />
                        <span className="absolute left-3 top-2.5 text-xs text-slate-500">🔍</span>
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-300 font-mono">
                            إجمالي الحسابات: <strong className="text-amber-400">{totalAccountsCount}</strong>
                        </span>
                        <button
                            type="button"
                            onClick={() => fetchAccounts(selectedType)}
                            disabled={loading}
                            className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer"
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
                            onClick={() => fetchAccounts(selectedType)}
                            className="px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-bold transition-all cursor-pointer"
                        >
                            إعادة المحاولة
                        </button>
                    </div>
                )}

                {/* Loading State */}
                {loading && (
                    <div className="p-8 space-y-3">
                        {[1, 2, 3, 4, 5].map((i) => (
                            <div
                                key={i}
                                className="h-12 rounded-xl bg-slate-800/40 border border-slate-800 animate-pulse flex items-center px-4 justify-between"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-5 h-5 rounded bg-slate-700/60" />
                                    <div className="w-16 h-5 rounded bg-slate-700/60" />
                                    <div className="w-48 h-5 rounded bg-slate-700/60" />
                                </div>
                                <div className="w-20 h-5 rounded bg-slate-700/60" />
                            </div>
                        ))}
                    </div>
                )}

                {/* Tree Content */}
                {!loading && !error && (
                    <div className="p-4 sm:p-6 space-y-1">
                        {filteredAccounts.length > 0 ? (
                            filteredAccounts.map((rootNode) => (
                                <AccountTreeNode
                                    key={rootNode.id}
                                    node={rootNode}
                                    level={1}
                                    expandedMap={expandedMap}
                                    toggleExpand={toggleExpand}
                                    searchQuery={searchQuery}
                                />
                            ))
                        ) : (
                            <div className="py-16 px-6 text-center">
                                <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-2xl mb-3">
                                    🔍
                                </div>
                                <h3 className="text-sm font-bold text-slate-200 mb-1">
                                    لا توجد حسابات مطابقة للبحث
                                </h3>
                                <p className="text-xs text-slate-400">
                                    جرب تغيير معيار البحث أو اختيار تبويب نوع حسابات آخر
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ChartOfAccountsPage;
