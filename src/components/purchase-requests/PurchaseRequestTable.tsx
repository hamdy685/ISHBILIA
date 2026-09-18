import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { PR_ACTION_LABELS, PR_STATUS_LABELS, PurchaseRequest } from '../../types/purchaseRequest';
import PurchaseRequestStatusBadge from './PurchaseRequestStatusBadge';
import PurchaseRequestTimeline from '../procurement/PurchaseRequestTimeline';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../ui/Table';
import { Button } from '../ui/Button';
import { getUnitLabel } from '../../utils/units';
import { getSummaryParcels, getSummaryRegions, getSummaryQuantities } from '../../utils/formatRequestSummary';

const REQUESTER_EDITABLE_STATUSES = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW'];
const REQUESTER_DELETABLE_STATUSES = ['DRAFT'];
const formatRequestDate = (value?: string | null): string => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(date);
};

const getRequestType = (pr: PurchaseRequest): React.ReactNode => {
  if (pr.request_type === 'OFFICE_SUPPLIES') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-950/80 text-indigo-300 border border-indigo-800/60">
        <span>🏢</span> مستلزمات مكتبية
      </span>
    );
  }
  if (pr.procurement_route === 'DIRECT') return 'شراء مباشر';
  if (pr.procurement_route === 'QUOTES') return 'عروض أسعار';
  return 'طلب شراء موقع';
};

const getLastAction = (pr: PurchaseRequest): string => {
  const latestAction = pr.approval_history?.[pr.approval_history.length - 1]?.action;
  if (latestAction && PR_ACTION_LABELS[latestAction]) return PR_ACTION_LABELS[latestAction];
  return PR_STATUS_LABELS[pr.status as keyof typeof PR_STATUS_LABELS] || 'قيد المتابعة';
};

interface Props {
  requests: PurchaseRequest[];
  onOpenSubmitModal: (pr: PurchaseRequest) => void;
  onOpenDeleteModal: (pr: PurchaseRequest) => void;
  emptyMessage?: string;
  emptyDescription?: string;
}

export const PurchaseRequestTable: React.FC<Props> = ({
  requests,
  onOpenSubmitModal,
  onOpenDeleteModal,
  emptyMessage = 'لا توجد طلبات شراء حالياً',
  emptyDescription = 'ابدأ بإنشاء أول طلب شراء جديد لمؤسستك.',
}) => {
  const { hasPermission } = useAuth();

  if (requests.length === 0) {
    return (
      <div className="text-center py-12 bg-slate-900/50 border border-dashed border-slate-800 rounded-xl p-6 space-y-3">
        <div className="w-12 h-12 mx-auto rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-400 text-xl">
          📋
        </div>
        <h3 className="text-sm font-bold text-slate-200">
          {emptyMessage}
        </h3>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">
          {emptyDescription}
        </p>
        {hasPermission('purchase_request.create') && (
          <div className="pt-2">
            <Link to="/requests/create">
              <Button variant="primary" size="sm">
                + إنشاء طلب شراء جديد
              </Button>
            </Link>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="hidden overflow-x-auto xl:block">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>رقم الطلب#</TableHead>
          <TableHead>الصنف / المواد</TableHead>
          <TableHead>رقم قطعة الأرض</TableHead>
          <TableHead>المنطقة</TableHead>
          <TableHead>الكمية / العدد</TableHead>
          <TableHead>تاريخ الاحتياج</TableHead>
          <TableHead>تاريخ الطلب</TableHead>
          <TableHead>نوع الطلب</TableHead>
          <TableHead>القسم / المشروع</TableHead>
          <TableHead>الحالة</TableHead>
          <TableHead>آخر إجراء</TableHead>
          <TableHead className="text-center">الإجراءات</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {requests.map((pr, index) => {
          const isDraft = pr.status === 'DRAFT';
          const canEdit = REQUESTER_EDITABLE_STATUSES.includes(pr.status) && hasPermission('purchase_request.edit_own');
          const canDelete = REQUESTER_DELETABLE_STATUSES.includes(pr.status) && hasPermission('purchase_request.edit_own');
          const canSubmit = isDraft && hasPermission('purchase_request.submit');
          const itemNames = pr.items?.map((item) => item.item_description || item.item?.name).filter(Boolean) || [];
          const itemsDisplay = itemNames.length === 0
            ? '—'
            : itemNames.length === 1
              ? itemNames[0]
              : `${itemNames[0]} (+${itemNames.length - 1} أصناف)`;
          const parcelsDisplay = getSummaryParcels(pr);
          const regionsDisplay = getSummaryRegions(pr);
          const quantitiesInfo = getSummaryQuantities(pr.items);
          const staggerClass = `stagger-card stagger-${(index % 8) + 1}`;

          return (
            <TableRow key={pr.id} className={`${staggerClass} border-b border-white/5 hover:bg-white/[0.03] transition-colors`}>
              <TableCell className="font-mono font-bold text-[#d4a84e]">
                <Link to={`/requests/${pr.id}`} className="hover:underline hover:text-gold-300">
                  {pr.request_number}
                </Link>
              </TableCell>
              <TableCell className="font-semibold text-slate-100 max-w-[180px] truncate text-xs">
                <span title={itemNames.join('، ')}>{itemsDisplay}</span>
              </TableCell>
              <TableCell className="font-mono text-[#edd6a6] text-xs whitespace-nowrap">{parcelsDisplay}</TableCell>
              <TableCell className="text-copper-300 text-xs whitespace-nowrap">{regionsDisplay}</TableCell>
              <TableCell className="text-xs whitespace-nowrap">
                <div title={quantitiesInfo.tooltip}>
                  <div className="font-mono font-bold text-amber-300">{quantitiesInfo.display}</div>
                  {quantitiesInfo.subtext && (
                    <div className="text-[10px] text-slate-400 font-normal leading-tight">{quantitiesInfo.subtext}</div>
                  )}
                </div>
              </TableCell>
              <TableCell className="font-mono font-bold text-amber-300 text-xs whitespace-nowrap">{pr.date_needed || '—'}</TableCell>
              <TableCell className="text-slate-400 text-xs">{formatRequestDate(pr.created_at)}</TableCell>
              <TableCell className="text-slate-300 text-xs">{getRequestType(pr)}</TableCell>
              <TableCell className="text-slate-300 text-xs">{pr.target_department?.name || pr.department?.name || '—'}</TableCell>
              <TableCell>
                <PurchaseRequestStatusBadge status={pr.status} />
              </TableCell>
              <TableCell className="max-w-[210px] text-xs text-slate-400">{getLastAction(pr)}</TableCell>
              <TableCell>
                <div className="flex gap-2 justify-center">
                  <Link to={`/requests/${pr.id}`}>
                    <Button variant="secondary" size="sm" className="px-2 py-0.5 text-[10px]">
                      عرض
                    </Button>
                  </Link>

                  {canEdit && (
                    <Link to={`/requests/${pr.id}/edit`}>
                      <Button variant="warning" size="sm" className="px-2 py-0.5 text-[10px] bg-amber-950/60 text-amber-300 border-amber-800/60 hover:bg-amber-900/60">
                        تعديل
                      </Button>
                    </Link>
                  )}

                  {canSubmit && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => onOpenSubmitModal(pr)}
                      className="px-2 py-0.5 text-[10px]"
                    >
                      تقديم
                    </Button>
                  )}

                  {canDelete && (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => onOpenDeleteModal(pr)}
                      className="px-2 py-0.5 text-[10px]"
                    >
                      حذف
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 xl:hidden">
        {requests.map((pr, index) => {
          const isDraft = pr.status === 'DRAFT';
          const canEdit = REQUESTER_EDITABLE_STATUSES.includes(pr.status) && hasPermission('purchase_request.edit_own');
          const canDelete = REQUESTER_DELETABLE_STATUSES.includes(pr.status) && hasPermission('purchase_request.edit_own');
          const canSubmit = isDraft && hasPermission('purchase_request.submit');
          const itemNames = pr.items?.map((item) => item.item_description || item.item?.name).filter(Boolean) || [];
          const parcelsDisplay = getSummaryParcels(pr);
          const regionsDisplay = getSummaryRegions(pr);
          const quantitiesInfo = getSummaryQuantities(pr.items);
          const isOffice = pr.request_type === 'OFFICE_SUPPLIES';
          const primaryItemDesc = itemNames[0] || (isOffice ? 'مستلزمات مكتبية' : 'مواد مشروعات');
          const staggerClass = `stagger-card stagger-${(index % 8) + 1}`;

          return (
            <article
              key={`mobile-card-${pr.id}`}
              className={`rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl p-4 space-y-3 shadow-xl shadow-black/50 hover:shadow-2xl hover:border-gold-500/40 hover:-translate-y-1 transition-all duration-300 ${staggerClass}`}
            >
              {/* Row 1: Request Number, Status Badge, and Date */}
              <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-2.5">
                <div className="flex items-center gap-2">
                  <Link
                    to={`/requests/${pr.id}`}
                    className="font-mono text-sm font-black text-gold-400 hover:text-gold-200 hover:underline transition-colors"
                  >
                    {pr.request_number}
                  </Link>
                  <PurchaseRequestStatusBadge status={pr.status} />
                </div>
                <span className="font-mono text-[10px] text-slate-400 shrink-0">
                  {formatRequestDate(pr.created_at)}
                </span>
              </div>

              {/* Row 2: Mandatory Core Data Strip (المنطقة ورقم القطعة) */}
              <div className="flex items-center gap-2 text-xs flex-wrap bg-slate-950/80 border border-white/5 rounded-xl px-3 py-2 shadow-inner">
                {isOffice ? (
                  <span className="font-bold text-indigo-300 flex items-center gap-1 text-[11px]">
                    <span>🏢</span> مستلزمات مكتبية للمقر
                  </span>
                ) : (
                  <>
                    <div className="flex items-center gap-1 font-semibold text-slate-300">
                      <span className="text-slate-400">قطعة:</span>
                      <strong className="font-mono font-bold text-gold-300">{parcelsDisplay || '—'}</strong>
                    </div>
                    <span className="text-slate-600">•</span>
                    <div className="flex items-center gap-1 font-semibold text-slate-300">
                      <span className="text-slate-400">المنطقة:</span>
                      <strong className="font-bold text-copper-300">{regionsDisplay || '—'}</strong>
                    </div>
                  </>
                )}
                {pr.date_needed && (
                  <>
                    <span className="text-slate-600 mr-auto">•</span>
                    <div className="flex items-center gap-1 text-[11px] font-mono text-slate-400">
                      <span>الاحتياج:</span>
                      <strong className="text-amber-200">{pr.date_needed}</strong>
                    </div>
                  </>
                )}
              </div>

              {/* Row 3: Mandatory Core Data (الصنف والكمية) */}
              <div className="rounded-xl border border-white/5 bg-slate-950/90 p-3 space-y-2 shadow-inner">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-bold text-slate-400 block">الصنف والمواد:</span>
                    <p className="text-xs font-bold text-slate-100 line-clamp-2 mt-0.5">
                      {primaryItemDesc}
                    </p>
                  </div>
                  <div className="text-left shrink-0">
                    <span className="text-[10px] font-bold text-slate-400 block">الكمية الإجمالية:</span>
                    <span className="font-mono font-black text-amber-300 text-xs">
                      {quantitiesInfo.display}
                    </span>
                    {quantitiesInfo.subtext && (
                      <span className="text-[9px] text-slate-400 block">{quantitiesInfo.subtext}</span>
                    )}
                  </div>
                </div>

                {/* If multiple items exist */}
                {itemNames.length > 1 && (
                  <div className="pt-2 border-t border-white/5 text-[11px] text-slate-400 flex items-center justify-between">
                    <span className="text-gold-400/90 font-semibold">
                      +{itemNames.length - 1} أصناف أخرى مشمولة في هذا الطلب
                    </span>
                    <Link to={`/requests/${pr.id}`} className="text-[10px] font-bold text-gold-300 hover:text-gold-200 hover:underline transition-colors">
                      عرض الكل ←
                    </Link>
                  </div>
                )}
              </div>

              {/* Row 4: Actions Toolbar */}
              <div className="flex items-center gap-2 pt-1">
                <Link to={`/requests/${pr.id}`} className="flex-1">
                  <Button variant="secondary" size="sm" className="w-full text-xs font-bold py-1.5">
                    عرض التفاصيل
                  </Button>
                </Link>
                {canSubmit && (
                  <Button
                    variant="primary"
                    size="sm"
                    className="flex-1 text-xs font-black py-1.5"
                    onClick={() => onOpenSubmitModal(pr)}
                  >
                    تقديم الطلب
                  </Button>
                )}
                {canEdit && (
                  <Link to={`/requests/${pr.id}/edit`}>
                    <Button variant="warning" size="sm" className="text-xs font-bold px-3 py-1.5">
                      تعديل
                    </Button>
                  </Link>
                )}
                {canDelete && (
                  <Button
                    variant="danger"
                    size="sm"
                    className="text-xs font-bold px-2.5 py-1.5"
                    onClick={() => onOpenDeleteModal(pr)}
                  >
                    حذف
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
};

export default PurchaseRequestTable;
