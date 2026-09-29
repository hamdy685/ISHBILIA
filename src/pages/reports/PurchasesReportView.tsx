import React, { useEffect, useMemo, useState } from 'react';
import {
  getPurchasesReportApi,
  PurchasesReportResponse,
  PurchasesReportRow,
} from '../../api/reports';
import { parseApiError } from '../../utils/apiError';
import { getUnitLabel } from '../../utils/units';
import { printDocumentOnly } from '../../utils/print';

interface ColumnFilters {
  delivery_date: string;
  po_number: string;
  item_name: string;
  uom: string;
  quantity: string;
  unit_price: string;
  total_price: string;
  supplier_name: string;
  parcel_reference: string;
  region: string;
  department_name: string;
  works: string;
}

const initialFilters: ColumnFilters = {
  delivery_date: '',
  po_number: '',
  item_name: '',
  uom: '',
  quantity: '',
  unit_price: '',
  total_price: '',
  supplier_name: '',
  parcel_reference: '',
  region: '',
  department_name: '',
  works: '',
};

// Clean number formatting without any RTL reversing bugs or minus signs
const formatCleanNumber = (val: number | string | null | undefined, maxDecimals = 2) => {
  const num = Math.abs(Number(val || 0));
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  });
};

const formatCleanQty = (val: number | string | null | undefined) => {
  const num = Math.abs(Number(val || 0));
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
};

export const PurchasesReportView: React.FC = () => {
  // Period filter states
  const [filterType, setFilterType] = useState<'daily' | 'monthly' | 'custom'>('monthly');
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [fromDate, setFromDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedDepartment, setSelectedDepartment] = useState<string>('ALL');
  const [accountingFilter, setAccountingFilter] = useState<'ALL' | 'VERIFIED_ONLY' | 'PENDING'>('VERIFIED_ONLY');

  // Column search filters
  const [colFilters, setColFilters] = useState<ColumnFilters>(initialFilters);
  const [showColumnFilters, setShowColumnFilters] = useState<boolean>(true);

  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Data state
  const [data, setData] = useState<PurchasesReportResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);

  // Active cell selection indicator (Excel aesthetic)
  const [selectedCell, setSelectedCell] = useState<string | null>(null);

  // Fetch report from backend
  const loadReport = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const response = await getPurchasesReportApi({
        filter_type: filterType,
        month: filterType === 'monthly' ? selectedMonth : undefined,
        date: filterType === 'daily' ? selectedDate : undefined,
        from_date: filterType === 'custom' ? fromDate : undefined,
        to_date: filterType === 'custom' ? toDate : undefined,
        department_id: selectedDepartment !== 'ALL' ? selectedDepartment : undefined,
        accounting_filter: accountingFilter,
        page: currentPage,
        per_page: pageSize,
      });
      setData(response);
    } catch (err) {
      setError(parseApiError(err).message || 'تعذر تحميل بيانات تقرير المشتريات.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Reset to page 1 on filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filterType, selectedMonth, selectedDate, fromDate, toDate, selectedDepartment, accountingFilter]);

  useEffect(() => {
    void loadReport();
  }, [filterType, selectedMonth, selectedDate, fromDate, toDate, selectedDepartment, accountingFilter, currentPage, pageSize]);

  // Selected Department Name for dynamic title
  const activeDepartmentName = useMemo(() => {
    if (selectedDepartment === 'ALL' || !data?.departments) return null;
    const dept = data.departments.find((d) => String(d.id) === String(selectedDepartment));
    return dept?.name || null;
  }, [selectedDepartment, data?.departments]);

  // Dynamic Report Title
  const dynamicReportTitle = useMemo(() => {
    let deptPrefix = activeDepartmentName ? `قسم ${activeDepartmentName}` : 'العام';
    let timePeriod = '';

    if (filterType === 'monthly') {
      const [y, m] = selectedMonth.split('-');
      timePeriod = `لشهر ${m}-${y}`;
    } else if (filterType === 'daily') {
      timePeriod = `ليوم ${selectedDate}`;
    } else {
      timePeriod = `للفترة من ${fromDate} إلى ${toDate}`;
    }

    return `تقرير مشتريات ${deptPrefix} ${timePeriod}`;
  }, [activeDepartmentName, filterType, selectedMonth, selectedDate, fromDate, toDate]);

  // Client-side filtering by column inputs
  const filteredRows = useMemo(() => {
    if (!data?.rows) return [];
    return data.rows.filter((row) => {
      const matchDate = !colFilters.delivery_date || row.delivery_date?.toLowerCase().includes(colFilters.delivery_date.toLowerCase()) || row.delivery_date_formatted?.includes(colFilters.delivery_date);
      const matchPo = !colFilters.po_number || row.po_number?.toLowerCase().includes(colFilters.po_number.toLowerCase()) || row.po_number_short?.includes(colFilters.po_number);
      const matchItem = !colFilters.item_name || row.item_name?.toLowerCase().includes(colFilters.item_name.toLowerCase());
      const matchUom = !colFilters.uom || row.uom?.toLowerCase().includes(colFilters.uom.toLowerCase());
      const matchQty = !colFilters.quantity || String(row.quantity).includes(colFilters.quantity);
      const matchUnitPrice = !colFilters.unit_price || String(row.unit_price).includes(colFilters.unit_price);
      const matchTotal = !colFilters.total_price || String(row.total_price).includes(colFilters.total_price);
      const matchSupplier = !colFilters.supplier_name || row.supplier_name?.toLowerCase().includes(colFilters.supplier_name.toLowerCase());
      const matchParcel = !colFilters.parcel_reference || row.parcel_reference?.toLowerCase().includes(colFilters.parcel_reference.toLowerCase());
      const matchRegion = !colFilters.region || row.region?.toLowerCase().includes(colFilters.region.toLowerCase());
      const matchDept = !colFilters.department_name || row.department_name?.toLowerCase().includes(colFilters.department_name.toLowerCase());
      const matchWorks = !colFilters.works || row.works?.toLowerCase().includes(colFilters.works.toLowerCase());

      return (
        matchDate &&
        matchPo &&
        matchItem &&
        matchUom &&
        matchQty &&
        matchUnitPrice &&
        matchTotal &&
        matchSupplier &&
        matchParcel &&
        matchRegion &&
        matchDept &&
        matchWorks
      );
    });
  }, [data?.rows, colFilters]);

  // Live totals of currently filtered rows
  const liveTotals = useMemo(() => {
    const totalQty = filteredRows.reduce((sum, r) => sum + Number(r.quantity || 0), 0);
    const totalAmount = filteredRows.reduce((sum, r) => sum + Number(r.total_price || 0), 0);
    const uniqueOrders = new Set(filteredRows.map((r) => r.purchase_order_id)).size;
    const uniqueSuppliers = new Set(filteredRows.map((r) => r.supplier_name).filter((s) => s && s !== '—')).size;

    return { totalQty, totalAmount, uniqueOrders, uniqueSuppliers };
  }, [filteredRows]);

  const hasActiveColFilters = useMemo(() => {
    return Object.values(colFilters).some((val) => val.trim() !== '');
  }, [colFilters]);

  const handleClearColFilters = () => {
    setColFilters(initialFilters);
  };

  const handleUpdateColFilter = (key: keyof ColumnFilters, value: string) => {
    setColFilters((prev) => ({ ...prev, [key]: value }));
  };

  // Export CSV (Excel Compatible with UTF-8 BOM)
  const handleExportCSV = () => {
    if (!filteredRows.length) return;

    const headers = [
      'تاريخ التوريد',
      'رقم أمر الشراء',
      'الصنف',
      'الوحدة',
      'الكمية',
      'سعر الوحدة',
      'سعر الكمية',
      'أسم المورد',
      'رقم القطعة',
      'إسم المنطقة',
      'القسم',
      'الاعمال',
    ];

    const lines: string[] = [];
    lines.push('\uFEFF' + headers.join(','));

    filteredRows.forEach((r) => {
      lines.push(
        [
          `"${r.delivery_date_formatted || r.delivery_date || '—'}"`,
          `"${r.po_number || '—'}"`,
          `"${(r.item_name || '—').replace(/"/g, '""')}"`,
          `"${r.uom || '—'}"`,
          r.quantity,
          r.unit_price,
          r.total_price,
          `"${(r.supplier_name || '—').replace(/"/g, '""')}"`,
          `"${r.parcel_reference || '—'}"`,
          `"${r.region || '—'}"`,
          `"${r.department_name || '—'}"`,
          `"${(r.works || '—').replace(/"/g, '""')}"`,
        ].join(',')
      );
    });

    lines.push(
      [
        '"الإجمالي"',
        `"${liveTotals.uniqueOrders} أمر شراء"`,
        '""',
        '""',
        liveTotals.totalQty,
        '""',
        liveTotals.totalAmount,
        `"${liveTotals.uniqueSuppliers} مورد"`,
        '""',
        '""',
        '""',
        '""',
      ].join(',')
    );

    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${dynamicReportTitle.replace(/[\s/]/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Copy to Clipboard (Tab-separated for direct paste into Excel)
  const handleCopyClipboard = () => {
    if (!filteredRows.length) return;

    const headers = [
      'تاريخ التوريد',
      'رقم أمر الشراء',
      'الصنف',
      'الوحدة',
      'الكمية',
      'سعر الوحدة',
      'سعر الكمية',
      'أسم المورد',
      'رقم القطعة',
      'إسم المنطقة',
      'القسم',
      'الاعمال',
    ];

    const lines: string[] = [headers.join('\t')];
    filteredRows.forEach((r) => {
      lines.push(
        [
          r.delivery_date_formatted || r.delivery_date || '—',
          r.po_number || '—',
          r.item_name || '—',
          r.uom || '—',
          r.quantity,
          r.unit_price,
          r.total_price,
          r.supplier_name || '—',
          r.parcel_reference || '—',
          r.region || '—',
          r.department_name || '—',
          r.works || '—',
        ].join('\t')
      );
    });

    void navigator.clipboard.writeText(lines.join('\n'));
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 3000);
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* ========================================================================= */}
      {/* ── 1. OFFICIAL PRINT VIEW (Pure Clean White Paper Document) ─────────────── */}
      {/* ========================================================================= */}
      <div className="hidden print:block font-sans text-black bg-white p-0 m-0 purchases-report-print-target">
        {/* Company Header */}
        <div className="border-b-2 border-black pb-3 mb-3 flex items-start justify-between bg-white text-black">
          <div className="flex items-center gap-3">
            <img src="/eshbelia-logo.png" alt="شعار شركة اشبيلية" className="h-14 w-auto object-contain" />
            <div>
              <div className="text-[10px] text-slate-800 font-bold">نظام المشتريات والحسابات المعتمد</div>
              <h1 className="text-lg font-black text-black mt-0.5">
                شركة إشبيلية للتطوير العقاري والمقاولات
              </h1>
              <h2 className="text-xs font-bold text-slate-800 mt-0.5">
                {dynamicReportTitle}
              </h2>
            </div>
          </div>
          <div className="text-left text-[10.5px] font-mono border border-black p-2 rounded bg-white text-black" dir="rtl">
            <div><strong>تاريخ الطباعة:</strong> {new Date().toLocaleDateString('ar-EG')}</div>
            <div><strong>الوقت:</strong> {new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</div>
            <div><strong>الحالة:</strong> معتمد نهائي</div>
          </div>
        </div>

        {/* Summary Metadata Box */}
        <div className="grid grid-cols-4 gap-2 mb-3 text-xs border border-black bg-white p-2 font-semibold text-black">
          <div>
            <span className="text-slate-600 block text-[10px]">القسم المحدد:</span>
            <span className="font-bold text-black">{activeDepartmentName || 'كافة الأقسام'}</span>
          </div>
          <div>
            <span className="text-slate-600 block text-[10px]">عدد الأوامر المسجلة:</span>
            <span className="font-bold text-black font-mono">{liveTotals.uniqueOrders} أمر شراء</span>
          </div>
          <div>
            <span className="text-slate-600 block text-[10px]">إجمالي الكميات:</span>
            <span className="font-bold text-black font-mono" dir="ltr">
              {formatCleanQty(liveTotals.totalQty)}
            </span>
          </div>
          <div>
            <span className="text-slate-600 block text-[10px]">إجمالي قيمة المشتريات:</span>
            <span className="font-black text-black font-mono text-sm" dir="ltr">
              {formatCleanNumber(liveTotals.totalAmount)} ج.م
            </span>
          </div>
        </div>

        {/* 12-Column Official Excel Table */}
        <table className="w-full border-collapse border border-black text-[10px] text-right">
          <thead>
            <tr className="bg-slate-100 border-b border-black font-black text-black">
              <th className="border border-black px-1 py-1.5 text-center w-7">م</th>
              <th className="border border-black px-2 py-1.5 text-center whitespace-nowrap">تاريخ التوريد</th>
              <th className="border border-black px-2 py-1.5 text-center whitespace-nowrap">رقم أمر الشراء</th>
              <th className="border border-black px-2 py-1.5">الصنف</th>
              <th className="border border-black px-1.5 py-1.5 text-center">الوحدة</th>
              <th className="border border-black px-2 py-1.5 text-center">الكمية</th>
              <th className="border border-black px-2 py-1.5 text-center">سعر الوحدة</th>
              <th className="border border-black px-2 py-1.5 text-center font-bold bg-slate-200">سعر الكمية</th>
              <th className="border border-black px-2 py-1.5">أسم المورد</th>
              <th className="border border-black px-1.5 py-1.5 text-center">رقم القطعة</th>
              <th className="border border-black px-2 py-1.5 text-center">إسم المنطقة</th>
              <th className="border border-black px-2 py-1.5 text-center">القسم</th>
              <th className="border border-black px-2 py-1.5">الاعمال</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, idx) => (
              <tr key={row.id} className="border-b border-black bg-white">
                <td className="border border-black px-1 py-1 text-center font-bold font-mono">{idx + 1}</td>
                <td className="border border-black px-2 py-1 text-center font-mono whitespace-nowrap">
                  {row.delivery_date_formatted || row.delivery_date}
                </td>
                <td className="border border-black px-2 py-1 text-center font-mono font-bold whitespace-nowrap">
                  {row.po_number_short || row.po_number}
                </td>
                <td className="border border-black px-2 py-1 font-bold text-black">{row.item_name}</td>
                <td className="border border-black px-1.5 py-1 text-center">{getUnitLabel(row.uom) || row.uom}</td>
                <td className="border border-black px-2 py-1 text-center font-mono font-bold" dir="ltr">
                  {formatCleanQty(row.quantity)}
                </td>
                <td className="border border-black px-2 py-1 text-center font-mono" dir="ltr">
                  {formatCleanNumber(row.unit_price)}
                </td>
                <td className="border border-black px-2 py-1 text-center font-mono font-black bg-slate-100" dir="ltr">
                  {formatCleanNumber(row.total_price)}
                </td>
                <td className="border border-black px-2 py-1">{row.supplier_name}</td>
                <td className="border border-black px-1.5 py-1 text-center font-mono font-bold">{row.parcel_reference}</td>
                <td className="border border-black px-2 py-1 text-center">{row.region}</td>
                <td className="border border-black px-2 py-1 text-center">{row.department_name}</td>
                <td className="border border-black px-2 py-1">{row.works}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100 border-t-2 border-black font-black text-black">
              <td colSpan={5} className="border border-black px-2 py-1.5 text-center text-xs font-bold">
                الإجمالي العام ({filteredRows.length} بند مسجل)
              </td>
              <td className="border border-black px-2 py-1.5 text-center font-mono font-bold" dir="ltr">
                {formatCleanQty(liveTotals.totalQty)}
              </td>
              <td className="border border-black px-2 py-1.5 text-center">—</td>
              <td className="border border-black px-2 py-1.5 text-center font-mono font-black text-xs bg-slate-200" dir="ltr">
                {formatCleanNumber(liveTotals.totalAmount)} ج.م
              </td>
              <td colSpan={5} className="border border-black px-2 py-1.5 text-left text-[10px] text-slate-700">
                أوامر الشراء: {liveTotals.uniqueOrders} | الموردين: {liveTotals.uniqueSuppliers}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Signatures */}
        <div className="mt-6 pt-3 border-t-2 border-black grid grid-cols-3 gap-6 text-center text-xs bg-white text-black">
          <div className="space-y-3">
            <div className="font-bold">إعداد الحسابات</div>
            <div className="border-b border-dashed border-black h-7 w-44 mx-auto" />
            <div className="text-[10px] text-slate-600">التوقيع والتاريخ</div>
          </div>
          <div className="space-y-3">
            <div className="font-bold">مراجعة مدير المشتريات</div>
            <div className="border-b border-dashed border-black h-7 w-44 mx-auto" />
            <div className="text-[10px] text-slate-600">التوقيع والتاريخ</div>
          </div>
          <div className="space-y-3">
            <div className="font-bold">اعتماد المدير التنفيذي</div>
            <div className="border-b border-dashed border-black h-7 w-44 mx-auto" />
            <div className="text-[10px] text-slate-600">التوقيع والتاريخ</div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ── 2. ON-SCREEN AUTHENTIC EXCEL SPREADSHEET VIEW ───────────────────────── */}
      {/* ========================================================================= */}
      <div className="print:hidden space-y-4 font-sans">
        
        {/* ── EXCEL RIBBON & WORKBOOK HEADER ── */}
        <div className="rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">
          
          {/* Top Green Excel Title Bar */}
          <div className="bg-[#107c41] px-4 py-2.5 text-white flex flex-wrap items-center justify-between gap-3 shadow-md">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded bg-white/20 font-black text-base shadow-inner">
                📗
              </span>
              <div>
                <h1 className="text-sm sm:text-base font-black tracking-wide flex items-center gap-2">
                  <span>ورقة إكسيل: {dynamicReportTitle}.xlsx</span>
                </h1>
                <span className="text-[10px] text-emerald-100 opacity-90 block">
                  تقرير المشتريات المسقطة محاسبياً (بعد تسجيل فاتورة المورد في المرحلة النهائية) • 12 عموداً • إمكانية التصفية والفرز والتصدير
                </span>
              </div>
            </div>

            {/* Quick Excel Actions */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportCSV}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 px-3 py-1.5 text-xs font-bold text-white transition border border-white/20 shadow-sm"
                title="تنزيل كملف Excel CSV"
              >
                <span>📥</span>
                <span>حفظ Excel</span>
              </button>

              <button
                type="button"
                onClick={handleCopyClipboard}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 px-3 py-1.5 text-xs font-bold text-white transition border border-white/20 shadow-sm"
                title="نسخ الجدول لبرنامج إكسل"
              >
                <span>📋</span>
                <span>{copySuccess ? 'تم النسخ!' : 'نسخ الورقة'}</span>
              </button>

              <button
                type="button"
                onClick={() => printDocumentOnly('.purchases-report-print-target', { orientation: 'landscape', title: dynamicReportTitle })}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-900 px-3.5 py-1.5 text-xs font-extrabold text-white transition border border-emerald-600 shadow"
                title="طباعة تقرير إكسل مسطر"
              >
                <span>🖨️</span>
                <span>طباعة الورقة</span>
              </button>


              <button
                type="button"
                onClick={() => void loadReport()}
                disabled={refreshing}
                className="inline-flex items-center gap-1 rounded-lg bg-white/10 hover:bg-white/20 px-2.5 py-1.5 text-xs text-white transition border border-white/20 disabled:opacity-50"
                title="إعادة احتساب وتحديث البيانات"
              >
                <span className={refreshing ? 'animate-spin' : ''}>🔄</span>
              </button>
            </div>
          </div>

          {/* Formula & Status Bar (fx) */}
          <div className="bg-slate-800/90 px-4 py-2 border-b border-slate-700 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3 flex-1 min-w-[280px]">
              <div className="font-mono font-black text-amber-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-700 text-[11px]">
                fx
              </div>
              <div className="text-slate-300 font-mono text-[11px] truncate flex items-center gap-4">
                <span>
                  =SUM(الكمية): <strong className="text-amber-300 font-bold" dir="ltr">{formatCleanQty(liveTotals.totalQty)}</strong>
                </span>
                <span className="text-slate-500">|</span>
                <span>
                  =SUM(سعر_الكمية): <strong className="text-emerald-300 font-bold" dir="ltr">{formatCleanNumber(liveTotals.totalAmount)} ج.م</strong>
                </span>
                <span className="text-slate-500">|</span>
                <span>
                  =COUNT(البنود): <strong className="text-cyan-300 font-bold">{filteredRows.length}</strong>
                </span>
                {selectedCell && (
                  <>
                    <span className="text-slate-500">|</span>
                    <span className="text-slate-400">الخلية المحددة: <strong className="text-white">{selectedCell}</strong></span>
                  </>
                )}
              </div>
            </div>

            {/* Accounting Mode Toggle (Verified Only vs All Invoiced vs Pending) */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
              <span className="text-[10px] font-bold text-slate-400 px-2">عرض:</span>
              <button
                type="button"
                onClick={() => setAccountingFilter('VERIFIED_ONLY')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded transition ${
                  accountingFilter === 'VERIFIED_ONLY'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                مسقط ومسجل بالحسابات ({data?.metrics?.verified_items_count || 0})
              </button>
              <button
                type="button"
                onClick={() => setAccountingFilter('ALL')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded transition ${
                  accountingFilter === 'ALL'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                جميع المشتريات المعتمدة ({data?.rows?.length || 0})
              </button>
              <button
                type="button"
                onClick={() => setAccountingFilter('PENDING')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded transition ${
                  accountingFilter === 'PENDING'
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                بانتظار تسجيل الفاتورة
              </button>
            </div>
          </div>

          {/* Controls Bar: Period Type + Date + Department Dropdown */}
          <div className="p-3 bg-slate-950/70 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              
              {/* Period Type */}
              <div className="flex items-center gap-1 rounded-lg bg-slate-900 p-1 border border-slate-800">
                <button
                  type="button"
                  onClick={() => setFilterType('monthly')}
                  className={`px-3 py-1 rounded text-xs font-bold transition ${
                    filterType === 'monthly' ? 'bg-[#107c41] text-white shadow' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  شهري
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType('daily')}
                  className={`px-3 py-1 rounded text-xs font-bold transition ${
                    filterType === 'daily' ? 'bg-[#107c41] text-white shadow' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  يومي
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType('custom')}
                  className={`px-3 py-1 rounded text-xs font-bold transition ${
                    filterType === 'custom' ? 'bg-[#107c41] text-white shadow' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  مخصص
                </button>
              </div>

              {/* Date Input */}
              {filterType === 'monthly' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-slate-400">الشهر:</span>
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-mono font-bold text-slate-200 focus:border-emerald-400 focus:outline-none"
                  />
                </div>
              )}

              {filterType === 'daily' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-slate-400">اليوم:</span>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-mono font-bold text-slate-200 focus:border-emerald-400 focus:outline-none"
                  />
                </div>
              )}

              {filterType === 'custom' && (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs font-mono text-slate-200 focus:border-emerald-400 focus:outline-none"
                  />
                  <span className="text-slate-500">إلى</span>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs font-mono text-slate-200 focus:border-emerald-400 focus:outline-none"
                  />
                </div>
              )}

              {/* Department Dropdown */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-400">القسم:</span>
                <select
                  value={selectedDepartment}
                  onChange={(e) => setSelectedDepartment(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-bold text-slate-200 focus:border-emerald-400 focus:outline-none"
                >
                  <option value="ALL">جميع الأقسام</option>
                  {data?.departments?.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Filter Toggle Button */}
            <div className="flex items-center gap-2">
              {hasActiveColFilters && (
                <button
                  type="button"
                  onClick={handleClearColFilters}
                  className="text-[11px] font-bold text-rose-400 hover:underline"
                >
                  مسح فلاتر الأعمدة ✕
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowColumnFilters((prev) => !prev)}
                className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition"
              >
                <span>🔍</span>
                <span>{showColumnFilters ? 'إخفاء فلاتر الأعمدة' : 'إظهار فلاتر الأعمدة'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs font-bold text-rose-300">
            {error}
          </div>
        )}

        {/* ── REAL EXCEL SPREADSHEET GRID (WHITE PAPER SHEET) ── */}
        <div className="rounded-2xl border-2 border-slate-300 bg-white text-slate-900 shadow-2xl overflow-hidden print:border-none print:shadow-none print:rounded-none">
          
          {/* Printable Header: Logo Top Right, Title Center, Date Left (Appears in Print) */}
          <div className="hidden print:flex items-start justify-between pb-3 border-b-2 border-black p-4 bg-white text-black">
            {/* 1. TOP RIGHT: Logo + Company Name */}
            <div className="text-right flex items-center gap-3 shrink-0">
              <img src="/eshbelia-logo.png" alt="شعار شركة اشبيلية" className="h-14 w-auto object-contain" />
              <div className="text-[11px] leading-snug">
                <div className="font-black text-sm text-black">شركة إشبيلية</div>
                <div className="text-[10px] text-slate-800 font-bold">للتطوير والاستثمار العقاري</div>
              </div>
            </div>

            {/* 2. CENTER: Title */}
            <div className="text-center self-center">
              <h1 className="text-base font-black text-black border-b-2 border-black pb-0.5 inline-block">
                تقرير المشتريات والتوريدات المعتمد ({dynamicReportTitle})
              </h1>
              <div className="text-[10px] font-bold text-slate-700 mt-0.5">
                ورقة إكسل المحاسبية — 12 عموداً
              </div>
            </div>

            {/* 3. TOP LEFT: Metadata */}
            <div className="text-left font-mono text-[10px] font-bold text-black" dir="rtl">
              <div><strong>تاريخ الطباعة:</strong> {new Date().toLocaleDateString('ar-EG')}</div>
              <div><strong>أوامر الشراء:</strong> {liveTotals.uniqueOrders}</div>
              <div><strong>الموردين:</strong> {liveTotals.uniqueSuppliers}</div>
              <div><strong>إجمالي البنود:</strong> {filteredRows.length}</div>
            </div>
          </div>

          {/* Sheet Tab Bar at top */}
          <div className="bg-[#e9ecef] border-b border-slate-300 px-4 py-2 flex items-center justify-between text-xs print:hidden">
            <div className="flex items-center gap-2 font-bold text-slate-700">
              <span className="text-emerald-700">📊</span>
              <span>ورقة العمل: مشتريات وتوريدات شركة اشبيلية ({dynamicReportTitle})</span>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-mono text-slate-600">
              <span>أوامر الشراء: <strong className="text-black">{liveTotals.uniqueOrders}</strong></span>
              <span>•</span>
              <span>الموردين: <strong className="text-black">{liveTotals.uniqueSuppliers}</strong></span>
              <span>•</span>
              <span>إجمالي البنود: <strong className="text-black">{filteredRows.length}</strong></span>
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-[300px] items-center justify-center p-12 text-emerald-700">
              <div className="flex flex-col items-center gap-3 text-center">
                <span className="h-9 w-9 animate-spin rounded-full border-3 border-emerald-600 border-t-transparent" />
                <span className="text-xs font-bold text-slate-600">
                  جاري تحميل وحساب بيانات ورقة العمل...
                </span>
              </div>
            </div>
          ) : filteredRows.length > 0 ? (
            <div className="overflow-x-auto max-h-[700px] overflow-y-auto">
              <table className="w-full text-right text-xs border-collapse min-w-[1200px]">
                
                {/* 1. Excel Column Letter Headers (A, B, C, D...) */}
                <thead className="sticky top-0 z-20 bg-[#f1f5f9] border-b-2 border-slate-400 text-slate-700 select-none">
                  <tr className="text-[11px] font-mono text-center font-extrabold print:hidden">
                    <th className="border border-slate-300 px-1 py-1 w-8 bg-[#e2e8f0]">#</th>
                    <th className="border border-slate-300 px-2 py-1 bg-[#e2e8f0]">A</th>
                    <th className="border border-slate-300 px-2 py-1 bg-[#e2e8f0]">B</th>
                    <th className="border border-slate-300 px-2 py-1 bg-[#e2e8f0]">C</th>
                    <th className="border border-slate-300 px-2 py-1 bg-[#e2e8f0]">D</th>
                    <th className="border border-slate-300 px-2 py-1 bg-[#e2e8f0]">E</th>
                    <th className="border border-slate-300 px-2 py-1 bg-[#e2e8f0]">F</th>
                    <th className="border border-slate-300 px-2 py-1 bg-[#e2e8f0]">G</th>
                    <th className="border border-slate-300 px-2 py-1 bg-[#e2e8f0]">H</th>
                    <th className="border border-slate-300 px-2 py-1 bg-[#e2e8f0]">I</th>
                    <th className="border border-slate-300 px-2 py-1 bg-[#e2e8f0]">J</th>
                    <th className="border border-slate-300 px-2 py-1 bg-[#e2e8f0]">K</th>
                    <th className="border border-slate-300 px-2 py-1 bg-[#e2e8f0]">L</th>
                  </tr>

                  {/* 2. Formal 12-Column Title Headers from Handwritten Note */}
                  <tr className="bg-[#f8fafc] text-slate-900 font-black text-[11.5px] border-b-2 border-slate-400 whitespace-nowrap">
                    <th className="border border-slate-300 px-1 py-2 text-center w-8 bg-[#e2e8f0]">م</th>
                    <th className="border border-slate-300 px-2.5 py-2 text-center whitespace-nowrap min-w-[90px]">تاريخ التوريد</th>
                    <th className="border border-slate-300 px-2.5 py-2 text-center whitespace-nowrap min-w-[110px]">رقم أمر الشراء</th>
                    <th className="border border-slate-300 px-3 py-2 min-w-[170px]">الصنف</th>
                    <th className="border border-slate-300 px-2 py-2 text-center w-16">الوحدة</th>
                    <th className="border border-slate-300 px-2.5 py-2 text-center w-20">الكمية</th>
                    <th className="border border-slate-300 px-2.5 py-2 text-center w-24">سعر الوحدة</th>
                    <th className="border border-slate-300 px-3 py-2 text-center w-28 bg-emerald-50 text-emerald-900">سعر الكمية</th>
                    <th className="border border-slate-300 px-3 py-2 min-w-[140px]">أسم المورد</th>
                    <th className="border border-slate-300 px-2 py-2 text-center w-20">رقم القطعة</th>
                    <th className="border border-slate-300 px-2.5 py-2 text-center w-24">إسم المنطقة</th>
                    <th className="border border-slate-300 px-2.5 py-2 text-center w-24">القسم</th>
                    <th className="border border-slate-300 px-3 py-2 min-w-[170px]">الاعمال</th>
                  </tr>

                  {/* 3. Excel Filter Input Row under each column */}
                  {showColumnFilters && (
                    <tr className="bg-[#f1f5f9] border-b border-slate-300 text-[10.5px]">
                      <th className="p-0.5 border border-slate-300 text-center bg-[#e2e8f0] text-slate-400">—</th>
                      <th className="p-1 border border-slate-300">
                        <input
                          type="text"
                          placeholder="فلتر..."
                          value={colFilters.delivery_date}
                          onChange={(e) => handleUpdateColFilter('delivery_date', e.target.value)}
                          className="w-full rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] text-slate-800 placeholder-slate-400 focus:border-emerald-600 focus:outline-none"
                        />
                      </th>
                      <th className="p-1 border border-slate-300">
                        <input
                          type="text"
                          placeholder="الأمر..."
                          value={colFilters.po_number}
                          onChange={(e) => handleUpdateColFilter('po_number', e.target.value)}
                          className="w-full rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] text-slate-800 placeholder-slate-400 focus:border-emerald-600 focus:outline-none"
                        />
                      </th>
                      <th className="p-1 border border-slate-300">
                        <input
                          type="text"
                          placeholder="الصنف..."
                          value={colFilters.item_name}
                          onChange={(e) => handleUpdateColFilter('item_name', e.target.value)}
                          className="w-full rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] text-slate-800 placeholder-slate-400 focus:border-emerald-600 focus:outline-none"
                        />
                      </th>
                      <th className="p-1 border border-slate-300">
                        <input
                          type="text"
                          placeholder="الوحدة..."
                          value={colFilters.uom}
                          onChange={(e) => handleUpdateColFilter('uom', e.target.value)}
                          className="w-full rounded border border-slate-300 bg-white px-1 py-0.5 text-[11px] text-center text-slate-800 placeholder-slate-400 focus:border-emerald-600 focus:outline-none"
                        />
                      </th>
                      <th className="p-1 border border-slate-300">
                        <input
                          type="text"
                          placeholder="كمية..."
                          value={colFilters.quantity}
                          onChange={(e) => handleUpdateColFilter('quantity', e.target.value)}
                          className="w-full rounded border border-slate-300 bg-white px-1 py-0.5 text-[11px] text-center text-slate-800 placeholder-slate-400 focus:border-emerald-600 focus:outline-none"
                        />
                      </th>
                      <th className="p-1 border border-slate-300">
                        <input
                          type="text"
                          placeholder="سعر..."
                          value={colFilters.unit_price}
                          onChange={(e) => handleUpdateColFilter('unit_price', e.target.value)}
                          className="w-full rounded border border-slate-300 bg-white px-1 py-0.5 text-[11px] text-center text-slate-800 placeholder-slate-400 focus:border-emerald-600 focus:outline-none"
                        />
                      </th>
                      <th className="p-1 border border-slate-300">
                        <input
                          type="text"
                          placeholder="إجمالي..."
                          value={colFilters.total_price}
                          onChange={(e) => handleUpdateColFilter('total_price', e.target.value)}
                          className="w-full rounded border border-slate-300 bg-white px-1 py-0.5 text-[11px] text-center text-slate-800 placeholder-slate-400 focus:border-emerald-600 focus:outline-none"
                        />
                      </th>
                      <th className="p-1 border border-slate-300">
                        <input
                          type="text"
                          placeholder="المورد..."
                          value={colFilters.supplier_name}
                          onChange={(e) => handleUpdateColFilter('supplier_name', e.target.value)}
                          className="w-full rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] text-slate-800 placeholder-slate-400 focus:border-emerald-600 focus:outline-none"
                        />
                      </th>
                      <th className="p-1 border border-slate-300">
                        <input
                          type="text"
                          placeholder="قطعة..."
                          value={colFilters.parcel_reference}
                          onChange={(e) => handleUpdateColFilter('parcel_reference', e.target.value)}
                          className="w-full rounded border border-slate-300 bg-white px-1 py-0.5 text-[11px] text-center text-slate-800 placeholder-slate-400 focus:border-emerald-600 focus:outline-none"
                        />
                      </th>
                      <th className="p-1 border border-slate-300">
                        <input
                          type="text"
                          placeholder="منطقة..."
                          value={colFilters.region}
                          onChange={(e) => handleUpdateColFilter('region', e.target.value)}
                          className="w-full rounded border border-slate-300 bg-white px-1 py-0.5 text-[11px] text-center text-slate-800 placeholder-slate-400 focus:border-emerald-600 focus:outline-none"
                        />
                      </th>
                      <th className="p-1 border border-slate-300">
                        <input
                          type="text"
                          placeholder="القسم..."
                          value={colFilters.department_name}
                          onChange={(e) => handleUpdateColFilter('department_name', e.target.value)}
                          className="w-full rounded border border-slate-300 bg-white px-1 py-0.5 text-[11px] text-center text-slate-800 placeholder-slate-400 focus:border-emerald-600 focus:outline-none"
                        />
                      </th>
                      <th className="p-1 border border-slate-300">
                        <input
                          type="text"
                          placeholder="الاعمال..."
                          value={colFilters.works}
                          onChange={(e) => handleUpdateColFilter('works', e.target.value)}
                          className="w-full rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] text-slate-800 placeholder-slate-400 focus:border-emerald-600 focus:outline-none"
                        />
                      </th>
                    </tr>
                  )}
                </thead>

                {/* 4. Table Rows with Clear Authentic Excel Cell Borders */}
                <tbody>
                  {filteredRows.map((row, idx) => {
                    const rowNumber = idx + 1;
                    const isEven = idx % 2 === 0;

                    return (
                      <tr
                        key={row.id}
                        className={`transition-colors hover:bg-emerald-50/70 ${
                          isEven ? 'bg-white' : 'bg-[#f8fafc]'
                        }`}
                      >
                        {/* Row Number (Excel Index Column) */}
                        <td className="border border-slate-300 px-1.5 py-2 text-center font-mono text-[10px] font-bold text-slate-500 bg-[#f1f5f9] select-none">
                          {rowNumber}
                        </td>

                        {/* A: تاريخ التوريد */}
                        <td
                          onClick={() => setSelectedCell(`A${rowNumber}`)}
                          className="border border-slate-300 px-2.5 py-2 text-center font-mono text-slate-800 whitespace-nowrap text-[11px]"
                        >
                          {row.delivery_date_formatted || row.delivery_date}
                        </td>

                        {/* B: رقم أمر الشراء */}
                        <td
                          onClick={() => setSelectedCell(`B${rowNumber}`)}
                          className="border border-slate-300 px-2.5 py-2 text-center font-mono font-black text-blue-700 whitespace-nowrap"
                        >
                          {row.po_number_short || row.po_number}
                        </td>

                        {/* C: الصنف */}
                        <td
                          onClick={() => setSelectedCell(`C${rowNumber}`)}
                          className="border border-slate-300 px-3 py-2 font-bold text-slate-900 leading-snug"
                        >
                          {row.item_name}
                        </td>

                        {/* D: الوحدة */}
                        <td
                          onClick={() => setSelectedCell(`D${rowNumber}`)}
                          className="border border-slate-300 px-2 py-2 text-center text-slate-700 whitespace-nowrap"
                        >
                          {getUnitLabel(row.uom) || row.uom}
                        </td>

                        {/* E: الكمية */}
                        <td
                          onClick={() => setSelectedCell(`E${rowNumber}`)}
                          className="border border-slate-300 px-2.5 py-2 text-center font-mono font-extrabold text-slate-900"
                          dir="ltr"
                        >
                          {formatCleanQty(row.quantity)}
                        </td>

                        {/* F: سعر الوحدة */}
                        <td
                          onClick={() => setSelectedCell(`F${rowNumber}`)}
                          className="border border-slate-300 px-2.5 py-2 text-center font-mono text-slate-800"
                          dir="ltr"
                        >
                          {formatCleanNumber(row.unit_price)}
                        </td>

                        {/* G: سعر الكمية (الإجمالي) */}
                        <td
                          onClick={() => setSelectedCell(`G${rowNumber}`)}
                          className="border border-slate-300 px-3 py-2 text-center font-mono font-black text-emerald-800 bg-emerald-50/50"
                          dir="ltr"
                        >
                          {formatCleanNumber(row.total_price)}
                        </td>

                        {/* H: أسم المورد */}
                        <td
                          onClick={() => setSelectedCell(`H${rowNumber}`)}
                          className="border border-slate-300 px-3 py-2 font-bold text-slate-800"
                        >
                          {row.supplier_name}
                        </td>

                        {/* I: رقم القطعة */}
                        <td
                          onClick={() => setSelectedCell(`I${rowNumber}`)}
                          className="border border-slate-300 px-2 py-2 text-center font-mono font-bold text-amber-800 bg-amber-50/30"
                        >
                          {row.parcel_reference}
                        </td>

                        {/* J: إسم المنطقة */}
                        <td
                          onClick={() => setSelectedCell(`J${rowNumber}`)}
                          className="border border-slate-300 px-2.5 py-2 text-center text-slate-800"
                        >
                          {row.region}
                        </td>

                        {/* K: القسم */}
                        <td
                          onClick={() => setSelectedCell(`K${rowNumber}`)}
                          className="border border-slate-300 px-2.5 py-2 text-center"
                        >
                          <span className="inline-block rounded bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-800">
                            {row.department_name}
                          </span>
                        </td>

                        {/* L: الاعمال */}
                        <td
                          onClick={() => setSelectedCell(`L${rowNumber}`)}
                          className="border border-slate-300 px-3 py-2 text-slate-700 leading-snug"
                        >
                          {row.works}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                {/* 5. Excel Total Formula Row with Double Bottom Underline */}
                <tfoot className="sticky bottom-0 z-10 bg-[#e2e8f0] border-t-2 border-slate-500 border-b-4 border-double border-slate-900 text-slate-900 font-black">
                  <tr className="text-xs">
                    <td className="border border-slate-300 px-1.5 py-2 text-center font-bold bg-[#cbd5e1]">Σ</td>
                    <td colSpan={4} className="border border-slate-300 px-3 py-2 text-center font-bold text-slate-800">
                      الإجمالي العام (=SUM لـ {filteredRows.length} بند مسجل)
                    </td>
                    <td className="border border-slate-300 px-2.5 py-2 text-center font-mono font-extrabold text-slate-900 text-sm" dir="ltr">
                      {formatCleanQty(liveTotals.totalQty)}
                    </td>
                    <td className="border border-slate-300 px-2 py-2 text-center text-slate-500">—</td>
                    <td className="border border-slate-300 px-3 py-2 text-center font-mono font-black text-sm text-emerald-800 bg-emerald-100" dir="ltr">
                      {formatCleanNumber(liveTotals.totalAmount)} ج.م
                    </td>
                    <td colSpan={5} className="border border-slate-300 px-3 py-2 text-slate-700 text-left text-[11px] font-mono">
                      عدد الأوامر: {liveTotals.uniqueOrders} | الموردين: {liveTotals.uniqueSuppliers}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-16 text-center bg-white text-slate-600">
              <span className="text-4xl mb-3">📋</span>
              <p className="text-base font-black text-slate-800">
                لا توجد بيانات مطابقة للفترة أو الفلاتر المحددة
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-md">
                قم بتعديل محدد الشهر أو القسم، أو اضغط على &quot;عرض: الكل&quot; لمشاهدة كافة الأوامر الصادرة.
              </p>
            </div>
          )}

          {/* Pagination Navigation Bar */}
          {data?.pagination && data.pagination.last_page > 1 && (
            <div className="bg-slate-50 border-t border-slate-300 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-700">
              <div className="flex items-center gap-2">
                <span className="font-semibold">صفحة</span>
                <span className="font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded px-2 py-0.5">
                  {data.pagination.current_page}
                </span>
                <span>من</span>
                <span className="font-mono font-bold text-slate-900">{data.pagination.last_page}</span>
                <span className="text-slate-500 font-mono text-[11px] mr-2">
                  (عرض البنود من {data.pagination.from} إلى {data.pagination.to} من أصل {data.pagination.total} مسجل)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={pageSize}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setPageSize(next);
                    setCurrentPage(1);
                  }}
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:border-emerald-600 focus:outline-none"
                >
                  <option value={25}>25 بند بالصفحة</option>
                  <option value={50}>50 بند بالصفحة</option>
                  <option value={100}>100 بند بالصفحة</option>
                </select>

                <button
                  type="button"
                  disabled={currentPage <= 1 || refreshing}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="rounded border border-slate-300 bg-white px-3 py-1 font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  السابق
                </button>
                <button
                  type="button"
                  disabled={currentPage >= (data?.pagination?.last_page || 1) || refreshing}
                  onClick={() => setCurrentPage((p) => Math.min(data?.pagination?.last_page || 1, p + 1))}
                  className="rounded border border-slate-300 bg-white px-3 py-1 font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  التالي
                </button>
              </div>
            </div>
          )}

          {/* Bottom Sheet Status Bar */}
          <div className="bg-[#f1f5f9] border-t border-slate-300 px-4 py-2 flex flex-wrap items-center justify-between text-[11px] text-slate-600 font-mono">
            <div className="flex items-center gap-4">
              <span>جاهز | READY</span>
              <span>•</span>
              <span>الصفوف المعروضة: <strong>{filteredRows.length}</strong></span>
              <span>•</span>
              <span>مجموع الكميات: <strong dir="ltr">{formatCleanQty(liveTotals.totalQty)}</strong></span>
              <span>•</span>
              <span>مجموع المبالغ: <strong dir="ltr">{formatCleanNumber(liveTotals.totalAmount)} EGP</strong></span>
            </div>
            <div className="text-[10px] text-slate-500">
              تحديث تلقائي • نظام إدارة المشتريات والحسابات
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PurchasesReportView;
