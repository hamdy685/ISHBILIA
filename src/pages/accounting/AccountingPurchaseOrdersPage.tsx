import React, { useEffect, useState } from 'react';
import { getAccountingPurchaseOrdersApi, getAccountingPurchaseOrderApi } from '../../api/accounting';
import Badge from '../../components/procurement/PurchaseOrderStatusBadge';
import { PurchaseOrder } from '../../types/purchaseOrder';
import { Button } from '../../components/ui/Button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table';
import { CurrencyDisplay } from '../../components/ui/CurrencyDisplay';
import PurchaseOrderPrintModal from '../../components/procurement/PurchaseOrderPrintModal';
import TableFilterBar from '../../components/ui/TableFilterBar';
import { getDefaultDateFrom, getTodayInputDate, isDefaultTodayRange } from '../../utils/dateFilters';
import { parseApiError } from '../../utils/apiError';
import { SupplementItemBadge } from '../../components/common/SupplementItemBadge';

export const AccountingPurchaseOrdersPage: React.FC = () => {
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPo, setSelectedPo] = useState<PurchaseOrder | null>(null);
  const [openingPoId, setOpeningPoId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [supplierFilter, setSupplierFilter] = useState('ALL');
  const today = getTodayInputDate();
  const defaultDateFrom = getDefaultDateFrom();
  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState(today);

  const openPurchaseOrder = async (po: PurchaseOrder) => {
    setOpeningPoId(po.id);
    try {
      const fullPo = await getAccountingPurchaseOrderApi(po.id);
      setSelectedPo(fullPo);
    } catch {
      setSelectedPo(po);
    } finally {
      setOpeningPoId(null);
    }
  };

  useEffect(() => {
    getAccountingPurchaseOrdersApi()
      .then(setPos)
      .catch((err) => setError(parseApiError(err).message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-cyan-400 animate-pulse text-xs" dir="rtl">جاري تحميل البيانات...</div>;
  }

  const departmentOptions = Array.from(new Map(pos.map((po) => [po.department?.id || po.purchase_request?.department?.id, po.department?.name || po.purchase_request?.department?.name]).filter(([id, name]) => id && name) as Array<[number, string]>));
  const supplierOptions = Array.from(new Map(pos.map((po) => [po.supplier?.id || po.supplier_id, po.supplier?.company_name]).filter(([id, name]) => id && name) as Array<[number, string]>));
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredPos = pos.filter((po) => {
    const requester = po.requested_by?.name || po.purchase_request?.requester?.name || '';
    const department = po.department?.name || po.purchase_request?.department?.name || '';
    const approver = po.department_approver?.name || po.purchase_request?.assigned_reviewer?.name || '';
    const supplier = po.supplier?.company_name || '';
    const date = po.created_at ? po.created_at.slice(0, 10) : '';
    const searchText = [po.po_number, po.purchase_request?.request_number, requester, department, supplier].filter(Boolean).join(' ').toLocaleLowerCase('ar-EG');
    const ignoreDefaultDateRangeForSearch = Boolean(normalizedSearch) && isDefaultTodayRange(dateFrom, dateTo);
    const matchesSearch = !normalizedSearch || searchText.includes(normalizedSearch);
    const matchesStatus = statusFilter === 'ALL' || po.status === statusFilter;
    const departmentId = po.department?.id || po.purchase_request?.department?.id;
    const supplierId = po.supplier?.id || po.supplier_id;
    const matchesDepartment = departmentFilter === 'ALL' || String(departmentId || '') === departmentFilter;
    const matchesSupplier = supplierFilter === 'ALL' || String(supplierId || '') === supplierFilter;
    const matchesDate = ignoreDefaultDateRangeForSearch || ((!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo));
    return matchesSearch && matchesStatus && matchesDepartment && matchesSupplier && matchesDate;
  });
  const clearFilters = () => { setSearchTerm(''); setStatusFilter('ALL'); setDepartmentFilter('ALL'); setSupplierFilter('ALL'); setDateFrom(defaultDateFrom); setDateTo(today); };
  const hasActiveFilters = Boolean(searchTerm || statusFilter !== 'ALL' || departmentFilter !== 'ALL' || supplierFilter !== 'ALL' || dateFrom !== defaultDateFrom || dateTo !== today);

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <div className="border-b border-slate-800 pb-4">
        <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <span>📋</span> أوامر الشراء للحسابات
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          قائمة بجميع أوامر الشراء المسجلة، يمكنك اختيار أي أمر شراء لمراجعته مالياً.
        </p>
      </div>

      <TableFilterBar
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="بحث برقم الأمر أو الطلب أو الموظف أو المورد..."
        selects={[
          { label: 'القسم', value: departmentFilter, onChange: setDepartmentFilter, options: [{ value: 'ALL', label: 'كل الأقسام' }, ...departmentOptions.map(([id, name]) => ({ value: String(id), label: name }))] },
          { label: 'المورد', value: supplierFilter, onChange: setSupplierFilter, options: [{ value: 'ALL', label: 'كل الموردين' }, ...supplierOptions.map(([id, name]) => ({ value: String(id), label: name }))] },
          { label: 'الحالة', value: statusFilter, onChange: setStatusFilter, options: [{ value: 'ALL', label: 'كل الحالات' }, ...Array.from(new Set(pos.map((po) => po.status))).map((status) => ({ value: status, label: status }))] },
        ]}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onClear={clearFilters}
        hasActiveFilters={hasActiveFilters}
        resultCount={filteredPos.length}
        totalCount={pos.length}
        resultLabel="أمر شراء"
      />


      <div className="hidden min-w-0 md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">رقم أمر الشراء#</TableHead>
              <TableHead className="whitespace-nowrap">رقم الطلب#</TableHead>
              <TableHead className="whitespace-nowrap">صاحب الطلب</TableHead>
              <TableHead className="whitespace-nowrap">القسم</TableHead>
              <TableHead className="whitespace-nowrap">رئيس القسم المعتمد</TableHead>
              <TableHead className="whitespace-nowrap">المورد</TableHead>
              <TableHead className="whitespace-nowrap">الصنف</TableHead>
              <TableHead className="whitespace-nowrap">رقم قطعة الأرض</TableHead>
              <TableHead className="whitespace-nowrap">الكمية / العدد</TableHead>
              <TableHead className="whitespace-nowrap">الإجمالي الكلي</TableHead>
              <TableHead className="whitespace-nowrap">الحالة</TableHead>
              <TableHead className="whitespace-nowrap text-center">الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPos.length === 0 ? (
              <TableRow><TableCell colSpan={12} className="py-8 text-center text-xs text-slate-400">{pos.length === 0 ? 'لا توجد أوامر شراء حالياً للحسابات' : 'لم نجد أوامر شراء مطابقة للفلاتر الحالية.'}</TableCell></TableRow>
            ) : filteredPos.map((x) => {
              const item = (x.items && x.items.length > 0) ? x.items[0] : (x.purchase_request?.items && x.purchase_request.items.length > 0 ? x.purchase_request.items[0] : undefined);
              const itemName = item ? ((item as any).item_name || (item as any).item_description || (item as any).item?.name || '—') : '—';
              const parcelNumber = item ? ((item as any).item_reference || '—') : '—';
              const quantity = item ? `${(item as any).quantity || '—'} ${(item as any).uom || ''}` : '—';

              const isSupplement = Boolean((item as any)?.is_supplementary || (x.items && x.items.some((it) => it.is_supplementary)));
              const supplementBatch = (item as any)?.supplement_batch || x.items?.find((it) => it.is_supplementary)?.supplement_batch;

              return (
                <TableRow key={x.id}>
                  <TableCell className="whitespace-nowrap font-mono font-bold text-cyan-400">{x.po_number}</TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-slate-400">{x.purchase_request?.request_number || 'شراء مباشر'}</TableCell>
                  <TableCell className="max-w-[160px] font-bold text-slate-200">{x.requested_by?.name || x.purchase_request?.requester?.name || '—'}</TableCell>
                  <TableCell className="max-w-[160px] text-slate-300">{x.department?.name || x.purchase_request?.department?.name || '—'}</TableCell>
                  <TableCell className="max-w-[160px] font-bold text-emerald-300">{x.department_approver?.name || x.purchase_request?.assigned_reviewer?.name || '—'}</TableCell>
                  <TableCell className="max-w-[180px] font-bold text-slate-100">{x.supplier?.company_name || '—'}</TableCell>
                  <TableCell className="max-w-[220px] font-semibold text-slate-100 text-xs">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span>{itemName}</span>
                      {isSupplement && (
                        <SupplementItemBadge isSupplementary={true} batchNumber={supplementBatch} />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-cyan-300 text-xs whitespace-nowrap">{parcelNumber}</TableCell>
                  <TableCell className="font-mono font-bold text-amber-300 text-xs whitespace-nowrap">{quantity}</TableCell>
                  <TableCell className="whitespace-nowrap"><CurrencyDisplay amount={x.grand_total} amountClassName="font-mono font-bold text-emerald-400" /></TableCell>
                  <TableCell className="whitespace-nowrap"><Badge status={x.status} /></TableCell>
                  <TableCell className="text-center"><Button type="button" variant="secondary" size="sm" className="whitespace-nowrap px-2 py-0.5 text-[10px]" onClick={() => void openPurchaseOrder(x)} disabled={openingPoId === x.id}>{openingPoId === x.id ? 'جاري الفتح...' : '👁️ فتح أمر الشراء'}</Button></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 md:hidden">
        {filteredPos.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/50 p-8 text-center text-xs text-slate-400">{pos.length === 0 ? 'لا توجد أوامر شراء حالياً للحسابات' : 'لم نجد أوامر شراء مطابقة للفلاتر الحالية.'}</div>
        ) : filteredPos.map((x) => {
          const item = (x.items && x.items.length > 0) ? x.items[0] : (x.purchase_request?.items && x.purchase_request.items.length > 0 ? x.purchase_request.items[0] : undefined);
          const itemName = item ? ((item as any).item_name || (item as any).item_description || (item as any).item?.name || 'غير محدد') : 'غير محدد';
          const parcelNumber = item ? ((item as any).item_reference || '—') : '—';
          const quantity = item ? `${(item as any).quantity || '—'} ${(item as any).uom || ''}` : '—';

          const isSupplement = Boolean((item as any)?.is_supplementary || (x.items && x.items.some((it) => it.is_supplementary)));
          const supplementBatch = (item as any)?.supplement_batch || x.items?.find((it) => it.is_supplementary)?.supplement_batch;

          return (
            <article key={`mobile-${x.id}`} className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
              <div className="flex min-w-0 items-start justify-between gap-3"><span className="min-w-0 break-normal font-mono text-sm font-black text-cyan-300">{x.po_number}</span><div className="shrink-0"><Badge status={x.status} /></div></div>
              <dl className="mt-4 grid min-w-0 grid-cols-1 gap-3 text-xs min-[420px]:grid-cols-2">
                <div className="min-w-0"><dt className="text-slate-500">رقم الطلب</dt><dd className="mt-1 break-normal font-mono text-slate-300">{x.purchase_request?.request_number || 'شراء مباشر'}</dd></div>
                <div className="min-w-0"><dt className="text-slate-500">المورد</dt><dd className="mt-1 break-normal font-bold leading-6 text-slate-100">{x.supplier?.company_name || 'غير محدد'}</dd></div>
                <div className="min-w-0"><dt className="text-slate-500">صاحب الطلب</dt><dd className="mt-1 break-normal leading-6 text-slate-300">{x.requested_by?.name || x.purchase_request?.requester?.name || 'غير محدد'}</dd></div>
                <div className="min-w-0"><dt className="text-slate-500">القسم</dt><dd className="mt-1 break-normal leading-6 text-slate-300">{x.department?.name || x.purchase_request?.department?.name || 'غير محدد'}</dd></div>
                <div className="min-w-0 min-[420px]:col-span-2">
                  <dt className="text-slate-500">الصنف وقطعة الأرض</dt>
                  <dd className="mt-1 break-normal font-bold leading-6 text-slate-100 flex items-center gap-1.5 flex-wrap">
                    <span>{itemName}</span>
                    {isSupplement && (
                      <SupplementItemBadge isSupplementary={true} batchNumber={supplementBatch} />
                    )}
                    <span className="font-mono text-cyan-300">({parcelNumber})</span>
                  </dd>
                </div>
                <div className="min-w-0"><dt className="text-slate-500">الكمية / العدد</dt><dd className="mt-1 font-mono font-bold text-amber-300">{quantity}</dd></div>
                <div className="min-w-0"><dt className="text-slate-500">رئيس القسم</dt><dd className="mt-1 break-normal leading-6 text-emerald-300">{x.department_approver?.name || x.purchase_request?.assigned_reviewer?.name || 'غير محدد'}</dd></div>
                <div className="min-w-0 min-[420px]:col-span-2"><dt className="text-slate-500">الإجمالي الكلي</dt><dd className="mt-1 whitespace-nowrap"><CurrencyDisplay amount={x.grand_total} amountClassName="font-mono font-bold text-emerald-400" /></dd></div>
              </dl>
              <Button type="button" variant="secondary" size="sm" className="mt-4 w-full whitespace-nowrap" onClick={() => void openPurchaseOrder(x)} disabled={openingPoId === x.id}>{openingPoId === x.id ? 'جاري الفتح...' : '👁️ فتح أمر الشراء'}</Button>
            </article>
          );
        })}
      </div>

      {selectedPo && (
        <PurchaseOrderPrintModal po={selectedPo} isOpen={true} onClose={() => setSelectedPo(null)} />
      )}
    </div>
  );
};

export default AccountingPurchaseOrdersPage;
