import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { getAccountingPurchaseOrderApi } from '../../api/accounting';
import { getPurchaseReceiptByIdApi, getReceiptPhotoUrl } from '../../api/purchaseReceipts';
import Badge from '../../components/procurement/PurchaseOrderStatusBadge';
import { PurchaseOrder, LinkedReceiptSummary } from '../../types/purchaseOrder';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table';
import { CurrencyDisplay } from '../../components/ui/CurrencyDisplay';
import { getUnitLabel } from '../../utils/units';
import PrintablePO from '../../components/procurement/PrintablePO';
import { UnifiedNotesCard } from '../../components/common/UnifiedNotesCard';
import { Modal } from '../../components/ui/Modal';
import { useAuth } from '../../context/AuthContext';
import { SupplementItemBadge } from '../../components/common/SupplementItemBadge';

export const AccountingPurchaseOrderDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const queryReceiptId = Number(searchParams.get('receipt_id') || 0);

  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [extraReceipts, setExtraReceipts] = useState<LinkedReceiptSummary[]>([]);
  const [printPo, setPrintPo] = useState<PurchaseOrder | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<{ url: string; title: string } | null>(null);
  const { hasRole } = useAuth();
  const isDepartmentAccountant = hasRole('site_accountant') || hasRole('licenses_accountant') || hasRole('buffet_accountant');
  const isFinancialDirector = hasRole('accountant') && !isDepartmentAccountant && !hasRole('admin');

  const load = async () => {
    if (!id) return;
    try {
      const poData = await getAccountingPurchaseOrderApi(parseInt(id, 10));
      setPo(poData);

      // If queryReceiptId is specified and not present in poData.receipts, fetch directly
      if (queryReceiptId > 0 && (!poData.receipts || !poData.receipts.some((r) => r.id === queryReceiptId))) {
        try {
          const fetchedReceipt = await getPurchaseReceiptByIdApi(queryReceiptId);
          if (fetchedReceipt) {
            setExtraReceipts([fetchedReceipt as unknown as LinkedReceiptSummary]);
          }
        } catch (err) {
          console.warn('Failed to load extra receipt from query param', err);
        }
      }
    } catch (err) {
      console.error('Failed to load PO details', err);
    }
  };

  useEffect(() => {
    void load();
  }, [id, queryReceiptId]);

  const allReceipts = useMemo(() => {
    const list = [...(po?.receipts || [])];
    extraReceipts.forEach((er) => {
      if (!list.some((r) => r.id === er.id)) {
        list.push(er);
      }
    });
    return list;
  }, [po?.receipts, extraReceipts]);

  if (!po) {
    return <div className="text-cyan-400 animate-pulse text-xs p-6" dir="rtl">جاري تحميل بيانات أمر الشراء وإذن الاستلام...</div>;
  }

  const handleExportJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(po, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `PO_${po.po_number}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-bold font-mono text-cyan-400">
            {po.po_number}
          </h1>
          <Badge status={po.status} />
          <span className="bg-emerald-950 text-emerald-400 border border-emerald-800/80 px-2.5 py-1 rounded text-xs font-bold">
            EGP / ج.م
          </span>
          <span className="bg-blue-900/40 text-blue-300 border border-blue-700/50 px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1">
            👁️ للاطلاع المالي والمطابقة (Read-Only)
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isDepartmentAccountant ? (
            <Link to={`/accounting/supplier-payments?tab=payments&po=${po.po_number || po.id}${queryReceiptId ? `&purchase_receipt_id=${queryReceiptId}&action=create_invoice` : ''}`}>
              <Button variant="primary" size="sm" className="font-bold shadow-md shadow-cyan-900/40">
                <span>🧾 تسجيل فاتورة الاستلام</span>
                <span className="mr-1">←</span>
              </Button>
            </Link>
          ) : (
            <Link to={`/accounting/supplier-payments?tab=payments&po=${po.po_number || po.id}`}>
              <Button variant="primary" size="sm" className="font-bold shadow-md shadow-cyan-900/40">
                <span>💳 فواتير وسداد دفعات المورد</span>
                <span className="mr-1">←</span>
              </Button>
            </Link>
          )}
          <button
            onClick={() => setPrintPo(po)}
            className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
          >
            🖨️ طباعة PO
          </button>
          <button
            onClick={handleExportJson}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
          >
            📥 تصدير البيانات
          </button>
          <Link to="/accounting/purchase-orders">
            <Button variant="secondary" size="sm">
              &rarr; العودة للطلبات
            </Button>
          </Link>
        </div>
      </div>

      {/* Operational Invoice & Payment Banner */}
      {isFinancialDirector ? (
        <div className="rounded-2xl border border-cyan-500/40 bg-gradient-to-r from-slate-900 via-cyan-950/20 to-slate-900 p-4 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">💳</span>
            <div>
              <h4 className="text-sm font-bold text-cyan-300">
                أمر الشراء وإذن الاستلام معتمدان — مسند لمحاسب القسم لتسجيل الفاتورة
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                {allReceipts.length > 0
                  ? `تم ربط أمر الشراء بـ (${allReceipts.length}) إذن استلام معتمد. يقوم محاسب القسم المختص بتسجيل فاتورة المورد، وبصفتك المدير المالي يمكنك متابعة كشف الحساب وسداد الدفعات.`
                  : 'يمكنك الانتقال لشاشة فواتير ودفعات الموردين لمتابعة الأرصدة وسداد الدفعات المستحقة.'}
              </p>
            </div>
          </div>
          <Link to={`/accounting/supplier-payments?tab=payments&po=${po.po_number || po.id}`}>
            <Button variant="secondary" size="sm" className="whitespace-nowrap font-bold text-cyan-300 border-cyan-700/60 hover:bg-slate-800">
              متابعة حساب المورد والدفعات ←
            </Button>
          </Link>
        </div>
      ) : (
        <div className="rounded-2xl border border-cyan-500/60 bg-gradient-to-r from-slate-900 via-cyan-950/20 to-slate-900 p-4 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🧾</span>
            <div>
              <h4 className="text-sm font-bold text-cyan-300">
                أمر الشراء وإذن الاستلام جاهزان لتسجيل فاتورة المورد
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                {allReceipts.length > 0
                  ? `تم اعتماد (${allReceipts.length}) إذن استلام بضائع. يمكنك بصفتك محاسب القسم مراجعة البنود والكميات وتسجيل فاتورة المورد وترحيل التكاليف.`
                  : 'يمكنك الانتقال لشاشة فواتير الموردين لتسجيل فاتورة المورد فور صدور إذن الاستلام.'}
              </p>
            </div>
          </div>
          <Link to={`/accounting/supplier-payments?tab=payments&po=${po.po_number || po.id}${queryReceiptId ? `&purchase_receipt_id=${queryReceiptId}` : ''}`}>
            <Button variant="primary" size="sm" className="whitespace-nowrap font-black">
              تسجيل الفاتورة والدفعات ←
            </Button>
          </Link>
        </div>
      )}

      {/* المورد & PR Metadata Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <Card className="space-y-2">
          <h3 className="text-xs font-bold text-slate-200 border-b border-slate-800 pb-2">🏢 تفاصيل المورد</h3>
          <div className="space-y-1 text-slate-300">
            <div><strong className="text-slate-400">الشركة:</strong> {po.supplier?.company_name || 'غير محدد'}</div>
            <div><strong className="text-slate-400">الكود:</strong> <span className="font-mono text-cyan-400">{po.supplier?.code || '-'}</span></div>
            <div><strong className="text-slate-400">الهاتف والبريد:</strong> {po.supplier?.phone || '-'} | {po.supplier?.email || '-'}</div>
          </div>
        </Card>

        <Card className="space-y-2">
          <h3 className="text-xs font-bold text-slate-200 border-b border-slate-800 pb-2">📋 طلب الشراء المرتبط</h3>
          <div className="space-y-1 text-slate-300">
            <div>
              <strong className="text-slate-400">رقم طلب الشراء:</strong>{' '}
              {po.purchase_request_id
                ? (po.purchase_request?.request_number || `#PR-${po.purchase_request_id}`)
                : '—'}
            </div>
            <div><strong className="text-slate-400">القسم:</strong> {po.department?.name || po.purchase_request?.department?.name || '—'}</div>
            <div><strong className="text-slate-400">مُقدّم الطلب:</strong> <span className="font-bold text-slate-100">{po.requested_by?.name || po.purchase_request?.requester?.name || '—'}</span></div>
            <div><strong className="text-slate-400">رئيس القسم المعتمد:</strong> <span className="font-bold text-emerald-300">{po.department_approver?.name || po.purchase_request?.assigned_reviewer?.name || '—'}</span></div>
            <div><strong className="text-slate-400">تاريخ الإصدار:</strong> {po.created_at ? new Date(po.created_at).toLocaleDateString('ar-EG') : '—'}</div>
          </div>
        </Card>
      </div>

      {/* Items Section */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
          <h3 className="text-sm font-bold text-slate-200">📦 بنود أمر الشراء (المطلوبة من المورد)</h3>
          {po.items && po.items.length > 0 && (
            <span className="text-xs text-slate-400 font-mono">
              إجمالي {po.items.length} بنود
            </span>
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden sm:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>اسم الصنف</TableHead>
                <TableHead>المنطقة</TableHead>
                <TableHead>الكمية والوحدة</TableHead>
                <TableHead>سعر الوحدة</TableHead>
                <TableHead>إجمالي البند</TableHead>
                <TableHead>الوصف والمواصفات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {po.items && po.items.length > 0 ? (
                po.items.map((item, index) => (
                  <TableRow key={item.id || index}>
                    <TableCell className="font-mono text-cyan-400">{index + 1}</TableCell>
                    <TableCell className="font-bold text-slate-100">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>{item.item_name || item.item?.name || '—'}</span>
                        <SupplementItemBadge
                          isSupplementary={item.is_supplementary}
                          batchNumber={item.supplement_batch}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-slate-300">{item.region || '—'}</TableCell>
                    <TableCell className="text-slate-300">
                      {item.quantity} {getUnitLabel(item.uom || '')}
                    </TableCell>
                    <TableCell className="font-mono text-cyan-400">
                      <CurrencyDisplay amount={item.unit_price || 0} currency={po.currency || 'ج.م'} />
                    </TableCell>
                    <TableCell className="font-mono text-emerald-400 font-bold">
                      <CurrencyDisplay amount={item.line_total || (Number(item.quantity || 0) * Number(item.unit_price || 0))} currency={po.currency || 'ج.م'} />
                    </TableCell>
                    <TableCell className="text-slate-400 text-[11px] max-w-xs truncate">
                      {item.item_description || item.specifications || 'لا توجد مواصفات إضافية'}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-4 text-slate-500">
                    لا توجد بنود مضافة لهذا الأمر
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Mobile Card View */}
        <div className="space-y-3 sm:hidden">
          {po.items && po.items.length > 0 ? (
            po.items.map((item, index) => (
              <div key={`po-mob-${item.id || index}`} className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-2.5 shadow-sm">
                <div className="flex items-start justify-between gap-2 border-b border-slate-800/80 pb-2">
                    <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                      <span className="font-mono text-xs font-black px-2 py-0.5 rounded-md bg-cyan-950 text-cyan-300 border border-cyan-800/80">
                        #{index + 1}
                      </span>
                      <h4 className="text-sm font-black text-slate-100 flex items-center gap-1.5 flex-wrap">
                        <span>{item.item_name || item.item?.name || '—'}</span>
                        <SupplementItemBadge
                          isSupplementary={item.is_supplementary}
                          batchNumber={item.supplement_batch}
                        />
                      </h4>
                    </div>
                  {item.region && (
                    <span className="text-[11px] text-slate-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-800 font-medium">
                      {item.region}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800/60">
                    <span className="text-slate-400 block text-[10px]">الكمية والوحدة:</span>
                    <span className="font-bold text-slate-100 text-xs">
                      {item.quantity} {getUnitLabel(item.uom || '')}
                    </span>
                  </div>

                  <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800/60">
                    <span className="text-slate-400 block text-[10px]">سعر الوحدة:</span>
                    <span className="font-mono font-bold text-cyan-300 text-xs">
                      <CurrencyDisplay amount={item.unit_price || 0} currency={po.currency || 'ج.م'} />
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-slate-800/70 pt-2 text-xs bg-slate-900/40 p-2 rounded-lg">
                  <span className="text-slate-300 font-semibold">إجمالي البند:</span>
                  <span className="font-mono font-black text-emerald-400 text-sm">
                    <CurrencyDisplay amount={item.line_total || (Number(item.quantity || 0) * Number(item.unit_price || 0))} currency={po.currency || 'ج.م'} />
                  </span>
                </div>

                {(item.item_description || item.specifications) && (
                  <p className="text-[11px] text-slate-400 bg-slate-900/30 p-2 rounded border border-slate-800/50 leading-relaxed">
                    {item.item_description || item.specifications}
                  </p>
                )}
              </div>
            ))
          ) : (
            <div className="text-center py-4 text-xs text-slate-500">لا توجد بنود مضافة لهذا الأمر</div>
          )}
        </div>

        {/* Totals Box */}
        <div className="flex justify-end pt-2">
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1.5 w-full sm:w-80 text-xs">
            <div className="flex justify-between text-slate-400">
              <span>إجمالي البنود:</span>
              <span className="font-mono font-bold text-slate-200">
                <CurrencyDisplay amount={po.subtotal || po.grand_total || 0} currency={po.currency || 'ج.م'} />
              </span>
            </div>
            <div className="flex justify-between border-t border-slate-800 pt-1.5 text-sm font-bold text-cyan-300">
              <span>المبلغ الإجمالي الكلي:</span>
              <span className="font-mono font-black text-cyan-400">
                <CurrencyDisplay amount={po.grand_total || po.subtotal || 0} currency={po.currency || 'ج.م'} />
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* ── Linked Goods Receipt Notes (إذن الاستلام) Section ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">📦</span>
            <h2 className="text-base font-black text-slate-100">
              أذونات الاستلام وفحص البضاعة (GRN)
            </h2>
            {allReceipts.length > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-cyan-950 text-cyan-300 border border-cyan-800/80">
                {allReceipts.length} إذن استلام مقترن
              </span>
            )}
          </div>
        </div>

        {allReceipts.length > 0 ? (
          allReceipts.map((receipt) => {
            const isHighlighted = queryReceiptId === receipt.id;
            const photoUrl = getReceiptPhotoUrl(receipt);

            return (
              <Card
                key={receipt.id}
                className={`p-4 sm:p-5 space-y-4 transition-all border ${
                  isHighlighted
                    ? 'border-cyan-400/90 bg-slate-900 shadow-xl shadow-cyan-950/40 ring-1 ring-cyan-400/50'
                    : 'border-slate-800 bg-slate-950/80'
                }`}
              >
                {/* Receipt Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-mono text-sm sm:text-base font-black text-cyan-300 bg-slate-900 border border-slate-700/80 px-2.5 py-1 rounded-xl">
                      {receipt.receipt_number}
                    </span>

                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-bold border whitespace-nowrap ${
                        receipt.status === 'APPROVED'
                          ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/80'
                          : 'bg-amber-950/80 text-amber-300 border-amber-700/80'
                      }`}
                    >
                      {receipt.status === 'APPROVED'
                        ? '✅ تم الفحص والاستلام واعتماده'
                        : `⏳ حالة الإذن: ${receipt.status}`}
                    </span>

                    <span className="bg-slate-900 text-slate-300 border border-slate-700/80 px-2 py-0.5 rounded-lg text-xs font-semibold whitespace-nowrap">
                      {receipt.receipt_type === 'REQUESTER_OFFICE'
                        ? '🏢 استلام مكتبي'
                        : receipt.receipt_type === 'SITE_DIRECT'
                        ? '🏗️ استلام موقع مباشر'
                        : '🏭 استلام مستودع'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {isDepartmentAccountant ? (
                      <Link
                        to={`/accounting/supplier-payments?tab=payments&purchase_receipt_id=${receipt.id}&po=${po.po_number || po.id}&action=create_invoice`}
                      >
                        <Button variant="primary" size="sm" className="font-bold shadow-sm w-full sm:w-auto">
                          <span>🧾 تسجيل فاتورة هذا الإذن</span>
                          <span className="mr-1">←</span>
                        </Button>
                      </Link>
                    ) : (
                      <>
                        <span className="rounded-xl bg-slate-900/90 border border-slate-700/80 px-3 py-1.5 text-xs font-bold text-slate-400 flex items-center gap-1.5">
                          <span>👤</span>
                          <span>مسند لمحاسب القسم لتسجيل الفاتورة</span>
                        </span>
                        <Link
                          to={`/accounting/supplier-payments?tab=payments&po=${po.po_number || po.id}`}
                        >
                          <Button variant="secondary" size="sm" className="text-xs font-semibold text-cyan-300 border-cyan-800/60 hover:bg-slate-800">
                            متابعة الدفعات ←
                          </Button>
                        </Link>
                      </>
                    )}
                  </div>
                </div>

                {/* Receipt Meta Details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs bg-slate-900/60 p-3 rounded-xl border border-slate-800/60">
                  <div>
                    <span className="text-slate-400 block font-semibold text-[11px]">تاريخ الاستلام:</span>
                    <span className="text-slate-100 font-medium">
                      {receipt.received_at || receipt.warehouse_submitted_at
                        ? new Date(receipt.received_at || receipt.warehouse_submitted_at!).toLocaleDateString('ar-EG')
                        : '—'}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block font-semibold text-[11px]">أمين المستودع (المستلم):</span>
                    <span className="text-cyan-300 font-bold">
                      {receipt.warehouse_keeper?.name || '—'}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block font-semibold text-[11px]">مهندس الموقع المعتمد:</span>
                    <span className="text-emerald-300 font-bold">
                      {receipt.site_engineer?.name || '—'}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block font-semibold text-[11px]">تاريخ اعتماد الموقع:</span>
                    <span className="text-slate-100 font-medium">
                      {receipt.site_engineer_approved_at
                        ? new Date(receipt.site_engineer_approved_at).toLocaleDateString('ar-EG')
                        : '—'}
                    </span>
                  </div>
                </div>

                {/* Notes */}
                {(receipt.warehouse_notes || receipt.site_engineer_notes || receipt.receiver_notes) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {receipt.warehouse_notes && (
                      <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                        <span className="text-amber-400 font-bold block mb-1">📝 ملاحظات أمين المستودع:</span>
                        <p className="text-slate-300 leading-relaxed">{receipt.warehouse_notes}</p>
                      </div>
                    )}
                    {receipt.site_engineer_notes && (
                      <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                        <span className="text-cyan-400 font-bold block mb-1">🏗️ ملاحظات مهندس الموقع:</span>
                        <p className="text-slate-300 leading-relaxed">{receipt.site_engineer_notes}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Items Received Section */}
                {receipt.items && receipt.items.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-300">📦 البنود المستلمة ومطابقتها بأمر الشراء:</h4>

                    {/* Desktop Table View */}
                    <div className="hidden sm:block">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>#</TableHead>
                            <TableHead>اسم الصنف / البيان</TableHead>
                            <TableHead>الكمية المطلوبة بالـ PO</TableHead>
                            <TableHead>الكمية المستلمة فعلياً</TableHead>
                            <TableHead>حالة المطابقة</TableHead>
                            <TableHead>ملاحظات الاستلام</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {receipt.items.map((rItem, idx) => {
                            const reqQty = Number(rItem.ordered_quantity || 0);
                            const recQty = Number(rItem.received_quantity || 0);
                            const isComplete = recQty >= reqQty && reqQty > 0;

                            return (
                              <TableRow key={rItem.id || idx}>
                                <TableCell className="font-mono text-cyan-400 text-xs">{idx + 1}</TableCell>
                                <TableCell className="font-bold text-slate-100 text-xs">
                                  {rItem.purchase_order_item?.item_name || rItem.purchase_order_item?.item_description || '—'}
                                </TableCell>
                                <TableCell className="font-mono text-slate-300 text-xs">
                                  {reqQty} {rItem.purchase_order_item?.uom ? getUnitLabel(rItem.purchase_order_item.uom) : ''}
                                </TableCell>
                                <TableCell className="font-mono text-emerald-400 font-bold text-xs">
                                  {recQty} {rItem.purchase_order_item?.uom ? getUnitLabel(rItem.purchase_order_item.uom) : ''}
                                </TableCell>
                                <TableCell className="text-xs">
                                  {isComplete ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/80 px-2.5 py-0.5 text-xs font-bold whitespace-nowrap">
                                      ✓ مطابق 100%
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-950 text-amber-300 border border-amber-800/80 px-2.5 py-0.5 text-xs font-bold whitespace-nowrap">
                                      ⚠️ استلام جزئي ({recQty}/{reqQty})
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className="text-slate-400 text-xs">
                                  {rItem.notes || '—'}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Mobile Card View */}
                    <div className="space-y-2.5 sm:hidden">
                      {receipt.items.map((rItem, idx) => {
                        const reqQty = Number(rItem.ordered_quantity || 0);
                        const recQty = Number(rItem.received_quantity || 0);
                        const isComplete = recQty >= reqQty && reqQty > 0;

                        return (
                          <div key={`rcpt-mob-${rItem.id || idx}`} className="rounded-xl border border-slate-800 bg-slate-900/90 p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-mono text-xs font-black px-2 py-0.5 rounded-md bg-cyan-950 text-cyan-300 border border-cyan-800/80 shrink-0">
                                  #{idx + 1}
                                </span>
                                <h5 className="text-xs font-bold text-slate-100 truncate">
                                  {rItem.purchase_order_item?.item_name || rItem.purchase_order_item?.item_description || '—'}
                                </h5>
                              </div>
                              {isComplete ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/80 px-2 py-0.5 text-[10px] font-bold whitespace-nowrap shrink-0">
                                  ✓ مطابق 100%
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-950 text-amber-300 border border-amber-800/80 px-2 py-0.5 text-[10px] font-bold whitespace-nowrap shrink-0">
                                  ⚠️ استلام جزئي ({recQty}/{reqQty})
                                </span>
                              )}
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800/60">
                                <span className="text-slate-400 block text-[10px]">المطلوب بأمر الشراء:</span>
                                <span className="font-mono font-bold text-slate-200 text-xs">
                                  {reqQty} {rItem.purchase_order_item?.uom ? getUnitLabel(rItem.purchase_order_item.uom) : ''}
                                </span>
                              </div>
                              <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800/60">
                                <span className="text-slate-400 block text-[10px]">المستلم فعلياً:</span>
                                <span className="font-mono font-bold text-emerald-400 text-xs">
                                  {recQty} {rItem.purchase_order_item?.uom ? getUnitLabel(rItem.purchase_order_item.uom) : ''}
                                </span>
                              </div>
                            </div>

                            {rItem.notes && (
                              <p className="text-[11px] text-slate-400 bg-slate-950/50 p-2 rounded border border-slate-800/40">
                                <strong>ملاحظات:</strong> {rItem.notes}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Photo Attachment Preview */}
                {photoUrl && (
                  <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={photoUrl}
                        alt={receipt.receipt_number}
                        className="h-16 w-20 object-cover rounded-lg border border-slate-700 shadow-sm cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => setPreviewPhoto({ url: photoUrl, title: `مستند إذن الاستلام ${receipt.receipt_number}` })}
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-200 block">
                          📎 صورة إذن الاستلام / الفاتورة الورقية
                        </span>
                        <span className="text-[11px] text-slate-400">
                          تم تصويرها وإرفاقها من قبل موقع العمل / المستودع
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setPreviewPhoto({ url: photoUrl, title: `مستند إذن الاستلام ${receipt.receipt_number}` })}
                      className="text-xs font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer bg-slate-900 border border-slate-700/80 px-3 py-1.5 rounded-xl transition-colors self-start sm:self-center"
                    >
                      <span>🔍 تكبير ومعاينة المستند</span>
                    </button>
                  </div>
                )}
              </Card>
            );
          })
        ) : (
          <Card className="p-4 bg-slate-900/50 border border-slate-800 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">⏳</span>
              <div>
                <span className="font-bold text-slate-300 block">إذن الاستلام (GRN) لم يصدر بعد</span>
                <span className="text-slate-400 text-[11px]">في انتظار استلام الأصناف بواسطة أمين المستودع أو مهندس الموقع.</span>
              </div>
            </div>
            <span className="text-slate-500 font-mono text-[11px]">بانتظار التوريد</span>
          </Card>
        )}
      </div>

      <UnifiedNotesCard purchaseOrder={po} />

      {/* Printable PO Modal */}
      {printPo && (
        <PrintablePO
          po={printPo}
          onClose={() => setPrintPo(null)}
        />
      )}

      {/* Document Photo Preview Modal */}
      {previewPhoto && (
        <Modal
          isOpen={Boolean(previewPhoto)}
          onClose={() => setPreviewPhoto(null)}
          title={previewPhoto.title}
          size="xl"
        >
          <div className="flex flex-col items-center justify-center p-2 space-y-4">
            <img
              src={previewPhoto.url}
              alt={previewPhoto.title}
              className="max-h-[75vh] w-auto object-contain rounded-xl border border-slate-700 shadow-2xl"
            />
            <div className="flex items-center justify-end w-full gap-2 pt-2 border-t border-slate-800">
              <a
                href={previewPhoto.url}
                target="_blank"
                rel="noreferrer"
                download
                className="px-4 py-2 bg-cyan-700 hover:bg-cyan-600 text-white rounded-xl text-xs font-bold transition-colors"
              >
                تحميل الصورة 💾
              </a>
              <Button variant="secondary" size="sm" onClick={() => setPreviewPhoto(null)}>
                إغلاق
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default AccountingPurchaseOrderDetailsPage;

