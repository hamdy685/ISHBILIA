import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMyArchiveApi, SystemEvent } from '../api/systemEvents';
import { getOwnPurchaseRequestsApi } from '../api/purchaseRequests';
import { PurchaseRequest } from '../types/purchaseRequest';
import { parseApiError } from '../utils/apiError';
import ErrorMessage from '../components/ErrorMessage';
import LoadingSpinner from '../components/LoadingSpinner';
import { Card } from '../components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/Table';
import { Button } from '../components/ui/Button';
import TableColumnFilters from '../components/ui/TableColumnFilters';
import PurchaseRequestStatusBadge from '../components/purchase-requests/PurchaseRequestStatusBadge';
import { getDefaultDateFrom, getTodayInputDate } from '../utils/dateFilters';
import { useAuth } from '../context/AuthContext';
import { getPrimaryRoleSlug } from '../routes/roleRouting';
import { getSummaryParcels, getSummaryRegions, getSummaryQuantities, getItemsSummaryDisplay } from '../utils/formatRequestSummary';

const ACTION_LABELS: Record<string, string> = {
  CREATED: 'إنشاء',
  SUBMITTED: 'إرسال للمراجعة',
  REVIEW_STARTED: 'بدء المراجعة',
  APPROVED_BY_REVIEWER: 'اعتماد المراجع',
  APPROVED_BY_EXECUTIVE: 'اعتماد المدير التنفيذي',
  THREE_QUOTES_REQUIRED: 'بدء عروض الأسعار',
  THREE_QUOTES_SUBMITTED: 'إرسال عروض الأسعار',
  EXECUTIVE_SELECTED_QUOTE: 'اختيار العرض',
  EXECUTIVE_REJECTED_QUOTES: 'رفض العروض',
  PO_CREATED: 'إنشاء أمر الشراء',
  PO_ISSUED: 'إصدار أمر الشراء',
  RECEIPT_CREATED: 'إنشاء إذن الاستلام',
  RECEIPT_APPROVED: 'اعتماد إذن الاستلام',
  INVOICE_CREATED: 'تسجيل فاتورة المورد',
  PAYMENT_CREATED: 'تسجيل دفعة',
};

const ENTITY_LABELS: Record<string, string> = {
  'App\\Models\\PurchaseRequest': 'طلب شراء',
  'App\\Models\\PurchaseOrder': 'أمر شراء',
  'App\\Models\\PurchaseReceipt': 'إذن استلام',
  'App\\Models\\SupplierInvoice': 'فاتورة مورد',
};

export const RoleArchivePage: React.FC = () => {
  const { user } = useAuth();
  const primaryRole = getPrimaryRoleSlug(user);
  const [activeTab, setActiveTab] = useState<'REQUESTS' | 'EVENTS'>('REQUESTS');
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const today = getTodayInputDate();
  const defaultDateFrom = getDefaultDateFrom();
  const [eventFilters, setEventFilters] = useState({
    dateFrom: defaultDateFrom,
    dateTo: today,
    entity: '',
    action: '',
    from: '',
    to: '',
    description: '',
  });

  const [requestSearch, setRequestSearch] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [eventsData, requestsData] = await Promise.allSettled([
        getMyArchiveApi(),
        getOwnPurchaseRequestsApi(),
      ]);

      if (eventsData.status === 'fulfilled') setEvents(eventsData.value || []);
      if (requestsData.status === 'fulfilled') setRequests(requestsData.value || []);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const contains = (value: unknown, filter: string) =>
    !filter || String(value ?? '').toLocaleLowerCase('ar-EG').includes(filter.toLocaleLowerCase('ar-EG'));

  const hasNonDateSearch = Boolean(
    eventFilters.entity || eventFilters.action || eventFilters.from || eventFilters.to || eventFilters.description,
  );
  const ignoreDefaultDateForSearch = hasNonDateSearch && eventFilters.dateFrom === defaultDateFrom && eventFilters.dateTo === today;

  const filteredEvents = events.filter((event) => {
    const eventDate = String(event.occurred_at || '').slice(0, 10);
    return (
      (ignoreDefaultDateForSearch ||
        ((!eventFilters.dateFrom || eventDate >= eventFilters.dateFrom) &&
          (!eventFilters.dateTo || eventDate <= eventFilters.dateTo))) &&
      contains(ENTITY_LABELS[event.entity_type || ''] || 'سجل مشتريات', eventFilters.entity) &&
      contains(ACTION_LABELS[event.action] || event.action, eventFilters.action) &&
      contains(event.from_state, eventFilters.from) &&
      contains(event.to_state, eventFilters.to) &&
      contains(event.description, eventFilters.description)
    );
  });

  const filteredRequests = requests.filter((pr) => {
    if (!requestSearch.trim()) return true;
    const q = requestSearch.trim().toLowerCase();
    const itemNames = (pr.items || []).map((i) => `${i.item_description || i.item?.name || ''} ${i.item_reference || ''} ${i.region || ''}`).join(' ');
    const searchString = `${pr.request_number} ${pr.department?.name || ''} ${pr.status || ''} ${pr.requester?.name || ''} ${itemNames}`.toLowerCase();
    return searchString.includes(q);
  });

  const getEntityUrl = (event: SystemEvent): string | null => {
    if (!event.entity_id) return null;
    if (event.entity_type === 'App\\Models\\PurchaseRequest') {
      return `/requests/${event.entity_id}`;
    }
    if (event.entity_type === 'App\\Models\\PurchaseOrder') {
      return primaryRole === 'general_manager'
        ? `/general-manager/purchase-orders/${event.entity_id}`
        : `/procurement/purchase-orders/${event.entity_id}`;
    }
    if (event.entity_type === 'App\\Models\\PurchaseReceipt') {
      return '/warehouse';
    }
    if (event.entity_type === 'App\\Models\\SupplierInvoice') {
      return '/accounting/supplier-payments';
    }
    return null;
  };

  if (loading) return <LoadingSpinner message="جاري تحميل أرشيف الطلبات والإجراءات..." />;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-xl font-black text-slate-100 flex items-center gap-2">
            <span>🗂️</span> أرشيف الطلبات والإجراءات
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            أرشيف شامل لجميع طلبات الشراء وسجل الحركات والتدقيق الخاص بدورك في النظام.
          </p>
        </div>

        {/* Tab Toggle */}
        <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('REQUESTS')}
            className={`rounded-lg px-4 py-1.5 text-xs font-bold transition-all ${
              activeTab === 'REQUESTS'
                ? 'bg-cyan-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            📋 أرشيف طلبات الشراء ({requests.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('EVENTS')}
            className={`rounded-lg px-4 py-1.5 text-xs font-bold transition-all ${
              activeTab === 'EVENTS'
                ? 'bg-cyan-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            ⚡ سجل الإجراءات والتدقيق ({events.length})
          </button>
        </div>
      </div>

      {error && <ErrorMessage error={error} onDismiss={() => setError(null)} />}

      {/* Tab 1: Requests Archive */}
      {activeTab === 'REQUESTS' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <input
              type="search"
              value={requestSearch}
              onChange={(e) => setRequestSearch(e.target.value)}
              placeholder="بحث في أرشيف الطلبات برقم الطلب، الصنف، القطعة، المنطقة، الحالة..."
              className="w-full sm:max-w-md rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-2 text-xs font-bold text-slate-100 placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
            />
            <span className="text-xs text-slate-400">
              المعروض: <strong className="font-mono text-cyan-300">{filteredRequests.length}</strong> طلب
            </span>
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block">
            <Card className="p-0 border-slate-800 bg-slate-900/90 overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>رقم الطلب</TableHead>
                      <TableHead>ملخص البنود</TableHead>
                      <TableHead>رقم قطعة الأرض</TableHead>
                      <TableHead>المنطقة</TableHead>
                      <TableHead>الكمية / العدد</TableHead>
                      <TableHead>القسم</TableHead>
                      <TableHead>تاريخ الطلب</TableHead>
                      <TableHead>الحالة</TableHead>
                      <TableHead className="text-center">الإجراء</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRequests.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="py-12 text-center text-slate-400">
                          لا توجد طلبات شراء مطابقة للبحث في الأرشيف.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredRequests.map((pr) => {
                        const itemNames = (pr.items || []).map((i) => i.item_description || i.item?.name).filter(Boolean);
                        const itemsSummary = getItemsSummaryDisplay(pr.items);
                        const parcelRefs = getSummaryParcels(pr);
                        const regions = getSummaryRegions(pr);
                        const quantitiesInfo = getSummaryQuantities(pr.items);

                        return (
                          <TableRow key={pr.id}>
                            <TableCell className="font-mono font-bold text-cyan-400">
                              <Link to={`/requests/${pr.id}`} className="hover:underline">
                                {pr.request_number}
                              </Link>
                            </TableCell>
                            <TableCell className="font-semibold text-slate-100 max-w-[200px] truncate">
                              <span title={itemNames.join('، ')}>{itemsSummary}</span>
                            </TableCell>
                            <TableCell className="font-mono">{parcelRefs}</TableCell>
                            <TableCell>{regions}</TableCell>
                            <TableCell className="whitespace-nowrap">
                              <div title={quantitiesInfo.tooltip}>
                                <div className="font-mono font-bold text-amber-300">{quantitiesInfo.display}</div>
                                {quantitiesInfo.subtext && (
                                  <div className="text-[10px] text-slate-400 font-normal leading-tight">{quantitiesInfo.subtext}</div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{pr.target_department?.name || pr.department?.name || '—'}</TableCell>
                            <TableCell className="whitespace-nowrap font-mono text-xs text-slate-400">
                              {pr.created_at?.split('T')[0] || '—'}
                            </TableCell>
                            <TableCell>
                              <PurchaseRequestStatusBadge status={pr.status} />
                            </TableCell>
                            <TableCell className="text-center">
                              <Link to={`/requests/${pr.id}`}>
                                <Button variant="secondary" size="sm" className="px-3 py-1 text-xs">
                                  عرض الطلب
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
            </Card>
          </div>

          {/* Mobile Cards View */}
          <div className="space-y-3 md:hidden">
            {filteredRequests.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/50 p-8 text-center text-xs text-slate-400">
                لا توجد طلبات شراء مطابقة للبحث في الأرشيف.
              </div>
            ) : (
              filteredRequests.map((pr) => {
                const itemNames = (pr.items || []).map((i) => i.item_description || i.item?.name).filter(Boolean);
                const itemsSummary = itemNames.length === 0
                  ? '—'
                  : itemNames.length === 1
                    ? itemNames[0]
                    : `${itemNames[0]} (+${itemNames.length - 1} أصناف)`;
                const parcelRefs = getSummaryParcels(pr);
                const regions = getSummaryRegions(pr);

                return (
                  <article
                    key={`mobile-archive-pr-${pr.id}`}
                    className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/90 p-4 space-y-3 shadow-lg shadow-black/40"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                      <Link
                        to={`/requests/${pr.id}`}
                        className="font-mono text-sm font-black text-cyan-400 hover:underline"
                      >
                        {pr.request_number}
                      </Link>
                      <PurchaseRequestStatusBadge status={pr.status} />
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
                        <span className="text-[11px] text-slate-400 font-bold block mb-1">الصنف / المواد المطلوبة:</span>
                        <p className="font-semibold text-slate-100 leading-snug" title={itemNames.join('، ')}>
                          {itemsSummary}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div className="bg-slate-950/40 p-2 rounded-lg border border-slate-800/60">
                          <span className="text-slate-500 font-bold block">رقم القطعة:</span>
                          <span className="font-mono font-bold text-amber-300">
                            {parcelRefs || '—'}
                          </span>
                        </div>
                        <div className="bg-slate-950/40 p-2 rounded-lg border border-slate-800/60">
                          <span className="text-slate-500 font-bold block">المنطقة:</span>
                          <span className="font-semibold text-slate-200">
                            {regions || '—'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 pt-1">
                        <div>
                          <span className="text-slate-500">القسم: </span>
                          <span className="text-slate-300 font-medium">{pr.target_department?.name || pr.department?.name || '—'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">التاريخ: </span>
                          <span className="font-mono text-slate-400">{pr.created_at?.split('T')[0] || '—'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-800">
                      <Link to={`/requests/${pr.id}`} className="block">
                        <Button variant="secondary" size="sm" className="w-full text-xs font-bold py-2 justify-center">
                          عرض تفاصيل الطلب ←
                        </Button>
                      </Link>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Activity Events Archive */}
      {activeTab === 'EVENTS' && (
        <div className="space-y-4">
          <TableColumnFilters
            filters={[
              { key: 'dateFrom', label: 'من تاريخ', type: 'date', value: eventFilters.dateFrom, onChange: (value) => setEventFilters((c) => ({ ...c, dateFrom: value })) },
              { key: 'dateTo', label: 'إلى تاريخ', type: 'date', value: eventFilters.dateTo, onChange: (value) => setEventFilters((c) => ({ ...c, dateTo: value })) },
              { key: 'entity', label: 'نوع السجل', value: eventFilters.entity, onChange: (value) => setEventFilters((c) => ({ ...c, entity: value })) },
              { key: 'action', label: 'الإجراء', value: eventFilters.action, onChange: (value) => setEventFilters((c) => ({ ...c, action: value })) },
              { key: 'from', label: 'من الحالة', value: eventFilters.from, onChange: (value) => setEventFilters((c) => ({ ...c, from: value })) },
              { key: 'to', label: 'إلى الحالة', value: eventFilters.to, onChange: (value) => setEventFilters((c) => ({ ...c, to: value })) },
              { key: 'description', label: 'التفاصيل', value: eventFilters.description, onChange: (value) => setEventFilters((c) => ({ ...c, description: value })) },
            ]}
            hasActiveFilters={Boolean(
              eventFilters.dateFrom !== defaultDateFrom ||
                eventFilters.dateTo !== today ||
                eventFilters.entity ||
                eventFilters.action ||
                eventFilters.from ||
                eventFilters.to ||
                eventFilters.description,
            )}
            onClear={() =>
              setEventFilters({
                dateFrom: defaultDateFrom,
                dateTo: today,
                entity: '',
                action: '',
                from: '',
                to: '',
                description: '',
              })
            }
          />

          <div className="hidden sm:block">
            <Card className="p-0 border-slate-800 bg-slate-900/90 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>التاريخ والوقت</TableHead>
                    <TableHead>نوع السجل</TableHead>
                    <TableHead>الإجراء</TableHead>
                    <TableHead>من الحالة</TableHead>
                    <TableHead>إلى الحالة</TableHead>
                    <TableHead>التفاصيل</TableHead>
                    <TableHead className="text-center">المستند</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEvents.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-12 text-center text-slate-400">
                        لا توجد حركات مطابقة للفلاتر الحالية.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredEvents.map((event) => {
                      const docUrl = getEntityUrl(event);

                      return (
                        <TableRow key={event.id}>
                          <TableCell className="font-mono text-xs text-slate-300 whitespace-nowrap">
                            {event.occurred_at ? new Date(event.occurred_at).toLocaleString('ar-EG') : '—'}
                          </TableCell>
                          <TableCell className="font-bold text-cyan-300">
                            {ENTITY_LABELS[event.entity_type || ''] || 'سجل مشتريات'}
                          </TableCell>
                          <TableCell className="font-bold text-amber-300">
                            {ACTION_LABELS[event.action] || event.action || 'إجراء'}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-slate-400">{event.from_state || '—'}</TableCell>
                          <TableCell className="font-mono text-xs text-emerald-300">{event.to_state || '—'}</TableCell>
                          <TableCell className="max-w-[320px] text-xs leading-6 text-slate-300">{event.description || '—'}</TableCell>
                          <TableCell className="text-center">
                            {docUrl ? (
                              <Link to={docUrl}>
                                <Button variant="secondary" size="sm" className="px-2.5 py-1 text-xs">
                                  فتح المستند
                                </Button>
                              </Link>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </Card>
          </div>

          <div className="space-y-3 sm:hidden">
            {filteredEvents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-700 px-3 py-8 text-center text-xs text-slate-400">
                لا توجد حركات مطابقة للفلاتر الحالية.
              </div>
            ) : (
              filteredEvents.map((event) => {
                const docUrl = getEntityUrl(event);
                return (
                  <article key={`mobile-${event.id}`} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5 space-y-2">
                    <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-2.5">
                      <div>
                        <span className="font-bold text-cyan-300 text-xs">
                          {ENTITY_LABELS[event.entity_type || ''] || 'سجل'}
                        </span>
                        <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                          {event.occurred_at ? new Date(event.occurred_at).toLocaleString('ar-EG') : '—'}
                        </p>
                      </div>
                      <span className="rounded-md bg-amber-950/60 border border-amber-800/60 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                        {ACTION_LABELS[event.action] || event.action}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300">{event.description || 'لا توجد تفاصيل إضافية'}</p>

                    {docUrl && (
                      <div className="pt-2">
                        <Link to={docUrl}>
                          <Button variant="secondary" size="sm" className="w-full text-xs">
                            فتح المستند المرتبط
                          </Button>
                        </Link>
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default RoleArchivePage;
