import React, { useMemo, useState } from 'react';
import { Button } from '../ui/Button';
import { LandParcel, createLandParcelApi } from '../../api/supplierFinance';
import { parseApiError } from '../../utils/apiError';
import { formatCleanNumber } from '../../utils/numberFormat';

export interface LandAllocationDraft {
  land_parcel_id: number | '';
  department_id?: number | '';
  amount: string;
  notes: string;
}

interface LandAllocationEditorProps {
  parcels: LandParcel[];
  departments?: Array<{ id: number; name: string; code?: string }>;
  allocations: LandAllocationDraft[];
  invoiceAmount: number;
  disabled?: boolean;
  error?: string | null;
  onChange: (allocations: LandAllocationDraft[]) => void;
  onParcelCreated?: (newParcel: LandParcel) => void;
}

const money = (value: number) => `${formatCleanNumber(value)} ج.م`;

export const LandAllocationEditor: React.FC<LandAllocationEditorProps> = ({
  parcels,
  departments = [],
  allocations,
  invoiceAmount,
  disabled = false,
  error,
  onChange,
  onParcelCreated,
}) => {
  const [isAddingParcel, setIsAddingParcel] = useState(false);
  const [newParcelRef, setNewParcelRef] = useState('');
  const [newParcelRegion, setNewParcelRegion] = useState('');
  const [newParcelOpeningBalance, setNewParcelOpeningBalance] = useState('');
  const [newParcelNotes, setNewParcelNotes] = useState('');
  const [isSavingParcel, setIsSavingParcel] = useState(false);
  const [parcelCreateError, setParcelCreateError] = useState<string | null>(null);

  const allocatedTotal = useMemo(
    () => allocations.reduce((sum, allocation) => sum + Number(allocation.amount || 0), 0),
    [allocations],
  );

  const updateAllocation = (index: number, field: keyof LandAllocationDraft, value: string) => {
    onChange(allocations.map((allocation, allocationIndex) => (
      allocationIndex === index
        ? {
            ...allocation,
            [field]: field === 'land_parcel_id' || field === 'department_id'
              ? (value ? Number(value) : '')
              : value,
          }
        : allocation
    )));
  };

  const addRow = () => onChange([...allocations, { land_parcel_id: '', department_id: departments[0]?.id || '', amount: '', notes: '' }]);
  const removeRow = (index: number) => onChange(allocations.filter((_, allocationIndex) => allocationIndex !== index));

  const handleCreateParcel = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!newParcelRef.trim() || !newParcelRegion.trim()) {
      setParcelCreateError('رقم قطعة الأرض والمنطقة مطلوبان.');
      return;
    }

    setIsSavingParcel(true);
    setParcelCreateError(null);

    try {
      const created = await createLandParcelApi({
        parcel_reference: newParcelRef.trim(),
        region: newParcelRegion.trim(),
        opening_balance: Number(newParcelOpeningBalance || 0),
        notes: newParcelNotes.trim() || undefined,
      });

      onParcelCreated?.(created);

      // Auto-assign the newly created parcel to the first empty row or a new row
      const emptyRowIndex = allocations.findIndex((a) => a.land_parcel_id === '');
      if (emptyRowIndex >= 0) {
        const nextAllocations = [...allocations];
        nextAllocations[emptyRowIndex] = {
          ...nextAllocations[emptyRowIndex],
          land_parcel_id: created.id,
          amount: nextAllocations[emptyRowIndex].amount || (nextAllocations.length === 1 ? String(invoiceAmount || '') : ''),
        };
        onChange(nextAllocations);
      } else {
        onChange([...allocations, { land_parcel_id: created.id, amount: allocations.length === 0 ? String(invoiceAmount || '') : '', notes: '' }]);
      }

      // Reset form
      setNewParcelRef('');
      setNewParcelRegion('');
      setNewParcelOpeningBalance('');
      setNewParcelNotes('');
      setIsAddingParcel(false);
    } catch (err) {
      setParcelCreateError(parseApiError(err).message);
    } finally {
      setIsSavingParcel(false);
    }
  };

  return (
    <div className="rounded-xl border border-amber-700/60 bg-amber-950/20 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-amber-200">توزيع مصروف الفاتورة على قطع الأراضي (ديناميكي ومرن) <span className="text-rose-400">*</span></h3>
          <p className="mt-1 text-xs leading-6 text-amber-100/75">
            اختر قطعة الأرض وحدد مبلغ المصروف المحمل عليها. المبلغ ديناميكي ويمكن أن يكون أقل أو أكثر من إجمالي الفاتورة أو موزعاً على عدة قطع بحرية كاملة.
          </p>
        </div>
        <div className="text-left text-xs bg-slate-950/60 border border-slate-800 p-2.5 rounded-lg">
          <div className="text-slate-400">قيمة الفاتورة: <strong className="font-mono text-slate-100">{money(invoiceAmount)}</strong></div>
          <div className="text-emerald-300 mt-0.5">إجمالي المصروف الموزع: <strong className="font-mono">{money(allocatedTotal)}</strong></div>
        </div>
      </div>

      {/* Quick Add Parcel Form */}
      {isAddingParcel && (
        <div className="rounded-xl border border-cyan-700/70 bg-slate-900/95 p-4 space-y-3 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h4 className="text-xs font-bold text-cyan-300">🏢 إنشاء حساب قطعة أرض جديدة سريعاً</h4>
            <button
              type="button"
              onClick={() => setIsAddingParcel(false)}
              className="text-xs font-bold text-slate-400 hover:text-white"
            >
              ✕ إلغاء
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">رقم قطعة الأرض *</label>
              <input
                required
                value={newParcelRef}
                onChange={(e) => setNewParcelRef(e.target.value)}
                placeholder="مثال: 256"
                className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">المنطقة *</label>
              <input
                required
                value={newParcelRegion}
                onChange={(e) => setNewParcelRegion(e.target.value)}
                placeholder="مثال: السابعة"
                className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-100"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">رصيد العميل الافتتاحي (ج.م)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={newParcelOpeningBalance}
                onChange={(e) => setNewParcelOpeningBalance(e.target.value)}
                placeholder="0.00"
                className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">ملاحظات (اختياري)</label>
              <input
                value={newParcelNotes}
                onChange={(e) => setNewParcelNotes(e.target.value)}
                placeholder="ملاحظات على القطعة..."
                className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-100"
              />
            </div>
          </div>
          {parcelCreateError && <p className="text-xs font-bold text-rose-300">{parcelCreateError}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" size="sm" variant="secondary" onClick={() => setIsAddingParcel(false)}>
              إلغاء
            </Button>
            <Button
              type="button"
              size="sm"
              variant="primary"
              isLoading={isSavingParcel}
              onClick={() => void handleCreateParcel()}
              className="font-bold"
            >
              حفظ القطعة واختيارها فوراً
            </Button>
          </div>
        </div>
      )}

      {parcels.length === 0 && !isAddingParcel ? (
        <div className="mt-3 rounded-lg border border-rose-500/50 bg-rose-950/30 p-3 text-xs leading-6 text-rose-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <span>لا توجد حسابات قطع أراضٍ نشطة حالياً.</span>
          <Button
            type="button"
            size="sm"
            variant="primary"
            onClick={() => setIsAddingParcel(true)}
            className="font-bold whitespace-nowrap min-h-10"
          >
            + إضافة أول قطعة أرض الآن
          </Button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {allocations.map((allocation, index) => (
            <div key={`${index}-${allocation.land_parcel_id}`} className="grid grid-cols-1 gap-2.5 rounded-xl border border-slate-700/80 bg-slate-950/80 p-3.5 sm:grid-cols-[1.2fr_1fr_0.8fr_1.2fr_auto] items-end">
              <label className="text-[11px] font-bold text-slate-300">
                قطعة الأرض <span className="text-amber-400">*</span>
                <select
                  aria-label={`قطعة الأرض للتوزيع ${index + 1}`}
                  value={allocation.land_parcel_id}
                  onChange={(event) => updateAllocation(index, 'land_parcel_id', event.target.value)}
                  disabled={disabled}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-xs text-slate-100 outline-none focus:border-amber-400 disabled:opacity-60 font-semibold"
                >
                  <option value="">اختر القطعة...</option>
                  {parcels.map((parcel) => (
                    <option key={parcel.id} value={parcel.id}>
                      {parcel.parcel_reference} — {parcel.region} (الرصيد: {money(Number(parcel.balance))})
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-[11px] font-bold text-slate-300">
                القسم / بند الصرف
                <select
                  aria-label={`القسم للتوزيع ${index + 1}`}
                  value={allocation.department_id ?? ''}
                  onChange={(event) => updateAllocation(index, 'department_id', event.target.value)}
                  disabled={disabled}
                  className="mt-1 h-10 w-full rounded-lg border border-cyan-800/70 bg-slate-900 px-2.5 text-xs text-cyan-200 outline-none focus:border-cyan-400 disabled:opacity-60 font-semibold"
                >
                  <option value="">(عام / بدون تحديد قسم)</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name} {dept.code ? `(${dept.code})` : ''}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-[11px] font-bold text-slate-300">
                مبلغ المصروف (ج.م) <span className="text-amber-400">*</span>
                <input
                  aria-label={`مبلغ توزيع القطعة ${index + 1}`}
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={allocation.amount}
                  onChange={(event) => updateAllocation(index, 'amount', event.target.value)}
                  disabled={disabled}
                  placeholder="0.00"
                  className="mt-1 h-10 w-full rounded-lg border border-amber-500/60 bg-slate-900 px-2 text-center font-mono text-xs text-slate-100 outline-none focus:border-amber-300 disabled:opacity-60 font-bold"
                />
              </label>

              <label className="text-[11px] font-bold text-slate-300">
                ملاحظة الصرف
                <input
                  aria-label={`ملاحظة توزيع القطعة ${index + 1}`}
                  value={allocation.notes}
                  onChange={(event) => updateAllocation(index, 'notes', event.target.value)}
                  disabled={disabled}
                  placeholder="مثال: أعمال تطوير / تشطيب..."
                  className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-xs text-slate-100 outline-none focus:border-amber-400 disabled:opacity-60"
                />
              </label>

              <Button type="button" size="sm" variant="danger" onClick={() => removeRow(index)} disabled={disabled || allocations.length <= 1} className="min-h-10">
                حذف
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button type="button" size="sm" variant="secondary" onClick={addRow} disabled={disabled} className="min-h-10 text-xs">
              + إضافة سطر توزيع
            </Button>
            {!isAddingParcel && (
              <Button
                type="button"
                size="sm"
                variant="primary"
                onClick={() => setIsAddingParcel(true)}
                disabled={disabled}
                className="min-h-10 text-xs font-bold bg-cyan-800 hover:bg-cyan-700 text-white"
              >
                + إضافة قطعة أرض جديدة للنظام
              </Button>
            )}
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-xs font-bold text-rose-300">{error}</p>}
    </div>
  );
};

export default LandAllocationEditor;


