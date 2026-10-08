import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getGeneralManagerPurchaseOrderApi } from '../../api/generalManager';
import Badge from '../../components/procurement/PurchaseOrderStatusBadge';
import { PurchaseOrder } from '../../types/purchaseOrder';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table';
import { CurrencyDisplay } from '../../components/ui/CurrencyDisplay';
import { getUnitLabel } from '../../utils/units';
import PrintablePO from '../../components/procurement/PrintablePO';
import ThreeWayMatchPrintModal from '../../components/accounting/ThreeWayMatchPrintModal';
import { UnifiedNotesCard } from '../../components/common/UnifiedNotesCard';
import { formatCleanNumber, formatCleanQty } from '../../utils/numberFormat';
import { formatRebarDisplay, extractRebarInfo } from '../../utils/rebar';
import { isActualPurchaseOrder, getActualPoLineItems, calculateActualPoGrandTotal } from '../../utils/actualPo';

export const GeneralManagerPurchaseOrderDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [printPo, setPrintPo] = useState<PurchaseOrder | null>(null);
  const [cyclePrintPo, setCyclePrintPo] = useState<PurchaseOrder | null>(null);

  const load = () => {
    if (id) {
      getGeneralManagerPurchaseOrderApi(parseInt(id, 10))
        .then(setPo)
        .finally(() => setLoading(false));
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  if (loading) {
    return <div className="text-cyan-400 animate-pulse text-xs p-6" dir="rtl">جاري تحميل بيانات أمر الشراء...</div>;
  }

  if (!po) {
    return <div className="text-rose-400 text-xs p-6" dir="rtl">لم يتم العثور على أمر الشراء.</div>;
  }

  const handleExportJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(po, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `PO_GM_${po.po_number}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const isActual = isActualPurchaseOrder(po);
  const displayedItems = getActualPoLineItems(po);
  const displayedGrandTotal = calculateActualPoGrandTotal(po);

  return (
    <div className="space-y-6 pb-24 md:pb-0 animate-fade-in" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-bold font-mono text-cyan-400">
            {po.po_number}
          </h1>
          <Badge status={po.status} />
          {isActual && (
            <span className="bg-cyan-950 text-cyan-400 border border-cyan-800/80 px-2.5 py-1 rounded text-xs font-bold flex items-center gap-1">
              ✨ أمر شراء فعلي (معزول للبنود المستلمة فقط)
            </span>
          )}
          <span className="bg-emerald-950 text-emerald-400 border border-emerald-800/80 px-2.5 py-1 rounded text-xs font-bold">
            EGP / ج.م
          </span>
          <span className="bg-blue-900/40 text-blue-300 border border-blue-700/50 px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1">
            👑 للاطلاع الإداري التنفيذي (Read-Only)
          </span>
        </div>
        {/* Responsive Actions: Sticky bottom on mobile, inline in header on desktop */}
        <div className="fixed bottom-0 inset-x-0 z-30 flex items-center justify-between gap-2 border-t border-slate-800 bg-slate-900/95 p-3 shadow-2xl backdrop-blur md:static md:z-auto md:flex md:w-auto md:justify-start md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-none">
          <button
            onClick={() => setPrintPo(po)}
            className="flex-1 md:flex-none min-h-10 md:min-h-0 px-3 py-2 md:py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg md:rounded text-xs font-bold transition-colors flex items-center justify-center gap-1 shadow-lg md:shadow-none shadow-emerald-950/50"
          >
            🖨️ طباعة PO
          </button>
          <button
            onClick={() => setCyclePrintPo(po)}
            className="flex-1 md:flex-none min-h-10 md:min-h-0 px-3 py-2 md:py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded-lg md:rounded text-xs font-bold transition-colors flex items-center justify-center gap-1"
          >
            🖨️ طباعة الدورة (3 في 1)
          </button>
          <button
            onClick={handleExportJson}
            className="flex-1 md:flex-none min-h-10 md:min-h-0 px-3 py-2 md:py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg md:rounded text-xs font-semibold transition-colors flex items-center justify-center gap-1"
          >
            📥 تصدير البيانات
          </button>
          <Link to="/general-manager/purchase-orders" className="flex-1 md:flex-none">
            <Button variant="secondary" size="md" className="w-full md:w-auto min-h-10 md:min-h-0 text-xs">
              &rarr; العودة للقائمة
            </Button>
          </Link>
        </div>
      </div>

      {/* Metadata */}
      <Card className="space-y-3 text-xs">
        <h3 className="text-xs font-bold text-slate-200 border-b border-slate-800 pb-2">🏢 تفاصيل الطلب والجهة المعنية</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-slate-300">
          <div>
            <strong className="text-slate-400 block mb-0.5">المورد:</strong>
            <span className="font-semibold text-cyan-300">{po.supplier?.company_name || 'شراء مباشر'}</span>
          </div>
          <div>
            <strong className="text-slate-400 block mb-0.5">طلب الشراء المرتبط:</strong>
            {po.purchase_request_id
              ? (po.purchase_request?.request_number || `#PR-${po.purchase_request_id}`)
              : '—'}
          </div>
          <div>
            <strong className="text-slate-400 block mb-0.5">القسم:</strong>
            <span>{po.purchase_request?.department?.name || '—'}</span>
          </div>
          <div>
            <strong className="text-slate-400 block mb-0.5">مُقدِّم الطلب الأصلي:</strong>
            <span>{po.purchase_request?.requester?.name || '—'}</span>
          </div>
          <div>
            <strong className="text-slate-400 block mb-0.5">رئيس القسم المعتمد:</strong>
            <span className="font-semibold text-emerald-300">{po.department_approver?.name || po.purchase_request?.assigned_reviewer?.name || '—'}</span>
          </div>
          <div>
            <strong className="text-slate-400 block mb-0.5">مسؤول المشتريات المصدر:</strong>
            <span>{po.created_by?.name || '—'}</span>
          </div>
          <div>
            <strong className="text-slate-400 block mb-0.5">تاريخ الإصدار:</strong>
            <span>{po.created_at ? new Date(po.created_at).toLocaleDateString('ar-EG') : '—'}</span>
          </div>
        </div>
      </Card>

      {/* Line البنود */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-200">📦 بنود أمر الشراء</h3>
        <div className="hidden min-w-0 md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>رقم قطعة الأرض</TableHead>
                <TableHead>المنطقة</TableHead>
                <TableHead>اسم الصنف</TableHead>
                <TableHead>المواصفات</TableHead>
                <TableHead>الوحدة</TableHead>
                <TableHead>الكمية</TableHead>
                <TableHead>سعر الوحدة (ج.م)</TableHead>
                <TableHead>الإجمالي (ج.م)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayedItems?.map((item, index) => (
                <TableRow key={item.id || index}>
                  <TableCell className="text-slate-400 font-bold">{index + 1}</TableCell>
                  <TableCell className="font-mono text-slate-300">{item.item_reference || '—'}</TableCell>
                  <TableCell className="text-slate-300">{item.region || '—'}</TableCell>
                  <TableCell className="font-bold text-slate-100">{item.item_name || item.item_description}</TableCell>
                  <TableCell className="text-slate-400 text-[11px]">{item.specifications || '-'}</TableCell>
                  <TableCell className="text-slate-300">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span>{getUnitLabel(item.uom)}</span>
                      {extractRebarInfo(item.specifications) && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono font-medium">
                          ({extractRebarInfo(item.specifications)?.barCount} سيخ {extractRebarInfo(item.specifications)?.linia})
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono">{formatCleanQty(item.quantity)}</TableCell>
                  <TableCell>
                    <CurrencyDisplay amount={item.unit_price} amountClassName="font-mono text-slate-200" />
                  </TableCell>
                  <TableCell>
                    <CurrencyDisplay amount={item.line_total} amountClassName="font-mono font-bold text-emerald-400" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="space-y-3 md:hidden">
          {displayedItems?.map((item, index) => (
            <article key={`mobile-gm-po-item-${item.id || index}`} className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <span className="shrink-0 rounded-md bg-slate-800 px-2 py-1 text-[11px] font-bold text-slate-300">
                  بند {index + 1}
                </span>
                <span className="min-w-0 break-normal font-mono text-sm font-black text-cyan-300">
                  {item.item_reference || 'بدون رقم قطعة'}
                </span>
              </div>
              <dl className="mt-4 grid min-w-0 grid-cols-1 gap-3 text-xs min-[420px]:grid-cols-2">
                <div className="min-w-0 min-[420px]:col-span-2">
                  <dt className="text-slate-500">اسم الصنف</dt>
                  <dd className="mt-1 break-normal font-bold leading-6 text-slate-100">
                    {item.item_name || item.item_description || 'غير محدد'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">المنطقة</dt>
                  <dd className="mt-1 break-normal text-slate-300">{item.region || 'غير محددة'}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">الكمية والوحدة</dt>
                  <dd className="mt-1 whitespace-nowrap font-mono text-slate-200">
                    {formatRebarDisplay(item.quantity, item.uom, item.specifications) || `${formatCleanQty(item.quantity)} ${getUnitLabel(item.uom)}`}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">سعر الوحدة</dt>
                  <dd className="mt-1 whitespace-nowrap">
                    <CurrencyDisplay amount={item.unit_price} amountClassName="font-mono text-slate-200" />
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">إجمالي البند</dt>
                  <dd className="mt-1 whitespace-nowrap">
                    <CurrencyDisplay amount={item.line_total} amountClassName="font-mono font-bold text-emerald-400" />
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
      </div>

      {/* Financial Summary */}
      <div className="flex justify-end">
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 w-full max-w-xs text-xs">
          <div className="flex justify-between items-center text-slate-400">
            <span>إجمالي البنود:</span>
            <span className="font-mono font-bold text-slate-200">{formatCleanNumber(displayedGrandTotal)} ج.م</span>
          </div>
          <div className="flex justify-between items-center text-slate-400">
            
            <span className="font-mono text-slate-500"></span>
          </div>
          <div className="border-t border-slate-800 pt-2 flex justify-between items-center font-bold text-sm">
            <span className="text-cyan-400">المبلغ الكلي المعتمد:</span>
            <span className="font-mono text-emerald-400">{formatCleanNumber(displayedGrandTotal)} ج.م</span>
          </div>
        </div>
      </div>

      <UnifiedNotesCard purchaseOrder={po} />

      {/* Printable PO Modal */}
      {printPo && (
        <PrintablePO po={printPo} onClose={() => setPrintPo(null)} />
      )}

      {cyclePrintPo && (
        <ThreeWayMatchPrintModal po={cyclePrintPo} isOpen={true} onClose={() => setCyclePrintPo(null)} />
      )}
    </div>
  );
};

export default GeneralManagerPurchaseOrderDetailsPage;
