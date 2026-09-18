import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ErrorMessage from '../../components/ErrorMessage';
import LoadingSpinner from '../../components/LoadingSpinner';
import PurchaseRequestStatusBadge from '../../components/purchase-requests/PurchaseRequestStatusBadge';
import ApproveRequestDialog from '../../components/reviewer/ApproveRequestDialog';
import RejectRequestDialog from '../../components/reviewer/RejectRequestDialog';
import { useAuth } from '../../context/AuthContext';
import {
  getReviewerPurchaseRequestApi,
  startReviewApi,
  approvePurchaseRequestApi,
  rejectPurchaseRequestApi,
} from '../../api/reviewer';
import { ApiError } from '../../types/api';
import { PurchaseRequest } from '../../types/purchaseRequest';
import { parseApiError } from '../../utils/apiError';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table';
import { getUnitLabel } from '../../utils/units';
import { getSummaryParcels, getSummaryRegions, getSummaryQuantities } from '../../utils/formatRequestSummary';
import SystemEventTimeline from '../../components/ui/SystemEventTimeline';
import { UnifiedNotesCard } from '../../components/common/UnifiedNotesCard';
import { ForbiddenPage } from '../ErrorPages';

const PRIORITY_LABELS: Record<string, string> = {
  LOW: 'منخفضة',
  MEDIUM: 'متوسطة',
  HIGH: 'عالية',
  URGENT: 'عاجلة',
};

export const ReviewerPurchaseRequestDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const [requestData, setRequestData] = useState<PurchaseRequest | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isStartingReview, setIsStartingReview] = useState<boolean>(false);
  const [isMutating, setIsMutating] = useState<boolean>(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modals
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);

  const fetchRequest = async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getReviewerPurchaseRequestApi(parseInt(id, 10));
      setRequestData(data);
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequest();
  }, [id]);

  const handleStartReview = async () => {
    if (!requestData) return;
    setIsStartingReview(true);
    try {
      await startReviewApi(requestData.id);
      await fetchRequest();
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setIsStartingReview(false);
    }
  };

  const handleConfirmApprove = async (
    comment?: string,
    siteEngineerUserId?: number | null,
    requiresWarehouseReceipt?: boolean
  ) => {
    if (!requestData) return;
    setIsMutating(true);
    setError(null);
    try {
      await approvePurchaseRequestApi(
        requestData.id,
        comment,
        siteEngineerUserId,
        requiresWarehouseReceipt
      );
      setIsApproveModalOpen(false);
      setSuccessMessage('تم اعتماد طلب الشراء بنجاح وإرساله للمدير العام.');
      await fetchRequest();
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setIsMutating(false);
    }
  };

  const handleConfirmReject = async (comments: string) => {
    if (!requestData) return;
    setIsMutating(true);
    setError(null);
    try {
      await rejectPurchaseRequestApi(requestData.id, comments);
      setIsRejectModalOpen(false);
      navigate('/reviewer/requests', {
        state: { message: 'تم رفض طلب الشراء.' },
      });
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setIsMutating(false);
    }
  };

  if (isLoading) {
    return <LoadingSpinner fullScreen message="تحميل تفاصيل طلب الشراء للمراجعة..." />;
  }

  if (error && !requestData) {
    if (error.status === 403) {
      return <ForbiddenPage />;
    }
    return (
      <div className="space-y-4" dir="rtl">
        <ErrorMessage error={error} />
        <Link to="/reviewer/requests">
          <Button variant="secondary" size="sm">
            &rarr; العودة لقائمة المراجعة
          </Button>
        </Link>
      </div>
    );
  }

  if (!requestData) return null;

  const isSubmitted = requestData.status === 'SUBMITTED';
  const isUnderReview = requestData.status === 'UNDER_REVIEW';
  const canReview = (isSubmitted || isUnderReview) && hasPermission('purchase_request.approve');
  const canEditBeforeApproval = isUnderReview && hasPermission('purchase_request.edit_during_review');
  const isLockedAfterApproval = !isSubmitted && !isUnderReview;

  const itemNames = requestData.items?.map((item) => item.item_description || item.item?.name).filter(Boolean) || [];
  const itemsDisplay = itemNames.length === 0
    ? '—'
    : itemNames.length === 1
      ? itemNames[0]
      : `${itemNames[0]} (+${itemNames.length - 1} أصناف)`;
  const parcelsDisplay = getSummaryParcels(requestData);
  const regionsDisplay = getSummaryRegions(requestData);
  const quantitiesInfo = getSummaryQuantities(requestData.items);

  return (
    <div className="space-y-3.5 pb-24 md:pb-6 animate-fade-in" dir="rtl">
      {successMessage && (
        <div className="bg-emerald-950/40 border border-emerald-800/80 text-emerald-300 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between shadow-md">
          <span>✓ {successMessage}</span>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-400 font-bold ml-2 cursor-pointer">✕</button>
        </div>
      )}

      <ErrorMessage error={error} onDismiss={() => setError(null)} />

      {isLockedAfterApproval && (
        <div className="rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-2.5 text-xs text-slate-300">
          تم اعتماد المرحلة السابقة وإرسال الطلب إلى المرحلة التالية، لذلك تم إغلاق التعديل من جهة المراجع.
        </div>
      )}

      {/* Header & Direct Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center space-x-3 space-x-reverse flex-wrap gap-2">
          <h1 className="text-lg sm:text-xl font-black font-mono text-cyan-400">
            {requestData.request_number}
          </h1>
          <PurchaseRequestStatusBadge status={requestData.status} />
        </div>

        {/* Action Buttons: Direct Action without navigating or hunting */}
        <div className="flex items-center gap-2 flex-wrap">
          {canReview && (
            <Button
              type="button"
              variant="success"
              size="sm"
              onClick={() => setIsApproveModalOpen(true)}
              disabled={isMutating}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-black shadow-md shadow-emerald-950/50 flex items-center gap-1 text-xs"
              title="اعتماد الطلب فوراً من هنا"
            >
              <span>✓</span>
              <span>اعتماد الطلب</span>
            </Button>
          )}

          {canReview && hasPermission('purchase_request.reject') && (
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={() => setIsRejectModalOpen(true)}
              disabled={isMutating}
              className="bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs"
            >
              <span>✕</span>
              <span>رفض</span>
            </Button>
          )}

          {isSubmitted && hasPermission('purchase_request.review') && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleStartReview}
              isLoading={isStartingReview}
              className="text-xs font-bold"
            >
              بدء المراجعة
            </Button>
          )}

          {canEditBeforeApproval && (
            <Link to={`/reviewer/requests/${requestData.id}/review`}>
              <Button variant="warning" size="sm" className="bg-amber-950/60 text-amber-300 border-amber-800/60 hover:bg-amber-900/60 text-xs font-bold">
                ✏️ تعديل البنود
              </Button>
            </Link>
          )}

          <Link to="/reviewer/requests">
            <Button variant="secondary" size="sm" className="text-xs">
              ← قائمة الطلبات
            </Button>
          </Link>
        </div>
      </div>

      {/* ── شريط البيانات الأساسية الأربعة الإلزامي (المنطقة، رقم القطعة، الأصناف، والكمية) ── */}
      <div className="rounded-2xl border-2 border-amber-500/40 bg-gradient-to-r from-slate-900 via-amber-950/20 to-slate-900 p-3 sm:p-3.5 shadow-lg">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5">
            <span className="text-[10px] font-bold text-slate-400 block">رقم قطعة الأرض:</span>
            <span className="text-sm sm:text-base font-black font-mono text-cyan-300 block mt-0.5">
              {parcelsDisplay}
            </span>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5">
            <span className="text-[10px] font-bold text-slate-400 block">المنطقة الجغرافية:</span>
            <span className="text-sm sm:text-base font-black text-amber-300 block mt-0.5">
              {regionsDisplay}
            </span>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5">
            <span className="text-[10px] font-bold text-slate-400 block">الأصناف المطلوبة ({requestData.items?.length || 0}):</span>
            <span className="text-xs sm:text-sm font-black text-slate-100 block mt-0.5 truncate" title={itemNames.join('، ')}>
              {itemsDisplay}
            </span>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5">
            <span className="text-[10px] font-bold text-slate-400 block">الكمية الإجمالية:</span>
            <span className="text-sm sm:text-base font-black font-mono text-amber-300 block mt-0.5" title={quantitiesInfo.tooltip}>
              {quantitiesInfo.display}
            </span>
          </div>
        </div>
      </div>

      {/* Summary Operational Metadata (Dense & Compact - No Duplicate Region/Parcel) */}
      <Card className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs p-3.5">
        <div>
          <div className="text-[10px] text-slate-400 font-semibold">القسم المستهدف</div>
          <div className="font-bold text-cyan-300 mt-0.5">
            {requestData.target_department?.name || requestData.department?.name || 'غير محدد'}
          </div>
        </div>

        <div>
          <div className="text-[10px] text-slate-400 font-semibold">مقدم الطلب</div>
          <div className="font-bold text-slate-200 mt-0.5">
            {requestData.requester?.name}
          </div>
        </div>

        <div>
          <div className="text-[10px] text-slate-400 font-semibold">تاريخ الاحتياج</div>
          <div className="font-bold text-amber-300 font-mono mt-0.5">
            {requestData.date_needed || '-'}
          </div>
        </div>

        <div>
          <div className="text-[10px] text-slate-400 font-semibold">استلام المخزن</div>
          <div className="font-bold mt-0.5">
            {requestData.requires_warehouse_receipt !== false ? (
              <span className="text-emerald-400 text-xs font-bold">✅ يمر على المخزن</span>
            ) : (
              <span className="text-amber-400 text-xs font-bold">⚡ توريد مباشر (بدون مخزن)</span>
            )}
          </div>
        </div>
      </Card>

      {/* Line البنود Section */}
      <div className="space-y-2">
        <h3 className="text-xs sm:text-sm font-bold text-slate-200 flex items-center gap-2">
          <span>📦</span> عناصر طلب الشراء التفصيلية
        </h3>

        <div className="hidden min-w-0 md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>رقم قطعة الأرض</TableHead>
                <TableHead>المنطقة</TableHead>
                <TableHead>وصف العنصر</TableHead>
                <TableHead>الكمية</TableHead>
                <TableHead>الوحدة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requestData.items?.map((item, index) => (
                <TableRow key={item.id}>
                  <TableCell className="font-bold text-slate-400">{index + 1}</TableCell>
                  <TableCell className="font-mono text-cyan-300">{item.item_reference || '—'}</TableCell>
                  <TableCell className="text-amber-300">{item.region || '—'}</TableCell>
                  <TableCell className="font-bold text-slate-100">{item.item_description}</TableCell>
                  <TableCell className="font-mono font-bold text-slate-200">
                    {parseFloat(item.quantity).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-slate-400">{getUnitLabel(item.uom)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="space-y-2.5 md:hidden">
          {requestData.items?.map((item, index) => (
            <article key={`mobile-reviewer-item-${item.id}`} className="min-w-0 rounded-xl border border-slate-800 bg-slate-900/80 p-3 space-y-2">
              <div className="flex min-w-0 items-start justify-between gap-2 border-b border-slate-800/80 pb-2">
                <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                  بند {index + 1}
                </span>
                <span className="font-mono text-xs font-black text-cyan-300">
                  🏷️ {item.item_reference || 'بدون رقم قطعة'}
                </span>
              </div>
              <p className="font-bold text-xs text-slate-100">{item.item_description}</p>
              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-amber-300">📍 {item.region || 'غير محددة'}</span>
                <span className="font-mono font-bold text-emerald-300">
                  ⚖️ {parseFloat(item.quantity).toLocaleString()} {getUnitLabel(item.uom)}
                </span>
              </div>
            </article>
          ))}
        </div>
      </div>

      <UnifiedNotesCard request={requestData} />

      {/* System Events: Collapsed by default to eliminate wasted space */}
      <SystemEventTimeline entity="purchase_request" entityId={requestData.id} defaultCollapsed={true} />

      {/* Mobile Sticky Action Bar: Instant decision making without scrolling */}
      {canReview && (
        <div className="fixed bottom-0 inset-x-0 z-30 flex items-center justify-between gap-2 border-t border-slate-800 bg-slate-950/95 p-3 shadow-2xl backdrop-blur md:hidden">
          <Button
            type="button"
            variant="success"
            size="md"
            onClick={() => setIsApproveModalOpen(true)}
            disabled={isMutating}
            className="flex-1 min-h-10 text-xs font-black bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg"
          >
            ✓ اعتماد فوراً
          </Button>

          {hasPermission('purchase_request.reject') && (
            <Button
              type="button"
              variant="danger"
              size="md"
              onClick={() => setIsRejectModalOpen(true)}
              disabled={isMutating}
              className="flex-1 min-h-10 text-xs font-bold"
            >
              ✕ رفض
            </Button>
          )}

          {canEditBeforeApproval && (
            <Link to={`/reviewer/requests/${requestData.id}/review`} className="flex-1">
              <Button variant="warning" size="md" className="w-full min-h-10 text-xs font-bold bg-amber-950 text-amber-300 border-amber-700">
                ✏️ تعديل
              </Button>
            </Link>
          )}
        </div>
      )}

      {/* Approve and Reject Dialogs */}
      <ApproveRequestDialog
        isOpen={isApproveModalOpen}
        requestNumber={requestData.request_number}
        initialSiteEngineerId={requestData.site_engineer_user_id || requestData.site_engineer?.id}
        initialRequiresWarehouseReceipt={requestData.requires_warehouse_receipt !== false}
        isApproving={isMutating}
        onConfirm={handleConfirmApprove}
        onCancel={() => setIsApproveModalOpen(false)}
      />

      <RejectRequestDialog
        isOpen={isRejectModalOpen}
        requestNumber={requestData.request_number}
        isRejecting={isMutating}
        onConfirm={handleConfirmReject}
        onCancel={() => setIsRejectModalOpen(false)}
      />
    </div>
  );
};

export default ReviewerPurchaseRequestDetailsPage;
