import React, { useEffect, useMemo, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { PurchaseRequest, PR_PRIORITY_LABELS } from '../../types/purchaseRequest';
import { المورد } from '../../types/purchaseOrder';
import { DirectAccountingFinancialData } from '../../api/procurement';
import { getUnitLabel } from '../../utils/units';
import { SupplierSelectWithQuickAdd } from '../common/SupplierSelectWithQuickAdd';
import { SupplementItemBadge } from '../common/SupplementItemBadge';

interface DirectAccountingReviewModalProps {
  request: PurchaseRequest | null;
  suppliers?: المورد[];
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (financialData: DirectAccountingFinancialData) => void;
  isSubmitting?: boolean;
  reviewMode?: 'procurement' | 'accounting';
  apiError?: string | null;
}

type EditableFinancialItem = {
  pr_item_id: number;
  supplier_id: number | '';
  one_time_supplier_name?: string;
  item_reference?: string | null;
  region?: string | null;
  item_description: string;
  uom?: string | null;
  quantity: number | string;
  unit_price: number | string;
  is_supplementary?: boolean;
  supplement_batch?: number | null;
};


const formatAmount = (value: number | string | null | undefined) =>
  Number(value || 0).toLocaleString('ar-EG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const lineTotal = (quantity: number | string, unitPrice: number | string) => {
  const safeQuantity = Number.isFinite(Number(quantity)) ? Number(quantity) : 0;
  const safeUnitPrice = Number.isFinite(Number(unitPrice)) ? Number(unitPrice) : 0;
  return Math.round(safeQuantity * safeUnitPrice * 100) / 100;
};

export const DirectAccountingReviewModal: React.FC<DirectAccountingReviewModalProps> = ({
  request,
  suppliers = [],
  isOpen,
  onClose,
  onConfirm,
  isSubmitting = false,
  reviewMode = 'procurement',
  apiError = null,
}) => {
  const isAccountingReview = reviewMode === 'accounting';
  const [items, setItems] = useState<EditableFinancialItem[]>([]);
  const [notes, setNotes] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [globalSupplierId, setGlobalSupplierId] = useState<string>('');
  const [globalOneTimeName, setGlobalOneTimeName] = useState<string>('');

  const safeSuppliers = Array.isArray(suppliers) ? suppliers : [];

  const activeSuppliers = useMemo(
    () => safeSuppliers.filter((supplier) => Boolean(supplier && supplier.is_active)),
    [safeSuppliers],
  );

  useEffect(() => {
    if (!isOpen || !request) {
      setGlobalSupplierId('');
      setGlobalOneTimeName('');
      return;
    }

    const rawItems = Array.isArray(request.items) ? request.items : [];
    setItems(rawItems.map((item) => ({
      pr_item_id: item.id,
      supplier_id: item.supplier_id || request.direct_supplier_id || request.direct_supplier?.id || '',
      item_reference: item.item_reference,
      region: item.region,
      item_description: item.item_description || item.item?.name || '',
      uom: item.uom,
      quantity: Number(item.quantity) || 1,
      unit_price: Number(item.estimated_unit_price) > 0 ? Number(item.estimated_unit_price) : '',
      is_supplementary: Boolean(item.is_supplementary),
      supplement_batch: item.supplement_batch,
    })));
    setNotes(request.notes || '');
    setValidationError(null);
    setGlobalSupplierId('');
    setGlobalOneTimeName('');
  }, [isOpen, request?.id]);

  const grandTotal = useMemo(
    () => items.reduce((sum, item) => sum + lineTotal(item.quantity, item.unit_price), 0),
    [items],
  );

  // Group items by supplier for the summary view
  const supplierGroupSummary = useMemo(() => {
    const groups = new Map<number | '', { name: string; total: number; count: number }>();
    for (const item of items) {
      const sid = item.supplier_id;
      const existing = groups.get(sid);
      const supplierName = sid ? activeSuppliers.find((s) => s && s.id === sid)?.company_name || `مورد #${sid}` : 'غير محدد';
      if (existing) {
        existing.total += lineTotal(item.quantity, item.unit_price);
        existing.count += 1;
      } else {
        groups.set(sid, { name: supplierName, total: lineTotal(item.quantity, item.unit_price), count: 1 });
      }
    }
    return Array.from(groups.entries()).map(([sid, data]) => ({ supplierId: sid, ...data }));
  }, [items, activeSuppliers]);

  const updateItem = (index: number, field: 'quantity' | 'unit_price', value: string) => {
    const parsedValue = value === '' ? '' : Number(value);
    setItems((current) => current.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [field]: parsedValue } : item
    )));
    setValidationError(null);
  };

  const updateItemSupplier = (index: number, value: string) => {
    const parsedValue = value === '' ? '' as const : Number(value);
    setItems((current) => current.map((item, itemIndex) => (
      itemIndex === index ? { ...item, supplier_id: parsedValue } : item
    )));
    setValidationError(null);
  };

  const applySupplierToAll = (supplierId: number | '', oneTimeName?: string) => {
    setItems((current) =>
      current.map((item) => ({
        ...item,
        supplier_id: supplierId,
        one_time_supplier_name: oneTimeName || undefined,
      }))
    );
    setValidationError(null);
  };

  const handleApplyGlobalSupplier = () => {
    if (!globalSupplierId && !globalOneTimeName.trim()) {
      setValidationError('يرجى اختيار مورد أو كتابة اسم مورد لعملية واحدة أولاً.');
      return;
    }
    applySupplierToAll(globalSupplierId ? Number(globalSupplierId) : '', globalOneTimeName.trim());
  };

  const handleConfirm = () => {
    if (items.length === 0) {
      setValidationError('لا توجد بنود مالية مرتبطة بهذا الطلب.');
      return;
    }
    if (items.some((item) => !item.supplier_id && !item.one_time_supplier_name?.trim())) {
      setValidationError('يجب اختيار المورد أو تحديد مورد لعملية واحدة لكل بند من بنود الطلب.');
      return;
    }
    if (items.some((item) => !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0)) {
      setValidationError('يجب أن تكون الكمية أكبر من صفر في جميع البنود.');
      return;
    }
    if (items.some((item) => !Number.isFinite(Number(item.unit_price)) || Number(item.unit_price) < 0)) {
      setValidationError('يجب إدخال سعر وحدة صحيح لا يقل عن صفر في جميع البنود.');
      return;
    }

    onConfirm({
      supplier_id: globalSupplierId ? Number(globalSupplierId) : undefined,
      one_time_supplier_name: globalOneTimeName.trim() || undefined,
      items: items.map((item) => ({
        pr_item_id: item.pr_item_id,
        supplier_id: item.supplier_id ? Number(item.supplier_id) : undefined,
        one_time_supplier_name: item.one_time_supplier_name || undefined,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
      })),
      notes: notes.trim() || null,
    });
  };

  if (!isOpen || !request) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      closeOnBackdrop={!isSubmitting}
      closeOnEscape={!isSubmitting}
      title={isAccountingReview ? `مراجعة وتعديل البيانات المالية — ${request.request_number}` : `إدخال البيانات المالية — ${request.request_number}`}
      subtitle={isAccountingReview
        ? 'راجع الحسابات الطلب كاملًا، وعدّل البيانات المالية والملاحظات عند الحاجة، ثم أعده إلى مدير المشتريات.'
        : 'اختر المورد لكل بند وأدخل الكميات والأسعار قبل إرسال الطلب المباشر إلى الحسابات للموافقة المالية.'}
      size="xl"
      footer={(
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={isSubmitting}>
            إلغاء والعودة
          </Button>
          <Button
            variant="success"
            size="sm"
            onClick={handleConfirm}
            isLoading={isSubmitting}
            loadingText={isAccountingReview ? 'جاري إعادة الطلب للمشتريات...' : 'جاري الإرسال للحسابات...'}
          >
            {isAccountingReview ? 'اعتماد وإرسال للمشتريات' : 'تأكيد وإرسال للحسابات'}
          </Button>
        </>
      )}
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-lg border border-cyan-500/30 bg-slate-950/70 p-3">
            <p className="text-[11px] text-slate-400">رقم طلب الشراء</p>
            <p className="mt-1 whitespace-nowrap font-mono text-sm font-black text-cyan-200">{request.request_number}</p>
          </div>
          <div className="rounded-lg border border-amber-500/40 bg-amber-950/20 p-3">
            <p className="text-[11px] text-amber-300 font-semibold">تاريخ الاحتياج ⏳</p>
            <p className="mt-1 font-mono text-sm font-black text-amber-200">{request.date_needed || 'غير محدد'}</p>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-950/70 p-3">
            <p className="text-[11px] text-slate-400">القسم المستهدف</p>
            <p className="mt-1 text-sm font-bold text-slate-100">{request.target_department?.name || request.department?.name || 'غير محدد'}</p>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-950/70 p-3">
            <p className="text-[11px] text-slate-400">مقدم الطلب</p>
            <p className="mt-1 text-sm font-bold text-slate-100">{request.requester?.name || 'غير محدد'}</p>
          </div>
          <div className="rounded-lg border border-amber-500/40 bg-amber-950/20 p-3">
            <p className="text-[11px] text-amber-300/80">مسار الإجراء</p>
            <p className="mt-1 text-sm font-black text-amber-200">طلب مباشر — {isAccountingReview ? 'إعادة للمشتريات بعد المراجعة' : 'موافقة الحسابات أولًا'}</p>
          </div>
        </div>

        {/* Quick supplier apply */}
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/20 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-emerald-200">تطبيق مورد على جميع البنود دفعة واحدة</p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                يمكنك اختيار مورد معتمد، أو إضافة مورد جديد، أو كتابة اسم مورد لعملية واحدة فقط وتطبيقه على كل البنود.
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={handleApplyGlobalSupplier}
              disabled={isSubmitting || (!globalSupplierId && !globalOneTimeName.trim())}
              className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold shrink-0"
            >
              ✓ تطبيق على جميع البنود
            </Button>
          </div>
          <div className="max-w-xl">
            <SupplierSelectWithQuickAdd
              suppliers={suppliers}
              selectedSupplierId={globalSupplierId}
              onSelectSupplierId={(val) => setGlobalSupplierId(val)}
              oneTimeSupplierName={globalOneTimeName}
              onChangeOneTimeSupplierName={(name) => setGlobalOneTimeName(name)}
              onSupplierCreated={(newSup) => {
                setGlobalSupplierId(String(newSup.id));
                setGlobalOneTimeName('');
              }}
              label="المورد المقترح للبنود"
            />
          </div>
        </div>

        {(validationError || apiError) && (
          <div role="alert" className="rounded-lg border border-rose-500/50 bg-rose-950/30 px-3 py-2.5 text-xs font-bold leading-6 text-rose-200">
            {validationError || apiError}
          </div>
        )}

        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="text-sm font-black text-slate-100">تفاصيل البنود والأسعار</h3>
              {(() => {
                const reqItems = Array.isArray(request?.items) ? request.items : [];
                const parcel = reqItems[0]?.item_reference || items[0]?.item_reference || '';
                const region = reqItems[0]?.region || items[0]?.region || '';
                return (parcel || region) ? (
                  <span className="text-xs font-bold bg-amber-950/50 text-amber-300 border border-amber-700/50 px-2.5 py-0.5 rounded-lg flex items-center gap-1.5 shadow-sm">
                    <span>🏗️</span>
                    <span>قطعة {parcel || '—'}</span>
                    {region && (
                      <>
                        <span className="text-amber-500/70">•</span>
                        <span>{region}</span>
                      </>
                    )}
                  </span>
                ) : null;
              })()}
            </div>
            <span className="text-xs text-slate-400 font-medium">العملة: جنيه مصري (EGP)</span>
          </div>
          <div className="hidden overflow-x-auto rounded-lg border border-slate-700 sm:block">
            <table className="w-full border-collapse text-right text-xs">
              <thead className="bg-slate-950 text-cyan-200">
                <tr>
                  <th className="border-b border-slate-700 px-3 py-3 text-center">#</th>
                  <th className="border-b border-slate-700 px-3 py-3">اسم الصنف</th>
                  <th className="border-b border-slate-700 px-3 py-3">المورد</th>
                  <th className="border-b border-slate-700 px-3 py-3 text-center">الكمية</th>
                  <th className="border-b border-slate-700 px-3 py-3 text-center">سعر الوحدة</th>
                  <th className="border-b border-slate-700 px-3 py-3 text-center">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-rose-300">لا توجد بنود مرتبطة بهذا الطلب لإدخال بياناتها المالية.</td>
                  </tr>
                ) : items.map((item, index) => (
                  <tr key={item.pr_item_id || index} className="bg-slate-900 even:bg-slate-950/70 hover:bg-slate-800/40 transition-colors">
                    <td className="border-t border-slate-800 px-3 py-3 text-center font-mono text-slate-400">{index + 1}</td>
                    <td className="border-t border-slate-800 px-3 py-3 font-bold text-slate-100">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span>{item.item_description || '—'}</span>
                        <SupplementItemBadge
                          isSupplementary={item.is_supplementary}
                          batchNumber={item.supplement_batch}
                        />
                      </div>
                    </td>
                    <td className="border-t border-slate-800 px-2 py-2">
                      {item.one_time_supplier_name ? (
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-1 rounded bg-amber-500/20 text-amber-300 font-bold text-[10px] border border-amber-500/40 truncate max-w-[150px]">
                            ⚡ {item.one_time_supplier_name}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setItems(cur => cur.map((it, idx) => idx === index ? { ...it, one_time_supplier_name: undefined } : it));
                            }}
                            className="text-[10px] text-slate-400 hover:text-rose-400"
                            title="إلغاء المورد المخصص"
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <select
                          aria-label={`مورد البند ${index + 1}`}
                          value={item.supplier_id}
                          onChange={(event) => updateItemSupplier(index, event.target.value)}
                          disabled={isSubmitting}
                          className={`h-9 w-44 rounded-md border px-2 text-[11px] outline-none disabled:opacity-60 ${
                            item.supplier_id
                              ? 'border-emerald-500/60 bg-[#0b1424] text-slate-100 focus:border-emerald-300'
                              : 'border-rose-500/60 bg-rose-950/20 text-rose-300 focus:border-rose-300'
                          }`}
                        >
                          <option value="">اختر المورد...</option>
                          {activeSuppliers.map((supplier) => supplier && (
                            <option key={supplier.id} value={supplier.id}>
                              {supplier.company_name || `مورد #${supplier.id}`}{supplier.code ? ` — ${supplier.code}` : ''}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="border-t border-slate-800 px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <input
                          aria-label={`كمية البند ${index + 1}`}
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={item.quantity ?? ''}
                          onFocus={(event) => event.target.select()}
                          onChange={(event) => updateItem(index, 'quantity', event.target.value)}
                          disabled={isSubmitting}
                          className="h-9 w-24 rounded-md border border-cyan-500/60 bg-[#0b1424] px-2 text-center font-mono text-xs text-slate-100 outline-none focus:border-cyan-300 disabled:opacity-60"
                        />
                        <span className="text-[11px] font-bold text-amber-300">{getUnitLabel(item.uom)}</span>
                      </div>
                    </td>
                    <td className="border-t border-slate-800 px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <input
                          aria-label={`سعر وحدة البند ${index + 1}`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unit_price ?? ''}
                          onFocus={(event) => event.target.select()}
                          onChange={(event) => updateItem(index, 'unit_price', event.target.value)}
                          disabled={isSubmitting}
                          className="h-9 w-28 rounded-md border border-emerald-500/60 bg-[#0b1424] px-2 text-center font-mono text-xs text-slate-100 outline-none focus:border-emerald-300 disabled:opacity-60"
                        />
                        <span className="text-[10px] text-slate-400 font-bold">ج.م</span>
                      </div>
                    </td>
                    <td className="border-t border-slate-800 px-3 py-3 text-center font-mono font-black text-emerald-300 text-sm">
                      {formatAmount(lineTotal(item.quantity, item.unit_price))} ج.م
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-950">
                  <td colSpan={5} className="border-t border-cyan-500/50 px-3 py-4 text-left text-sm font-black text-slate-100">الإجمالي المالي للطلب:</td>
                  <td className="border-t border-cyan-500/50 px-3 py-4 text-center font-mono text-base font-black text-emerald-300">{formatAmount(grandTotal)} ج.م</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 sm:hidden">
            {items.length === 0 ? (
              <div className="rounded-xl border border-rose-800/60 bg-rose-950/20 px-3 py-6 text-center text-xs text-rose-200">
                لا توجد بنود مرتبطة بهذا الطلب لإدخال بياناتها المالية.
              </div>
            ) : items.map((item, index) => (
              <article key={`mobile-${item.pr_item_id || index}`} className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-cyan-300">بند #{index + 1}</p>
                    <p className="mt-0.5 break-words text-sm font-black text-slate-100 flex items-center gap-1.5 flex-wrap">
                      <span>{item.item_description || 'بدون وصف'}</span>
                      <SupplementItemBadge
                        isSupplementary={item.is_supplementary}
                        batchNumber={item.supplement_batch}
                      />
                    </p>
                  </div>
                  <span className="text-[11px] font-bold bg-amber-950/50 text-amber-300 border border-amber-800/50 px-2 py-0.5 rounded shrink-0">
                    {getUnitLabel(item.uom)}
                  </span>
                </div>
                <label className="mt-3 block text-xs font-bold text-emerald-300">
                  المورد <span className="text-rose-400">*</span>
                  <select
                    aria-label={`مورد البند ${index + 1}`}
                    value={item.supplier_id}
                    onChange={(event) => updateItemSupplier(index, event.target.value)}
                    disabled={isSubmitting}
                    className={`mt-1 min-h-11 w-full rounded-xl border px-3 py-2 text-sm outline-none disabled:opacity-60 ${
                      item.supplier_id
                        ? 'border-emerald-500/60 bg-[#0b1424] text-slate-100 focus:border-emerald-300'
                        : 'border-rose-500/60 bg-rose-950/20 text-rose-300 focus:border-rose-300'
                    }`}
                  >
                    <option value="">اختر المورد...</option>
                    {activeSuppliers.map((supplier) => supplier && (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.company_name || `مورد #${supplier.id}`}{supplier.code ? ` — ${supplier.code}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="mt-3 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                  <label className="text-xs font-bold text-slate-300">
                    الكمية ({getUnitLabel(item.uom)})
                    <input
                      aria-label={`كمية البند ${index + 1}`}
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={item.quantity ?? ''}
                      onFocus={(event) => event.target.select()}
                      onChange={(event) => updateItem(index, 'quantity', event.target.value)}
                      disabled={isSubmitting}
                      className="mt-1 min-h-11 w-full rounded-xl border border-cyan-500/60 bg-[#0b1424] px-3 py-2 text-center font-mono text-sm text-slate-100 outline-none focus:border-cyan-300 disabled:opacity-60"
                    />
                  </label>
                  <label className="text-xs font-bold text-slate-300">
                    سعر الوحدة (ج.م)
                    <input
                      aria-label={`سعر وحدة البند ${index + 1}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unit_price ?? ''}
                      onFocus={(event) => event.target.select()}
                      onChange={(event) => updateItem(index, 'unit_price', event.target.value)}
                      disabled={isSubmitting}
                      className="mt-1 min-h-11 w-full rounded-xl border border-emerald-500/60 bg-[#0b1424] px-3 py-2 text-center font-mono text-sm text-slate-100 outline-none focus:border-emerald-300 disabled:opacity-60"
                    />
                  </label>
                </div>
                <div className="mt-3 flex items-center justify-between rounded-lg border border-emerald-700/50 bg-emerald-950/20 px-3 py-2 text-xs">
                  <span className="text-slate-400 font-medium">إجمالي البند</span>
                  <strong className="font-mono text-sm text-emerald-200">{formatAmount(lineTotal(item.quantity, item.unit_price))} ج.م</strong>
                </div>
              </article>
            ))}
            <div className="flex items-center justify-between rounded-xl border border-cyan-500/50 bg-slate-950 px-3 py-3 text-sm font-black">
              <span className="text-slate-100">الإجمالي المالي للطلب</span>
              <span className="font-mono text-emerald-300">{formatAmount(grandTotal)} ج.م</span>
            </div>
          </div>
        </div>

        {/* Supplier summary */}
        {supplierGroupSummary.length > 1 && (
          <div className="rounded-lg border border-violet-500/40 bg-violet-950/15 p-3">
            <p className="mb-2 text-xs font-bold text-violet-200">ملخص الموردين</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {supplierGroupSummary.map((group) => (
                <div key={String(group.supplierId)} className="flex items-center justify-between rounded-md border border-violet-500/30 bg-slate-950/60 px-3 py-2 text-xs">
                  <div>
                    <p className="font-bold text-slate-100">{group.name}</p>
                    <p className="text-[10px] text-slate-400">{group.count} بند</p>
                  </div>
                  <p className="font-mono font-black text-emerald-200">{formatAmount(group.total)} ج.م</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <label className="block border-t border-slate-800 pt-4 text-xs font-bold text-slate-300">
          ملاحظات مالية وملاحظات المراجعة
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            disabled={isSubmitting}
            rows={3}
            placeholder="اكتب أي ملاحظات تحتاجها الحسابات أو توضيحًا على التعديلات..."
            className="mt-2 w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-normal leading-6 text-slate-100 outline-none focus:border-cyan-400 disabled:opacity-60"
          />
        </label>
      </div>
    </Modal>
  );
};

export default DirectAccountingReviewModal;
