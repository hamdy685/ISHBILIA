import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ErrorMessage from '../../components/ErrorMessage';
import { TableSkeleton } from '../../components/ui/StateFeedback';
import PurchaseRequestStatusBadge from '../../components/purchase-requests/PurchaseRequestStatusBadge';
import AddReviewItemDialog from '../../components/reviewer/AddReviewItemDialog';
import ApproveRequestDialog from '../../components/reviewer/ApproveRequestDialog';
import RejectRequestDialog from '../../components/reviewer/RejectRequestDialog';
import { useAuth } from '../../context/AuthContext';
import {
  addReviewItemApi,
  approvePurchaseRequestApi,
  deleteReviewItemApi,
  getReviewerPurchaseRequestApi,
  rejectPurchaseRequestApi,
  ReviewItemPayload,
  startReviewApi,
  updateReviewHeaderApi,
  updateReviewItemApi,
} from '../../api/reviewer';
import { ApiError } from '../../types/api';
import { PR_ACTION_LABELS, PR_STATUS_LABELS, PurchaseRequest } from '../../types/purchaseRequest';
import { parseApiError } from '../../utils/apiError';
import { getUnitLabel } from '../../utils/units';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table';
import { FormField, Input, Select } from '../../components/ui/FormField';
import { UnifiedNotesCard } from '../../components/common/UnifiedNotesCard';

export const ReviewPurchaseRequestPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const [requestData, setRequestData] = useState<PurchaseRequest | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isMutating, setIsMutating] = useState<boolean>(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Editable header state
  const [headerDateNeeded, setHeaderDateNeeded] = useState('');
  const [headerNotes, setHeaderNotes] = useState('');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);

  const fetchRequest = async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getReviewerPurchaseRequestApi(parseInt(id, 10));
      setRequestData(data);
      setHeaderDateNeeded(data.date_needed || '');
      setHeaderNotes(data.notes || '');
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequest();
  }, [id]);

  const handleSaveHeader = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !requestData) return;
    setIsMutating(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const updated = await updateReviewHeaderApi(parseInt(id, 10), {
        date_needed: headerDateNeeded || undefined,
        notes: headerNotes || undefined,
      });
      setRequestData(updated);
      setSuccessMessage('تم تحديث بيانات الطلب.');
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setIsMutating(false);
    }
  };

  const handleStartReview = async () => {
    if (!id) return;
    setIsMutating(true);
    setError(null);
    try {
      const updated = await startReviewApi(parseInt(id, 10));
      setRequestData(updated);
      setHeaderDateNeeded(updated.date_needed || '');
      setHeaderNotes(updated.notes || '');
      setSuccessMessage('بدأت المراجعة.');
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setIsMutating(false);
    }
  };

  const handleUpdateItem = async (itemId: number, field: keyof ReviewItemPayload, value: any) => {
    if (!id) return;
    setIsMutating(true);
    setError(null);
    try {
      const currentItem = requestData?.items?.find(i => i.id === itemId);
      if (!currentItem) return;
      const payload: ReviewItemPayload = {
        item_description: currentItem.item_description,
        item_reference: currentItem.item_reference || '',
        region: currentItem.region || '',
        quantity: parseFloat(currentItem.quantity),
        uom: currentItem.uom || undefined,
        specifications: currentItem.specifications || undefined,
        notes: currentItem.notes || undefined,
        [field]: value,
      };
      const updated = await updateReviewItemApi(parseInt(id, 10), itemId, payload);
      setRequestData(updated);
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setIsMutating(false);
    }
  };

  const handleAddItem = async (payload: ReviewItemPayload) => {
    if (!id) return;
    setIsMutating(true);
    setError(null);
    try {
      const updated = await addReviewItemApi(parseInt(id, 10), payload);
      setRequestData(updated);
      setIsAddModalOpen(false);
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setIsMutating(false);
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    if (!id) return;
    if (!confirm('هل أنت متأكد من حذف هذا البند؟')) return;
    setIsMutating(true);
    setError(null);
    try {
      const updated = await deleteReviewItemApi(parseInt(id, 10), itemId);
      setRequestData(updated);
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setIsMutating(false);
    }
  };

  const handleApprove = async (comments?: string, siteEngineerUserId?: number | null, requiresWarehouseReceipt?: boolean) => {
    if (!id) return;
    setIsMutating(true);
    setError(null);
    try {
      await approvePurchaseRequestApi(parseInt(id, 10), comments || '', siteEngineerUserId, requiresWarehouseReceipt);
      setIsApproveModalOpen(false);
      navigate('/reviewer/requests', {
        state: { message: '✅ تم اعتماد طلب الشراء وتحديد مسار الاستلام وإرساله إلى المدير التنفيذي.' },
      });
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setIsMutating(false);
    }
  };

  const handleReject = async (comments: string) => {
    if (!id) return;
    setIsMutating(true);
    setError(null);
    try {
      await rejectPurchaseRequestApi(parseInt(id, 10), comments);
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

  const handleDirectApprove = () => {
    setIsApproveModalOpen(true);
  };

  if (isLoading) return <TableSkeleton rows={8} columns={6} className="min-h-[340px]" />;

  if (error && !requestData) {
    return (
      <div className="space-y-4" dir="rtl">
        <ErrorMessage error={error} />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            if (window.history.length > 2) {
              navigate(-1);
            } else {
              navigate('/reviewer/requests');
            }
          }}
        >
          ← العودة للقائمة
        </Button>
      </div>
    );
  }

  if (!requestData) {
    return (
      <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/50 p-8 text-center" dir="rtl">
        <h2 className="text-base font-bold text-slate-100">تعذر تحميل طلب الشراء</h2>
        <p className="text-xs text-slate-400">لم يتم العثور على بيانات الطلب المطلوبة. يمكنك العودة إلى قائمة الطلبات والمحاولة مرة أخرى.</p>
        <Link to="/reviewer/requests"><Button variant="secondary" size="sm">العودة إلى قائمة الطلبات</Button></Link>
      </div>
    );
  }

  const isUnderReview = requestData.status === 'UNDER_REVIEW';
  const reviewerEditableStatuses = ['SUBMITTED', 'UNDER_REVIEW'];
  const canEdit = reviewerEditableStatuses.includes(requestData.status) && hasPermission('purchase_request.edit_during_review') && !isMutating;
  const isFinalized = !reviewerEditableStatuses.includes(requestData.status);
  const isConflictError = error?.status === 409;

  return (
    <div className="space-y-3.5 pb-24 md:pb-6 animate-fade-in" dir="rtl">
      {/* Flash */}
      {successMessage && (
        <div className="bg-emerald-950/40 border border-emerald-800/80 text-emerald-300 px-4 py-3 rounded-xl text-xs font-semibold flex items-center justify-between">
          <span>{successMessage}</span>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-400 font-bold ml-2">✕</button>
        </div>
      )}
      <ErrorMessage error={error} onDismiss={() => setError(null)} />

      {/* Stale data alert */}
      {isConflictError && (
        <div className="bg-amber-950/40 border border-amber-800/80 text-amber-300 p-4 rounded-xl flex items-center justify-between text-xs font-semibold">
          <span>بيانات الطلب قديمة. أعد تحميل البيانات قبل المتابعة.</span>
          <Button variant="warning" size="sm" onClick={fetchRequest}>إعادة تحميل</Button>
        </div>
      )}

      {/* Finalized / locked banner */}
      {isFinalized && (
        <div className="bg-slate-800/60 border border-slate-700/50 p-4 rounded-xl text-xs text-slate-300 flex items-center gap-3">
          <span className="text-lg">🔒</span>
          <div>
            <strong>الطلب مُغلق</strong>
            <div className="text-slate-400 mt-0.5">
              {PR_STATUS_LABELS[requestData.status] || 'حالة غير معروفة'} — تم اعتماد المرحلة السابقة، لذلك لا يمكن إجراء تعديلات إضافية
            </div>
          </div>
        </div>
      )}

      {/* Workspace Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-black font-mono text-cyan-400">
              مساحة المراجعة — {requestData.request_number}
            </h1>
            <PurchaseRequestStatusBadge status={requestData.status} />
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {requestData.department && `القسم: ${requestData.department.name}`}
            {requestData.requester && ` • مقدم الطلب: ${requestData.requester.name}`}
          </p>
        </div>

        <Card className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3 text-xs border-cyan-900/50 bg-cyan-950/10">
          <div><div className="text-[10px] text-slate-400 font-semibold">القسم المستهدف</div><div className="mt-1 font-bold text-cyan-300">{requestData.target_department?.name || requestData.department?.name || 'غير محدد'}</div></div>
          <div><div className="text-[10px] text-amber-400 font-semibold">تاريخ الاحتياج ⏳</div><div className="mt-1 font-mono font-bold text-amber-300">{requestData.date_needed || 'غير محدد'}</div></div>
          <div><div className="text-[10px] text-slate-400 font-semibold">مدير القسم</div><div className="mt-1 font-bold text-slate-200">{requestData.target_department?.manager?.name || 'غير محدد'}</div></div>
          <div><div className="text-[10px] text-slate-400 font-semibold">مسؤول الاستلام بالموقع</div><div className="mt-1 font-bold text-emerald-300">{requestData.site_engineer?.name || 'يحدده المراجع عند الاعتماد'}</div></div>
          <div>
            <div className="text-[10px] text-slate-400 font-semibold">استلام المخزن (عم سلامة)</div>
            <div className="mt-1 font-bold">
              {requestData.requires_warehouse_receipt !== false ? (
                <span className="text-emerald-400 text-[11px] font-bold">✅ يمر على المخزن</span>
              ) : (
                <span className="text-amber-400 text-[11px] font-bold">⚡ توريد مباشر</span>
              )}
            </div>
          </div>
          <div><div className="text-[10px] text-slate-400 font-semibold">رقم قطعة الأرض</div><div className="mt-1 font-mono font-bold text-amber-300">{requestData.parcel_reference || requestData.items?.[0]?.item_reference || 'غير محدد'}</div></div>
          <div><div className="text-[10px] text-slate-400 font-semibold">المنطقة</div><div className="mt-1 font-bold text-slate-200">{requestData.region || requestData.items?.[0]?.region || 'غير محددة'}</div></div>
        </Card>

        {/* Responsive Action Bar: Sticky bottom on mobile, inline header on desktop */}
        <div className="fixed bottom-0 inset-x-0 z-30 flex items-center justify-between gap-2 border-t border-slate-800 bg-slate-900/95 p-3 shadow-2xl backdrop-blur md:static md:z-auto md:flex md:w-auto md:justify-start md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-none">
          {requestData.status === 'SUBMITTED' && hasPermission('purchase_request.review') && (
            <Button
              variant="primary"
              size="md"
              onClick={handleStartReview}
              isLoading={isMutating}
              className="flex-1 md:flex-none min-h-10 text-xs font-bold md:text-sm"
            >
              بدء المراجعة
            </Button>
          )}

          {!isFinalized && hasPermission('purchase_request.approve') && (
            <Button
              variant="success"
              size="md"
              onClick={handleDirectApprove}
              isLoading={isMutating}
              className="flex-1 md:flex-none min-h-10 text-xs font-black md:text-sm shadow-lg shadow-emerald-950/50"
              title="اعتماد الطلب فوراً بخطوة واحدة"
            >
              اعتماد الطلب
            </Button>
          )}

          {isUnderReview && !isFinalized && hasPermission('purchase_request.reject') && (
            <Button
              variant="danger"
              size="md"
              onClick={() => setIsRejectModalOpen(true)}
              disabled={isMutating}
              className="flex-1 md:flex-none min-h-10 text-xs font-bold md:text-sm"
            >
              رفض الطلب
            </Button>
          )}

          <Link to="/reviewer/requests" className="flex-1 md:flex-none">
            <Button variant="secondary" size="md" className="w-full md:w-auto min-h-10 text-xs md:text-sm">← قائمة الطلبات</Button>
          </Link>
        </div>
      </div>

      {/* Editable Header */}
      <Card>
        <form onSubmit={handleSaveHeader} className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <span>📝</span> تعديل معلومات الطلب
            </h3>
            {canEdit && (
              <Button type="submit" variant="primary" size="sm" isLoading={isMutating}>
                حفظ
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <FormField label="تاريخ الاحتياج">
              <Input type="date" disabled={!canEdit} value={headerDateNeeded} onChange={e => setHeaderDateNeeded(e.target.value)} />
            </FormField>
            <FormField label="ملاحظات">
              <Input type="text" disabled={!canEdit} value={headerNotes} onChange={e => setHeaderNotes(e.target.value)} />
            </FormField>
          </div>
        </form>
      </Card>

      {/* Line البنود Table */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <span>📦</span> تعديل بنود الطلب({requestData.items?.length || 0})
          </h3>
          {canEdit && (
            <Button type="button" variant="secondary" size="sm" onClick={() => setIsAddModalOpen(true)} disabled={isMutating}>
              + إضافة بند
            </Button>
          )}
        </div>
        <div className="hidden min-w-0 md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>رقم قطعة الأرض</TableHead>
                <TableHead>وصف العنصر</TableHead>
                <TableHead>المنطقة</TableHead>
                <TableHead>الكمية</TableHead>
                <TableHead>الوحدة</TableHead>
                {!isFinalized && <TableHead className="text-center">إجراء</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {requestData.items?.map((item, index) => (
                <TableRow key={item.id}>
                  <TableCell className="font-bold text-slate-400">{index + 1}</TableCell>
                  <TableCell className="min-w-[140px]">
                    <Input
                      type="text"
                      disabled={!canEdit}
                      defaultValue={item.item_reference || ''}
                      onBlur={e => {
                        if (e.target.value !== (item.item_reference || '')) {
                          handleUpdateItem(item.id, 'item_reference', e.target.value);
                        }
                      }}
                      className="py-1 px-2 text-xs font-mono"
                      dir="ltr"
                      required
                    />
                  </TableCell>
                  <TableCell className="font-bold text-slate-100 min-w-[200px]">
                    <Input
                      type="text"
                      disabled={!canEdit}
                      defaultValue={item.item_description}
                      onBlur={e => {
                        if (e.target.value !== item.item_description) {
                          handleUpdateItem(item.id, 'item_description', e.target.value);
                        }
                      }}
                      className="py-1 px-2 text-xs"
                    />
                  </TableCell>
                  <TableCell className="min-w-[170px]">
                    <Input
                      type="text"
                      disabled={!canEdit}
                      defaultValue={item.region || ''}
                      onBlur={e => {
                        if (e.target.value !== (item.region || '')) {
                          handleUpdateItem(item.id, 'region', e.target.value);
                        }
                      }}
                      className="py-1 px-2 text-xs"
                      placeholder="المنطقة"
                      required
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      disabled={!canEdit}
                      defaultValue={parseFloat(item.quantity)}
                      onFocus={e => e.target.select()}
                      onBlur={e => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val) && val > 0 && val !== parseFloat(item.quantity)) {
                          handleUpdateItem(item.id, 'quantity', val);
                        }
                      }}
                      className="w-20 text-center py-1 px-2 font-mono text-xs"
                    />
                  </TableCell>
                  <TableCell className="text-slate-400">{getUnitLabel(item.uom)}</TableCell>
                  {!isFinalized && (
                    <TableCell className="text-center">
                      {canEdit && (
                        <Button type="button" variant="danger" size="sm"
                          onClick={() => handleDeleteItem(item.id)}
                          disabled={isMutating}
                          className="px-2 py-0.5 text-[10px]">
                          حذف
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="space-y-3 md:hidden">
          {requestData.items?.map((item, index) => (
            <article key={`mobile-review-item-${item.id}`} className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
              <div className="flex min-w-0 items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <span className="shrink-0 rounded-md bg-slate-800 px-2 py-1 text-[11px] font-bold text-slate-300">
                  بند {index + 1}
                </span>
                <span className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-300">
                  الوحدة: <strong className="text-slate-100">{getUnitLabel(item.uom)}</strong>
                </span>
              </div>

              <div className="mt-3 space-y-3 text-xs">
                <div>
                  <label className="mb-1 block text-slate-400 font-medium">رقم قطعة الأرض</label>
                  <Input
                    type="text"
                    disabled={!canEdit}
                    defaultValue={item.item_reference || ''}
                    onBlur={e => {
                      if (e.target.value !== (item.item_reference || '')) {
                        handleUpdateItem(item.id, 'item_reference', e.target.value);
                      }
                    }}
                    className="h-10 w-full px-3 text-xs font-mono"
                    dir="ltr"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-slate-400 font-medium">وصف العنصر</label>
                  <Input
                    type="text"
                    disabled={!canEdit}
                    defaultValue={item.item_description}
                    onBlur={e => {
                      if (e.target.value !== item.item_description) {
                        handleUpdateItem(item.id, 'item_description', e.target.value);
                      }
                    }}
                    className="h-10 w-full px-3 text-xs"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-slate-400 font-medium">المنطقة</label>
                    <Input
                      type="text"
                      disabled={!canEdit}
                      defaultValue={item.region || ''}
                      onBlur={e => {
                        if (e.target.value !== (item.region || '')) {
                          handleUpdateItem(item.id, 'region', e.target.value);
                        }
                      }}
                      className="h-10 w-full px-3 text-xs"
                      placeholder="المنطقة"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-slate-400 font-medium">الكمية</label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      disabled={!canEdit}
                      defaultValue={parseFloat(item.quantity)}
                      onFocus={e => e.target.select()}
                      onBlur={e => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val) && val > 0 && val !== parseFloat(item.quantity)) {
                          handleUpdateItem(item.id, 'quantity', val);
                        }
                      }}
                      className="h-10 w-full px-3 font-mono text-xs"
                    />
                  </div>
                </div>
              </div>

              {!isFinalized && canEdit && (
                <div className="mt-4 border-t border-slate-800/80 pt-3">
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => handleDeleteItem(item.id)}
                    disabled={isMutating}
                    className="w-full whitespace-nowrap min-h-10"
                  >
                    حذف هذا البند
                  </Button>
                </div>
              )}
            </article>
          ))}
        </div>
      </Card>

      <UnifiedNotesCard request={requestData} />

      {/* Modals */}
      <AddReviewItemDialog
        isOpen={isAddModalOpen}
        isAdding={isMutating}
        defaultParcelReference={requestData.parcel_reference || requestData.items?.[0]?.item_reference || ''}
        defaultRegion={requestData.region || requestData.items?.[0]?.region || ''}
        onConfirm={handleAddItem}
        onCancel={() => setIsAddModalOpen(false)}
      />
      <ApproveRequestDialog
        isOpen={isApproveModalOpen}
        requestNumber={requestData.request_number}
        initialSiteEngineerId={requestData.site_engineer?.id || requestData.site_engineer_user_id || requestData.target_department?.site_engineer?.id || null}
        initialRequiresWarehouseReceipt={requestData.requires_warehouse_receipt ?? true}
        isApproving={isMutating}
        onConfirm={handleApprove}
        onCancel={() => setIsApproveModalOpen(false)}
      />
      <RejectRequestDialog
        isOpen={isRejectModalOpen}
        requestNumber={requestData.request_number}
        isRejecting={isMutating}
        onConfirm={handleReject}
        onCancel={() => setIsRejectModalOpen(false)}
      />
    </div>
  );
};

export default ReviewPurchaseRequestPage;
