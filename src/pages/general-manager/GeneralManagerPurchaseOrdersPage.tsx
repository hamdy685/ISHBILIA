import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getGeneralManagerPurchaseOrdersApi } from '../../api/generalManager';
import Badge from '../../components/procurement/PurchaseOrderStatusBadge';
import { PurchaseOrder } from '../../types/purchaseOrder';
import { Button } from '../../components/ui/Button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table';
import { CurrencyDisplay } from '../../components/ui/CurrencyDisplay';
import TableFilterBar from '../../components/ui/TableFilterBar';
import { getDefaultDateFrom, getTodayInputDate, isDefaultTodayRange } from '../../utils/dateFilters';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';
import { getUnitLabel } from '../../utils/units';

export const GeneralManagerPurchaseOrdersPage: React.FC = () => {
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [supplierFilter, setSupplierFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const today = getTodayInputDate();
  const defaultDateFrom = getDefaultDateFrom();
  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState(today);

  const fetchPos = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await getGeneralManagerPurchaseOrdersApi();
      setPos(data);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void fetchPos(false);
  }, []);

  useRealtimeRefresh(() => { void fetchPos(true); });

  if (loading) {
    return <div className="text-cyan-400 animate-pulse text-xs" dir="rtl">جاري تحميل البيانات...</div>;
  }

  const departmentOptions = Array.from(new Map(pos.map((po) => [po.purchase_request?.department?.id, po.purchase_request?.department?.name]).filter(([id, name]) => id && name) as Array<[number, string]>));
  const supplierOptions = Array.from(new Map(pos.map((po) => [po.supplier?.id || po.supplier_id, po.supplier?.company_name]).filter(([id, name]) => id && name) as Array<[number, string]>));
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredPos = pos.filter((po) => {
    const supplier = po.supplier?.company_name || '';
    const department = po.purchase_request?.department?.name || '';
    const date = po.created_at ? po.created_at.slice(0, 10) : '';
    const searchText = [po.po_number, supplier, department].filter(Boolean).join(' ').toLocaleLowerCase('ar-EG');
    const departmentId = po.purchase_request?.department?.id;
    const supplierId = po.supplier?.id || po.supplier_id;
    const ignoreDefaultDateRangeForSearch = Boolean(normalizedSearch) && isDefaultTodayRange(dateFrom, dateTo);
    const matchesDate = ignoreDefaultDateRangeForSearch || ((!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo));
    return (!normalizedSearch || searchText.includes(normalizedSearch))
      && (departmentFilter === 'ALL' || String(departmentId || '') === departmentFilter)
      && (supplierFilter === 'ALL' || String(supplierId || '') === supplierFilter)
      && (statusFilter === 'ALL' || po.status === statusFilter)
      && matchesDate;
  });
  const clearFilters = () => { setSearchTerm(''); setDepartmentFilter('ALL'); setSupplierFilter('ALL'); setStatusFilter('ALL'); setDateFrom(defaultDateFrom); setDateTo(today); };
  const hasActiveFilters = Boolean(searchTerm || departmentFilter !== 'ALL' || supplierFilter !== 'ALL' || statusFilter !== 'ALL' || dateFrom !== defaultDateFrom || dateTo !== today);

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      {/* Header */}
      <div className="border-b border-slate-800 pb-4">
        <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <span>📋</span> أوامر الشراء الصادرة — العرض التنفيذي
        </h1>
        <div className="mt-2 inline-flex items-center gap-1.5 bg-blue-900/40 border border-blue-700/50 rounded-lg px-3 py-1.5">
          <span className="text-blue-400 text-xs">👁️</span>
          <span className="text-blue-300 text-xs font-medium">وصول للعرض والاطلاع فقط — لا يوجد إجراء مطلوب</span>
        </div>
      </div>

      <TableFilterBar
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="بحث برقم أمر الشراء أو المورد أو القسم..."
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


      {/* Table */}
      <div className="hidden min-w-0 md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>رقم أمر الشراء#</TableHead>
              <TableHead>المورد</TableHead>
              <TableHead>القسم</TableHead>
              <TableHead>الصنف</TableHead>
              <TableHead>رقم قطعة الأرض</TableHead>
              <TableHead>الكمية / العدد</TableHead>
              <TableHead>الإجمالي النهائي</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead className="text-center">التفاصيل</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-slate-400 text-xs">
                  {pos.length === 0 ? 'لا توجد أوامر شراء صادرة حالياً' : 'لم نجد أوامر شراء مطابقة للفلاتر الحالية.'}
                </TableCell>
              </TableRow>
            ) : (
              filteredPos.map((x) => {
                const item = (x.items && x.items.length > 0) ? x.items[0] : (x.purchase_request?.items && x.purchase_request.items.length > 0 ? x.purchase_request.items[0] : undefined);
                const itemName = item ? ((item as any).item_name || (item as any).item_description || (item as any).item?.name || '—') : '—';
                const parcelNumber = item ? ((item as any).item_reference || '—') : '—';
                const quantity = item ? `${(item as any).quantity || '—'} ${getUnitLabel((item as any).uom)}` : '—';

                return (
                  <TableRow key={x.id}>
                    <TableCell className="font-mono font-bold text-cyan-400">{x.po_number}</TableCell>
                    <TableCell className="font-bold text-slate-100">{x.supplier?.company_name || '—'}</TableCell>
                    <TableCell className="text-slate-300">{x.purchase_request?.department?.name || '—'}</TableCell>
                    <TableCell className="max-w-[180px] font-semibold text-slate-100 text-xs">{itemName}</TableCell>
                    <TableCell className="font-mono text-cyan-300 text-xs whitespace-nowrap">{parcelNumber}</TableCell>
                    <TableCell className="font-mono font-bold text-amber-300 text-xs whitespace-nowrap">{quantity}</TableCell>
                    <TableCell>
                      <CurrencyDisplay amount={x.grand_total} amountClassName="font-mono font-bold text-emerald-400" />
                    </TableCell>
                    <TableCell>
                      <Badge status={x.status} />
                    </TableCell>
                    <TableCell className="text-center">
                      <Link to={`/general-manager/purchase-orders/${x.id}`}>
                        <Button variant="secondary" size="sm" className="px-2 py-0.5 text-[10px]">
                          👁️ عرض التفاصيل
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 md:hidden">
        {filteredPos.length === 0 ? (
          <div className="sm:col-span-2 rounded-xl border border-dashed border-slate-800 bg-slate-900/50 p-8 text-center text-xs text-slate-400">
            {pos.length === 0 ? 'لا توجد أوامر شراء صادرة حالياً' : 'لم نجد أوامر شراء مطابقة للفلاتر الحالية.'}
          </div>
        ) : (
          filteredPos.map((x) => {
            const item = (x.items && x.items.length > 0) ? x.items[0] : (x.purchase_request?.items && x.purchase_request.items.length > 0 ? x.purchase_request.items[0] : undefined);
            const itemName = item ? ((item as any).item_name || (item as any).item_description || (item as any).item?.name || 'غير محدد') : 'غير محدد';
            const parcelNumber = item ? ((item as any).item_reference || '—') : '—';
            const quantity = item ? `${(item as any).quantity || '—'} ${getUnitLabel((item as any).uom)}` : '—';

            return (
              <article key={`mobile-gm-po-${x.id}`} className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <span className="min-w-0 break-normal font-mono text-sm font-black text-cyan-300">{x.po_number}</span>
                  <div className="shrink-0"><Badge status={x.status} /></div>
                </div>
                <dl className="mt-4 grid min-w-0 grid-cols-1 gap-3 text-xs min-[420px]:grid-cols-2">
                  <div className="min-w-0"><dt className="text-slate-500">المورد</dt><dd className="mt-1 break-normal font-bold leading-6 text-slate-100">{x.supplier?.company_name || 'غير محدد'}</dd></div>
                  <div className="min-w-0"><dt className="text-slate-500">القسم</dt><dd className="mt-1 break-normal text-slate-300">{x.purchase_request?.department?.name || 'غير محدد'}</dd></div>
                  <div className="min-w-0 min-[420px]:col-span-2"><dt className="text-slate-500">الصنف وقطعة الأرض</dt><dd className="mt-1 break-normal font-bold leading-6 text-slate-100">{itemName} <span className="font-mono text-cyan-300">({parcelNumber})</span></dd></div>
                  <div className="min-w-0"><dt className="text-slate-500">الكمية / العدد</dt><dd className="mt-1 font-mono font-bold text-amber-300">{quantity}</dd></div>
                  <div className="min-w-0"><dt className="text-slate-500">الإجمالي النهائي</dt><dd className="mt-1 whitespace-nowrap"><CurrencyDisplay amount={x.grand_total} amountClassName="font-mono font-bold text-emerald-400" /></dd></div>
                </dl>
                <Link to={`/general-manager/purchase-orders/${x.id}`} className="mt-4 block">
                  <Button variant="secondary" size="sm" className="w-full whitespace-nowrap min-h-10">
                    👁️ عرض التفاصيل
                  </Button>
                </Link>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
};

export default GeneralManagerPurchaseOrdersPage;
