import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { TableSkeleton } from '../../components/ui/StateFeedback';
import ErrorMessage from '../../components/ErrorMessage';
import { parseApiError } from '../../utils/apiError';
import { getUnitLabel } from '../../utils/units';
import TableFilterBar from '../../components/ui/TableFilterBar';
import { getDefaultDateFrom, getTodayInputDate, isDefaultTodayRange } from '../../utils/dateFilters';
import {
  approvePurchaseReceiptApi,
  createPurchaseReceiptApi,
  getAssignedReceiptsApi,
  getPurchaseReceiptArchiveApi,
  getWarehouseReceiptQueueApi,
  updatePurchaseReceiptApi,
  ReceiptPurchaseOrder,
  ReceiptRecord,
  getReceiptPhotoUrl,
} from '../../api/purchaseReceipts';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';

interface ReceiptColorTheme {
  border: string;
  cardBg: string;
  headerBg: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  accentText: string;
  itemBorder: string;
  inputBorder: string;
  colorTitle: string;
  icon: string;
}

const RECEIPT_COLOR_PALETTES: ReceiptColorTheme[] = [
  {
    border: 'border-cyan-500/70 shadow-cyan-950/40',
    cardBg: 'bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950',
    headerBg: 'bg-slate-900/95 border-cyan-800/60',
    badgeBg: 'bg-cyan-500',
    badgeText: 'text-slate-950',
    badgeBorder: 'border-cyan-400',
    accentText: 'text-cyan-300',
    itemBorder: 'border-slate-800 bg-slate-900/60',
    inputBorder: 'border-cyan-500/60 focus:ring-cyan-400',
    colorTitle: 'إذن استلام مواد',
    icon: '📦',
  },
  {
    border: 'border-amber-500/70 shadow-amber-950/40',
    cardBg: 'bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950',
    headerBg: 'bg-slate-900/95 border-amber-800/60',
    badgeBg: 'bg-amber-500',
    badgeText: 'text-slate-950',
    badgeBorder: 'border-amber-400',
    accentText: 'text-amber-300',
    itemBorder: 'border-slate-800 bg-slate-900/60',
    inputBorder: 'border-amber-500/60 focus:ring-amber-400',
    colorTitle: 'إذن استلام مواد',
    icon: '🏗️',
  },
];

const getReceiptTheme = (index: number): ReceiptColorTheme => {
  return RECEIPT_COLOR_PALETTES[index % RECEIPT_COLOR_PALETTES.length];
};

type ReceiptMode = 'warehouse' | 'site';
type ActiveTab = 'QUEUE' | 'ARCHIVE';

export const PurchaseReceiptPage: React.FC<{ mode: ReceiptMode }> = ({ mode }) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('QUEUE');
  const [orders, setOrders] = useState<ReceiptPurchaseOrder[]>([]);
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([]);
  const [archiveReceipts, setArchiveReceipts] = useState<ReceiptRecord[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [receiptPhotos, setReceiptPhotos] = useState<Record<number, { base64: string; name: string } | null>>({});
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);
  const [expandedArchiveId, setExpandedArchiveId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handlePhotoCapture = (orderId: number, file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('يرجى اختيار ملف صورة صالح (JPG, PNG, WebP).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setReceiptPhotos((prev) => ({ ...prev, [orderId]: { base64, name: file.name } }));
    };
    reader.readAsDataURL(file);
  };

  const today = getTodayInputDate();
  const defaultDateFrom = getDefaultDateFrom();
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState(today);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      if (mode === 'warehouse') {
        const [queueData, archiveData] = await Promise.all([
          getWarehouseReceiptQueueApi(),
          getPurchaseReceiptArchiveApi().catch(() => []),
        ]);
        setOrders(queueData || []);
        setArchiveReceipts(archiveData || []);
      } else {
        const [assignedData, archiveData] = await Promise.all([
          getAssignedReceiptsApi(),
          getPurchaseReceiptArchiveApi().catch(() => []),
        ]);
        setReceipts(assignedData || []);
        setArchiveReceipts(archiveData || []);
      }
    } catch (err) {
      if (!silent) setError(parseApiError(err).message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void load(false);
  }, [mode]);

  useRealtimeRefresh(() => {
    void load(true);
  });

  // Auto-focus on receipt_id or po_id from deep-link
  useEffect(() => {
    const targetReceiptId = searchParams.get('receipt_id');
    const targetPoId = searchParams.get('po_id');
    if (targetReceiptId) {
      const match = [...receipts, ...archiveReceipts].find((r) => String(r.id) === targetReceiptId);
      if (match?.receipt_number) {
        setSearchTerm(match.receipt_number);
      } else {
        setSearchTerm(String(targetReceiptId));
      }
    } else if (targetPoId) {
      const orderMatch = orders.find((o) => String(o.id) === targetPoId);
      if (orderMatch?.po_number) {
        setSearchTerm(orderMatch.po_number);
      } else {
        setSearchTerm(String(targetPoId));
      }
    }
  }, [searchParams, receipts, archiveReceipts, orders]);

  const normalizedSearch = searchTerm.trim().toLocaleLowerCase('ar-EG');
  const ignoreDefaultDateForSearch = Boolean(normalizedSearch) && isDefaultTodayRange(dateFrom, dateTo);
  const matchesFilter = (text: string, value: string) =>
    (!normalizedSearch || text.toLocaleLowerCase('ar-EG').includes(normalizedSearch)) &&
    (ignoreDefaultDateForSearch || ((!dateFrom || value >= dateFrom) && (!dateTo || value <= dateTo)));

  const visibleOrders = orders.filter((order) =>
    matchesFilter(
      [
        order.po_number,
        order.purchase_request?.request_number,
        order.supplier?.company_name,
        order.purchase_request?.department?.name,
        order.purchase_request?.requester?.name,
        order.purchase_request?.project_name,
      ]
        .filter(Boolean)
        .join(' '),
      String(order.created_at || order.purchase_request?.created_at || '').slice(0, 10),
    ),
  );

  const visibleReceipts = receipts.filter((receipt) =>
    matchesFilter(
      [
        receipt.receipt_number,
        receipt.purchase_order?.po_number,
        receipt.purchase_order?.supplier?.company_name,
        receipt.purchase_order?.purchase_request?.department?.name,
        receipt.warehouse_keeper?.name,
      ]
        .filter(Boolean)
        .join(' '),
      String(receipt.received_at || receipt.created_at || '').slice(0, 10),
    ),
  );

  const visibleArchive = archiveReceipts.filter((receipt) =>
    matchesFilter(
      [
        receipt.receipt_number,
        receipt.purchase_order?.po_number,
        receipt.purchase_order?.supplier?.company_name,
        receipt.purchase_order?.purchase_request?.department?.name,
        receipt.warehouse_keeper?.name,
        receipt.site_engineer?.name,
        receipt.warehouse_notes,
        receipt.site_engineer_notes,
      ]
        .filter(Boolean)
        .join(' '),
      String(receipt.received_at || receipt.created_at || '').slice(0, 10),
    ),
  );

  const submitWarehouseReceipt = async (order: ReceiptPurchaseOrder) => {
    const hasUnentered = (order.items || []).some((item) => {
      const q = quantities[`${order.id}-${item.id}`];
      return q === undefined || q === null || q.trim() === '';
    });

    if (hasUnentered) {
      setError('يرجى إدخال الكميات المستلمة فعلياً لجميع الأصناف قبل تأكيد الاستلام.');
      return;
    }

    const items = (order.items || []).map((item) => ({
      purchase_order_item_id: item.id,
      received_quantity: Number(quantities[`${order.id}-${item.id}`]),
      notes: itemNotes[`${order.id}-${item.id}`] || undefined,
    }));

    if (items.some((item) => Number.isNaN(item.received_quantity) || item.received_quantity < 0)) {
      setError('يرجى إدخال كميات مستلمة صحيحة لكل بند.');
      return;
    }

    setSaving(order.id);
    setError(null);
    setSuccessMessage(null);
    try {
      const photo = receiptPhotos[order.id];
      await createPurchaseReceiptApi(order.id, { 
        items, 
        warehouse_notes: notes[order.id],
        photo_base64: photo?.base64,
        photo_name: photo?.name,
      });
      setSuccessMessage(`تم تسجيل استلام أمر الشراء ${order.po_number} واعتماده نهائياً ونقله للحسابات بنجاح!`);
      await load();
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setSaving(null);
    }
  };

  const approveReceipt = async (receipt: ReceiptRecord) => {
    const items = (receipt.items || []).map((item) => ({
      id: item.id,
      received_quantity: Number(quantities[`receipt-${receipt.id}-${item.id}`] ?? item.received_quantity),
      notes: itemNotes[`receipt-${receipt.id}-${item.id}`] || undefined,
    }));

    if (items.some((item) => Number.isNaN(item.received_quantity) || item.received_quantity < 0)) {
      setError('يرجى إدخال كميات مستلمة صحيحة قبل الاعتماد.');
      return;
    }

    setSaving(receipt.id);
    setError(null);
    try {
      await approvePurchaseReceiptApi(receipt.id, {
        site_engineer_notes: notes[receipt.id],
        items,
      });
      setSuccessMessage(`تم اعتماد إذن الاستلام ${receipt.receipt_number} وإرساله للحسابات لصرف الدفعات.`);
      await load();
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <TableSkeleton rows={5} columns={6} className="min-h-[360px]" />;

  return (
    <div className="space-y-6" dir="rtl">
      {/* ── Page Header Banner ── */}
      <div
        className={`rounded-2xl border-2 p-4 sm:p-6 shadow-xl space-y-3 ${
          mode === 'warehouse'
            ? 'border-amber-500/40 bg-gradient-to-r from-slate-900 via-amber-950/20 to-slate-900'
            : 'border-emerald-500/40 bg-gradient-to-r from-slate-900 via-emerald-950/20 to-slate-900'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <span
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl font-black shadow-inner ${
                mode === 'warehouse'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
              }`}
            >
              {mode === 'warehouse' ? '📦' : '🏗️'}
            </span>
            <div>
              <h1 className="text-lg sm:text-xl font-black text-slate-100 flex items-center gap-2.5 flex-wrap">
                {mode === 'warehouse' ? 'مهام وأرشيف استلام المواد بالمخزن' : 'إذن استلام المواد — فحص واعتماد الاستلام'}
                {(mode === 'warehouse' ? orders.length : receipts.length) > 0 && (
                  <span
                    className={`rounded-full px-3 py-0.5 text-xs font-black ${
                      mode === 'warehouse' ? 'bg-amber-500 text-slate-950' : 'bg-emerald-500 text-slate-950'
                    }`}
                  >
                    {(mode === 'warehouse' ? orders.length : receipts.length)} أمر بانتظار الفحص
                  </span>
                )}
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                {mode === 'warehouse'
                  ? 'قم بفحص بضاعة الموردين ومطابقة الأصناف والمواصفات، وسجل الكميات المستلمة أو راجع أرشيف الاستلامات المعتمدة.'
                  : 'راجع استلام المخزن وافحص المواد هندسياً وفنياً في الموقع للتأكد من مطابقتها قبل الاعتماد النهائي وإرسالها للحسابات.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {successMessage && (
        <div className="rounded-xl border border-emerald-700/60 bg-emerald-950/50 p-4 text-sm font-bold text-emerald-300 flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-2">
            <span>✅</span>
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-xs text-emerald-400 hover:text-white cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      )}

      {error && <ErrorMessage error={error} onDismiss={() => setError(null)} />}

      {/* ── Main Navigation Tabs ── */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('QUEUE')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
            activeTab === 'QUEUE'
              ? mode === 'warehouse'
                ? 'bg-amber-500 text-slate-950 font-black shadow-lg shadow-amber-950/40'
                : 'bg-emerald-600 text-white font-black shadow-lg shadow-emerald-950/40'
              : 'bg-slate-900/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <span>📦 مهام الاستلام المعلقة</span>
          <span
            className={`px-2.5 py-0.5 rounded-full text-xs font-black ${
              activeTab === 'QUEUE'
                ? 'bg-slate-950/20 text-current'
                : (mode === 'warehouse' ? orders.length : receipts.length) > 0
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {mode === 'warehouse' ? orders.length : receipts.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ARCHIVE')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
            activeTab === 'ARCHIVE'
              ? 'bg-cyan-600 text-white font-black shadow-lg shadow-cyan-950/40'
              : 'bg-slate-900/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <span>🗄️ أرشيف استلام المواد</span>
          <span className="px-2.5 py-0.5 rounded-full text-xs bg-slate-800 text-slate-300">
            {archiveReceipts.length}
          </span>
        </button>
      </div>

      <TableFilterBar
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder={
          activeTab === 'ARCHIVE'
            ? 'بحث في الأرشيف برقم الإذن، أمر الشراء، المورد، أمين المخزن، مهندس الموقع...'
            : mode === 'warehouse'
            ? 'بحث برقم أمر الشراء، رقم الطلب، المورد، القسم، الصنف...'
            : 'بحث برقم إذن الاستلام، أمر الشراء، المورد، القسم...'
        }
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onClear={() => {
          setSearchTerm('');
          setDateFrom(defaultDateFrom);
          setDateTo(today);
        }}
        hasActiveFilters={Boolean(searchTerm || dateFrom !== defaultDateFrom || dateTo !== today)}
        resultCount={
          activeTab === 'ARCHIVE'
            ? visibleArchive.length
            : mode === 'warehouse'
            ? visibleOrders.length
            : visibleReceipts.length
        }
      />

      {/* ── TAB 1: PENDING QUEUE ── */}
      {activeTab === 'QUEUE' && (
        <>
          {mode === 'warehouse' ? (
            /* Warehouse Keeper Pending Orders Queue - Ultra Simple Color-Coded Interface */
            visibleOrders.length > 0 ? (
              <div className="space-y-8">
                {visibleOrders.map((order, orderIdx) => {
                  const isSavingThis = saving === order.id;
                  const theme = getReceiptTheme(orderIdx);

                  return (
                    <div
                      key={order.id}
                      className={`p-5 sm:p-7 space-y-6 border-3 ${theme.border} ${theme.cardBg} shadow-2xl rounded-3xl transition-all`}
                    >
                      {/* 1. Header: Big Distinct Color Ribbon & Supplier Info */}
                      <div className={`rounded-2xl border-2 ${theme.headerBg} p-4 sm:p-5 space-y-4`}>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className={`px-4 py-1.5 rounded-xl font-black text-sm sm:text-base border-2 ${theme.badgeBg} ${theme.badgeText} ${theme.badgeBorder} shadow-md flex items-center gap-1.5`}>
                              <span>{theme.icon}</span>
                              <span>{theme.colorTitle}</span>
                            </span>

                            <span className="font-mono text-base sm:text-lg font-black text-white bg-slate-950 border border-slate-700 px-3.5 py-1.5 rounded-xl shadow-inner">
                              أمر شراء #{order.po_number}
                            </span>

                            {order.purchase_request && (
                              <span className="text-xs sm:text-sm font-bold text-slate-300 bg-slate-900 border border-slate-700 px-3 py-1 rounded-lg">
                                طلب توريد #{order.purchase_request.request_number}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-950/80 border border-amber-600/70 text-amber-300 text-xs sm:text-sm font-black shadow-sm">
                              <span>🔒</span>
                              <span>استلام أعمى: يُسجل المستلم الكميات الفعلية بعد انتهاء الصبة والتوريد</span>
                            </span>
                          </div>
                        </div>

                        {/* Large Clear Info Callouts */}
                        {(() => {
                          const orderParcel =
                            order.purchase_request?.parcel_reference ||
                            order.items?.find((i) => i.item_reference || i.pr_item?.item_reference)?.item_reference ||
                            order.items?.find((i) => i.item_reference || i.pr_item?.item_reference)?.pr_item?.item_reference ||
                            null;

                          const orderRegion =
                            order.purchase_request?.region ||
                            order.items?.find((i) => i.region || i.pr_item?.region)?.region ||
                            order.items?.find((i) => i.region || i.pr_item?.region)?.pr_item?.region ||
                            null;

                          return (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm sm:text-base pt-1">
                              <div className="flex items-center gap-3 text-slate-100 bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800">
                                <span className="text-3xl shrink-0">🏢</span>
                                <div>
                                  <span className="text-slate-400 block text-xs font-bold">المورد صاحب البضاعة:</span>
                                  <span className="font-black text-base sm:text-lg text-white block mt-0.5">
                                    {order.supplier?.company_name || 'مورد غير محدد'}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-3 text-slate-100 bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800">
                                <span className="text-3xl shrink-0">📍</span>
                                <div>
                                  <span className="text-slate-400 block text-xs font-bold">المشروع / موقع التوريد:</span>
                                  <span className="font-black text-base sm:text-lg text-cyan-300 block mt-0.5">
                                    {order.purchase_request?.project_name || order.purchase_request?.department?.name || 'المخزن الرئيسي'}
                                  </span>
                                </div>
                              </div>

                              {/* Parcel Reference Callout */}
                              <div className="flex items-center gap-3 text-slate-100 bg-slate-950/80 p-3.5 rounded-2xl border border-cyan-800/70 shadow-sm">
                                <span className="text-3xl shrink-0">🏷️</span>
                                <div>
                                  <span className="text-cyan-400 block text-xs font-bold">رقم قطعة الأرض:</span>
                                  <span className="font-mono font-black text-base sm:text-lg text-cyan-200 block mt-0.5">
                                    {orderParcel || 'غير محددة'}
                                  </span>
                                </div>
                              </div>

                              {/* Region Callout */}
                              <div className="flex items-center gap-3 text-slate-100 bg-slate-950/80 p-3.5 rounded-2xl border border-amber-800/70 shadow-sm">
                                <span className="text-3xl shrink-0">📍</span>
                                <div>
                                  <span className="text-amber-400 block text-xs font-bold">المنطقة الجغرافية:</span>
                                  <span className="font-black text-base sm:text-lg text-amber-200 block mt-0.5">
                                    {orderRegion || 'غير محددة'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      {/* 2. Items List: Ultra Simple Big Visual Cards */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                          <h4 className="text-sm sm:text-base font-black text-slate-100 flex items-center gap-2">
                            <span>📦</span>
                            <span>الأصناف المطلوب استلامها في هذا الإذن ({order.items?.length || 0} صنف):</span>
                          </h4>
                        </div>

                        <div className="space-y-4">
                          {(order.items || []).map((item, idx) => {
                            const key = `${order.id}-${item.id}`;
                            const val = quantities[key] ?? '';
                            const numVal = parseFloat(val) || 0;

                            const itemParcel =
                              item.item_reference ||
                              item.pr_item?.item_reference ||
                              order.purchase_request?.parcel_reference ||
                              null;

                            const itemRegion =
                              item.region ||
                              item.pr_item?.region ||
                              order.purchase_request?.region ||
                              null;

                            return (
                              <div
                                key={item.id}
                                className={`rounded-2xl border-2 ${theme.itemBorder} bg-slate-950/90 p-4 sm:p-5 space-y-4 shadow-xl`}
                              >
                                {/* Item Title & Number */}
                                <div className="flex items-start justify-between gap-3">
                                  <div className="space-y-1 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${theme.badgeBg} ${theme.badgeText} font-black text-base shrink-0 shadow-md`}>
                                        {idx + 1}
                                      </span>
                                      <h4 className="text-base sm:text-xl font-black text-white flex items-center gap-2 flex-wrap">
                                        <span>{item.item_description || item.item?.name}</span>
                                      </h4>
                                    </div>
                                    {item.specifications && (
                                      <p className="text-xs sm:text-sm text-slate-300 leading-relaxed pr-10">
                                        المواصفات: <strong className="text-slate-100">{item.specifications}</strong>
                                      </p>
                                    )}
                                  </div>
                                </div>

                                {/* Plot & Region Badges on Item */}
                                {(itemParcel || itemRegion) && (
                                  <div className="flex items-center gap-2 flex-wrap text-xs sm:text-sm">
                                    {itemParcel && (
                                      <span className="inline-flex items-center gap-1.5 font-mono text-cyan-200 bg-cyan-950 border border-cyan-700/80 px-3 py-1 rounded-xl font-black shadow-sm">
                                        <span>🏷️</span> قطعة الأرض: {itemParcel}
                                      </span>
                                    )}
                                    {itemRegion && (
                                      <span className="inline-flex items-center gap-1.5 text-amber-200 bg-amber-950 border border-amber-700/80 px-3 py-1 rounded-xl font-black shadow-sm">
                                        <span>📍</span> المنطقة: {itemRegion}
                                      </span>
                                    )}
                                  </div>
                                )}

                                {/* Blind Receiving Callout (Ordered quantity is hidden for audit accuracy) */}
                                <div className="rounded-2xl border border-slate-700/70 bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 p-3.5 flex items-center gap-3 shadow-md">
                                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300 text-lg border border-amber-500/40 shrink-0">
                                    📝
                                  </span>
                                  <div className="flex-1">
                                    <span className="text-xs text-slate-300 block">
                                      الوحدة المقررة: <strong className="text-white font-mono text-sm">{getUnitLabel(item.uom || '')}</strong>
                                    </span>
                                    <span className="text-[11px] text-amber-300 font-bold block mt-0.5">
                                      ⚠️ استلام أعمى: يرجى كتابة الكمية المستلمة فعلياً في الموقع بعد انتهاء الصبة من واقع بونات التوريد.
                                    </span>
                                  </div>
                                </div>

                                {/* Received Quantity Input Section */}
                                <div className="rounded-2xl border-2 border-emerald-500/80 bg-emerald-950/30 p-4 sm:p-5 space-y-3 shadow-inner">
                                  <div className="flex items-center justify-between">
                                    <label htmlFor={`qty-${key}`} className="text-sm sm:text-base font-black text-emerald-300 flex items-center gap-2">
                                      <span className="text-lg">📥</span>
                                      <span>الكمية المستلمة فعلياً في الموقع بعد انتهاء الصبة:</span>
                                    </label>
                                    <span className="text-xs font-bold text-emerald-300 bg-emerald-950 border border-emerald-500/50 px-2.5 py-0.5 rounded-full">
                                      اكتب الرقم هنا 👇
                                    </span>
                                  </div>

                                  <div className="space-y-2.5">
                                    <div className="relative flex items-center">
                                      <input
                                        id={`qty-${key}`}
                                        type="number"
                                        min="0"
                                        step="any"
                                        placeholder="اكتب الكمية المستلمة بالأرقام..."
                                        value={val}
                                        onChange={(e) => setQuantities({ ...quantities, [key]: e.target.value })}
                                        className="w-full h-14 rounded-2xl border-2 border-emerald-400 bg-slate-900/95 pl-24 pr-4 text-xl sm:text-2xl font-black text-emerald-200 placeholder:text-slate-500 placeholder:text-sm sm:placeholder:text-base placeholder:font-normal focus:border-emerald-300 focus:bg-slate-900 focus:ring-4 focus:ring-emerald-500/30 focus:outline-none transition-all shadow-inner"
                                      />
                                      {/* Unit badge pinned inside input */}
                                      <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-emerald-950/90 border border-emerald-500/50 px-3 py-1.5 rounded-xl pointer-events-none">
                                        <span className="text-xs sm:text-sm font-black text-emerald-300">
                                          {getUnitLabel(item.uom || '')}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Action Buttons: Clearly labeled pill buttons, not input boxes */}
                                    <div className="flex items-center justify-between pt-1">
                                      <span className="text-[11px] text-slate-400 font-medium">أزرار ضغط سريعة (ليست للكتابة):</span>
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          tabIndex={-1}
                                          onClick={() => {
                                            const next = Math.max(0, numVal - 1);
                                            setQuantities({ ...quantities, [key]: String(next) });
                                          }}
                                          className="h-8 px-3.5 rounded-full bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 border border-slate-600 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition select-none active:scale-95 shadow-sm"
                                          title="إنقاص الكمية بمقدار 1"
                                        >
                                          <span className="text-sm font-black">-1</span>
                                          <span>إنقاص</span>
                                        </button>

                                        <button
                                          type="button"
                                          tabIndex={-1}
                                          onClick={() => {
                                            const next = numVal + 1;
                                            setQuantities({ ...quantities, [key]: String(next) });
                                          }}
                                          className="h-8 px-3.5 rounded-full bg-emerald-900/60 hover:bg-emerald-800/80 active:bg-emerald-700 text-emerald-200 border border-emerald-600/70 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition select-none active:scale-95 shadow-sm"
                                          title="زيادة الكمية بمقدار 1"
                                        >
                                          <span className="text-sm font-black">+1</span>
                                          <span>زيادة</span>
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {/* Simple Notes */}
                                <div className="pt-1">
                                  <input
                                    type="text"
                                    placeholder="أي ملاحظة على هذا الصنف (اختياري)..."
                                    value={itemNotes[key] || ''}
                                    onChange={(e) => setItemNotes({ ...itemNotes, [key]: e.target.value })}
                                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-xs sm:text-sm text-slate-200 focus:border-cyan-400 focus:outline-none"
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* General Order Notes */}
                        <div className="space-y-1.5 pt-2">
                          <label className="text-xs sm:text-sm font-bold text-slate-300">ملاحظات عامة على الاستلام (اختياري):</label>
                          <textarea
                            rows={2}
                            value={notes[order.id] || ''}
                            onChange={(e) => setNotes({ ...notes, [order.id]: e.target.value })}
                            placeholder="مثال: تم فحص البضاعة ومطابقة الأختام، البضاعة سليمة وبحالة جيدة..."
                            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs sm:text-sm text-slate-100 focus:border-cyan-400 focus:outline-none"
                          />
                        </div>

                        {/* 3. Camera / Photo Attachment (Ultra Simple Big Button) */}
                        <div className="rounded-2xl border-2 border-dashed border-cyan-500/70 bg-cyan-950/30 p-4 sm:p-5 space-y-4 shadow-lg">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-3">
                              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/20 text-cyan-300 text-3xl border border-cyan-500/40 shrink-0">
                                📷
                              </span>
                              <div>
                                <h5 className="text-sm sm:text-base font-black text-cyan-200 flex items-center gap-2">
                                  <span>تصوير بون الميزان أو وزنة الحديد / بوليصة الاستلام</span>
                                  <span className="text-xs font-bold text-amber-300 bg-amber-950/80 border border-amber-800/60 px-2 py-0.5 rounded-md">
                                    (اختياري)
                                  </span>
                                </h5>
                                <p className="text-xs text-slate-300 mt-0.5">
                                  التقط صورة واضحة بالكاميرا ليراها مهندس الموقع والمحاسب مباشرة مع إذن الصرف.
                                </p>
                              </div>
                            </div>
                            {receiptPhotos[order.id] && (
                              <button
                                type="button"
                                onClick={() => setReceiptPhotos((prev) => ({ ...prev, [order.id]: null }))}
                                className="text-xs font-bold text-rose-300 hover:text-white bg-rose-950/90 border border-rose-700 px-3.5 py-1.5 rounded-xl cursor-pointer shadow-md"
                              >
                                ✕ حذف الصورة وإعادة التصوير
                              </button>
                            )}
                          </div>

                          {receiptPhotos[order.id] ? (
                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-slate-950 p-4 rounded-2xl border-2 border-emerald-500/80 shadow-xl">
                              <div
                                onClick={() => setPreviewPhotoUrl(receiptPhotos[order.id]!.base64)}
                                className="relative h-28 w-28 sm:h-32 sm:w-32 rounded-2xl overflow-hidden border-2 border-emerald-400 cursor-pointer group shrink-0 shadow-lg"
                              >
                                <img
                                  src={receiptPhotos[order.id]!.base64}
                                  alt="صورة الاستلام"
                                  className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                                />
                                <div className="absolute inset-0 bg-slate-950/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                  <span className="text-xs font-black text-white bg-slate-900/90 px-2.5 py-1 rounded-lg">🔍 تكبير</span>
                                </div>
                              </div>
                              <div className="space-y-2 text-xs flex-1">
                                <div className="font-black text-emerald-400 text-base flex items-center gap-2">
                                  <span>✅</span>
                                  <span>تم التقاط صورة بون الميزان بنجاح!</span>
                                </div>
                                <p className="text-slate-300 text-xs sm:text-sm">
                                  الملف: {receiptPhotos[order.id]!.name}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => setPreviewPhotoUrl(receiptPhotos[order.id]!.base64)}
                                  className="text-xs sm:text-sm font-black text-cyan-400 hover:text-cyan-300 underline inline-flex items-center gap-1 cursor-pointer pt-1"
                                >
                                  <span>👁️</span> اضغط هنا لمعاينة الصورة بالحجم الكامل المكبر
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                              {/* Option 1: Direct Native Camera Launch on Phone/Tablet */}
                              <label
                                htmlFor={`receipt-camera-capture-${order.id}`}
                                className="flex items-center justify-center gap-3.5 p-4 sm:p-5 rounded-2xl border-2 border-cyan-400 hover:border-cyan-300 bg-cyan-950/60 hover:bg-cyan-900/70 cursor-pointer transition-all text-right group shadow-lg active:scale-98"
                              >
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/20 text-cyan-300 text-3xl border border-cyan-400 group-hover:scale-110 transition-transform">
                                  📸
                                </div>
                                <div className="space-y-1 flex-1">
                                  <span className="text-sm sm:text-base font-black text-cyan-100 group-hover:text-white block">
                                    فتح الكاميرا والتقاط صورة الميزان فوراً
                                  </span>
                                  <span className="block text-xs text-slate-300">
                                    تشغيل كاميرا الهاتف مباشرة وتصوير الورقة
                                  </span>
                                </div>
                                <input
                                  id={`receipt-camera-capture-${order.id}`}
                                  type="file"
                                  accept="image/*"
                                  capture="environment"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handlePhotoCapture(order.id, file);
                                    e.target.value = '';
                                  }}
                                />
                              </label>

                              {/* Option 2: Gallery / Files Picker */}
                              <label
                                htmlFor={`receipt-gallery-picker-${order.id}`}
                                className="flex items-center justify-center gap-3.5 p-4 sm:p-5 rounded-2xl border-2 border-slate-700 hover:border-cyan-400 bg-slate-900/80 hover:bg-slate-900 cursor-pointer transition-all text-right group shadow-lg active:scale-98"
                              >
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-800 text-slate-300 text-3xl border border-slate-700 group-hover:scale-110 transition-transform">
                                  📁
                                </div>
                                <div className="space-y-1 flex-1">
                                  <span className="text-sm sm:text-base font-black text-slate-200 group-hover:text-cyan-300 block">
                                    اختيار صورة من الهاتف أو الملفات
                                  </span>
                                  <span className="block text-xs text-slate-400">
                                    تحميل صورة تم التقاطها مسبقاً
                                  </span>
                                </div>
                                <input
                                  id={`receipt-gallery-picker-${order.id}`}
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handlePhotoCapture(order.id, file);
                                    e.target.value = '';
                                  }}
                                />
                              </label>
                            </div>
                          )}
                        </div>

                        {/* 4. Giant Confirm & Submit Button */}
                        <div className="pt-4 border-t border-slate-800 space-y-2">
                          <Button
                            variant="success"
                            size="lg"
                            isLoading={isSavingThis}
                            onClick={() => submitWarehouseReceipt(order)}
                            className="w-full font-black text-base sm:text-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 py-4 rounded-2xl shadow-2xl shadow-emerald-950/80 flex items-center justify-center gap-3 cursor-pointer active:scale-98 transition-all"
                          >
                            <span className="text-2xl">✅</span>
                            <span>تأكيد واعتماد الاستلام النهائي للموقع (أمر #{order.po_number}) ونقله للحسابات</span>
                          </Button>
                          <p className="text-center text-xs sm:text-sm font-bold text-slate-400">
                            💡 ضغطة واحدة لحفظ إذن الاستلام نهائياً ونقله للإدارة المالية والحسابات للمطابقة والصرف فور انتهاء الصبة.
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-12 text-center text-slate-400 space-y-2 rounded-2xl border border-slate-800 bg-slate-900/60">
                <span className="text-4xl block">📦</span>
                <p className="text-base font-bold text-slate-200">لا توجد مهام استلام معلقة حالياً بالمخزن</p>
                <p className="text-xs text-slate-500">
                  تظهر هنا أوامر الشراء الصادرة للموردين فور اعتمادها، لتسجيل استلام المواد بالمخزن. يمكنك الاطلاع على الاستلامات السابقة من تبويب «أرشيف استلام المواد».
                </p>
              </div>
            )
          ) : (
            /* Site Engineer Pending Receipts Queue */
            visibleReceipts.length > 0 ? (
              <div className="space-y-6">
                {visibleReceipts.map((receipt) => {
                  const isSavingThis = saving === receipt.id;

                  return (
                    <Card key={receipt.id} className="p-4 sm:p-6 space-y-5 border-2 border-emerald-500/50 bg-slate-900/95 shadow-2xl rounded-2xl">
                      {/* Header */}
                      <div className="space-y-3 border-b border-slate-800 pb-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="font-mono text-base sm:text-lg font-black text-emerald-300 bg-emerald-950 border border-emerald-700 px-3.5 py-1.5 rounded-xl shadow-inner">
                              {receipt.receipt_number}
                            </span>
                            <span className="text-xs sm:text-sm font-bold text-slate-300 bg-slate-800 border border-slate-700 px-3 py-1 rounded-lg">
                              أمر شراء: <span className="font-mono text-cyan-300">{receipt.purchase_order?.po_number}</span>
                            </span>
                            {receipt.receipt_type === 'SITE_DIRECT' && (
                              <span className="text-xs sm:text-sm font-black text-amber-200 bg-amber-950/90 border border-amber-500/80 px-3 py-1 rounded-xl flex items-center gap-1.5 shadow-md">
                                <span>🏗️</span>
                                <span>توريد مباشر لموقع المباني (استلام مباشر بالموقع دون مرور بالمخزن)</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {(() => {
                          const receiptParcel =
                            receipt.purchase_order?.purchase_request?.parcel_reference ||
                            receipt.purchase_request?.parcel_reference ||
                            receipt.items?.find((i) => i.purchase_order_item?.item_reference || i.purchase_order_item?.pr_item?.item_reference)?.purchase_order_item?.item_reference ||
                            receipt.items?.find((i) => i.purchase_order_item?.item_reference || i.purchase_order_item?.pr_item?.item_reference)?.purchase_order_item?.pr_item?.item_reference ||
                            null;

                          const receiptRegion =
                            receipt.purchase_order?.purchase_request?.region ||
                            receipt.purchase_request?.region ||
                            receipt.items?.find((i) => i.purchase_order_item?.region || i.purchase_order_item?.pr_item?.region)?.purchase_order_item?.region ||
                            receipt.items?.find((i) => i.purchase_order_item?.region || i.purchase_order_item?.pr_item?.region)?.purchase_order_item?.pr_item?.region ||
                            null;

                          return (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs sm:text-sm pt-1">
                              <div className="flex items-center gap-2 text-slate-200 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
                                <span className="text-base">🏢</span>
                                <div>
                                  <span className="text-slate-400 block text-[11px]">المورد:</span>
                                  <span className="font-bold text-slate-100">{receipt.purchase_order?.supplier?.company_name || 'مورد غير محدد'}</span>
                                </div>
                              </div>

                              {receipt.receipt_type === 'SITE_DIRECT' ? (
                                <div className="flex items-center gap-2 text-indigo-200 bg-indigo-950/50 p-2.5 rounded-xl border border-indigo-700/60">
                                  <span className="text-base">🏗️</span>
                                  <div>
                                    <span className="text-indigo-400 block text-[11px] font-bold">مسار التوريد:</span>
                                    <span className="font-bold text-white">مباشر للموقع من المورد</span>
                                  </div>
                                </div>
                              ) : receipt.warehouse_keeper ? (
                                <div className="flex items-center gap-2 text-amber-300 bg-amber-950/40 p-2.5 rounded-xl border border-amber-800/50">
                                  <span className="text-base">📦</span>
                                  <div>
                                    <span className="text-amber-400/80 block text-[11px]">أمين المخزن:</span>
                                    <span className="font-bold">{receipt.warehouse_keeper.name}</span>
                                  </div>
                                </div>
                              ) : null}

                              {/* Parcel Reference Callout */}
                              <div className="flex items-center gap-2 text-cyan-200 bg-cyan-950/40 p-2.5 rounded-xl border border-cyan-800/50">
                                <span className="text-base">🏷️</span>
                                <div>
                                  <span className="text-cyan-400/80 block text-[11px] font-bold">رقم قطعة الأرض:</span>
                                  <span className="font-mono font-black text-cyan-300 text-xs sm:text-sm">{receiptParcel || 'غير محددة'}</span>
                                </div>
                              </div>

                              {/* Region Callout */}
                              <div className="flex items-center gap-2 text-amber-200 bg-amber-950/40 p-2.5 rounded-xl border border-amber-800/50">
                                <span className="text-base">📍</span>
                                <div>
                                  <span className="text-amber-400/80 block text-[11px] font-bold">المنطقة:</span>
                                  <span className="font-black text-amber-300 text-xs sm:text-sm">{receiptRegion || 'غير محددة'}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                        {receipt.warehouse_notes && (
                          <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-3 text-xs sm:text-sm text-amber-200">
                            <strong className="text-amber-400">ملاحظات أمين المخزن: </strong>
                            {receipt.warehouse_notes}
                          </div>
                        )}

                        {/* Attached Photo Display for Site Engineer */}
                        {Boolean(receipt.photo_url || receipt.photo_path) && (
                          <div className="rounded-2xl border-2 border-cyan-500/50 bg-cyan-950/25 p-4 space-y-3 shadow-md">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <span className="text-xs sm:text-sm font-black text-cyan-200 flex items-center gap-2">
                                <span>📷</span> صورة فحص واستلام المخزن (بون الميزان / وزنة الحديد المرفقة):
                              </span>
                              <button
                                type="button"
                                onClick={() => setPreviewPhotoUrl(getReceiptPhotoUrl(receipt))}
                                className="text-xs font-bold text-cyan-400 hover:text-cyan-300 underline inline-flex items-center gap-1 cursor-pointer"
                              >
                                <span>🔍</span> عرض بالحجم الكامل
                              </button>
                            </div>
                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3.5 bg-slate-950/90 p-3 rounded-xl border border-slate-800">
                              <div
                                onClick={() => setPreviewPhotoUrl(getReceiptPhotoUrl(receipt))}
                                className="relative h-24 w-24 sm:h-28 sm:w-28 rounded-xl overflow-hidden border-2 border-cyan-400/80 cursor-pointer shrink-0 shadow-lg group"
                              >
                                <img
                                  src={getReceiptPhotoUrl(receipt)}
                                  alt="صورة الاستلام الميداني"
                                  className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                                />
                                <div className="absolute inset-0 bg-slate-950/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                  <span className="text-xs font-bold text-white bg-slate-900/90 px-2 py-1 rounded">🔍 تكبير</span>
                                </div>
                              </div>
                              <div className="text-xs space-y-1.5 flex-1">
                                <p className="font-black text-slate-100 text-sm">
                                  صورة موثقة بواسطة أمين المخزن أثناء استلام الشحنة
                                </p>
                                <p className="text-slate-300">
                                  يمكنك مطابقة بون الميزان وأختام الحديد ومطابقتها هندسياً قبل تأكيد الاعتماد النهائي.
                                </p>
                                <button
                                  type="button"
                                  onClick={() => setPreviewPhotoUrl(getReceiptPhotoUrl(receipt))}
                                  className="text-xs font-bold text-cyan-400 hover:underline cursor-pointer"
                                >
                                  اضغط هنا لمعاينة الصورة المكبرة ←
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Items Cards */}
                      <div className="space-y-4">
                        <h4 className="text-xs sm:text-sm font-black text-emerald-300 flex items-center gap-2">
                          <span>🏗️</span> بنود الاستلام المطلوب فحصها هندسياً ({receipt.items?.length || 0} بنود):
                        </h4>

                        <div className="space-y-3.5">
                          {(receipt.items || []).map((item, idx) => {
                            const key = `receipt-${receipt.id}-${item.id}`;
                            const val = quantities[key] ?? String(item.received_quantity);

                            return (
                              <div
                                key={item.id}
                                className="rounded-2xl border-2 border-slate-700/80 bg-slate-950/90 p-4 sm:p-5 space-y-3.5 shadow-lg"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="space-y-1 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300 font-black text-sm border border-emerald-500/40 shrink-0">
                                        #{idx + 1}
                                      </span>
                                      <h4 className="text-base sm:text-lg font-black text-slate-50 tracking-wide flex items-center gap-2 flex-wrap">
                                        <span>{item.purchase_order_item?.item_description || item.purchase_order_item?.item?.name}</span>
                                      </h4>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 flex-wrap text-xs sm:text-sm">
                                  {(item.purchase_order_item?.item_reference || item.purchase_order_item?.pr_item?.item_reference || receipt.purchase_order?.purchase_request?.parcel_reference || receipt.purchase_request?.parcel_reference) && (
                                    <span className="inline-flex items-center gap-1.5 font-mono text-cyan-200 bg-cyan-950 border border-cyan-700/80 px-3 py-1 rounded-xl font-black">
                                      <span>🏷️</span> قطعة الأرض: {item.purchase_order_item?.item_reference || item.purchase_order_item?.pr_item?.item_reference || receipt.purchase_order?.purchase_request?.parcel_reference || receipt.purchase_request?.parcel_reference}
                                    </span>
                                  )}
                                  {(item.purchase_order_item?.region || item.purchase_order_item?.pr_item?.region || receipt.purchase_order?.purchase_request?.region || receipt.purchase_request?.region) && (
                                    <span className="inline-flex items-center gap-1.5 text-amber-200 bg-amber-950 border border-amber-700/80 px-3 py-1 rounded-xl font-black">
                                      <span>📍</span> المنطقة: {item.purchase_order_item?.region || item.purchase_order_item?.pr_item?.region || receipt.purchase_order?.purchase_request?.region || receipt.purchase_request?.region}
                                    </span>
                                  )}
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                                  {/* Warehouse Recorded Quantity or Ordered Quantity for SITE_DIRECT */}
                                  <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 flex flex-col justify-between space-y-1">
                                    <span className="text-xs font-bold text-slate-400">
                                      {receipt.receipt_type === 'SITE_DIRECT' ? 'الكمية المطلوبة للتوريد المباشر بالموقع:' : 'الكمية المسجلة من أمين المخزن:'}
                                    </span>
                                    <div className="font-mono text-xl sm:text-2xl font-black text-cyan-300 flex items-baseline gap-2 mt-1">
                                      <span>{item.received_quantity}</span>
                                      <span className="text-base font-bold text-slate-300">{getUnitLabel(item.purchase_order_item?.uom || '')}</span>
                                    </div>
                                  </div>

                                  {/* Site Engineer Confirmed Quantity */}
                                  <div className="rounded-2xl border-2 border-emerald-500/80 bg-emerald-950/30 p-4 space-y-2 shadow-inner">
                                    <div className="flex items-center justify-between">
                                      <label htmlFor={`site-qty-${key}`} className="text-xs sm:text-sm font-black text-emerald-300 flex items-center gap-1.5">
                                        <span>👷</span>
                                        <span>الكمية المعتمدة ميدانياً:</span>
                                      </label>
                                      <span className="text-[11px] font-bold text-emerald-400 bg-emerald-950 border border-emerald-500/50 px-2 py-0.5 rounded-full">
                                        جاهزة للاعتماد
                                      </span>
                                    </div>
                                    <div className="relative flex items-center">
                                      <input
                                        id={`site-qty-${key}`}
                                        type="number"
                                        min="0"
                                        step="any"
                                        placeholder="أدخل الكمية المعتمدة..."
                                        value={val}
                                        onChange={(e) => setQuantities({ ...quantities, [key]: e.target.value })}
                                        className="w-full h-12 rounded-xl border-2 border-emerald-400 bg-slate-900/95 pl-24 pr-3.5 text-lg sm:text-xl font-black text-emerald-200 placeholder:text-slate-500 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-500/30 focus:outline-none transition-all shadow-inner"
                                      />
                                      <div className="absolute left-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-emerald-950/90 border border-emerald-500/50 px-2.5 py-1 rounded-lg pointer-events-none">
                                        <span className="text-xs font-black text-emerald-300">
                                          {getUnitLabel(item.purchase_order_item?.uom || '')}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-1 pt-1">
                                  <input
                                    type="text"
                                    placeholder="ملاحظات مهندس الموقع على هذا الصنف..."
                                    value={itemNotes[key] ?? (item.notes || '')}
                                    onChange={(e) => setItemNotes({ ...itemNotes, [key]: e.target.value })}
                                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs sm:text-sm text-slate-200 focus:border-cyan-400 focus:outline-none"
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* General Site Notes */}
                        <div className="space-y-1.5 pt-2">
                          <label className="text-xs sm:text-sm font-bold text-slate-300">ملاحظات واعتماد مهندس الموقع (اختياري):</label>
                          <textarea
                            rows={2}
                            value={notes[receipt.id] || ''}
                            onChange={(e) => setNotes({ ...notes, [receipt.id]: e.target.value })}
                            placeholder="ملاحظات مهندس الموقع على استلام وفحص المواد بالموقع..."
                            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs sm:text-sm text-slate-100 focus:border-cyan-400 focus:outline-none"
                          />
                        </div>

                        {/* Big Submit Button */}
                        <div className="pt-3 border-t border-slate-800 space-y-2">
                          <Button
                            variant="success"
                            size="lg"
                            isLoading={isSavingThis}
                            onClick={() => approveReceipt(receipt)}
                            className="w-full font-black text-base sm:text-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 py-3.5 rounded-2xl shadow-xl shadow-emerald-950/60 flex items-center justify-center gap-2"
                          >
                            <span>✓</span> اعتماد مطابق للموقع وإرسال للحسابات لصرف الدفعات
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <div className="p-12 text-center text-slate-400 space-y-2 rounded-2xl border border-slate-800 bg-slate-900/60">
                <span className="text-4xl block">🏗️</span>
                <p className="text-base font-bold text-slate-200">لا توجد أذونات استلام بانتظار الاعتماد الميداني</p>
                <p className="text-xs text-slate-500">
                  تظهر هنا أذونات الاستلام المسجلة من أمين المخزن لاعتمادها هندسياً قبل إرسالها للحسابات.
                </p>
              </div>
            )
          )}
        </>
      )}

      {/* ── TAB 2: MATERIALS RECEIPT ARCHIVE (أرشيف استلام المواد) ── */}
      {activeTab === 'ARCHIVE' && (
        <div className="space-y-4 animate-fade-in">
          {visibleArchive.length > 0 ? (
            visibleArchive.map((receipt) => {
              const isExpanded = expandedArchiveId === receipt.id;
              const isApproved = receipt.status === 'APPROVED';
              const isPendingSite = receipt.status === 'PENDING_SITE_ENGINEER';

              return (
                <Card
                  key={`archive-${receipt.id}`}
                  className={`p-4 sm:p-6 space-y-4 border rounded-2xl transition-all ${
                    isApproved
                      ? 'border-emerald-800/70 bg-slate-900/90'
                      : 'border-slate-800 bg-slate-900/80'
                  }`}
                >
                  {/* Top Summary Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-mono text-sm sm:text-base font-black text-cyan-300 bg-cyan-950 border border-cyan-800/80 px-3 py-1 rounded-xl">
                        {receipt.receipt_number}
                      </span>
                      {receipt.purchase_order && (
                        <span className="text-xs sm:text-sm font-bold text-slate-300">
                          أمر شراء: <span className="font-mono text-cyan-400">{receipt.purchase_order.po_number}</span>
                        </span>
                      )}
                      <span className="text-xs sm:text-sm text-slate-300">
                        🏢 {receipt.purchase_order?.supplier?.company_name || 'مورد غير محدد'}
                      </span>
                      {receipt.receipt_type === 'SITE_DIRECT' && (
                        <span className="text-xs font-black px-2.5 py-0.5 rounded-full border bg-amber-950/80 text-amber-300 border-amber-600/70 shadow-sm">
                          🏗️ توريد مباشر لموقع المباني
                        </span>
                      )}
                      <span
                        className={`text-xs font-bold px-3 py-1 rounded-full border ${
                          isApproved
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-800/60'
                            : isPendingSite
                            ? 'bg-amber-950 text-amber-300 border-amber-800/60'
                            : 'bg-slate-800 text-slate-300 border-slate-700'
                        }`}
                      >
                        {isApproved ? '✓ معتمد ومطابق (جاهز للحسابات)' : isPendingSite ? '⏳ بانتظار اعتماد مهندس الموقع' : receipt.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setExpandedArchiveId(isExpanded ? null : receipt.id)}
                        className="text-xs sm:text-sm font-bold rounded-xl"
                      >
                        {isExpanded ? 'إخفاء التفاصيل' : 'عرض التفاصيل والبنود ←'}
                      </Button>
                    </div>
                  </div>

                  {/* Parcel Reference & Region Badges */}
                  {(() => {
                    const archiveParcel =
                      receipt.purchase_order?.purchase_request?.parcel_reference ||
                      receipt.purchase_request?.parcel_reference ||
                      receipt.items?.find((i) => i.purchase_order_item?.item_reference || i.purchase_order_item?.pr_item?.item_reference)?.purchase_order_item?.item_reference ||
                      receipt.items?.find((i) => i.purchase_order_item?.item_reference || i.purchase_order_item?.pr_item?.item_reference)?.purchase_order_item?.pr_item?.item_reference ||
                      null;

                    const archiveRegion =
                      receipt.purchase_order?.purchase_request?.region ||
                      receipt.purchase_request?.region ||
                      receipt.items?.find((i) => i.purchase_order_item?.region || i.purchase_order_item?.pr_item?.region)?.purchase_order_item?.region ||
                      receipt.items?.find((i) => i.purchase_order_item?.region || i.purchase_order_item?.pr_item?.region)?.purchase_order_item?.pr_item?.region ||
                      null;

                    return (archiveParcel || archiveRegion) ? (
                      <div className="flex items-center gap-2 flex-wrap text-xs pt-1">
                        {archiveParcel && (
                          <span className="inline-flex items-center gap-1.5 font-mono text-cyan-200 bg-cyan-950/80 border border-cyan-800/60 px-3 py-1 rounded-xl font-bold">
                            <span>🏷️</span> قطعة الأرض: {archiveParcel}
                          </span>
                        )}
                        {archiveRegion && (
                          <span className="inline-flex items-center gap-1.5 text-amber-200 bg-amber-950/80 border border-amber-800/60 px-3 py-1 rounded-xl font-bold">
                            <span>📍</span> المنطقة: {archiveRegion}
                          </span>
                        )}
                      </div>
                    ) : null;
                  })()}

                  {/* Audit Trail & Sign-offs Banner */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
                    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 space-y-1">
                      <div className="flex items-center justify-between text-slate-400 font-bold">
                        <span>{receipt.receipt_type === 'SITE_DIRECT' ? '🏗️ توريد مباشر للموقع:' : '📦 استلام أمين المخزن:'}</span>
                        <span className="font-mono text-xs text-slate-500">
                          {receipt.received_at || receipt.created_at?.slice(0, 10) || '—'}
                        </span>
                      </div>
                      <p className="text-slate-100 font-bold text-sm sm:text-base">
                        {receipt.receipt_type === 'SITE_DIRECT' ? 'توريد مباشر من المورد لموقع المباني (بدون مخزن)' : (receipt.warehouse_keeper?.name || 'عم سلامة (أمين المخزن)')}
                      </p>
                      {receipt.warehouse_notes && (
                        <p className="text-amber-300 text-xs sm:text-sm bg-amber-950/30 p-2.5 rounded-lg border border-amber-900/40 mt-1">
                          «{receipt.warehouse_notes}»
                        </p>
                      )}
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 space-y-1">
                      <div className="flex items-center justify-between text-slate-400 font-bold">
                        <span>👷 اعتماد مهندس الموقع:</span>
                        <span className="font-mono text-xs text-slate-500">
                          {isApproved ? 'تم الاعتماد الميداني' : 'قيد المراجعة'}
                        </span>
                      </div>
                      <p className="text-slate-100 font-bold text-sm sm:text-base">
                        {receipt.site_engineer?.name || receipt.purchase_order?.purchase_request?.site_engineer?.name || 'مهندس الموقع'}
                      </p>
                      {receipt.site_engineer_notes && (
                        <p className="text-emerald-300 text-xs sm:text-sm bg-emerald-950/30 p-2.5 rounded-lg border border-emerald-900/40 mt-1">
                          «{receipt.site_engineer_notes}»
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Photo in Archive View */}
                  {Boolean(receipt.photo_url || receipt.photo_path) && (
                    <div className="rounded-xl border border-cyan-500/40 bg-cyan-950/20 p-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={getReceiptPhotoUrl(receipt)}
                          alt="صورة الاستلام"
                          onClick={() => setPreviewPhotoUrl(getReceiptPhotoUrl(receipt))}
                          className="h-14 w-14 rounded-lg object-cover border border-cyan-500/60 cursor-pointer shrink-0 hover:scale-105 transition-transform"
                        />
                        <div className="text-xs">
                          <p className="font-bold text-cyan-200">📷 مرفق صورة إذن الاستلام / بون الميزان</p>
                          <p className="text-slate-400 text-[11px]">تم توثيق الصورة وحفظها مع سجل الاستلام.</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPreviewPhotoUrl(getReceiptPhotoUrl(receipt))}
                        className="text-xs font-bold text-cyan-400 hover:underline shrink-0 cursor-pointer"
                      >
                        معاينة الصورة 🔍
                      </button>
                    </div>
                  )}

                  {/* Expanded Items Cards in Archive */}
                  {isExpanded && (
                    <div className="space-y-3 pt-3 border-t border-slate-800 animate-fade-in">
                      <h4 className="text-xs sm:text-sm font-bold text-slate-300">تفاصيل البنود والكميات المسجلة في هذا الإذن:</h4>
                      <div className="space-y-2.5">
                        {(receipt.items || []).map((item, idx) => (
                          <div key={item.id} className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-cyan-400 font-bold text-xs">#{idx + 1}</span>
                                <span className="font-black text-sm text-slate-100 flex items-center gap-2 flex-wrap">
                                  <span>{item.purchase_order_item?.item_description || item.purchase_order_item?.item?.name}</span>
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 flex-wrap text-xs">
                              {(item.purchase_order_item?.item_reference || item.purchase_order_item?.pr_item?.item_reference || receipt.purchase_order?.purchase_request?.parcel_reference || receipt.purchase_request?.parcel_reference) && (
                                <span className="font-mono text-cyan-300 bg-cyan-950/80 border border-cyan-800/60 px-2.5 py-0.5 rounded-lg font-bold">
                                  قطعة الأرض: {item.purchase_order_item?.item_reference || item.purchase_order_item?.pr_item?.item_reference || receipt.purchase_order?.purchase_request?.parcel_reference || receipt.purchase_request?.parcel_reference}
                                </span>
                              )}
                              {(item.purchase_order_item?.region || item.purchase_order_item?.pr_item?.region || receipt.purchase_order?.purchase_request?.region || receipt.purchase_request?.region) && (
                                <span className="text-amber-300 bg-amber-950/80 border border-amber-800/60 px-2.5 py-0.5 rounded-lg font-bold">
                                  المنطقة: {item.purchase_order_item?.region || item.purchase_order_item?.pr_item?.region || receipt.purchase_order?.purchase_request?.region || receipt.purchase_request?.region}
                                </span>
                              )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                              <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 flex items-center justify-between text-xs sm:text-sm">
                                <span className="text-slate-400 font-bold flex items-center gap-1.5">
                                  <span>📋</span> الكمية المطلوبة بأمر الشراء:
                                </span>
                                <span className="font-mono font-black text-cyan-300 text-sm sm:text-base">
                                  {item.ordered_quantity ?? item.purchase_order_item?.quantity ?? '—'} {getUnitLabel(item.purchase_order_item?.uom || '')}
                                </span>
                              </div>
                              <div className="bg-emerald-950/40 p-3 rounded-xl border border-emerald-800/60 flex items-center justify-between text-xs sm:text-sm">
                                <span className="text-emerald-300 font-bold flex items-center gap-1.5">
                                  <span>✓</span> الكمية الفعلية المستلمة:
                                </span>
                                <span className="font-mono font-black text-emerald-200 text-sm sm:text-base">
                                  {item.received_quantity} {getUnitLabel(item.purchase_order_item?.uom || '')}
                                </span>
                              </div>
                            </div>
                            {item.notes && (
                              <p className="text-xs text-slate-400 bg-slate-900/60 p-2 rounded-lg">
                                ملاحظات: {item.notes}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })
          ) : (
            <div className="p-12 text-center text-slate-400 space-y-2 rounded-2xl border border-slate-800 bg-slate-900/60">
              <span className="text-4xl block">🗄️</span>
              <p className="text-base font-bold text-slate-200">لا توجد سجلات في أرشيف الاستلام حتى الآن</p>
              <p className="text-xs text-slate-500">
                يتم أرشفة وحفظ كل إذن استلام فور تسجيله من أمين المخزن واعتماده من مهندس الموقع لتوثيق دورة الاستلام بالكامل.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Full-Screen Image Preview Modal */}
      {previewPhotoUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm animate-fade-in"
          onClick={() => setPreviewPhotoUrl(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] w-full bg-slate-950 rounded-2xl border border-slate-700 p-2 overflow-hidden shadow-2xl flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between p-3 border-b border-slate-800 text-slate-100">
              <span className="font-black text-sm flex items-center gap-2">
                <span>📷</span> معاينة صورة بون الميزان / استلام المخزن
              </span>
              <button
                type="button"
                onClick={() => setPreviewPhotoUrl(null)}
                className="h-8 w-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-2 overflow-auto max-h-[75vh] flex items-center justify-center w-full">
              <img
                src={previewPhotoUrl}
                alt="معاينة كاملة لصورة إذن الاستلام الميداني أو بون الميزان"
                className="max-h-[70vh] max-w-full object-contain rounded-lg shadow-inner"
              />
            </div>
            <div className="p-3 w-full border-t border-slate-800 text-center">
              <a
                href={previewPhotoUrl}
                target="_blank"
                rel="noreferrer"
                download="receipt-photo.jpg"
                className="text-xs font-bold text-cyan-400 hover:underline inline-flex items-center gap-1.5"
              >
                <span>📥</span> فتح في نافذة مستقلة / تحميل الصورة
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseReceiptPage;
