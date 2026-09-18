import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import ErrorMessage from '../../components/ErrorMessage';
import LoadingSpinner from '../../components/LoadingSpinner';
import PurchaseRequestStatusBadge from '../../components/purchase-requests/PurchaseRequestStatusBadge';
import DeleteRequestDialog from '../../components/purchase-requests/DeleteRequestDialog';
import SubmitRequestDialog from '../../components/purchase-requests/SubmitRequestDialog';
import PurchaseRequestPrintModal from '../../components/purchase-requests/PurchaseRequestPrintModal';
import { useAuth } from '../../context/AuthContext';
import {
  deletePurchaseRequestApi,
  getPurchaseRequestApi,
  submitPurchaseRequestApi,
} from '../../api/purchaseRequests';
import { ForbiddenPage } from '../ErrorPages';
import { ApiError } from '../../types/api';
import {
  PR_STATUS_LABELS,
  PR_TYPE_LABELS,
  PurchaseRequest,
} from '../../types/purchaseRequest';
import { parseApiError } from '../../utils/apiError';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table';
import SystemEventTimeline from '../../components/ui/SystemEventTimeline';
import PurchaseRequestTimeline from '../../components/procurement/PurchaseRequestTimeline';
import OfficeReceiptModal from '../../components/purchase-requests/OfficeReceiptModal';
import { getUnitLabel } from '../../utils/units';
import { getSummaryParcels, getSummaryRegions, getSummaryQuantities } from '../../utils/formatRequestSummary';
import { UnifiedNotesCard } from '../../components/common/UnifiedNotesCard';

const REQUESTER_EDITABLE_STATUSES = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW'];
const REVIEWER_DECISION_STATUSES = ['REJECTED', 'APPROVED_BY_REVIEWER', 'PENDING_PROCUREMENT_APPROVAL', 'APPROVED_BY_PROCUREMENT', 'PO_DRAFT', 'ISSUED'];

export const PurchaseRequestDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { hasPermission } = useAuth();

  const [requestData, setRequestData] = useState<PurchaseRequest | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [flashMessage, setFlashMessage] = useState<string | null>(
    (location.state as any)?.message || null
  );

  // Modals
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);
  const [isOfficeReceiptModalOpen, setIsOfficeReceiptModalOpen] = useState<boolean>(false);
  const [selectedPoForReceipt, setSelectedPoForReceipt] = useState<any>(null);

  const fetchRequest = async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getPurchaseRequestApi(parseInt(id, 10));
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

  const handleConfirmSubmit = async () => {
    if (!requestData) return;
    setIsSubmitting(true);
    try {
      await submitPurchaseRequestApi(requestData.id);
      setIsSubmitModalOpen(false);
      setFlashMessage('تم إرسال طلب الشراء للمراجعة بنجاح.');
      await fetchRequest();
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!requestData) return;
    setIsDeleting(true);
    try {
      await deletePurchaseRequestApi(requestData.id);
      setIsDeleteModalOpen(false);
      navigate('/requests', {
        state: { message: 'تم حذف مسودة طلب الشراء بنجاح.' },
      });
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) return <LoadingSpinner fullScreen message="تحميل تفاصيل طلب الشراء..." />;

  if (error && !requestData) {
    if (error.status === 403) {
      return <ForbiddenPage />;
    }
    return (
      <div className="space-y-4" dir="rtl">
        <ErrorMessage error={error} />
        <Link to="/requests">
          <Button variant="secondary" size="sm">← العودة</Button>
        </Link>
      </div>
    );
  }

  if (!requestData) return null;

  const isDraft = requestData.status === 'DRAFT';
  const canEdit = REQUESTER_EDITABLE_STATUSES.includes(requestData.status) && hasPermission('purchase_request.edit_own');
  const canDelete = isDraft && hasPermission('purchase_request.edit_own');
  const canSubmit = isDraft && hasPermission('purchase_request.submit');
  const reviewerDecisionFinal = REVIEWER_DECISION_STATUSES.includes(requestData.status);

  const isOffice = requestData.request_type === 'OFFICE_SUPPLIES';
  const issuedPos = requestData.purchase_orders || [];
  const activeOfficePo = isOffice && issuedPos.length > 0 ? issuedPos[0] : null;
  const isOfficeReceiptConfirmed = activeOfficePo?.has_approved_receipt || false;
  const canRequestSupplement =
    [
      'APPROVED_BY_REVIEWER',
      'APPROVED_BY_GM',
      'PO_ISSUED',
      'ACCOUNTING_APPROVED',
      'APPROVED_BY_PROCUREMENT',
    ].includes(requestData.status) || Boolean(issuedPos.length > 0);

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
      {/* Flash */}
      {flashMessage && (
        <div className="bg-emerald-950/40 border border-emerald-800/80 text-emerald-300 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between shadow-md">
          <span>✓ {flashMessage}</span>
          <button onClick={() => setFlashMessage(null)} className="text-emerald-400 font-bold ml-2 cursor-pointer">✕</button>
        </div>
      )}
      <ErrorMessage error={error} onDismiss={() => setError(null)} />

      {/* Office Supplies Receipt Card for Requester */}
      {isOffice && activeOfficePo && (
        isOfficeReceiptConfirmed ? (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-4 text-xs text-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg shadow-emerald-950/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-xl">
                ✓
              </div>
              <div>
                <div className="font-bold text-sm text-emerald-100">تم استلام الأصناف المكتبية واعتمادها بنجاح</div>
                <p className="text-emerald-300/80 text-[11px] mt-0.5">
                  أمر الشراء ({activeOfficePo.po_number}) تم تأكيد استلامه في مقر الشركة وتحويله للحسابات لاستكمال إجراءات الفاتورة.
                </p>
              </div>
            </div>
            <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/50 text-emerald-300">
              تم الاستلام الفعلي
            </span>
          </div>
        ) : (
          <div className="rounded-xl border border-indigo-500/50 bg-indigo-950/40 p-4 text-xs text-indigo-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl shadow-indigo-950/40">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-xl">
                📦
              </div>
              <div>
                <div className="font-bold text-sm text-slate-100">المستلزمات المكتبية جاهزة / تم توريدها للاستلام</div>
                <p className="text-indigo-300/90 text-[11px] mt-0.5">
                  بصفتك مقدم الطلب، يمكنك تأكيد استلام الأصناف المكتبية مباشرة لنقل أمر الشراء ({activeOfficePo.po_number}) للحسابات وصرف المستحقات.
                </p>
              </div>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setSelectedPoForReceipt(activeOfficePo);
                setIsOfficeReceiptModalOpen(true);
              }}
              className="bg-indigo-600 hover:bg-indigo-500 border-indigo-500 text-white font-bold px-4 py-2 text-xs flex items-center gap-2 whitespace-nowrap shadow-md"
            >
              <span>📦</span> تأكيد استلام الأصناف المكتبية
            </Button>
          </div>
        )
      )}

      {['SUBMITTED', 'UNDER_REVIEW'].includes(requestData.status) && (
        <div className="rounded-xl border border-cyan-700/40 bg-cyan-950/25 px-4 py-2.5 text-xs text-cyan-200">
          الطلب قابل للتعديل حاليًا؛ سيتم إغلاق التعديل فور اعتماد المراجع.
        </div>
      )}

      {reviewerDecisionFinal && (
        <div className="rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-xs text-slate-300">
          تم اتخاذ قرار المراجع على هذا الطلب، لذلك تم إغلاق التعديل من جهة الموظف.
        </div>
      )}

      {/* Rejection Alert */}
      {requestData.status === 'REJECTED' && requestData.rejection_reason && (
        <div className="bg-rose-950/40 border border-rose-800/80 p-4 rounded-xl">
          <h3 className="font-bold text-rose-200 text-xs flex items-center gap-2">
            <span>⚠️</span> سبب الرفض:
          </h3>
          <p className="text-xs mt-1 text-rose-300">{requestData.rejection_reason}</p>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center space-x-3 space-x-reverse">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-black font-mono text-cyan-400">{requestData.request_number}</h1>
              <PurchaseRequestStatusBadge status={requestData.status} />
              {isOffice ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-950/90 text-indigo-300 border border-indigo-700/60 shadow-sm">
                  <span>🏢</span> مستلزمات مكتبية للشركة
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-950/90 text-amber-300 border border-amber-700/60 shadow-sm">
                  <span>🏗️</span> مشتريات مشروع / موقع
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="secondary" size="sm" onClick={() => setIsPrintModalOpen(true)}
            className="bg-cyan-950/60 text-cyan-300 border-cyan-800/60 hover:bg-cyan-900/60 flex items-center gap-1.5">
            🖨️ طباعة
          </Button>
          {canRequestSupplement && (
            <Link to="/supplementary-requests">
              <Button
                variant="primary"
                size="sm"
                className="bg-amber-600 hover:bg-amber-500 text-white font-bold flex items-center gap-1.5 shadow-md shadow-amber-900/30"
              >
                <span>➕</span> طلب كمية إضافية (كمالة)
              </Button>
            </Link>
          )}
          {canEdit && (
            <Link to={`/requests/${requestData.id}/edit`}>
              <Button variant="warning" size="sm">تعديل</Button>
            </Link>
          )}
          {canSubmit && (
            <Button variant="primary" size="sm" onClick={() => setIsSubmitModalOpen(true)}>
              تقديم
            </Button>
          )}
          {canDelete && (
            <Button variant="danger" size="sm" onClick={() => setIsDeleteModalOpen(true)}>
              حذف
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (window.history.length > 2) {
                navigate(-1);
              } else {
                navigate('/requests');
              }
            }}
          >
            ← العودة
          </Button>
        </div>
      </div>

      {/* ── شريط البيانات الأساسية الأربعة الإلزامي (المنطقة، رقم القطعة، الأصناف، والكمية) ── */}
      <div className="rounded-2xl border-2 border-amber-500/40 bg-gradient-to-r from-slate-900 via-amber-950/20 to-slate-900 p-3.5 sm:p-4 shadow-xl">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          {/* 1. رقم قطعة الأرض */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5">
            <span className="text-[10px] font-bold text-slate-400 block">رقم قطعة الأرض:</span>
            <span className="text-sm sm:text-base font-black font-mono text-cyan-300 block mt-0.5">
              {parcelsDisplay}
            </span>
          </div>

          {/* 2. المنطقة */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5">
            <span className="text-[10px] font-bold text-slate-400 block">المنطقة الجغرافية:</span>
            <span className="text-sm sm:text-base font-black text-amber-300 block mt-0.5">
              {regionsDisplay}
            </span>
          </div>

          {/* 3. الأصناف المطلوبة */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5">
            <span className="text-[10px] font-bold text-slate-400 block">الأصناف المطلوبة ({requestData.items?.length || 0}):</span>
            <span className="text-xs sm:text-sm font-black text-slate-100 block mt-0.5 truncate" title={itemNames.join('، ')}>
              {itemsDisplay}
            </span>
          </div>

          {/* 4. الكمية الإجمالية */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5">
            <span className="text-[10px] font-bold text-slate-400 block">الكمية الإجمالية:</span>
            <span className="text-sm sm:text-base font-black font-mono text-amber-300 block mt-0.5" title={quantitiesInfo.tooltip}>
              {quantitiesInfo.display}
            </span>
          </div>
        </div>
      </div>

      {/* Summary metadata */}
      <Card className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
        <div>
          <div className="text-[10px] text-slate-400 font-semibold">نوع الطلب</div>
          <div className="font-bold text-slate-200 mt-1 flex items-center gap-1">
            {isOffice ? '🏢 مستلزمات مكتبية للشركة' : '🏗️ مشتريات مشروعات ومواقع'}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400 font-semibold">القسم المستهدف</div>
          <div className="font-bold text-slate-200 mt-1">{requestData.target_department?.name || requestData.department?.name || 'غير محدد'}</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400 font-semibold">مقدم الطلب (المستلم)</div>
          <div className="font-bold text-slate-200 mt-1">{requestData.requester?.name}</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400 font-semibold">الحالة</div>
          <div className="font-bold text-slate-200 mt-1">{PR_STATUS_LABELS[requestData.status] || requestData.status}</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400 font-semibold">تاريخ الاحتياج</div>
          <div className="font-bold text-slate-200 mt-1 font-mono">{requestData.date_needed || '-'}</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400 font-semibold">تاريخ الإنشاء</div>
          <div className="font-bold text-slate-200 mt-1 font-mono">
            {new Date(requestData.created_at).toLocaleDateString('ar-EG')}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400 font-semibold">مسؤول الاستلام / مهندس الموقع</div>
          <div className="font-bold text-slate-200 mt-1">
            {isOffice
              ? 'مقدم الطلب (استلام مكتبي مباشر)'
              : requestData.site_engineer?.name
                ? `${requestData.site_engineer.name}${requestData.is_general_manager_requester ? ' (اختيار المدير التنفيذي)' : ''}`
                : 'يحدده المراجع عند الاعتماد'}
          </div>
        </div>
        <div className="col-span-2 md:col-span-4">
          <div className="text-[10px] text-slate-400 font-semibold">ملاحظات</div>
          <div className="font-bold text-slate-200 mt-1">{requestData.notes || '-'}</div>
        </div>
      </Card>

      <Card className="border-cyan-900/60 bg-slate-950/40 p-3 sm:p-4">
        <PurchaseRequestTimeline request={requestData} />
      </Card>

      {/* Line البنود */}
      <div className="space-y-2.5">
        <h3 className="flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-200">
          <span>📦</span> بنود ومواد طلب الشراء التفصيلية
        </h3>
        <div className="hidden sm:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>م</TableHead>
                <TableHead>{isOffice ? 'مكان / مكتب الاستلام' : 'رقم قطعة الأرض'}</TableHead>
                {!isOffice && <TableHead>المنطقة</TableHead>}
                <TableHead>الصنف</TableHead>
                <TableHead>الكمية</TableHead>
                <TableHead>الوحدة</TableHead>
                <TableHead>المواصفات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requestData.items?.map((item, index) => (
                <TableRow key={item.id}>
                  <TableCell className="font-bold font-mono text-slate-400">{index + 1}</TableCell>
                  <TableCell className="font-mono text-cyan-300">{item.item_reference || requestData.parcel_reference || (isOffice ? 'مقر الشركة' : '—')}</TableCell>
                  {!isOffice && <TableCell className="text-amber-300">{item.region || requestData.region || '—'}</TableCell>}
                  <TableCell className="font-bold text-slate-100">{item.item_description}</TableCell>
                  <TableCell className="font-bold font-mono text-slate-200">
                    {parseFloat(item.quantity).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-slate-400">{getUnitLabel(item.uom)}</TableCell>
                  <TableCell className="text-xs text-slate-300">{item.specifications || '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="space-y-2.5 sm:hidden">
          {requestData.items?.length ? requestData.items.map((item, index) => (
            <article key={`mobile-${item.id}`} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 space-y-2">
              <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-cyan-300">بند #{index + 1}</p>
                  <p className="mt-0.5 break-words text-sm font-black text-slate-100">{item.item_description || 'بدون وصف'}</p>
                </div>
                <span className="shrink-0 font-mono text-xs font-bold text-cyan-300">🏷️ {item.item_reference || (isOffice ? 'مقر الشركة' : '—')}</span>
              </div>
              <div className="flex items-center justify-between text-xs pt-0.5">
                {!isOffice && <span className="text-amber-300 font-bold">📍 {item.region || '—'}</span>}
                <span className="font-bold text-emerald-300 font-mono">
                  ⚖️ {parseFloat(item.quantity).toLocaleString()} {getUnitLabel(item.uom)}
                </span>
              </div>
              {item.specifications && (
                <p className="text-[11px] text-slate-400 border-t border-slate-800/60 pt-1">
                  المواصفات: {item.specifications}
                </p>
              )}
            </article>
          )) : (
            <div className="rounded-xl border border-dashed border-slate-700 px-3 py-6 text-center text-xs text-slate-400">لا توجد بنود مرتبطة بالطلب.</div>
          )}
        </div>
      </div>

      <UnifiedNotesCard request={requestData} />

      {/* System Events: Collapsed by default */}
      <SystemEventTimeline entity="purchase_request" entityId={requestData.id} defaultCollapsed={true} />

      {/* Mobile Sticky Action Bar */}
      {(canSubmit || canEdit || canDelete || canRequestSupplement) && (
        <div className="fixed bottom-0 inset-x-0 z-30 flex items-center justify-between gap-2 border-t border-slate-800 bg-slate-950/95 p-3 shadow-2xl backdrop-blur sm:hidden">
          {canSubmit && (
            <Button
              variant="primary"
              size="md"
              onClick={() => setIsSubmitModalOpen(true)}
              className="flex-1 bg-gradient-to-r from-cyan-500 to-teal-400 text-slate-950 font-black text-xs min-h-10"
            >
              🚀 إرسال للمراجعة
            </Button>
          )}
          {canRequestSupplement && (
            <Link to="/supplementary-requests" className="flex-1">
              <Button
                variant="primary"
                size="md"
                className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs min-h-10 flex items-center justify-center gap-1"
              >
                <span>➕</span> طلب كمية إضافية
              </Button>
            </Link>
          )}
          {canEdit && (
            <Link to={`/requests/${requestData.id}/edit`} className="flex-1">
              <Button variant="warning" size="md" className="w-full text-xs font-bold bg-amber-950 text-amber-300 border-amber-700 min-h-10">
                ✏️ تعديل
              </Button>
            </Link>
          )}
          {canDelete && (
            <Button
              variant="danger"
              size="md"
              onClick={() => setIsDeleteModalOpen(true)}
              className="min-w-12 text-xs font-bold min-h-10"
            >
              🗑️
            </Button>
          )}
        </div>
      )}

      {/* Dialogs */}
      <SubmitRequestDialog
        isOpen={isSubmitModalOpen}
        requestNumber={requestData.request_number}
        isSubmitting={isSubmitting}
        onConfirm={handleConfirmSubmit}
        onCancel={() => setIsSubmitModalOpen(false)}
      />
      <DeleteRequestDialog
        isOpen={isDeleteModalOpen}
        requestNumber={requestData.request_number}
        isDeleting={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setIsDeleteModalOpen(false)}
      />
      <PurchaseRequestPrintModal
        isOpen={isPrintModalOpen}
        pr={requestData}
        onClose={() => setIsPrintModalOpen(false)}
      />
      {selectedPoForReceipt && (
        <OfficeReceiptModal
          isOpen={isOfficeReceiptModalOpen}
          purchaseOrderId={selectedPoForReceipt.id}
          poNumber={selectedPoForReceipt.po_number}
          supplierName={selectedPoForReceipt.supplier?.company_name}
          items={requestData.items?.map(i => ({
            id: i.id,
            item_description: i.item_description,
            quantity: i.quantity,
            uom: i.uom,
          }))}
          onClose={() => {
            setIsOfficeReceiptModalOpen(false);
            setSelectedPoForReceipt(null);
          }}
          onSuccess={(msg) => {
            setFlashMessage(msg);
            fetchRequest();
          }}
        />
      )}
    </div>
  );
};

export default PurchaseRequestDetailsPage;
