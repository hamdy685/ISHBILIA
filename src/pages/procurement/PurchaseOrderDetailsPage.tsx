import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getPurchaseOrderApi, submitPurchaseOrderApi } from '../../api/purchaseOrders';
import { PurchaseOrder } from '../../types/purchaseOrder';
import PurchaseOrderStatusBadge from '../../components/procurement/PurchaseOrderStatusBadge';
import PurchaseOrderPrintModal from '../../components/procurement/PurchaseOrderPrintModal';
import ThreeWayMatchPrintModal from '../../components/accounting/ThreeWayMatchPrintModal';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import { useAuth } from '../../context/AuthContext';
import { parseApiError } from '../../utils/apiError';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table';
import { CurrencyDisplay } from '../../components/ui/CurrencyDisplay';
import { getUnitLabel } from '../../utils/units';
import SystemEventTimeline from '../../components/ui/SystemEventTimeline';
import { UnifiedNotesCard } from '../../components/common/UnifiedNotesCard';
import { SupplementItemBadge } from '../../components/common/SupplementItemBadge';
import { isActualPurchaseOrder, getActualPoLineItems, calculateActualPoGrandTotal } from '../../utils/actualPo';

export const PurchaseOrderDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);
  const [isCyclePrintModalOpen, setIsCyclePrintModalOpen] = useState<boolean>(false);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { hasPermission } = useAuth();

  const isActual = React.useMemo(() => isActualPurchaseOrder(po), [po]);
  const displayedItems = React.useMemo(() => getActualPoLineItems(po), [po]);
  const displayedGrandTotal = React.useMemo(() => calculateActualPoGrandTotal(displayedItems, po?.grand_total), [displayedItems, po?.grand_total]);

  const loadPo = async (): Promise<PurchaseOrder | null> => {
    if (!id) return null;
    setLoading(true);
    setError(null);
    try {
      const data = await getPurchaseOrderApi(parseInt(id, 10));
      setPo(data);
      return data;
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      setError(parsed.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPo();
  }, [id]);

  if (loading) {
    return <LoadingSpinner message="جاري تفاصيل أمر الشراء..." />;
  }

  if (!po) {
    return (
      <div className="p-8 text-center bg-slate-900/40 border border-slate-800 text-slate-400 text-xs rounded-xl" dir="rtl">
        لم يتم العثور على أمر الشراء المطلوب.
      </div>
    );
  }

  const isPendingActual = po.status === 'PENDING_ACTUAL_PO';
  const isDraftOrReturned = ['PO_DRAFT', 'RETURNED_TO_PROCUREMENT'].includes(po.status);
  const isEditable = po.status !== 'REJECTED';

  const handleSubmitToAccounting = async () => {
    if (submitting) return;
    if (!confirm('هل أنت متأكد من تعميد وإرسال أمر الشراء للاستلام والتوريد؟')) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitPurchaseOrderApi(po.id);
      await loadPo();
      setSuccessMessage('✅ تم تعميد وإرسال أمر الشراء للاستلام والتوريد بنجاح.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      if (err?.code === 'ECONNABORTED' || err?.message?.includes('timeout')) {
        setError('جاري التحقق من حالة أمر الشراء...');
        try {
          const reloaded = await loadPo();
          if (reloaded?.status === 'ISSUED') {
            setError(null);
            setSuccessMessage('✅ تم تعميد وإرسال أمر الشراء للاستلام والتوريد بنجاح.');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
          }
        } catch {
          // ignore
        }
      }
      const parsed = parseApiError(err);
      setError(parsed.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="procurement-reference-page space-y-3.5 pb-24 md:pb-6 animate-fade-in" dir="rtl">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-3 space-x-reverse">
            <h1 className="text-2xl font-black text-slate-100 font-mono">{po.po_number}</h1>
            <PurchaseOrderStatusBadge status={po.status} />
          </div>
          <p className="text-xs text-slate-400 mt-1">
            تفاصيل أمر الشراء، السجلات المالية، وبنود التوريد المعتمدة
          </p>
        </div>

        {/* Responsive Actions: Sticky bottom on mobile, inline in header on desktop */}
        <div className="fixed bottom-0 inset-x-0 z-30 flex items-center justify-between gap-2 border-t border-slate-800 bg-slate-900/95 p-3 shadow-2xl backdrop-blur md:static md:z-auto md:flex md:w-auto md:justify-start md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-none">
          {isPendingActual && hasPermission('purchase_order.edit') && (
            <Link to={`/procurement/purchase-orders/${po.id}/edit`} className="flex-1 md:flex-none">
              <Button variant="primary" size="md" className="w-full md:w-auto min-h-10 text-xs font-black bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 hover:from-amber-500 hover:to-orange-500 text-white shadow-lg shadow-amber-950/50 border border-amber-400/50">
                ⚡ إنشاء أمر الشراء الفعلي
              </Button>
            </Link>
          )}

          {isEditable && hasPermission('purchase_order.edit') && (
            <Link to={`/procurement/purchase-orders/${po.id}/edit`} className="flex-1 md:flex-none">
              <Button variant="warning" size="md" className="w-full md:w-auto min-h-10 text-xs bg-amber-950/60 text-amber-300 border-amber-800/60 hover:bg-amber-900/60">
                ✏️ تعديل أمر الشراء
              </Button>
            </Link>
          )}

          {isDraftOrReturned && hasPermission('purchase_order.edit') && (
            <Button
              variant="primary"
              size="md"
              onClick={handleSubmitToAccounting}
              isLoading={submitting}
              className="flex-1 md:flex-none min-h-10 text-xs font-bold"
            >
              {po.status === 'RETURNED_TO_PROCUREMENT' ? 'إعادة الإرسال للاستلام' : 'إرسال إلى الاستلام والمخزن'}
            </Button>
          )}

          <Button
            variant="secondary"
            size="md"
            onClick={() => setIsPrintModalOpen(true)}
            className="flex-1 md:flex-none min-h-10 text-xs"
          >
            🖨️ معاينة PO
          </Button>

          <Button
            variant="ghost"
            size="md"
            onClick={() => setIsCyclePrintModalOpen(true)}
            className="flex-1 md:flex-none min-h-10 text-xs text-cyan-300 border border-slate-700 hover:bg-slate-800 font-bold"
          >
            🖨️ طباعة الدورة (3 في 1)
          </Button>
        </div>
      </div>

      {successMessage && (
        <div className="rounded-xl border border-emerald-500/50 bg-emerald-950/40 p-3.5 text-xs text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>✅</span>
            <span className="font-bold">{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-400 hover:text-white cursor-pointer font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {error && <ErrorMessage error={error} />}

      {/* ── Actual PO Callout Banner ── */}
      {isPendingActual && (
        <div className="rounded-2xl border-2 border-indigo-500/50 bg-gradient-to-r from-indigo-950/40 via-slate-900 to-slate-950 p-5 shadow-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="text-3xl">📦</span>
            <div>
              <h3 className="text-sm font-black text-indigo-300">
                إذن الاستلام معتمد — بانتظار إصدار أمر الشراء الفعلي (Actual PO)
              </h3>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                تم اعتماد الاستلام في الموقع من قبل أمين المخزن ومهندس الموقع. يرجى مراجعة البنود ومطابقة الكميات والأسعار الفعلية لإصدار الأمر الفعلي النهائي وإرساله للإدارة المالية.
              </p>
            </div>
          </div>
          <Link to={`/procurement/purchase-orders/${po.id}/edit`}>
            <Button variant="primary" size="md" className="whitespace-nowrap font-black bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white shadow-lg">
              ⚡ مراجعة وإصدار الأمر الفعلي ←
            </Button>
          </Link>
        </div>
      )}

      {/* ── Finalized Actual PO Banner (if already finalized) ── */}
      {po.finalized_at && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-3.5 flex items-center justify-between gap-3 text-xs text-emerald-300">
          <div className="flex items-center gap-2">
            <span>✅</span>
            <span>
              تم إصدار هذا الأمر كـ <strong>أمر شراء فعلي</strong> بتاريخ{' '}
              <strong className="font-mono">{po.finalized_at.slice(0, 10)}</strong>
              {po.finalized_by?.name ? ` بواسطة ${po.finalized_by.name}` : ''}
              {po.finalization_notes ? ` — ملاحظات: ${po.finalization_notes}` : ''}
            </span>
          </div>
        </div>
      )}

      {/* ── Supplement Items Callout Banner ── */}
      {po.items?.some((i) => i.is_supplementary) && (
        <div className="rounded-2xl border-2 border-amber-500/80 bg-gradient-to-r from-amber-950/70 via-slate-900 to-amber-950/50 p-5 shadow-2xl text-amber-200 space-y-2">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 border border-amber-500/50 text-amber-300 text-xl font-black shadow-inner">
              ⚡
            </span>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-base font-black text-amber-300">
                  يتضمن أمر الشراء بنود كمالة إضافية معتمدة
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-500 text-slate-950 shadow-sm">
                  {po.items.filter((i) => i.is_supplementary).length} بند كمالة
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                تمت إضافة واعتماد بنود كمالة إضافية على هذا الأمر بموجب طلب كمالة معتمد من رئيس القسم/المشروع.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Metadata Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
        
        {/* المورد Info */}
        <Card className="space-y-2">
          <div className="font-bold text-slate-200 border-b border-slate-800 pb-2 flex justify-between">
            <span>بيانات المورد</span>
            <span className="font-mono text-cyan-400">{po.supplier?.code}</span>
          </div>
          <div className="flex justify-between"><span className="text-slate-400">اسم الشركة:</span><span className="font-bold text-slate-200">{po.supplier?.company_name || 'غير محدد'}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">رقم الهاتف:</span><span className="text-slate-300 font-mono" dir="ltr">{po.supplier?.phone || 'غير متاح'}</span></div>
        </Card>

        {/* PR التفاصيل والتكلفة */}
        <Card className="space-y-2">
          <div className="font-bold text-slate-200 border-b border-slate-800 pb-2">طلب الشراء والتكلفة</div>
          <div className="flex justify-between"><span className="text-slate-400">طلب الشراء:</span><span className="font-mono font-bold text-cyan-400">{po.purchase_request?.request_number || 'أمر مباشر Direct'}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">القسم:</span><span className="text-slate-200 font-bold">{po.department?.name || po.purchase_request?.department?.name || 'إدارة المشتريات'}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">صاحب الطلب:</span><span className="text-slate-200 font-bold">{po.requested_by?.name || po.purchase_request?.requester?.name || '—'}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">رئيس القسم المعتمد:</span><span className="text-emerald-300 font-bold">{po.department_approver?.name || po.purchase_request?.assigned_reviewer?.name || '—'}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">منشئ أمر الشراء:</span><span className="text-slate-200 font-bold">{po.created_by?.name || '—'}</span></div>
        </Card>

        {/* Commercial Terms */}
        <Card className="space-y-2">
          <div className="font-bold text-slate-200 border-b border-slate-800 pb-2">الشروط التجارية والفترة</div>
          <div className="flex justify-between"><span className="text-slate-400">شروط الدفع:</span><span className="text-slate-200 font-bold">{po.payment_terms || 'حسب الاتفاق'}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">تاريخ التوريد:</span><span className="font-mono text-slate-300">{po.delivery_date || 'فور الاعتماد'}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">كود الميزانية:</span><span className="font-mono text-slate-300">{po.budget_code || '—'}</span></div>
        </Card>
      </div>

      {po.financial_notes && (
        <div className="p-4 bg-amber-950/40 border border-amber-800/80 rounded-xl text-amber-300 text-xs font-semibold shadow-lg">
          <span className="font-bold">ملاحظات مالية من الحسابات:</span> {po.financial_notes}
        </div>
      )}

      {/* البنود Commercial Table */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between pb-1">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
            {isActual ? 'بنود أمر الشراء الفعلي المستلمة بالموقع' : 'بنود أمر الشراء المعتمدة والتكاليف التفصيلية'}
          </h3>
          {isActual && (
            <span className="text-[11px] font-bold text-emerald-400 bg-emerald-950/70 border border-emerald-500/40 px-2.5 py-0.5 rounded-full">
              عزل بنود الاستلام الفعلي فقط
            </span>
          )}
        </div>

        <div className="hidden min-w-0 md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>رقم قطعة الأرض</TableHead>
                <TableHead>المنطقة</TableHead>
                <TableHead>البند / الوصف</TableHead>
                <TableHead>الكمية</TableHead>
                <TableHead>سعر الوحدة</TableHead>
                <TableHead>الإجمالي النهائي</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayedItems.map((item, idx) => (
                <TableRow key={item.id || idx}>
                  <TableCell className="font-mono text-slate-400">{idx + 1}</TableCell>
                  <TableCell className="font-mono text-slate-300">{item.item_reference || '—'}</TableCell>
                  <TableCell className="text-slate-300">{item.region || '—'}</TableCell>
                  <TableCell className="font-bold text-slate-100">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span>{item.item_name || item.item_description}</span>
                      <SupplementItemBadge
                        isSupplementary={item.is_supplementary}
                        batchNumber={item.supplement_batch}
                      />
                    </div>
                    {item.specifications && <div className="text-[10px] text-slate-400 mt-0.5 font-normal">{item.specifications}</div>}
                  </TableCell>
                  <TableCell className="font-mono text-slate-200">{item.quantity} {getUnitLabel(item.uom)}</TableCell>
                  <TableCell>
                    <CurrencyDisplay amount={item.unit_price} amountClassName="font-mono text-slate-200" />
                  </TableCell>
                  <TableCell>
                    <CurrencyDisplay amount={item.line_total} amountClassName="font-mono font-bold text-cyan-400" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="space-y-3 md:hidden">
          {displayedItems.map((item, idx) => (
            <article key={`mobile-po-item-${item.id || idx}`} className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <span className="shrink-0 rounded-md bg-slate-800 px-2 py-1 text-[11px] font-bold text-slate-300">
                  بند {idx + 1}
                </span>
                <span className="min-w-0 break-normal font-mono text-sm font-black text-cyan-300">
                  {item.item_reference || 'بدون رقم قطعة'}
                </span>
              </div>
              <dl className="mt-4 grid min-w-0 grid-cols-1 gap-3 text-xs min-[420px]:grid-cols-2">
                <div className="min-w-0 min-[420px]:col-span-2">
                  <dt className="text-slate-500">البند / الوصف</dt>
                  <dd className="mt-1 break-normal font-bold leading-6 text-slate-100 flex items-center gap-2 flex-wrap">
                    <span>{item.item_name || item.item_description || 'غير محدد'}</span>
                    <SupplementItemBadge
                      isSupplementary={item.is_supplementary}
                      batchNumber={item.supplement_batch}
                    />
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">المنطقة</dt>
                  <dd className="mt-1 break-normal text-slate-300">{item.region || 'غير محددة'}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">الكمية والوحدة</dt>
                  <dd className="mt-1 whitespace-nowrap font-mono text-slate-200">
                    {item.quantity} {getUnitLabel(item.uom)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">سعر الوحدة</dt>
                  <dd className="mt-1 whitespace-nowrap">
                    <CurrencyDisplay amount={item.unit_price} amountClassName="font-mono text-slate-200" />
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">الإجمالي النهائي</dt>
                  <dd className="mt-1 whitespace-nowrap">
                    <CurrencyDisplay amount={item.line_total} amountClassName="font-mono font-bold text-cyan-400" />
                  </dd>
                </div>
                {item.specifications && (
                  <div className="min-[420px]:col-span-2">
                    <dt className="text-slate-500">المواصفات</dt>
                    <dd className="mt-1 break-normal text-slate-300 leading-6">{item.specifications}</dd>
                  </div>
                )}
              </dl>
            </article>
          ))}
        </div>

        {/* Financial Recalculated Totals */}
        <div className="flex justify-end pt-3 border-t border-slate-800">
          <div className="w-full sm:w-80 bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 text-xs">
            <div className="flex justify-between items-center text-sm font-black text-cyan-400">
              <span>الإجمالي الكلي:</span>
              <CurrencyDisplay amount={po.grand_total || 0} amountClassName="font-mono text-lg font-black text-cyan-400" />
            </div>
          </div>
        </div>
      </Card>

      <UnifiedNotesCard purchaseOrder={po} />

      <SystemEventTimeline entity="purchase_order" entityId={po.id} />

      {/* طباعة Preview Modal */}
      <PurchaseOrderPrintModal
        po={po}
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
      />

      <ThreeWayMatchPrintModal
        po={po}
        isOpen={isCyclePrintModalOpen}
        onClose={() => setIsCyclePrintModalOpen(false)}
      />
    </div>
  );
};

export default PurchaseOrderDetailsPage;
