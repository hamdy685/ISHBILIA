import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import { getProcurementPendingReceiptsApi } from '../../api/procurement';
import { getReceiptPhotoUrl } from '../../api/purchaseReceipts';
import { formatCleanNumber } from '../../utils/numberFormat';
import { exportToCsv } from '../../utils/exportCsv';
import { toast } from '../../utils/toast';

export const ProcurementPendingReceiptsPage: React.FC = () => {
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [quickFilter, setQuickFilter] = useState<'ALL' | 'PENDING' | 'DELAYED' | 'APPROVED'>('PENDING');

  // Preview modals
  const [previewItem, setPreviewItem] = useState<any | null>(null);
  const [lightboxPhotoUrl, setLightboxPhotoUrl] = useState<string | null>(null);

  const fetchReceipts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getProcurementPendingReceiptsApi({
        status: quickFilter === 'APPROVED' ? 'APPROVED' : quickFilter === 'ALL' ? 'ALL' : 'PENDING',
      });
      setReceipts(res.data || []);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'تعذر تحميل بيانات أذونات الاستلام.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReceipts();
  }, [quickFilter]);

  const handleCopyCode = (code: string) => {
    if (!code) return;
    void navigator.clipboard.writeText(code);
    toast.success(`تم نسخ الكود: ${code}`);
  };

  const filteredReceipts = useMemo(() => {
    return receipts.filter((r) => {
      // 1. Text Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesCode = (r.code || '').toLowerCase().includes(q);
        const matchesPo = (r.po_number || '').toLowerCase().includes(q);
        const matchesPr = (r.pr_number || '').toLowerCase().includes(q);
        const matchesSupplier = (r.supplier || '').toLowerCase().includes(q);
        const matchesReceiver = (r.receiver || '').toLowerCase().includes(q);
        const matchesSite = (r.project_site || '').toLowerCase().includes(q);
        const matchesParcel = (r.parcel_reference || '').toLowerCase().includes(q);
        const matchesItems = (r.items_summary || '').toLowerCase().includes(q);

        if (
          !matchesCode &&
          !matchesPo &&
          !matchesPr &&
          !matchesSupplier &&
          !matchesReceiver &&
          !matchesSite &&
          !matchesParcel &&
          !matchesItems
        ) {
          return false;
        }
      }

      // 2. Delayed filter
      if (quickFilter === 'DELAYED') {
        return (r.days_elapsed ?? 0) >= 3 && r.status === 'PENDING_SITE_ENGINEER';
      }

      return true;
    });
  }, [receipts, searchQuery, quickFilter]);

  const metrics = useMemo(() => {
    const total = receipts.length;
    const pendingSite = receipts.filter(
      (r) => r.status === 'PENDING_SITE_ENGINEER' || r.status === 'WAREHOUSE_RECEIPT_SUBMITTED'
    ).length;
    const delayed = receipts.filter(
      (r) => (r.days_elapsed ?? 0) >= 3 && r.status === 'PENDING_SITE_ENGINEER'
    ).length;
    const totalAmount = receipts.reduce((acc, curr) => acc + (curr.amount || 0), 0);

    return { total, pendingSite, delayed, totalAmount };
  }, [receipts]);

  const handleExportCsv = () => {
    if (filteredReceipts.length === 0) return;
    const headers = [
      '#',
      'رقم إذن الاستلام',
      'أمر الشراء',
      'طلب الشراء',
      'الموقع / المشروع',
      'المورد',
      'القسم',
      'المستلم الميداني المسند',
      'دور المستلم',
      'القيمة المالية',
      'الحالة',
      'العمر بالأيام',
      'التاريخ',
    ];
    const rows = filteredReceipts.map((r, idx) => [
      idx + 1,
      r.code,
      r.po_number || '—',
      r.pr_number || '—',
      r.project_site || '—',
      r.supplier || '—',
      r.department || '—',
      r.receiver || 'غير محدد',
      r.receiver_role || '—',
      r.amount ? `${formatCleanNumber(r.amount)} ج.م` : '—',
      r.status,
      r.days_elapsed ?? 0,
      r.date,
    ]);
    exportToCsv({
      headers,
      rows,
      filename: `أذونات_الاستلام_المتوقفة_${new Date().toISOString().slice(0, 10)}.csv`,
    });
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto" dir="rtl">
      {/* ── Page Header ── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border-2 border-emerald-500/40 p-6 md:p-7 shadow-2xl shadow-emerald-950/30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs text-slate-400">
              <Link to="/procurement" className="transition-colors hover:text-emerald-300">
                لوحة المشتريات
              </Link>
              <span>←</span>
              <span className="text-emerald-300 font-bold">أذونات الاستلام المتوقفة</span>
            </div>
            <h1 className="text-xl md:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-200 via-teal-300 to-emerald-400">
              📦 متابعة أذونات الاستلام المتوقفة بالمواقع
            </h1>
            <p className="mt-1 text-xs text-slate-400">
              متابعة حية لكافة الشحنات وأذونات الاستلام، مع إبراز وتحديد المستلم الميداني المسؤول عن فحصها واعتمادها بالموقع.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={filteredReceipts.length === 0}
              className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-950/40 text-xs font-bold flex items-center gap-1.5"
            >
              <span>📊</span>
              <span>تصدير Excel / CSV</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={fetchReceipts}
              disabled={loading}
              className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 text-xs font-bold"
            >
              <span>🔄</span>
              <span>تحديث</span>
            </Button>
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-800/80">
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3.5">
            <span className="text-[11px] text-slate-400 font-bold block">إجمالي أذونات الاستلام:</span>
            <span className="text-lg font-black font-mono text-cyan-300">{metrics.total} إذن</span>
          </div>
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3.5">
            <span className="text-[11px] text-slate-400 font-bold block">قيد انتظار المستلم / الموقع:</span>
            <span className="text-lg font-black font-mono text-amber-300">{metrics.pendingSite} إذن</span>
          </div>
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3.5">
            <span className="text-[11px] text-slate-400 font-bold block">أذونات متأخرة (+3 أيام):</span>
            <span className={`text-lg font-black font-mono ${metrics.delayed > 0 ? 'text-rose-400 animate-pulse' : 'text-slate-400'}`}>
              {metrics.delayed} إذن
            </span>
          </div>
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3.5">
            <span className="text-[11px] text-slate-400 font-bold block">إجمالي القيمة التقديرية:</span>
            <span className="text-lg font-black font-mono text-emerald-300">
              {formatCleanNumber(metrics.totalAmount)} ج.م
            </span>
          </div>
        </div>
      </div>

      {error && <ErrorMessage error={error} />}

      {/* ── Filters & Search Bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/80 border border-slate-800 p-4 rounded-2xl">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <span className="text-slate-400">🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث فوري في الإذن، أمر الشراء، المستلم، المورد، القطعة..."
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setQuickFilter('PENDING')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              quickFilter === 'PENDING'
                ? 'bg-amber-500/20 border border-amber-500/50 text-amber-300'
                : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            ⏳ المتوقفة بالموقع ({metrics.pendingSite})
          </button>
          <button
            type="button"
            onClick={() => setQuickFilter('DELAYED')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              quickFilter === 'DELAYED'
                ? 'bg-rose-500/20 border border-rose-500/50 text-rose-300'
                : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            🔥 متأخرة +3 أيام ({metrics.delayed})
          </button>
          <button
            type="button"
            onClick={() => setQuickFilter('APPROVED')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              quickFilter === 'APPROVED'
                ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-300'
                : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            ✅ المعتمدة بالموقع
          </button>
          <button
            type="button"
            onClick={() => setQuickFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              quickFilter === 'ALL'
                ? 'bg-cyan-500/20 border border-cyan-500/50 text-cyan-300'
                : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            📋 الكل ({receipts.length})
          </button>
        </div>
      </div>

      {/* ── Receipts Table ── */}
      <Card className="p-0 overflow-hidden border-slate-800 bg-slate-900/70 shadow-2xl">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 flex flex-col items-center justify-center space-y-3">
              <LoadingSpinner size="lg" />
              <span className="text-xs text-emerald-300 font-bold">جاري تحميل أذونات الاستلام وبيانات المستلمين...</span>
            </div>
          ) : filteredReceipts.length === 0 ? (
            <div className="p-12 text-center text-slate-400 font-medium text-xs">
              لا توجد أذونات استلام تطابق خيارات البحث الحالية.
            </div>
          ) : (
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-950/90 text-slate-300 border-b border-slate-800 font-black">
                <tr>
                  <th className="p-3.5 whitespace-nowrap">رقم الإذن والنوع</th>
                  <th className="p-3.5 whitespace-nowrap">أمر وطلب الشراء</th>
                  <th className="p-3.5 whitespace-nowrap">الموقع والقطعة والمنطقة</th>
                  <th className="p-3.5 whitespace-nowrap">المورد والقسم</th>
                  <th className="p-3.5 whitespace-nowrap">الأصناف والكميات</th>
                  <th className="p-3.5 whitespace-nowrap text-left">القيمة المالية</th>
                  {/* ── عمود المستلم الميداني (محدد وبارز حسب طلب المستخدم) ── */}
                  <th className="p-3.5 whitespace-nowrap bg-emerald-950/60 border-x border-emerald-800/60 text-emerald-300">
                    👷 المستلم الميداني المسؤول
                  </th>
                  <th className="p-3.5 whitespace-nowrap text-center">إثبات الاستلام</th>
                  <th className="p-3.5 whitespace-nowrap">حالة الاستلام</th>
                  <th className="p-3.5 whitespace-nowrap text-center">عمر الإذن والتاريخ</th>
                  <th className="p-3.5 whitespace-nowrap text-center">معاينة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 text-slate-300">
                {filteredReceipts.map((row) => {
                  const isDelayed = (row.days_elapsed ?? 0) >= 3 && row.status === 'PENDING_SITE_ENGINEER';
                  const isPending = row.status === 'PENDING_SITE_ENGINEER' || row.status === 'WAREHOUSE_RECEIPT_SUBMITTED';

                  return (
                    <tr key={row.id} className="hover:bg-slate-800/40 transition-colors">
                      {/* 1. Code & Type */}
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

                      {/* 2. PO & PR */}
                      <td className="p-3.5 whitespace-nowrap">
                        <div className="flex flex-col gap-1 text-[11px]">
                          {row.po_number ? (
                            <div className="flex items-center gap-1">
                              <Link
                                to={`/procurement/purchase-orders/${row.po_id || ''}`}
                                className="font-mono font-bold text-purple-300 bg-purple-950/60 border border-purple-800/40 px-1.5 py-0.5 rounded hover:bg-purple-900/60 hover:text-purple-100 transition-colors inline-flex items-center gap-1"
                              >
                                <span>📑</span>
                                <span>{row.po_number}</span>
                              </Link>
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
                        </div>
                      </td>

                      {/* 3. Location */}
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

                      {/* 4. Supplier & Department */}
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

                      {/* 5. Items */}
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
                              onClick={() => setPreviewItem(row)}
                              className="text-[10px] text-amber-300 hover:text-amber-200 underline font-bold cursor-pointer"
                            >
                              👁️ معاينة البنود
                            </button>
                          </div>
                        </div>
                      </td>

                      {/* 6. Amount */}
                      <td className="p-3.5 whitespace-nowrap text-left">
                        <div className="font-mono font-black text-emerald-400 text-xs">
                          {formatCleanNumber(row.amount || 0)} <span className="text-[10px]">ج.م</span>
                        </div>
                      </td>

                      {/* 7. Receiver Engineer — Highlighted & Clear */}
                      <td className="p-3.5 whitespace-nowrap bg-emerald-950/30 border-x border-emerald-900/50">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-600/30 text-emerald-300 text-xs font-black">
                              👷
                            </span>
                            <span className="font-bold text-slate-100 text-xs">
                              {row.receiver || 'غير محدد'}
                            </span>
                          </div>
                          {row.receiver_role && (
                            <span className="text-[10px] font-semibold text-emerald-400/90 pr-7">
                              ({row.receiver_role})
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 8. Proof Photo */}
                      <td className="p-3.5 whitespace-nowrap text-center">
                        {row.has_photo && row.photo_url ? (
                          <button
                            type="button"
                            onClick={() => setLightboxPhotoUrl(getReceiptPhotoUrl({ photo_url: row.photo_url, id: row.id }))}
                            className="px-2 py-1 rounded-lg border border-emerald-600/50 bg-emerald-950/70 hover:bg-emerald-900/80 text-emerald-300 font-bold text-[11px] inline-flex items-center gap-1 shadow-sm transition-all"
                            title="معاينة إثبات التوريد أو بون ميزان البسكول"
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

                      {/* 9. Status */}
                      <td className="p-3.5 whitespace-nowrap">
                        <span
                          className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1.5 ${
                            row.status === 'APPROVED'
                              ? 'bg-emerald-950/70 border-emerald-600/60 text-emerald-300'
                              : isPending
                              ? 'bg-amber-950/70 border-amber-600/60 text-amber-300'
                              : 'bg-slate-950 border-slate-700 text-slate-300'
                          }`}
                        >
                          <span>{row.status === 'APPROVED' ? '✅' : '⏳'}</span>
                          <span>
                            {row.status === 'APPROVED'
                              ? 'معتمد بالموقع'
                              : row.status === 'PENDING_SITE_ENGINEER'
                              ? 'بانتظار فحص المستلم'
                              : row.status === 'WAREHOUSE_RECEIPT_SUBMITTED'
                              ? 'مسجل بالمخزن'
                              : row.status}
                          </span>
                        </span>
                      </td>

                      {/* 10. Elapsed Time */}
                      <td className="p-3.5 whitespace-nowrap text-center font-mono">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`text-xs font-bold ${isDelayed ? 'text-rose-400 font-black' : 'text-slate-300'}`}>
                            {row.days_elapsed ?? 0} يوم
                          </span>
                          {isDelayed && (
                            <span className="px-1.5 py-0.2 rounded border border-rose-500/50 bg-rose-950/80 text-rose-300 text-[9px] font-black animate-pulse">
                              🔥 متأخر
                            </span>
                          )}
                          <span className="text-[10px] text-slate-500">{row.date}</span>
                        </div>
                      </td>

                      {/* 11. Actions */}
                      <td className="p-3.5 whitespace-nowrap text-center">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setPreviewItem(row)}
                          className="font-bold text-xs bg-slate-950 border-slate-700 text-cyan-300 hover:border-cyan-500"
                        >
                          👁️ تفاصيل
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* ── Preview Items Modal ── */}
      {previewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md" dir="rtl">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-2xl w-full p-6 space-y-4 animate-scale-in text-xs text-slate-100 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h4 className="text-sm font-black text-emerald-300 flex items-center gap-2">
                  <span>📦 تفاصيل وبنود إذن الاستلام:</span>
                  <span className="font-mono text-cyan-300">{previewItem.code}</span>
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  الموقع: {previewItem.project_site} • المورد: {previewItem.supplier}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewItem(null)}
                className="text-slate-400 hover:text-slate-200 font-bold text-base"
              >
                ✕
              </button>
            </div>

            {/* Receiver Info Highlight Card */}
            <div className="p-3 rounded-2xl bg-emerald-950/40 border border-emerald-800/60 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">👷</span>
                <div>
                  <span className="text-[11px] text-emerald-400 font-bold block">المستلم الميداني الحالي:</span>
                  <span className="text-sm font-black text-slate-100">{previewItem.receiver || 'غير محدد'}</span>
                  {previewItem.receiver_role && (
                    <span className="text-[10px] text-slate-400 mr-2">({previewItem.receiver_role})</span>
                  )}
                </div>
              </div>
              <span className={`px-2.5 py-1 rounded-xl text-xs font-bold border ${
                previewItem.status === 'APPROVED'
                  ? 'bg-emerald-950 border-emerald-600 text-emerald-300'
                  : 'bg-amber-950 border-amber-600 text-amber-300'
              }`}>
                {previewItem.status === 'APPROVED' ? 'معتمد' : 'بانتظار الفحص والاعتماد'}
              </span>
            </div>

            {/* Line Items List */}
            <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
              <span className="font-bold text-slate-300 block mb-1">
                📋 أصناف وبنود الإذن ({previewItem.items_list?.length || 0} بند):
              </span>
              {previewItem.items_list && previewItem.items_list.length > 0 ? (
                previewItem.items_list.map((it: any, i: number) => (
                  <div
                    key={it.id || i}
                    className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <span className="font-bold text-slate-100 block">{it.item_description}</span>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                        {it.item_reference && <span>قطعة: {it.item_reference}</span>}
                        {it.region && <span>منطقة: {it.region}</span>}
                      </div>
                    </div>
                    <div className="text-left font-mono">
                      <span className="text-amber-300 font-bold block">
                        المستلم: {formatCleanNumber(it.received_quantity)} {it.uom}
                      </span>
                      {it.ordered_quantity && (
                        <span className="text-[10px] text-slate-500">
                          المطلوب: {formatCleanNumber(it.ordered_quantity)} {it.uom}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-4 text-center text-slate-500">لا توجد بنود مفصلة.</div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-800">
              <Button variant="secondary" size="sm" onClick={() => setPreviewItem(null)}>
                إغلاق
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Photo Lightbox Modal ── */}
      {lightboxPhotoUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-fade-in"
          onClick={() => setLightboxPhotoUrl(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-700 rounded-3xl p-3 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2 px-2">
              <span className="text-xs font-bold text-slate-200">📷 صورة إثبات الاستلام / بون الميزان</span>
              <button
                type="button"
                onClick={() => setLightboxPhotoUrl(null)}
                className="text-slate-400 hover:text-white font-black text-sm"
              >
                ✕
              </button>
            </div>
            <div className="max-h-[80vh] overflow-auto flex items-center justify-center">
              <img
                src={lightboxPhotoUrl}
                alt="صورة إثبات الاستلام"
                className="max-h-[75vh] w-auto rounded-xl object-contain shadow-md"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProcurementPendingReceiptsPage;
