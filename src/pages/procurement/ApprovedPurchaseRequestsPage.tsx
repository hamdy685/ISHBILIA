import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getApprovedByProcurementPrsApi } from '../../api/procurement';
import { PurchaseRequest, PR_STATUS_LABELS } from '../../types/purchaseRequest';
import { useAuth } from '../../context/AuthContext';
import { TableSkeleton } from '../../components/ui/StateFeedback';
import ErrorMessage from '../../components/ErrorMessage';
import PrDetailsModal from '../../components/procurement/PrDetailsModal';
import DirectPoModal from '../../components/procurement/DirectPoModal';
import { parseApiError } from '../../utils/apiError';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table';
import { CurrencyDisplay } from '../../components/ui/CurrencyDisplay';
import { Input, Select } from '../../components/ui/FormField';
import TableFilterBar from '../../components/ui/TableFilterBar';
import { getDefaultDateFrom, getTodayInputDate, isDefaultTodayRange } from '../../utils/dateFilters';
import { getUnitLabel } from '../../utils/units';
import { getSummaryParcels, getSummaryRegions, getSummaryQuantities } from '../../utils/formatRequestSummary';

export const ApprovedPurchaseRequestsPage: React.FC = () => {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('');
  const [routeFilter, setRouteFilter] = useState<'ALL' | 'DIRECT' | 'QUOTES'>('ALL');
  const today = getTodayInputDate();
  const defaultDateFrom = getDefaultDateFrom();
  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState(today);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedPr, setSelectedPr] = useState<PurchaseRequest | null>(null);
  const [isDirectPoModalOpen, setIsDirectPoModalOpen] = useState<boolean>(false);

  const { hasPermission } = useAuth();

  const loadRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getApprovedByProcurementPrsApi();
      setRequests(data || []);
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const departments = Array.from(
    new Set(requests.map(r => r.department?.name).filter(Boolean))
  );

  const filteredRequests = requests.filter(r => {
    if (r.issued_purchase_orders_count && r.issued_purchase_orders_count > 0) {
      return false;
    }
    const matchesSearch =
      r.request_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.requester?.name && r.requester.name.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesDepartment = !departmentFilter || r.department?.name === departmentFilter;
    const matchesRoute = routeFilter === 'ALL' || (routeFilter === 'DIRECT' ? r.procurement_route === 'DIRECT' : r.procurement_route !== 'DIRECT');
    const approvedDate = r.updated_at ? r.updated_at.slice(0, 10) : '';
    const ignoreDefaultDateForSearch = Boolean(searchTerm.trim()) && isDefaultTodayRange(dateFrom, dateTo);
    const matchesFrom = ignoreDefaultDateForSearch || !dateFrom || approvedDate >= dateFrom;
    const matchesTo = ignoreDefaultDateForSearch || !dateTo || approvedDate <= dateTo;

    return matchesSearch && matchesDepartment && matchesRoute && matchesFrom && matchesTo;
  });

  return (
    <div className="procurement-reference-page space-y-6 animate-fade-in" dir="rtl">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center space-x-2 space-x-reverse">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <h1 className="text-xl font-black text-slate-100">الطلبات المعلقة والمعتمدة</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            طلبات الشراء المعتمدة من المراجع والمستعدة لإصدار أمر شراء رسمي للمورد
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={() => setIsDirectPoModalOpen(true)}
        >
            + طلب شراء مباشر
        </Button>
      </div>

      {error && <ErrorMessage error={error} />}

      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-800 bg-slate-950/50 p-2">
        {(['ALL', 'DIRECT', 'QUOTES'] as const).map(route => <button key={route} type="button" onClick={() => setRouteFilter(route)} className={`rounded-lg px-4 py-2 text-xs font-bold ${routeFilter === route ? 'bg-cyan-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800'}`}>{route === 'ALL' ? 'كل الطلبات' : route === 'DIRECT' ? 'طلبات شراء مباشر' : 'مسار عروض الأسعار'}</button>)}
      </div>

      <TableFilterBar
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="بحث برقم الطلب أو مقدم الطلب أو القسم..."
        selects={[{
          label: 'القسم',
          value: departmentFilter || 'ALL',
          onChange: (value) => setDepartmentFilter(value === 'ALL' ? '' : value),
          options: [{ value: 'ALL', label: 'كل الأقسام' }, ...departments.map((dept) => ({ value: dept as string, label: dept as string }))],
        }]}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onClear={() => { setSearchTerm(''); setDepartmentFilter(''); setRouteFilter('ALL'); setDateFrom(defaultDateFrom); setDateTo(today); }}
        hasActiveFilters={Boolean(searchTerm || departmentFilter || routeFilter !== 'ALL' || dateFrom !== defaultDateFrom || dateTo !== today)}
        resultCount={filteredRequests.length}
        totalCount={requests.length}
        resultLabel="طلب شراء"
      />

      {/* Content Table */}
      {loading ? (
        <TableSkeleton rows={6} columns={5} />
      ) : filteredRequests.length === 0 ? (
        <div className="bg-slate-900/40 p-12 text-center rounded-xl border border-slate-800 text-slate-400 text-xs">
          لا توجد طلبات شراء معتمدة تطابق الفلاتر الحالية. جرّب تغيير المعايير أو مسح الفلاتر.
        </div>
      ) : (
        <>
        <div className="hidden min-w-0 md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">رقم الطلب</TableHead>
                <TableHead className="whitespace-nowrap">المسار</TableHead>
                <TableHead className="whitespace-nowrap">القسم</TableHead>
                <TableHead className="whitespace-nowrap">الصنف</TableHead>
                <TableHead className="whitespace-nowrap">رقم قطعة الأرض</TableHead>
                <TableHead className="whitespace-nowrap">المنطقة</TableHead>
                <TableHead className="whitespace-nowrap">الكمية / العدد</TableHead>
                <TableHead className="whitespace-nowrap">تاريخ الاحتياج</TableHead>
                <TableHead className="whitespace-nowrap">المورد</TableHead>
                <TableHead className="whitespace-nowrap">صاحب الطلب</TableHead>
                <TableHead className="whitespace-nowrap">الحالة الحالية</TableHead>
                <TableHead className="whitespace-nowrap">تاريخ الاعتماد</TableHead>
                <TableHead className="whitespace-nowrap text-center">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRequests.map(r => {
                const itemNames = r.items?.map((item) => item.item_description || item.item?.name).filter(Boolean) || [];
                const itemsDisplay = itemNames.length === 0
                  ? '—'
                  : itemNames.length === 1
                    ? itemNames[0]
                    : `${itemNames[0]} (+${itemNames.length - 1} أصناف)`;
                const parcelsDisplay = getSummaryParcels(r);
                const regionsDisplay = getSummaryRegions(r);
                const quantitiesInfo = getSummaryQuantities(r.items);

                return (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap font-mono font-bold text-cyan-400">
                      <Link to={`/procurement/purchase-requests/${r.id}`} className="hover:underline">{r.request_number}</Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${r.procurement_route === 'DIRECT' ? 'bg-amber-400/15 text-amber-300' : 'bg-cyan-400/15 text-cyan-300'}`}>
                        {r.procurement_route === 'DIRECT' ? 'شراء مباشر' : 'عروض أسعار'}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[160px] text-slate-300">{r.department?.name || '—'}</TableCell>
                    <TableCell className="max-w-[180px] font-semibold text-slate-100 text-xs truncate">
                      <span title={itemNames.join('، ')}>{itemsDisplay}</span>
                    </TableCell>
                    <TableCell className="font-mono text-cyan-300 text-xs whitespace-nowrap">{parcelsDisplay}</TableCell>
                    <TableCell className="text-slate-300 text-xs whitespace-nowrap">{regionsDisplay}</TableCell>
                    <TableCell className="font-mono font-bold text-amber-300 text-xs whitespace-nowrap">
                      <span title={quantitiesInfo.tooltip}>{quantitiesInfo.display}</span>
                    </TableCell>
                    <TableCell className="font-mono font-bold text-amber-300 text-xs whitespace-nowrap">{r.date_needed || '—'}</TableCell>
                    <TableCell className="max-w-[180px] font-bold text-emerald-300">{r.direct_supplier?.company_name || r.selected_quote?.supplier?.company_name || '—'}</TableCell>
                    <TableCell className="max-w-[160px] text-slate-300">{r.requester?.name || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-cyan-200">{PR_STATUS_LABELS[r.status] || r.status}</TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-slate-400">{r.updated_at ? new Date(r.updated_at).toLocaleDateString('ar-SA') : '—'}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Button variant="secondary" size="sm" className="whitespace-nowrap px-2 py-0.5 text-[10px]" onClick={() => setSelectedPr(r)}>معاينة</Button>
                        {hasPermission('purchase_order.create') && (
                          <Link to={`/procurement/purchase-orders/create?pr=${r.id}`}>
                            <Button variant="primary" size="sm" className="whitespace-nowrap px-2 py-0.5 text-[10px]">+ إنشاء أمر شراء</Button>
                          </Link>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="space-y-3 md:hidden">
          {filteredRequests.map(r => {
            const itemNames = r.items?.map((item) => item.item_description || item.item?.name).filter(Boolean) || [];
            const parcelsDisplay = getSummaryParcels(r);
            const regionsDisplay = getSummaryRegions(r);
            const quantitiesInfo = getSummaryQuantities(r.items);

            return (
              <article key={`mobile-approved-${r.id}`} className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <Link to={`/procurement/purchase-requests/${r.id}`} className="min-w-0 break-normal font-mono text-sm font-black text-cyan-300 hover:underline">{r.request_number}</Link>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${r.procurement_route === 'DIRECT' ? 'bg-amber-400/15 text-amber-300' : 'bg-cyan-400/15 text-cyan-300'}`}>
                    {r.procurement_route === 'DIRECT' ? 'شراء مباشر' : 'عروض أسعار'}
                  </span>
                </div>
                <dl className="mt-4 grid min-w-0 grid-cols-1 gap-3 text-xs min-[420px]:grid-cols-2">
                  <div className="min-w-0"><dt className="text-slate-500">القسم</dt><dd className="mt-1 break-normal text-slate-300">{r.department?.name || 'غير محدد'}</dd></div>
                  <div className="min-w-0"><dt className="text-slate-500">المورد</dt><dd className="mt-1 break-normal font-bold leading-6 text-emerald-300">{r.direct_supplier?.company_name || r.selected_quote?.supplier?.company_name || 'غير محدد'}</dd></div>
                  <div className="min-w-0 min-[420px]:col-span-2"><dt className="text-slate-500">الصنف وقطعة الأرض</dt><dd className="mt-1 break-normal font-bold leading-6 text-slate-100">{itemNames.join('، ') || 'غير محدد'} <span className="font-mono text-cyan-300">({parcelsDisplay})</span></dd></div>
                  <div className="min-w-0"><dt className="text-slate-500">المنطقة</dt><dd className="mt-1 break-normal text-slate-200">{regionsDisplay}</dd></div>
                  <div className="min-w-0"><dt className="text-slate-500">الكمية / العدد</dt><dd className="mt-1 font-mono font-bold text-amber-300">{quantitiesInfo.display}</dd></div>
                  <div className="min-w-0"><dt className="text-slate-500">تاريخ الاحتياج</dt><dd className="mt-1 font-mono font-bold text-amber-300">{r.date_needed || 'غير محدد'}</dd></div>
                  <div className="min-w-0"><dt className="text-slate-500">صاحب الطلب</dt><dd className="mt-1 break-normal text-slate-300">{r.requester?.name || 'غير محدد'}</dd></div>
                  <div className="min-w-0"><dt className="text-slate-500">الحالة الحالية</dt><dd className="mt-1 break-normal text-cyan-200">{PR_STATUS_LABELS[r.status] || r.status}</dd></div>
                  <div className="min-w-0"><dt className="text-slate-500">تاريخ الاعتماد</dt><dd className="mt-1 whitespace-nowrap font-mono text-slate-400">{r.updated_at ? new Date(r.updated_at).toLocaleDateString('ar-SA') : '—'}</dd></div>
                </dl>
                <div className="mt-4 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
                  <Button variant="secondary" size="sm" className="w-full whitespace-nowrap" onClick={() => setSelectedPr(r)}>معاينة الطلب</Button>
                  {hasPermission('purchase_order.create') && (
                    <Link to={`/procurement/purchase-orders/create?pr=${r.id}`} className="block">
                      <Button variant="primary" size="sm" className="w-full whitespace-nowrap">إنشاء أمر شراء</Button>
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        </>
      )}

      {/* PR Preview Modal */}
      <PrDetailsModal
        pr={selectedPr}
        isOpen={!!selectedPr}
        onClose={() => setSelectedPr(null)}
        onPrUpdated={(updatedPr) => {
          setSelectedPr(updatedPr);
          void loadRequests();
        }}
        onCreatePo={(prId) => navigate(`/procurement/purchase-orders/create?pr=${prId}`)}
      />

      {/* Direct PO Modal */}
      <DirectPoModal
        isOpen={isDirectPoModalOpen}
        onClose={() => setIsDirectPoModalOpen(false)}
        onSuccess={() => { setIsDirectPoModalOpen(false); void loadRequests(); }}
      />
    </div>
  );
};

export default ApprovedPurchaseRequestsPage;
