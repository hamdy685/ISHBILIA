import React, { useEffect, useMemo, useState } from 'react';
import { getProcurementAnalyticsApi, ProcurementAnalyticsResponse, ProcurementAnalyticsFilterParams } from '../../api/procurement';
import { usePersistedState } from '../../hooks/usePersistedState';
import ErrorMessage from '../../components/ErrorMessage';
import { CurrencyDisplay } from '../../components/ui/CurrencyDisplay';
import { KpiCard } from '../../components/ui/Card';
import { parseApiError } from '../../utils/apiError';
import { DashboardBars, DashboardDonut, DashboardChartSegment } from '../../components/ui/DashboardCharts';
import { getUnitLabel } from '../../utils/units';
import { PurchasesReportView } from './PurchasesReportView';
import { useAuth } from '../../context/AuthContext';
import { formatCleanNumber, formatCleanQty } from '../../utils/numberFormat';
import { printDocumentOnly } from '../../utils/print';
import { ArabicDatePicker, ArabicMonthPicker, formatDateDMY } from '../../components/common/ArabicDatePicker';

const PURCHASE_ORDER_STATUS_LABELS: Record<string, string> = {
  PO_DRAFT: 'مسودة أمر شراء',
  ISSUED: 'صادر',
  PENDING_ACCOUNTING_REVIEW: 'بانتظار الحسابات',
  RETURNED_TO_PROCUREMENT: 'معاد للمشتريات',
  APPROVED_BY_ACCOUNTING: 'معتمد من الحسابات',
  FINAL_APPROVED: 'اعتماد نهائي',
  REJECTED: 'مرفوض',
};

const formatNumber = (value: number | string | null | undefined) =>
  formatCleanNumber(value, 0);

const formatCurrency = (value: number | string | null | undefined) =>
  formatCleanNumber(value, 2);

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatTime = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
};

const statusTone = (status: string) => {
  if (['COMPLETE', 'ISSUED', 'APPROVED_BY_ACCOUNTING', 'FINAL_APPROVED', 'APPROVED_BY_PROCUREMENT'].includes(status)) {
    return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
  }
  if (['LATE', 'REJECTED', 'RETURNED_TO_PROCUREMENT'].includes(status)) {
    return 'bg-rose-500/10 text-rose-300 border-rose-500/30';
  }
  if (['UNDER_REVIEW', 'PENDING_ACCOUNTING_REVIEW', 'PENDING_PROCUREMENT_APPROVAL', 'PARTIAL'].includes(status)) {
    return 'bg-amber-500/10 text-amber-300 border-amber-500/30';
  }
  return 'bg-slate-800 text-slate-300 border-slate-700';
};

const printStatusBadge = (status: string) => {
  const label = PURCHASE_ORDER_STATUS_LABELS[status] || status;
  return label;
};

const ProgressBar: React.FC<{ value: number; max: number; color?: string }> = ({ value, max, color = 'bg-cyan-400' }) => {
  const width = max > 0 ? Math.max(4, Math.min(100, (value / max) * 100)) : 4;
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden" dir="ltr">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
    </div>
  );
};

export const UniversalReportsPage: React.FC = () => {
  const { hasRole } = useAuth();
  const isSiteAccountant = hasRole('site_accountant') && !hasRole('accountant') && !hasRole('admin');

  // Main Tab: 'purchases_verified' (12 Columns Verified Purchases Report) vs 'orders_overview' (General Orders Analytics)
  const [mainTab, setMainTab] = usePersistedState<'purchases_verified' | 'orders_overview'>('reports.mainTab.v3', 'purchases_verified');

  // Filter types: 'daily' | 'monthly' | 'period' | 'custom'
  const [reportType, setReportType] = usePersistedState<'daily' | 'monthly' | 'period' | 'custom'>('reports.filterType.v1', 'daily');
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [customFrom, setCustomFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [customTo, setCustomTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [period, setPeriod] = usePersistedState('reports.period.v3', '90');
  const [status, setStatus] = usePersistedState('reports.status.v3', '');
  const [searchQuery, setSearchQuery] = useState('');
  
  // View mode: 'excel' (Spreadsheet View) vs 'dashboard' (Charts & Cards)
  const [viewMode, setViewMode] = useState<'excel' | 'dashboard'>('excel');
  const [copySuccess, setCopySuccess] = useState(false);

  const [report, setReport] = useState<ProcurementAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadReport = async () => {
    setError(null);
    setRefreshing(true);
    try {
      let activePeriod = period;
      const extraParams: Partial<ProcurementAnalyticsFilterParams> = {};

      if (reportType === 'daily') {
        activePeriod = 'today';
        extraParams.date = selectedDate;
      } else if (reportType === 'monthly') {
        activePeriod = 'this_month';
        if (selectedMonth) {
          const [year, month] = selectedMonth.split('-');
          extraParams.year = year;
          extraParams.month = month;
        }
      } else if (reportType === 'custom') {
        activePeriod = 'custom';
        extraParams.from_date = customFrom;
        extraParams.to_date = customTo;
      }

      const data = await getProcurementAnalyticsApi(activePeriod, status || undefined, extraParams);
      setReport(data);
    } catch (err) {
      setError(parseApiError(err).message || 'تعذر تحميل التقرير الشامل.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadReport();
  }, [reportType, selectedDate, selectedMonth, customFrom, customTo, period, status]);

  const metrics = report?.metrics;

  // Filtered orders based on local search
  const filteredOrders = useMemo(() => {
    if (!report?.recent_purchase_orders) return [];
    if (!searchQuery.trim()) return report.recent_purchase_orders;
    const q = searchQuery.trim().toLowerCase();
    return report.recent_purchase_orders.filter((po) => {
      const matchPo = po.po_number?.toLowerCase().includes(q);
      const matchSup = po.supplier_name?.toLowerCase().includes(q);
      const matchDept = po.department_name?.toLowerCase().includes(q);
      const matchItem = po.items?.some((it) => it.item_description?.toLowerCase().includes(q));
      return matchPo || matchSup || matchDept || matchItem;
    });
  }, [report?.recent_purchase_orders, searchQuery]);

  // Calculate live total for filtered orders
  const filteredOrdersTotal = useMemo(() => {
    return filteredOrders.reduce((sum, po) => sum + Number(po.grand_total || 0), 0);
  }, [filteredOrders]);

  // Report Title Detail Label
  const reportSubtitle = useMemo(() => {
    if (reportType === 'daily') {
      const d = new Date(selectedDate);
      return `التقرير اليومي - ${d.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
    }
    if (reportType === 'monthly') {
      const [y, m] = selectedMonth.split('-');
      const d = new Date(Number(y), Number(m) - 1, 1);
      return `التقرير الشهري - ${d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long' })}`;
    }
    if (reportType === 'custom') {
      return `فترة مخصصة: من ${formatDateDMY(customFrom)} إلى ${formatDateDMY(customTo)}`;
    }
    const periodMap: Record<string, string> = {
      '30': 'آخر 30 يوم',
      '90': 'آخر 90 يوم',
      '180': 'آخر 6 أشهر',
      '365': 'آخر سنة مالية',
      'all': 'كافة الفترات المسجلة',
    };
    return periodMap[period] || `آخر ${period} يوم`;
  }, [reportType, selectedDate, selectedMonth, customFrom, customTo, period]);

  // Visual Chart Segments
  const departmentSegments: DashboardChartSegment[] = useMemo(() => {
    if (!report?.department_breakdown?.length) return [];
    return report.department_breakdown.slice(0, 6).map((item) => ({
      label: item.name || 'عام',
      value: Number(item.total_value || 0),
    }));
  }, [report?.department_breakdown]);

  const supplierSegments: DashboardChartSegment[] = useMemo(() => {
    if (!report?.supplier_breakdown?.length) return [];
    return report.supplier_breakdown.slice(0, 6).map((item) => ({
      label: item.company_name || 'غير محدد',
      value: Number(item.total_value || 0),
    }));
  }, [report?.supplier_breakdown]);

  const maxDeptSpend = useMemo(
    () => Math.max(...(report?.department_breakdown?.map((d) => Number(d.total_value || 0)) || [0]), 1),
    [report?.department_breakdown],
  );

  const maxSupplierSpend = useMemo(
    () => Math.max(...(report?.supplier_breakdown?.map((s) => Number(s.total_value || 0)) || [0]), 1),
    [report?.supplier_breakdown],
  );

  // 1. Export CSV (Excel Compatible with UTF-8 BOM)
  const handleExportCsv = () => {
    if (!report) return;
    const headers = [
      'م',
      'رقم أمر الشراء',
      'تاريخ الإصدار',
      'المورد',
      'هاتف المورد',
      'القسم / المشروع',
      'بيان الأصناف والبنود',
      'الكمية',
      'الوحدة',
      'سعر الوحدة (ج.م)',
      'إجمالي البند (ج.م)',
      'إجمالي أمر الشراء (ج.م)',
      'الحالة',
    ];

    const rows: Array<Array<string | number>> = [];
    let serial = 1;

    filteredOrders.forEach((po) => {
      const orderDate = formatDate(po.created_at || po.updated_at);
      const poStatus = PURCHASE_ORDER_STATUS_LABELS[po.status] || po.status;

      if (po.items && po.items.length > 0) {
        po.items.forEach((item, idx) => {
          rows.push([
            idx === 0 ? serial : '',
            idx === 0 ? po.po_number : '',
            idx === 0 ? orderDate : '',
            idx === 0 ? (po.supplier_name || 'غير محدد') : '',
            idx === 0 ? (po.supplier_phone || '—') : '',
            idx === 0 ? (po.department_name || 'عام') : '',
            item.item_description || '—',
            item.quantity ?? '—',
            getUnitLabel(item.uom) || '—',
            item.unit_price ?? '—',
            item.line_total ?? item.grand_total ?? '—',
            idx === 0 ? po.grand_total : '',
            idx === 0 ? poStatus : '',
          ]);
        });
        serial++;
      } else {
        rows.push([
          serial++,
          po.po_number,
          orderDate,
          po.supplier_name || 'غير محدد',
          po.supplier_phone || '—',
          po.department_name || 'عام',
          '—',
          '—',
          '—',
          '—',
          '—',
          po.grand_total,
          poStatus,
        ]);
      }
    });

    // Summary row
    rows.push([
      'الإجمالي العام',
      `عدد الأوامر: ${filteredOrders.length}`,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      filteredOrdersTotal.toFixed(2),
      '',
    ]);

    const csvContent =
      '\uFEFF' +
      [headers.join(','), ...rows.map((e) => e.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `تقرير_مشتريات_${reportType}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 2. Copy TSV to Clipboard for Excel Direct Paste (Ctrl+V into Excel)
  const handleCopyToClipboard = () => {
    if (!report || !filteredOrders.length) return;
    const headers = [
      'م',
      'رقم أمر الشراء',
      'تاريخ الإصدار',
      'المورد',
      'القسم / المشروع',
      'الأصناف والبنود',
      'الكمية',
      'الوحدة',
      'سعر الوحدة',
      'إجمالي البند',
      'إجمالي الأمر',
      'الحالة',
    ];

    const lines: string[] = [headers.join('\t')];
    let serial = 1;

    filteredOrders.forEach((po) => {
      const orderDate = formatDate(po.created_at || po.updated_at);
      const poStatus = PURCHASE_ORDER_STATUS_LABELS[po.status] || po.status;

      if (po.items && po.items.length > 0) {
        po.items.forEach((item, idx) => {
          lines.push([
            idx === 0 ? String(serial) : '',
            idx === 0 ? po.po_number : '',
            idx === 0 ? orderDate : '',
            idx === 0 ? (po.supplier_name || 'غير محدد') : '',
            idx === 0 ? (po.department_name || 'عام') : '',
            item.item_description || '—',
            String(item.quantity ?? '—'),
            getUnitLabel(item.uom) || '—',
            String(item.unit_price ?? '—'),
            String(item.line_total ?? item.grand_total ?? '—'),
            idx === 0 ? String(po.grand_total) : '',
            idx === 0 ? poStatus : '',
          ].join('\t'));
        });
        serial++;
      } else {
        lines.push([
          String(serial++),
          po.po_number,
          orderDate,
          po.supplier_name || 'غير محدد',
          po.department_name || 'عام',
          '—',
          '—',
          '—',
          '—',
          '—',
          String(po.grand_total),
          poStatus,
        ].join('\t'));
      }
    });

    // Summary line
    lines.push([
      'الإجمالي العام',
      `عدد الأوامر: ${filteredOrders.length}`,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      filteredOrdersTotal.toFixed(2),
      '',
    ].join('\t'));

    void navigator.clipboard.writeText(lines.join('\n'));
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 3000);
  };

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      {/* Top Tab Bar between Purchases Report (12 cols) and Orders Analytics */}
      <div className="print:hidden flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-2.5 shadow-lg">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setMainTab('purchases_verified')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all ${
              mainTab === 'purchases_verified'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <span>📑</span>
            <span>تقرير المشتريات المحاسبي المعتمد (12 عموداً بعد تسجيل الفاتورة)</span>
          </button>

          <button
            type="button"
            onClick={() => setMainTab('orders_overview')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all ${
              mainTab === 'orders_overview'
                ? 'bg-slate-800 text-cyan-300 border border-slate-700 shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <span>📊</span>
            <span>تحليلات المشتريات ومؤشرات الأوامر المفوترة</span>
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-2 px-3 text-[11px] font-bold text-slate-500">
          <span>🔒 وصول مصرح: الحسابات • الإدارة التنفيذية • المشتريات</span>
        </div>
      </div>

      {mainTab === 'purchases_verified' ? (
        <PurchasesReportView />
      ) : (
        <>
          {/* ========================================================================= */}
          {/* ── 1. OFFICIAL EXCEL PRINT DOCUMENT (Visible ONLY during window.print()) ── */}
          {/* ========================================================================= */}
          <div className="hidden print:block font-sans text-black bg-white p-0 m-0 print:m-0 print:p-0 universal-report-print-target">
        
        {/* Official Header */}
        <div className="border-b-2 border-black pb-3 mb-3 flex items-start justify-between">
          <div className="space-y-1">
            <h1 className="text-xl font-black text-black tracking-tight">شركة اشبيلية للتطوير العقاري والمقاولات</h1>
            <h2 className="text-sm font-bold text-slate-800">
              تقرير أوامر الشراء والمشتريات المحاسبي ({reportSubtitle})
            </h2>
          </div>
          <div className="text-left text-[11px] font-mono border border-black p-2 rounded bg-slate-50">
            <div>تاريخ الطباعة: {new Date().toLocaleDateString('ar-EG')}</div>
            <div>وقت الطباعة: {new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</div>
            <div>حالة التقرير: معتمد رسمي</div>
          </div>
        </div>

        {/* Excel Summary Metadata Box */}
        <div className="grid grid-cols-4 gap-2 mb-3 text-xs border border-black bg-slate-100 p-2 font-semibold">
          <div className="border-l border-slate-400 pl-2">
            <span className="text-slate-600 block text-[10px]">نطاق التقرير:</span>
            <span className="font-bold text-black">{reportSubtitle}</span>
          </div>
          <div className="border-l border-slate-400 pl-2">
            <span className="text-slate-600 block text-[10px]">حالة الأوامر:</span>
            <span className="font-bold text-black">{status ? PURCHASE_ORDER_STATUS_LABELS[status] : 'جميع الحالات'}</span>
          </div>
          <div className="border-l border-slate-400 pl-2">
            <span className="text-slate-600 block text-[10px]">عدد الأوامر الصادرة:</span>
            <span className="font-bold text-black font-mono">{formatNumber(filteredOrders.length)} أمر شراء</span>
          </div>
          <div>
            <span className="text-slate-600 block text-[10px]">إجمالي قيمة المشتريات:</span>
            <span className="font-black text-black font-mono text-sm">{formatCurrency(filteredOrdersTotal)} ج.م</span>
          </div>
        </div>

        {/* ── Main Excel Sheet Table ── */}
        <div className="mb-4">
          <table className="w-full border-collapse border-2 border-black text-[10px] text-right">
            <thead>
              <tr className="bg-slate-200 border-b-2 border-black font-black text-black">
                <th className="border border-black px-1.5 py-1 text-center w-8">م</th>
                <th className="border border-black px-2 py-1 text-center w-24">رقم الأمر</th>
                <th className="border border-black px-2 py-1 text-center w-20">التاريخ</th>
                <th className="border border-black px-2 py-1">اسم المورد</th>
                <th className="border border-black px-2 py-1">القسم / المشروع</th>
                <th className="border border-black px-2 py-1">بيان الأصناف والبنود المطلوبة</th>
                <th className="border border-black px-2 py-1 text-center w-14">الكمية</th>
                <th className="border border-black px-1.5 py-1 text-center w-12">الوحدة</th>
                <th className="border border-black px-2 py-1 text-center w-16">سعر الوحدة</th>
                <th className="border border-black px-2 py-1 text-center w-20">الإجمالي (ج.م)</th>
                <th className="border border-black px-2 py-1 text-center w-18">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length > 0 ? (
                filteredOrders.map((po, poIdx) => {
                  const itemsCount = po.items?.length || 1;
                  const orderDate = formatDate(po.created_at || po.updated_at);

                  return (
                    <React.Fragment key={po.id}>
                      {po.items && po.items.length > 0 ? (
                        po.items.map((item, itemIdx) => (
                          <tr
                            key={`${po.id}-${item.id || itemIdx}`}
                            className={poIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}
                          >
                            {itemIdx === 0 && (
                              <td
                                rowSpan={itemsCount}
                                className="border border-black px-1.5 py-1 text-center font-mono font-bold align-middle"
                              >
                                {poIdx + 1}
                              </td>
                            )}
                            {itemIdx === 0 && (
                              <td
                                rowSpan={itemsCount}
                                className="border border-black px-2 py-1 font-mono font-bold text-center align-middle whitespace-nowrap"
                              >
                                {po.po_number}
                              </td>
                            )}
                            {itemIdx === 0 && (
                              <td
                                rowSpan={itemsCount}
                                className="border border-black px-2 py-1 text-center font-mono align-middle whitespace-nowrap text-[9px]"
                              >
                                {orderDate}
                              </td>
                            )}
                            {itemIdx === 0 && (
                              <td
                                rowSpan={itemsCount}
                                className="border border-black px-2 py-1 font-bold align-middle"
                              >
                                {po.supplier_name || 'غير محدد'}
                                {po.supplier_phone && (
                                  <span className="block text-[8px] font-mono text-slate-600">
                                    {po.supplier_phone}
                                  </span>
                                )}
                              </td>
                            )}
                            {itemIdx === 0 && (
                              <td
                                rowSpan={itemsCount}
                                className="border border-black px-2 py-1 align-middle text-slate-800"
                              >
                                {po.department_name || 'عام'}
                              </td>
                            )}
                            <td className="border border-black px-2 py-1">
                              <span className="font-semibold">{item.item_description || '—'}</span>
                              {item.region && (
                                <span className="text-[8px] text-slate-600 mr-1">({item.region})</span>
                              )}
                            </td>
                            <td className="border border-black px-2 py-1 text-center font-mono">
                              {item.quantity !== undefined && item.quantity !== null ? formatCleanQty(item.quantity) : '—'}
                            </td>
                            <td className="border border-black px-1.5 py-1 text-center">
                              {getUnitLabel(item.uom) || '—'}
                            </td>
                            <td className="border border-black px-2 py-1 text-center font-mono">
                              {item.unit_price ? formatCleanNumber(item.unit_price) : '—'}
                            </td>
                            <td className="border border-black px-2 py-1 text-center font-mono font-bold">
                              {item.line_total || item.grand_total
                                ? formatCleanNumber(item.line_total || item.grand_total)
                                : '—'}
                            </td>
                            {itemIdx === 0 && (
                              <td
                                rowSpan={itemsCount}
                                className="border border-black px-2 py-1 text-center font-bold align-middle text-[9px]"
                              >
                                {printStatusBadge(po.status)}
                              </td>
                            )}
                          </tr>
                        ))
                      ) : (
                        <tr className={poIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="border border-black px-1.5 py-1 text-center font-mono font-bold">
                            {poIdx + 1}
                          </td>
                          <td className="border border-black px-2 py-1 font-mono font-bold text-center">
                            {po.po_number}
                          </td>
                          <td className="border border-black px-2 py-1 text-center font-mono">
                            {orderDate}
                          </td>
                          <td className="border border-black px-2 py-1 font-bold">
                            {po.supplier_name || 'غير محدد'}
                          </td>
                          <td className="border border-black px-2 py-1">
                            {po.department_name || 'عام'}
                          </td>
                          <td className="border border-black px-2 py-1" colSpan={4}>
                            —
                          </td>
                          <td className="border border-black px-2 py-1 text-center font-mono font-bold">
                            {formatCurrency(po.grand_total)}
                          </td>
                          <td className="border border-black px-2 py-1 text-center font-bold">
                            {printStatusBadge(po.status)}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={11} className="border border-black text-center py-6 text-slate-500 font-bold">
                    لا توجد أوامر شراء أو تعاملات مسجلة ضمن هذه الفترة المحددة.
                  </td>
                </tr>
              )}
            </tbody>
            {/* Excel Grand Total Row */}
            <tfoot>
              <tr className="bg-slate-200 border-t-2 border-black font-black text-black">
                <td colSpan={9} className="border border-black px-3 py-1.5 text-right font-black text-xs">
                  الإجمالي العام لمشتريات الفترة ({filteredOrders.length} أمر شراء صادر):
                </td>
                <td className="border border-black px-2 py-1.5 text-center font-mono font-black text-xs">
                  {formatCurrency(filteredOrdersTotal)} ج.م
                </td>
                <td className="border border-black px-2 py-1.5 text-center text-[9px] font-bold">
                  معتمد
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ── Supplementary Excel Summary Tables (Suppliers & Departments) ── */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {/* Top Suppliers Summary Table */}
          <div className="border border-black p-2">
            <h3 className="text-xs font-black mb-1.5 border-b border-black pb-1">
              📊 ملخص إجمالي الإنفاق حسب الموردين
            </h3>
            <table className="w-full text-[9px] border-collapse">
              <thead>
                <tr className="border-b border-black bg-slate-100 font-bold">
                  <th className="p-1 text-right">المورد</th>
                  <th className="p-1 text-center">الأوامر</th>
                  <th className="p-1 text-center">الإجمالي (ج.م)</th>
                </tr>
              </thead>
              <tbody>
                {report?.supplier_breakdown?.slice(0, 5).map((sup, idx) => (
                  <tr key={idx} className="border-b border-slate-300">
                    <td className="p-1 font-semibold">{sup.company_name || 'غير محدد'}</td>
                    <td className="p-1 text-center font-mono">{sup.count}</td>
                    <td className="p-1 text-center font-mono font-bold">{formatCurrency(sup.total_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Department Spending Summary Table */}
          <div className="border border-black p-2">
            <h3 className="text-xs font-black mb-1.5 border-b border-black pb-1">
              🏗️ ملخص إجمالي الإنفاق حسب الأقسام والمشاريع
            </h3>
            <table className="w-full text-[9px] border-collapse">
              <thead>
                <tr className="border-b border-black bg-slate-100 font-bold">
                  <th className="p-1 text-right">القسم / المشروع</th>
                  <th className="p-1 text-center">الأوامر</th>
                  <th className="p-1 text-center">الإجمالي (ج.م)</th>
                </tr>
              </thead>
              <tbody>
                {report?.department_breakdown?.slice(0, 5).map((dept, idx) => (
                  <tr key={idx} className="border-b border-slate-300">
                    <td className="p-1 font-semibold">{dept.name || 'عام'}</td>
                    <td className="p-1 text-center font-mono">{dept.count}</td>
                    <td className="p-1 text-center font-mono font-bold">{formatCurrency(dept.total_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Official Signatures Box ── */}
        <div className="border-2 border-black p-3 mt-4">
          <div className="grid grid-cols-3 text-center text-xs font-bold divide-x divide-x-reverse divide-black">
            <div className="space-y-8">
              <div>إعداد مسؤول المشتريات</div>
              <div className="text-[10px] text-slate-500 font-normal">التوقيع: ____________________</div>
            </div>
            <div className="space-y-8">
              <div>مراجعة الحسابات والمالية</div>
              <div className="text-[10px] text-slate-500 font-normal">التوقيع: ____________________</div>
            </div>
            <div className="space-y-8">
              <div>اعتماد الإدارة العامة</div>
              <div className="text-[10px] text-slate-500 font-normal">التوقيع: ____________________</div>
            </div>
          </div>
        </div>

      </div>


      {/* ========================================================================= */}
      {/* ── 2. SCREEN VIEW & CONTROLS (Hidden during printing via print:hidden) ── */}
      {/* ========================================================================= */}
      <div className="print:hidden space-y-5">
        
        {/* Page Top Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="h-3 w-3 rounded-full bg-emerald-400 animate-pulse" />
              <h1 className="text-xl font-black text-slate-100 flex items-center gap-2">
                <span>📑</span> تقارير المشتريات والبيانات المحاسبية
              </h1>
              {isSiteAccountant && (
                <span className="rounded-xl border border-amber-700/60 bg-amber-950/50 px-2.5 py-0.5 text-xs font-bold text-amber-300">
                  أقسام التنفيذ والتشطيبات والمباني
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              طباعة وتصدير تقارير المشتريات اليومية والشهرية بنمط جدول إكسل محاسبي مسطر ومعتمد.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Print Button */}
            <button
              type="button"
              onClick={() => printDocumentOnly('.universal-report-print-target', { orientation: 'landscape', title: `تقرير أوامر الشراء والمشتريات (${reportSubtitle})` })}
              className="flex items-center gap-2 rounded-xl border border-emerald-600/60 bg-emerald-700/30 hover:bg-emerald-600/50 px-4 py-2 text-xs font-bold text-emerald-200 transition-all shadow-sm"
              title="طباعة تقرير إكسيل فوري"
            >
              <span className="text-base">🖨️</span>
              <span>طباعة تقرير إكسل</span>
            </button>


            {/* Export CSV / Excel */}
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!report || !filteredOrders.length}
              className="flex items-center gap-2 rounded-xl border border-emerald-800/80 bg-slate-900 px-3.5 py-2 text-xs font-bold text-emerald-300 hover:bg-slate-800 transition-colors disabled:opacity-50"
              title="تحميل ملف إكسيل CSV"
            >
              <span className="text-base">📥</span>
              <span>تصدير إكسيل (CSV)</span>
            </button>

            {/* Copy for Excel */}
            <button
              type="button"
              onClick={handleCopyToClipboard}
              disabled={!report || !filteredOrders.length}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800 transition-colors disabled:opacity-50"
              title="نسخ للـ Excel (Ctrl+V)"
            >
              <span>{copySuccess ? '✅' : '📋'}</span>
              <span>{copySuccess ? 'تم النسخ للإكسل!' : 'نسخ للإكسيل'}</span>
            </button>

            {/* Refresh */}
            <button
              type="button"
              onClick={() => void loadReport()}
              disabled={refreshing}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              <span className={refreshing ? 'animate-spin' : ''}>🔄</span>
              <span>تحديث</span>
            </button>
          </div>
        </div>

        {error && <ErrorMessage error={error} />}

        {/* ── Filter Bar (Daily / Monthly / Custom) ── */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
            
            {/* Filter Mode Selector Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-400 ml-1">نوع التقرير:</span>
              
              {/* Daily Report Button */}
              <button
                type="button"
                onClick={() => setReportType('daily')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  reportType === 'daily'
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/40'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-700'
                }`}
              >
                <span>📅</span>
                <span>تقرير يومي</span>
              </button>

              {/* Monthly Report Button */}
              <button
                type="button"
                onClick={() => setReportType('monthly')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  reportType === 'monthly'
                    ? 'bg-cyan-600 text-white shadow-md shadow-cyan-900/40'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-700'
                }`}
              >
                <span>🗓️</span>
                <span>تقرير شهري</span>
              </button>

              {/* Custom Date Range Button */}
              <button
                type="button"
                onClick={() => setReportType('custom')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  reportType === 'custom'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-700'
                }`}
              >
                <span>⏳</span>
                <span>فترة مخصصة</span>
              </button>

              {/* All Periods Button */}
              <button
                type="button"
                onClick={() => {
                  setReportType('period');
                  setPeriod('all');
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  reportType === 'period' && period === 'all'
                    ? 'bg-slate-700 text-white'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-700'
                }`}
              >
                <span>🌐</span>
                <span>كل الفترات</span>
              </button>
            </div>

            {/* View Mode Switcher (Excel Table vs Visual Dashboard) */}
            <div className="flex items-center bg-slate-900 rounded-xl p-1 border border-slate-800">
              <button
                type="button"
                onClick={() => setViewMode('excel')}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                  viewMode === 'excel'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>📊</span>
                <span>جدول بيانات إكسل</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('dashboard')}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                  viewMode === 'dashboard'
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>📈</span>
                <span>المؤشرات والرسوم</span>
              </button>
            </div>
          </div>

          {/* Secondary Filter Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              
              {/* Daily Picker */}
              {reportType === 'daily' && (
                <div className="flex items-center gap-2">
                  <ArabicDatePicker
                    value={selectedDate}
                    onChange={setSelectedDate}
                    label="اختر اليوم:"
                  />
                  <button
                    type="button"
                    onClick={() => setSelectedDate(new Date().toISOString().slice(0, 10))}
                    className="text-[11px] font-bold text-emerald-400 hover:underline"
                  >
                    اليوم الحالي
                  </button>
                </div>
              )}

              {/* Monthly Picker */}
              {reportType === 'monthly' && (
                <div className="flex items-center gap-2">
                  <ArabicMonthPicker
                    value={selectedMonth}
                    onChange={setSelectedMonth}
                    label="اختر الشهر:"
                  />
                  <button
                    type="button"
                    onClick={() => setSelectedMonth(new Date().toISOString().slice(0, 7))}
                    className="text-[11px] font-bold text-cyan-400 hover:underline"
                  >
                    الشهر الحالي
                  </button>
                </div>
              )}

              {/* Custom Range Pickers */}
              {reportType === 'custom' && (
                <div className="flex flex-wrap items-center gap-2">
                  <ArabicDatePicker
                    value={customFrom}
                    onChange={setCustomFrom}
                    label="من:"
                  />
                  <span className="text-xs font-bold text-slate-400">إلى:</span>
                  <ArabicDatePicker
                    value={customTo}
                    onChange={setCustomTo}
                    label=""
                  />
                </div>
              )}

              {/* Preset Period Picker */}
              {reportType === 'period' && period !== 'all' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-300">الفترة:</span>
                  <select
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-200 focus:outline-none"
                  >
                    <option value="30">آخر 30 يوم</option>
                    <option value="90">آخر 90 يوم (الربع الحالي)</option>
                    <option value="180">آخر 6 أشهر</option>
                    <option value="365">آخر سنة مالية</option>
                  </select>
                </div>
              )}

              {/* Status Filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-400">الحالة:</span>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-200 focus:border-cyan-500 focus:outline-none"
                >
                  <option value="">جميع الحالات</option>
                  <option value="APPROVED_BY_ACCOUNTING">معتمد من الحسابات</option>
                  <option value="FINAL_APPROVED">اعتماد نهائي</option>
                  <option value="ISSUED">صادر</option>
                  <option value="PENDING_ACCOUNTING_REVIEW">بانتظار الحسابات</option>
                  <option value="PO_DRAFT">مسودة أمر</option>
                  <option value="REJECTED">مرفوض</option>
                </select>
              </div>
            </div>

            {/* Quick Search */}
            <div className="relative min-w-[220px]">
              <input
                type="text"
                placeholder="بحث برقم الأمر، المورد، الصنف..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 pl-3 pr-8 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
              />
              <span className="absolute right-2.5 top-2 text-xs text-slate-500">🔍</span>
            </div>
          </div>
        </div>

        {/* Loading Spinner */}
        {loading ? (
          <div className="flex min-h-[300px] items-center justify-center rounded-2xl border border-slate-800 bg-slate-950/40 p-8 text-emerald-300">
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
              <span className="text-xs font-bold text-slate-400">جاري تجميع وحساب بيانات تقرير المشتريات المعتمد...</span>
            </div>
          </div>
        ) : (
          <>
            {/* Live Financial Summary Bar */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-1">
                <span className="text-[11px] font-bold text-slate-400 block">نطاق التقرير</span>
                <span className="text-xs font-extrabold text-slate-100 block truncate">{reportSubtitle}</span>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-1">
                <span className="text-[11px] font-bold text-slate-400 block">أوامر الشراء</span>
                <span className="text-base font-extrabold text-cyan-300 font-mono block">
                  {formatNumber(filteredOrders.length)} أمر
                </span>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-1">
                <span className="text-[11px] font-bold text-slate-400 block">إجمالي مشتريات الفترة</span>
                <span className="text-base font-extrabold text-emerald-300 font-mono block">
                  {formatCurrency(filteredOrdersTotal)} ج.م
                </span>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-1">
                <span className="text-[11px] font-bold text-slate-400 block">الموردين النشطين</span>
                <span className="text-base font-extrabold text-amber-300 font-mono block">
                  {formatNumber(report?.supplier_breakdown?.length || 0)} مورد
                </span>
              </div>
            </div>

            {/* ========================================================================= */}
            {/* ── OPTION A: EXCEL SPREADSHEET TABLE VIEW (Default / Focus) ───────────── */}
            {/* ========================================================================= */}
            {viewMode === 'excel' && (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5 space-y-4 shadow-xl">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                  <div>
                    <h2 className="text-sm font-black text-slate-100 flex items-center gap-2">
                      <span className="text-emerald-400">📊</span>
                      <span>جدول بيانات إكسل المحاسبي ({reportSubtitle})</span>
                    </h2>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      عرض بيانات مفصل ومسطر لكل أمر شراء وبنوده وأسعاره وإجمالياته.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 font-mono">
                      المعروض: <strong className="text-slate-200">{filteredOrders.length}</strong> أمر شراء
                    </span>
                  </div>
                </div>

                {filteredOrders.length > 0 ? (
                  <div className="overflow-x-auto rounded-xl border border-slate-800">
                    <table className="w-full text-right text-xs border-collapse min-w-[950px]">
                      <thead className="bg-slate-900 border-b border-slate-700 text-slate-300 font-black whitespace-nowrap">
                        <tr>
                          <th className="px-3 py-2.5 text-center w-10 border-l border-slate-800">م</th>
                          <th className="px-3 py-2.5 text-center border-l border-slate-800">رقم الأمر</th>
                          <th className="px-3 py-2.5 text-center border-l border-slate-800">التاريخ</th>
                          <th className="px-3 py-2.5 border-l border-slate-800">اسم المورد</th>
                          <th className="px-3 py-2.5 border-l border-slate-800">القسم / المشروع</th>
                          <th className="px-3 py-2.5 border-l border-slate-800 min-w-[220px]">بيان الأصناف والبنود</th>
                          <th className="px-3 py-2.5 text-center border-l border-slate-800 w-16">الكمية</th>
                          <th className="px-3 py-2.5 text-center border-l border-slate-800 w-14">الوحدة</th>
                          <th className="px-3 py-2.5 text-center border-l border-slate-800 w-24">سعر الوحدة</th>
                          <th className="px-3 py-2.5 text-center border-l border-slate-800 w-28">الإجمالي (ج.م)</th>
                          <th className="px-3 py-2.5 text-center">الحالة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {filteredOrders.map((po, poIdx) => {
                          const itemsCount = po.items?.length || 1;
                          const orderDate = formatDate(po.created_at || po.updated_at);

                          return (
                            <React.Fragment key={po.id}>
                              {po.items && po.items.length > 0 ? (
                                po.items.map((item, itemIdx) => (
                                  <tr
                                    key={`${po.id}-${item.id || itemIdx}`}
                                    className={`hover:bg-slate-900/60 transition-colors ${
                                      poIdx % 2 === 0 ? 'bg-slate-950/40' : 'bg-slate-900/20'
                                    }`}
                                  >
                                    {itemIdx === 0 && (
                                      <td
                                        rowSpan={itemsCount}
                                        className="px-3 py-2.5 text-center font-mono font-bold text-slate-400 border-l border-slate-800 align-middle"
                                      >
                                        {poIdx + 1}
                                      </td>
                                    )}
                                    {itemIdx === 0 && (
                                      <td
                                        rowSpan={itemsCount}
                                        className="px-3 py-2.5 font-mono font-bold text-cyan-300 text-center border-l border-slate-800 align-middle whitespace-nowrap"
                                      >
                                        {po.po_number}
                                      </td>
                                    )}
                                    {itemIdx === 0 && (
                                      <td
                                        rowSpan={itemsCount}
                                        className="px-3 py-2.5 text-center font-mono text-slate-400 border-l border-slate-800 align-middle whitespace-nowrap text-[11px]"
                                      >
                                        {orderDate}
                                      </td>
                                    )}
                                    {itemIdx === 0 && (
                                      <td
                                        rowSpan={itemsCount}
                                        className="px-3 py-2.5 font-bold text-slate-100 border-l border-slate-800 align-middle"
                                      >
                                        <div>{po.supplier_name || 'غير محدد'}</div>
                                        {po.supplier_phone && (
                                          <div className="text-[10px] font-mono text-slate-400 font-normal">
                                            {po.supplier_phone}
                                          </div>
                                        )}
                                      </td>
                                    )}
                                    {itemIdx === 0 && (
                                      <td
                                        rowSpan={itemsCount}
                                        className="px-3 py-2.5 text-slate-300 border-l border-slate-800 align-middle"
                                      >
                                        {po.department_name || 'عام'}
                                      </td>
                                    )}
                                    <td className="px-3 py-2 border-l border-slate-800">
                                      <div className="font-semibold text-slate-200">
                                        {item.item_description || '—'}
                                      </div>
                                      {item.region && (
                                        <div className="text-[10px] text-amber-400/80">الموقع: {item.region}</div>
                                      )}
                                    </td>
                                    <td className="px-3 py-2 text-center font-mono text-amber-300 border-l border-slate-800 font-bold">
                                      {item.quantity ?? '—'}
                                    </td>
                                    <td className="px-3 py-2 text-center text-slate-300 border-l border-slate-800">
                                      {getUnitLabel(item.uom) || '—'}
                                    </td>
                                    <td className="px-3 py-2 text-center font-mono text-slate-300 border-l border-slate-800">
                                      {item.unit_price ? formatCurrency(item.unit_price) : '—'}
                                    </td>
                                    <td className="px-3 py-2 text-center font-mono font-bold text-emerald-300 border-l border-slate-800">
                                      {item.line_total || item.grand_total
                                        ? formatCurrency(item.line_total || item.grand_total)
                                        : '—'}
                                    </td>
                                    {itemIdx === 0 && (
                                      <td
                                        rowSpan={itemsCount}
                                        className="px-3 py-2.5 text-center align-middle whitespace-nowrap"
                                      >
                                        <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold ${statusTone(po.status)}`}>
                                          {PURCHASE_ORDER_STATUS_LABELS[po.status] || po.status}
                                        </span>
                                      </td>
                                    )}
                                  </tr>
                                ))
                              ) : (
                                <tr className={poIdx % 2 === 0 ? 'bg-slate-950/40' : 'bg-slate-900/20'}>
                                  <td className="px-3 py-2.5 text-center font-mono font-bold text-slate-400 border-l border-slate-800">
                                    {poIdx + 1}
                                  </td>
                                  <td className="px-3 py-2.5 font-mono font-bold text-cyan-300 text-center border-l border-slate-800">
                                    {po.po_number}
                                  </td>
                                  <td className="px-3 py-2.5 text-center font-mono text-slate-400 border-l border-slate-800">
                                    {orderDate}
                                  </td>
                                  <td className="px-3 py-2.5 font-bold text-slate-100 border-l border-slate-800">
                                    {po.supplier_name || 'غير محدد'}
                                  </td>
                                  <td className="px-3 py-2.5 text-slate-300 border-l border-slate-800">
                                    {po.department_name || 'عام'}
                                  </td>
                                  <td className="px-3 py-2 border-l border-slate-800" colSpan={4}>
                                    —
                                  </td>
                                  <td className="px-3 py-2 text-center font-mono font-bold text-emerald-300 border-l border-slate-800">
                                    {formatCurrency(po.grand_total)}
                                  </td>
                                  <td className="px-3 py-2.5 text-center">
                                    <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold ${statusTone(po.status)}`}>
                                      {PURCHASE_ORDER_STATUS_LABELS[po.status] || po.status}
                                    </span>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                      {/* Excel Total Row */}
                      <tfoot className="bg-slate-900 border-t-2 border-slate-700 text-slate-100 font-black">
                        <tr>
                          <td colSpan={9} className="px-4 py-3 text-right text-xs font-black">
                            الإجمالي العام لمشتريات الفترة ({filteredOrders.length} أمر شراء):
                          </td>
                          <td className="px-3 py-3 text-center font-mono text-sm font-black text-emerald-300">
                            {formatCurrency(filteredOrdersTotal)} ج.م
                          </td>
                          <td className="px-3 py-3 text-center text-xs text-emerald-400 font-bold">
                            معتمد
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <div className="py-12 text-center text-sm text-slate-400">
                    لا توجد أوامر شراء مطابقة للبحث أو الفترة المحددة ({reportSubtitle}).
                  </div>
                )}
              </div>
            )}

            {/* ========================================================================= */}
            {/* ── OPTION B: VISUAL DASHBOARD & CHARTS VIEW ───────────────────────────── */}
            {/* ========================================================================= */}
            {viewMode === 'dashboard' && (
              <div className="space-y-5">
                {/* ── Visual KPI Cards ── */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                  <KpiCard
                    title="إجمالي الإنفاق والمشتريات"
                    value={
                      <div className="flex items-baseline gap-1">
                        <CurrencyDisplay amount={metrics?.total_value || '0'} className="text-emerald-300" />
                      </div>
                    }
                    accentColor="emerald"
                    subtext="إجمالي قيمة الأوامر للفترة"
                  />
                  <KpiCard
                    title="عدد أوامر الشراء"
                    value={formatNumber(metrics?.purchase_orders_count || 0)}
                    accentColor="cyan"
                    subtext={`${formatNumber(metrics?.pending_accounting_count || 0)} بانتظار الحسابات`}
                  />
                  <KpiCard
                    title="الطلبات المعتمدة"
                    value={formatNumber(metrics?.approved_requests_count || 0)}
                    accentColor="indigo"
                    subtext="طلبات جاهزة للتنفيذ"
                  />
                  <KpiCard
                    title="متوسط قيمة الأمر"
                    value={
                      <div className="flex items-baseline gap-1">
                        <CurrencyDisplay amount={metrics?.average_value || '0'} className="text-cyan-300" />
                      </div>
                    }
                    accentColor="cyan"
                    subtext="معدل قيمة كل أمر صادر"
                  />
                  <KpiCard
                    title="الموردين النشطين"
                    value={formatNumber(metrics?.active_supplier_count || report?.supplier_breakdown?.length || 0)}
                    accentColor="amber"
                    subtext="تم إصدار أوامر لهم"
                  />
                  <KpiCard
                    title="أوامر متأخرة أو متوقفة"
                    value={formatNumber(metrics?.late_delivery_count || metrics?.returned_count || 0)}
                    accentColor={(metrics?.late_delivery_count || metrics?.returned_count) ? 'rose' : 'slate'}
                    subtext={(metrics?.late_delivery_count || metrics?.returned_count) ? 'تتطلب متابعة' : 'لا توجد تأخيرات'}
                  />
                </div>

                {/* ── Charts ── */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <DashboardDonut
                    title="🏢 توزيع الإنفاق حسب الأقسام والمشاريع"
                    subtitle="نسبة مشاركة كل قسم من إجمالي ميزانية المشتريات"
                    segments={departmentSegments}
                    centerLabel="إجمالي المصروف"
                    centerValue={`${formatNumber(Number(metrics?.total_value || 0))} ج.م`}
                  />

                  <DashboardBars
                    title="🤝 كبار الموردين وحجم المشتريات"
                    subtitle="أكبر الموردين من حيث إجمالي قيمة أوامر الشراء"
                    segments={supplierSegments}
                    unit="ج.م"
                  />
                </div>

                {/* ── Breakdown Details ── */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {/* Department Spending List */}
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                      <h2 className="text-sm font-black text-slate-100 flex items-center gap-2">
                        <span>🏗️</span> تفاصيل إنفاق الأقسام والمشاريع
                      </h2>
                      <span className="text-xs text-slate-400 font-mono">
                        الأقسام: <strong>{report?.department_breakdown?.length || 0}</strong>
                      </span>
                    </div>
                    {report?.department_breakdown?.length ? (
                      <div className="space-y-3">
                        {report.department_breakdown.map((dept, index) => {
                          const spend = Number(dept.total_value || 0);
                          return (
                            <div key={index} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2">
                              <div className="flex items-center justify-between text-xs">
                                <div className="font-bold text-slate-200 flex items-center gap-1.5">
                                  <span className="text-slate-500 font-mono text-[11px]">#{index + 1}</span>
                                  <span>{dept.name || 'عام'}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-slate-400 text-[11px]">{formatNumber(dept.count)} أمر</span>
                                  <strong className="font-mono text-emerald-300 font-bold">
                                    {formatCurrency(spend)} ج.م
                                  </strong>
                                </div>
                              </div>
                              <ProgressBar value={spend} max={maxDeptSpend} color="bg-cyan-400" />
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="py-8 text-center text-xs text-slate-500">لا توجد بيانات إنفاق للأقسام</div>
                    )}
                  </div>

                  {/* Top Suppliers List */}
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                      <h2 className="text-sm font-black text-slate-100 flex items-center gap-2">
                        <span>🤝</span> كبار الموردين وحجم التعاملات
                      </h2>
                      <span className="text-xs text-slate-400 font-mono">
                        الموردين: <strong>{report?.supplier_breakdown?.length || 0}</strong>
                      </span>
                    </div>
                    {report?.supplier_breakdown?.length ? (
                      <div className="space-y-3">
                        {report.supplier_breakdown.map((sup, index) => {
                          const spend = Number(sup.total_value || 0);
                          return (
                            <div key={index} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2">
                              <div className="flex items-center justify-between text-xs">
                                <div className="font-bold text-slate-200 flex items-center gap-1.5">
                                  <span className="text-slate-500 font-mono text-[11px]">#{index + 1}</span>
                                  <span>{sup.company_name || 'غير محدد'}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-slate-400 text-[11px]">{formatNumber(sup.count)} أمر</span>
                                  <strong className="font-mono text-amber-300 font-bold">
                                    {formatCurrency(spend)} ج.م
                                  </strong>
                                </div>
                              </div>
                              <ProgressBar value={spend} max={maxSupplierSpend} color="bg-amber-400" />
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="py-8 text-center text-xs text-slate-500">لا توجد تعاملات موردين مسجلة</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
        </>
      )}

    </div>
  );
};

export default UniversalReportsPage;
