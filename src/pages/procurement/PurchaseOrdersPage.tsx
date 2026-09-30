import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getPurchaseOrdersApi, PurchaseOrderPaginationMeta } from '../../api/purchaseOrders';
import { PurchaseOrder, المورد } from '../../types/purchaseOrder';
import { getSuppliersApi } from '../../api/suppliers';
import PurchaseOrderStatusBadge from '../../components/procurement/PurchaseOrderStatusBadge';
import PurchaseOrderPrintModal from '../../components/procurement/PurchaseOrderPrintModal';
import ThreeWayMatchPrintModal from '../../components/accounting/ThreeWayMatchPrintModal';
import DirectPoModal from '../../components/procurement/DirectPoModal';
import { TableSkeleton } from '../../components/ui/StateFeedback';
import ErrorMessage from '../../components/ErrorMessage';
import { parseApiError } from '../../utils/apiError';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table';
import { CurrencyDisplay } from '../../components/ui/CurrencyDisplay';
import { Input } from '../../components/ui/FormField';
import TableFilterBar from '../../components/ui/TableFilterBar';
import { getDefaultDateFrom, getTodayInputDate, isDefaultTodayRange } from '../../utils/dateFilters';
import PaginationControls from '../../components/ui/PaginationControls';

export const PurchaseOrdersPage: React.FC = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<المورد[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [supplierFilter, setSupplierFilter] = useState('ALL');
  const today = getTodayInputDate();
  const defaultDateFrom = getDefaultDateFrom();
  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState(today);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageMeta, setPageMeta] = useState<PurchaseOrderPaginationMeta>({
    current_page: 1,
    from: null,
    last_page: 1,
    per_page: 15,
    to: null,
    total: 0,
  });

  const [selectedPrintPo, setSelectedPrintPo] = useState<PurchaseOrder | null>(null);
  const [selectedCyclePo, setSelectedCyclePo] = useState<PurchaseOrder | null>(null);
  const [isDirectPoModalOpen, setIsDirectPoModalOpen] = useState<boolean>(false);
  const ignoreDefaultDateForSearch = Boolean(searchTerm.trim()) && isDefaultTodayRange(dateFrom, dateTo);

  const loadOrders = async (requestedPage = page) => {
    setLoading(true);
    setError(null);
    try {
      const result = await getPurchaseOrdersApi({
        page: requestedPage,
        per_page: 15,
        ...(searchTerm.trim() ? { search: searchTerm.trim() } : {}),
        ...(selectedStatus !== 'ALL' ? { status: selectedStatus } : {}),
        ...(supplierFilter !== 'ALL' ? { supplier_id: Number(supplierFilter) } : {}),
        ...(dateFrom && !ignoreDefaultDateForSearch ? { date_from: dateFrom } : {}),
        ...(dateTo && !ignoreDefaultDateForSearch ? { date_to: dateTo } : {}),
      });
      setOrders(result.data || []);
      setPageMeta(result.meta);
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed.message);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void getSuppliersApi().then(setSuppliers).catch(() => setSuppliers([]));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadOrders(page); }, 300);
    return () => window.clearTimeout(timer);
  }, [page, searchTerm, selectedStatus, supplierFilter, dateFrom, dateTo]);

  const statusTabs = [
    { key: 'ALL', label: 'الكل' },
    { key: 'ISSUED', label: 'تم الإصدار' },
    { key: 'PO_DRAFT', label: 'مسودة تاريخية' },
    { key: 'PENDING_ACCOUNTING_REVIEW', label: 'بانتظار مراجعة الحسابات' },
    { key: 'RETURNED_TO_PROCUREMENT', label: 'معادة للمشتريات' },
    { key: 'APPROVED_BY_ACCOUNTING', label: 'اعتماد الحسابات' },
    { key: 'FINAL_APPROVED', label: 'اعتماد نهائي' },
    { key: 'REJECTED', label: 'مرفوضة' },
  ];

  const statusLabel = (status: string): string => statusTabs.find((tab) => tab.key === status)?.label || 'حالة غير معروفة';
  const supplierOptions = suppliers.filter((supplier) => supplier.is_active).map((supplier) => [supplier.id, supplier.company_name] as const);
  const hasActiveFilters = Boolean(searchTerm || selectedStatus !== 'ALL' || supplierFilter !== 'ALL' || dateFrom !== defaultDateFrom || dateTo !== today);
  const clearFilters = () => {
    setSearchTerm('');
    setSelectedStatus('ALL');
    setSupplierFilter('ALL');
    setDateFrom(defaultDateFrom);
    setDateTo(today);
    setPage(1);
  };
  const visibleOrders = orders;

  return (
    <div className="procurement-reference-page space-y-6 animate-fade-in" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2 space-x-reverse">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
            <h1 className="text-xl font-black text-slate-100">أرشيف أوامر الشراء والطباعة</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            استعراض أوامر الشراء الصادرة، الحالات الانتقالية التاريخية، ومعاينة المستندات الرسمية للطباعة
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={() => setIsDirectPoModalOpen(true)}
        >
          + أمر شراء مباشر
        </Button>
      </div>

      {error && <ErrorMessage error={error} />}

      {/* تصفية and الحالة Tab Bar */}
      <TableFilterBar
        searchValue={searchTerm}
        onSearchChange={(value) => { setSearchTerm(value); setPage(1); }}
        searchPlaceholder="بحث برقم أمر الشراء أو طلب الشراء أو اسم المورد..."
        selects={[
          {
            label: 'المورد',
            value: supplierFilter,
            onChange: (value) => { setSupplierFilter(value); setPage(1); },
            options: [
              { value: 'ALL', label: 'كل الموردين' },
              ...supplierOptions.map(([id, name]) => ({ value: String(id), label: name })),
            ],
          },
        ]}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={(value) => { setDateFrom(value); setPage(1); }}
        onDateToChange={(value) => { setDateTo(value); setPage(1); }}
        onClear={clearFilters}
        hasActiveFilters={hasActiveFilters}
        resultCount={orders.length}
        totalCount={pageMeta.total}
        resultLabel="أمر شراء"
      />
      <Card className="space-y-4">
        {/* Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-800">
          {statusTabs.map(tab => {
            const active = selectedStatus === tab.key;
            return (
              <Button
                key={tab.key}
                variant={active ? 'primary' : 'outline'}
                size="sm"
                onClick={() => { setSelectedStatus(tab.key); setPage(1); }}
                className="text-[11px]"
              >
                {tab.label}{active ? ` (${pageMeta.total.toLocaleString('ar-EG')})` : ''}
              </Button>
            );
          })}
        </div>
      </Card>

      {/* Main Table */}
      {loading ? (
        <TableSkeleton rows={7} columns={7} />
      ) : orders.length === 0 ? (
        <div className="bg-slate-900/40 p-12 text-center rounded-xl border border-slate-800 text-slate-400 text-xs">
          {hasActiveFilters ? 'لم نجد أوامر شراء مطابقة للفلاتر الحالية.' : 'لا توجد أوامر شراء متاحة حتى الآن.'}
          {hasActiveFilters && <div className="mt-3"><Button variant="secondary" size="sm" onClick={clearFilters}>مسح الفلاتر</Button></div>}
        </div>
      ) : (
        <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>رقم أمر الشراء</TableHead>
              <TableHead>طلب الشراء المرتبط</TableHead>
              <TableHead>المورد</TableHead>
              <TableHead>الحالة الحالية</TableHead>
              <TableHead>المبلغ الإجمالي</TableHead>
              <TableHead>تاريخ التحديث</TableHead>
              <TableHead className="text-center">الإجراءات والطباعة</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleOrders.map(po => {
              const canEdit = ['PO_DRAFT', 'RETURNED_TO_PROCUREMENT'].includes(po.status);
              return (
                <TableRow key={po.id}>
                  <TableCell className="font-mono font-bold text-cyan-400">
                    <Link to={`/procurement/purchase-orders/${po.id}`} className="hover:underline">
                      {po.po_number}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-slate-400">
                    {po.purchase_request?.request_number || 'أمر مباشر'}
                  </TableCell>
                  <TableCell className="font-bold text-slate-100">
                    {po.supplier?.company_name || 'غير محدد'}
                  </TableCell>
                  <TableCell>
                    <PurchaseOrderStatusBadge status={po.status} />
                  </TableCell>
                  <TableCell>
                    <CurrencyDisplay amount={po.grand_total} amountClassName="font-mono font-bold text-emerald-400" />
                  </TableCell>
                  <TableCell className="font-mono text-slate-400">
                    {po.updated_at ? new Date(po.updated_at).toLocaleDateString('ar-EG') : '—'}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Link to={`/procurement/purchase-orders/${po.id}`}>
                        <Button variant="secondary" size="sm" className="px-2 py-0.5 text-[10px]">
                          عرض التفاصيل
                        </Button>
                      </Link>
                      {canEdit && (
                        <Link to={`/procurement/purchase-orders/${po.id}/edit`}>
                          <Button variant="warning" size="sm" className="px-2 py-0.5 text-[10px] bg-amber-950/60 text-amber-300 border-amber-800/60 hover:bg-amber-900/60">
                            تعديل
                          </Button>
                        </Link>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedPrintPo(po)}
                        className="px-2 py-0.5 text-[10px] border border-slate-700 text-cyan-400 hover:bg-slate-800"
                      >
                        🖨️ طباعة PO
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedCyclePo(po)}
                        className="px-2 py-0.5 text-[10px] border border-slate-700 text-cyan-300 hover:bg-slate-800"
                      >
                        🖨️ طباعة الدورة (3 في 1)
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </div>
      )}

      {!loading && orders.length > 0 && (
        <div className="space-y-3 md:hidden">
          {orders.map((po) => {
            const canEdit = ['PO_DRAFT', 'RETURNED_TO_PROCUREMENT'].includes(po.status);
            return (
              <article key={`mobile-${po.id}`} className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link to={`/procurement/purchase-orders/${po.id}`} className="font-mono text-sm font-black text-cyan-300 hover:underline">{po.po_number}</Link>
                    <p className="mt-1 text-xs text-slate-400">{po.purchase_request?.request_number || 'أمر شراء مباشر'}</p>
                  </div>
                  <PurchaseOrderStatusBadge status={po.status} />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div><dt className="text-slate-500">المورد</dt><dd className="mt-1 font-bold text-slate-200">{po.supplier?.company_name || 'غير محدد'}</dd></div>
                  <div><dt className="text-slate-500">الحالة</dt><dd className="mt-1 font-bold text-slate-200">{statusLabel(po.status)}</dd></div>
                  <div><dt className="text-slate-500">الإجمالي</dt><dd className="mt-1"><CurrencyDisplay amount={po.grand_total} amountClassName="font-mono font-bold text-emerald-400" /></dd></div>
                  <div><dt className="text-slate-500">آخر تحديث</dt><dd className="mt-1 font-mono text-slate-300">{po.updated_at ? new Date(po.updated_at).toLocaleDateString('ar-EG') : '—'}</dd></div>
                </dl>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link to={`/procurement/purchase-orders/${po.id}`}><Button variant="secondary" size="sm">عرض التفاصيل</Button></Link>
                  {canEdit && <Link to={`/procurement/purchase-orders/${po.id}/edit`}><Button variant="warning" size="sm">تعديل</Button></Link>}
                  <Button variant="ghost" size="sm" onClick={() => setSelectedPrintPo(po)}>طباعة PO</Button>
                  <Button variant="ghost" size="sm" className="text-cyan-300 border border-slate-700" onClick={() => setSelectedCyclePo(po)}>🖨️ طباعة الدورة (3 في 1)</Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {!loading && orders.length > 0 && (
        <PaginationControls
          currentPage={pageMeta.current_page}
          lastPage={pageMeta.last_page}
          from={pageMeta.from}
          to={pageMeta.to}
          total={pageMeta.total}
          onPageChange={setPage}
          disabled={loading}
        />
      )}

      {/* طباعة Modal */}
      {selectedPrintPo && (
        <PurchaseOrderPrintModal
          po={selectedPrintPo}
          isOpen={!!selectedPrintPo}
          onClose={() => setSelectedPrintPo(null)}
        />
      )}

      {selectedCyclePo && (
        <ThreeWayMatchPrintModal
          po={selectedCyclePo}
          isOpen={!!selectedCyclePo}
          onClose={() => setSelectedCyclePo(null)}
        />
      )}

      {/* Direct PO Modal */}
      <DirectPoModal
        isOpen={isDirectPoModalOpen}
        onClose={() => setIsDirectPoModalOpen(false)}
        onSuccess={(newPoId) => navigate(`/procurement/purchase-orders/${newPoId}`)}
      />
    </div>
  );
};

export default PurchaseOrdersPage;
