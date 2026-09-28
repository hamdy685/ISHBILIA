import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CreateSupplierPaymentPayload,
  SupplierAccountDetails,
  SupplierAccountSummary,
  getSupplierAccountApi,
  getSupplierAccountsApi,
  recordSupplierPaymentApi,
} from '../../api/supplierFinance';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/Table';
import ErrorMessage from '../../components/ErrorMessage';
import TableColumnFilters from '../../components/ui/TableColumnFilters';
import { parseApiError } from '../../utils/apiError';
import { getTodayInputDate } from '../../utils/dateFilters';
import { createPortal } from 'react-dom';
import { getSupplierQuoteArchiveApi } from '../../api/purchaseQuotes';
import { PurchaseRequestQuote } from '../../types/purchaseRequest';
import { useAuth } from '../../context/AuthContext';

import { getToken } from '../../utils/authStorage';
import { formatCleanNumber } from '../../utils/numberFormat';

const today = getTodayInputDate;
const money = (value: string | number | null | undefined) => `${formatCleanNumber(value)} ج.م`;
const paymentMethods: Record<string, string> = { BANK_TRANSFER: 'تحويل بنكي', CASH: 'نقدي', CHEQUE: 'شيك' };

const getQuoteFileUrl = (quote: { id: number; file_url?: string | null; file_path?: string | null; file_name?: string | null }) => {
  if (!quote.file_url && !quote.file_path && !quote.file_name) return null;
  const token = getToken();
  const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
  if (quote.file_url && !quote.file_url.includes('/storage/quotes/')) {
    return quote.file_url.includes('?') ? `${quote.file_url}&token=${encodeURIComponent(token || '')}` : `${quote.file_url}${tokenParam}`;
  }
  return `/api/v1/purchase-quotes/${quote.id}/file${tokenParam}`;
};

/**
 * Dedicated Full-Page Supplier Account Statement View
 */
const SupplierAccountDedicatedPage: React.FC<{
  selected: SupplierAccountDetails;
  onBack: () => void;
  onRecordPayment: (account: SupplierAccountSummary) => void;
}> = ({ selected, onBack, onRecordPayment }) => {
  const [quotes, setQuotes] = useState<PurchaseRequestQuote[]>([]);
  const [quotesLoading, setQuotesLoading] = useState<boolean>(true);
  const { hasRole } = useAuth();
  const isDepartmentAccountant = hasRole('site_accountant') || hasRole('licenses_accountant') || hasRole('buffet_accountant');

  useEffect(() => {
    setQuotesLoading(true);
    getSupplierQuoteArchiveApi(selected.supplier.id)
      .then((data) => setQuotes(data || []))
      .catch(() => setQuotes([]))
      .finally(() => setQuotesLoading(false));
  }, [selected.supplier.id]);
  return (
    <div className="min-w-0 space-y-6 animate-fade-in print-container print-document" dir="rtl">
      {/* ── OFFICIAL PRINT HEADER ── */}
      <div className="hidden print:block mb-4 border-b-2 border-slate-900 pb-3">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-black text-slate-950">شركة اشبيلية للتطوير العقاري والمقاولات</h1>
            <p className="text-xs text-slate-700">كشف حساب مالي تفصيلي للمورد — {selected.supplier.company_name}</p>
          </div>
          <div className="text-left text-xs font-mono text-slate-700">
            <div>تاريخ الطباعة: {new Date().toLocaleDateString('ar-EG')}</div>
            <div>كود المورد: {selected.supplier.code || '—'}</div>
          </div>
        </div>
      </div>

      {/* Top Header & Navigation */}
      <div className="flex flex-col gap-4 border-b border-slate-800 pb-5 lg:flex-row lg:items-center lg:justify-between print:border-b-0 print:pb-2">
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-bold text-cyan-400">
            <button
              type="button"
              onClick={onBack}
              className="hover:underline flex items-center gap-1 text-slate-400 hover:text-cyan-300 transition-colors"
            >
              <span>← حسابات الموردين</span>
            </button>
            <span className="text-slate-600">/</span>
            <span>كشف حساب المورد</span>
          </div>

          <h1 className="text-xl md:text-2xl font-black text-slate-100 flex items-center gap-2 flex-wrap">
            <span>📋</span>
            <span>كشف حساب: {selected.supplier.company_name}</span>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
              selected.summary.is_overpaid
                ? 'bg-cyan-950 text-cyan-300 border border-cyan-800/60'
                : selected.summary.balance > 0
                ? 'bg-amber-950 text-amber-300 border border-amber-800/60'
                : 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
            }`}>
              {selected.summary.is_overpaid ? 'رصيد دائن (دفع زائد)' : selected.summary.balance > 0 ? 'مديونية قائمة مستحقة' : 'الحساب مسدد بالكامل'}
            </span>
          </h1>

          <p className="text-xs text-slate-400 flex items-center gap-3 flex-wrap">
            {selected.supplier.code && <span className="font-mono bg-slate-800/80 px-2 py-0.5 rounded text-slate-300">الكود: {selected.supplier.code}</span>}
            {selected.supplier.phone && <span>📞 {selected.supplier.phone}</span>}
            {selected.supplier.email && <span>✉️ {selected.supplier.email}</span>}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="font-bold flex items-center gap-1.5"
            onClick={onBack}
          >
            <span>⬅</span>
            <span>العودة لجميع الموردين</span>
          </Button>

          <Button
            size="sm"
            variant="secondary"
            className="font-bold flex items-center gap-1.5"
            onClick={() => window.print()}
          >
            <span>🖨️</span>
            <span>طباعة الكشف</span>
          </Button>

          <Button
            size="sm"
            variant="success"
            className="font-bold flex items-center gap-1.5"
            onClick={() => onRecordPayment(selected.summary)}
          >
            <span>➕</span>
            <span>تسجيل دفعة سداد</span>
          </Button>

          {isDepartmentAccountant && (
            <Link to={`/accounting/supplier-payments?supplier_id=${selected.supplier.id}`}>
              <Button size="sm" variant="primary" className="font-bold">
                <span>🧾</span> تسجيل فاتورة جديدة
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* 4 Financial Summary KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl bg-slate-900/90 p-4 border border-amber-900/50 shadow-lg">
          <div className="text-xs font-bold text-slate-400">💰 الرصيد الافتتاحي (مديونية سابقة)</div>
          <div className="mt-2 whitespace-nowrap font-mono font-black text-amber-300 text-2xl">
            {money(selected.summary.opening_balance || 0)}
          </div>
          {selected.supplier.opening_balance_notes ? (
            <div className="mt-2 text-[11px] text-slate-400 truncate bg-slate-950/60 p-1.5 rounded" title={selected.supplier.opening_balance_notes}>
              {selected.supplier.opening_balance_notes}
            </div>
          ) : (
            <div className="mt-2 text-[11px] text-slate-500">لا توجد ملاحظات رصيد سابق</div>
          )}
        </div>

        <div className="rounded-2xl bg-slate-900/90 p-4 border border-cyan-900/50 shadow-lg">
          <div className="text-xs font-bold text-slate-400">📑 إجمالي الفواتير المسجلة ({selected.invoices.length})</div>
          <div className="mt-2 whitespace-nowrap font-mono font-black text-cyan-300 text-2xl">
            {money(selected.summary.total_invoiced)}
          </div>
          <div className="mt-2 text-[11px] text-cyan-400/80">
            {selected.summary.open_invoices_count} فواتير مفتوحة غير مسددة بالكامل
          </div>
        </div>

        <div className="rounded-2xl bg-slate-900/90 p-4 border border-emerald-900/50 shadow-lg">
          <div className="text-xs font-bold text-slate-400">💳 إجمالي المدفوع للمورد ({selected.payments.length})</div>
          <div className="mt-2 whitespace-nowrap font-mono font-black text-emerald-300 text-2xl">
            {money(selected.summary.total_paid)}
          </div>
          <div className="mt-2 text-[11px] text-emerald-400/80">
            {selected.summary.payments_count} عمليات سداد مسجلة
          </div>
        </div>

        <div className={`rounded-2xl p-4 border shadow-lg ${
          selected.summary.is_overpaid
            ? 'bg-cyan-950/40 border-cyan-800/80'
            : selected.summary.balance > 0
            ? 'bg-amber-950/30 border-amber-800/70'
            : 'bg-slate-900/90 border-slate-800'
        }`}>
          <div className="text-xs font-bold text-slate-400">
            {selected.summary.is_overpaid ? '🏷️ رصيد دائن (دفع زائد للمورد)' : '⚖️ الرصيد الحالي المستحق'}
          </div>
          <div className={`mt-2 whitespace-nowrap font-mono font-black text-2xl ${
            selected.summary.is_overpaid ? 'text-cyan-300' : selected.summary.balance > 0 ? 'text-amber-300' : 'text-emerald-300'
          }`}>
            {money(selected.summary.is_overpaid ? Math.abs(selected.summary.balance) : Math.max(selected.summary.balance, 0))}
          </div>
          <div className="mt-2 text-[11px] font-medium text-slate-400">
            {selected.summary.is_overpaid
              ? 'مبالغ سددت بالزيادة ومتاحة للخصم من فواتير قادمة'
              : selected.summary.balance > 0
              ? 'المبلغ المطلوب سداده للمورد لتسوية كافة الحسابات'
              : 'تمت تسوية جميع الفواتير بالكامل'}
          </div>
        </div>
      </div>

      {/* Section 1: Invoices & POs */}
      <Card className="space-y-4 border-slate-800 bg-slate-900/90">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-black text-slate-100 flex items-center gap-2">
              <span>🧾</span>
              <span>سجل الفواتير وأوامر الشراء ({selected.invoices.length})</span>
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">
              جميع الفواتير المسجلة على هذا المورد مع حالة السداد ومطابقة الاستلام
            </p>
          </div>
        </div>

        {selected.invoices.length > 0 ? (
          <>
            <div className="hidden min-w-0 md:block overflow-x-auto">
              <Table className="min-w-[750px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">الفاتورة</TableHead>
                    <TableHead className="whitespace-nowrap">أمر الشراء</TableHead>
                    <TableHead className="whitespace-nowrap">تاريخ الفاتورة</TableHead>
                    <TableHead className="whitespace-nowrap">تاريخ الاستحقاق</TableHead>
                    <TableHead className="whitespace-nowrap">قيمة الفاتورة</TableHead>
                    <TableHead className="whitespace-nowrap">المدفوع</TableHead>
                    <TableHead className="whitespace-nowrap">المتبقي</TableHead>
                    <TableHead className="whitespace-nowrap">حالة السداد</TableHead>
                    <TableHead className="whitespace-nowrap">المطابقة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selected.invoices.map(invoice => {
                    const isOverdue = invoice.due_date && invoice.due_date < today() && ['OPEN', 'PARTIALLY_PAID'].includes(invoice.status);
                    return (
                      <TableRow key={invoice.id} className={isOverdue ? 'bg-rose-950/20' : undefined}>
                        <TableCell className="whitespace-nowrap font-mono font-bold text-cyan-300">
                          {invoice.invoice_number}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-slate-300">
                          {invoice.purchase_order?.po_number || `PO #${invoice.purchase_order_id}`}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-slate-400">
                          {invoice.invoice_date}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-slate-400">
                          {invoice.due_date || '—'}
                          {isOverdue && <span className="mr-1.5 text-[10px] font-bold text-rose-400 bg-rose-950 px-1.5 py-0.5 rounded border border-rose-800/60">متأخر</span>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono font-bold text-slate-100">
                          {money(invoice.amount)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono font-bold text-emerald-300">
                          {money(invoice.paid_amount)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono font-black text-amber-300">
                          {money(invoice.outstanding_amount)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black ${
                            invoice.status === 'PAID' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-700/50' :
                            invoice.status === 'PARTIALLY_PAID' ? 'bg-amber-500/20 text-amber-300 border border-amber-700/50' :
                            'bg-cyan-500/20 text-cyan-300 border border-cyan-700/50'
                          }`}>
                            {invoice.status === 'PAID' ? 'مدفوعة بالكامل' : invoice.status === 'PARTIALLY_PAID' ? 'مدفوعة جزئياً' : 'مفتوحة'}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {invoice.matching_status === 'MATCHED' ? (
                            <span className="text-xs font-bold text-emerald-300 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/50">مطابقة ✅</span>
                          ) : (
                            <span className="text-xs font-bold text-amber-300 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/50">بانتظار المطابقة ⏳</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-3 md:hidden">
              {selected.invoices.map(invoice => {
                const isOverdue = invoice.due_date && invoice.due_date < today() && ['OPEN', 'PARTIALLY_PAID'].includes(invoice.status);
                return (
                  <article key={`mobile-invoice-${invoice.id}`} className={`min-w-0 rounded-2xl border p-4 shadow-sm ${
                    isOverdue ? 'border-rose-800/70 bg-rose-950/20' : 'border-slate-800 bg-slate-950/60'
                  }`}>
                    <div className="flex min-w-0 items-start justify-between gap-3 border-b border-slate-800 pb-2.5">
                      <div>
                        <span className="font-mono text-sm font-black text-cyan-300 block">{invoice.invoice_number}</span>
                        <span className="text-[11px] font-mono text-slate-400">أمر الشراء: {invoice.purchase_order?.po_number || `PO #${invoice.purchase_order_id}`}</span>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-black ${
                        invoice.status === 'PAID' ? 'bg-emerald-500/20 text-emerald-300' :
                        invoice.status === 'PARTIALLY_PAID' ? 'bg-amber-500/20 text-amber-300' :
                        'bg-cyan-500/20 text-cyan-300'
                      }`}>
                        {invoice.status === 'PAID' ? 'مدفوعة' : invoice.status === 'PARTIALLY_PAID' ? 'جزئية' : 'مفتوحة'}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded-lg bg-slate-900 p-2 border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">القيمة</span>
                        <strong className="font-mono text-slate-200 mt-0.5 block">{money(invoice.amount)}</strong>
                      </div>
                      <div className="rounded-lg bg-slate-900 p-2 border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">المدفوع</span>
                        <strong className="font-mono text-emerald-300 mt-0.5 block">{money(invoice.paid_amount)}</strong>
                      </div>
                      <div className="rounded-lg bg-slate-900 p-2 border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">المتبقي</span>
                        <strong className="font-mono text-amber-300 mt-0.5 block">{money(invoice.outstanding_amount)}</strong>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800/80">
                      <div>التاريخ: <span className="font-mono">{invoice.invoice_date}</span></div>
                      <div>الاستحقاق: <span className="font-mono">{invoice.due_date || '—'}</span></div>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        ) : (
          <div className="py-8 text-center text-sm text-slate-500 bg-slate-950/40 rounded-xl border border-slate-800/60">
            لا توجد فواتير مسجلة لهذا المورد حتى الآن.
          </div>
        )}
      </Card>

      {/* Section 2: Payments History */}
      <Card className="space-y-4 border-slate-800 bg-slate-900/90">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-black text-slate-100 flex items-center gap-2">
              <span>💳</span>
              <span>سجل المدفوعات وتوزيعها على الفواتير ({selected.payments.length})</span>
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">
              تفاصيل الدفعات المسددة للمورد وتوزيع مبالغها على الفواتير حسب الأقدمية
            </p>
          </div>
        </div>

        {selected.payments.length > 0 ? (
          <>
            <div className="hidden min-w-0 md:block overflow-x-auto">
              <Table className="min-w-[750px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">رقم الدفعة</TableHead>
                    <TableHead className="whitespace-nowrap">تاريخ السداد</TableHead>
                    <TableHead className="whitespace-nowrap">طريقة الدفع</TableHead>
                    <TableHead className="whitespace-nowrap">قيمة الدفعة</TableHead>
                    <TableHead className="whitespace-nowrap">التوزيع على الفواتير</TableHead>
                    <TableHead className="whitespace-nowrap">رصيد زائد (دائن)</TableHead>
                    <TableHead className="whitespace-nowrap">المرجع</TableHead>
                    <TableHead className="whitespace-nowrap">الملاحظات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selected.payments.map(payment => (
                    <TableRow key={payment.id}>
                      <TableCell className="whitespace-nowrap font-mono font-bold text-emerald-300">
                        {payment.payment_number}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-slate-300">
                        {payment.payment_date}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span className="rounded-md bg-slate-800 px-2 py-1 text-xs font-bold text-slate-200">
                          {paymentMethods[payment.payment_method] || payment.payment_method}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono font-bold text-emerald-300">
                        {money(payment.amount)}
                      </TableCell>
                      <TableCell className="min-w-[220px] font-mono">
                        {payment.allocations?.length ? (
                          <div className="space-y-1">
                            {payment.allocations.map((allocation) => (
                              <div key={allocation.id} className="whitespace-nowrap text-xs bg-slate-950/80 p-1 rounded border border-slate-800">
                                فاتورة <span className="font-bold text-cyan-300">{allocation.invoice?.invoice_number || `#${allocation.supplier_invoice_id}`}</span>: {money(allocation.amount)}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">{money(payment.allocated_amount)}</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-cyan-300 font-bold">
                        {Number(payment.overpayment_amount || 0) > 0 ? money(payment.overpayment_amount) : '—'}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-300">
                        {payment.reference_number || '—'}
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        <span className="text-xs text-slate-400 truncate block" title={payment.notes || ''}>
                          {payment.notes || '—'}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-3 md:hidden">
              {selected.payments.map(payment => (
                <article key={`mobile-payment-${payment.id}`} className="min-w-0 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 shadow-sm space-y-3">
                  <div className="flex min-w-0 items-start justify-between gap-3 border-b border-slate-800 pb-2.5">
                    <div>
                      <span className="font-mono text-sm font-black text-emerald-300 block">{payment.payment_number}</span>
                      <span className="text-[11px] font-mono text-slate-400">{payment.payment_date}</span>
                    </div>
                    <span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs font-bold text-slate-200">
                      {paymentMethods[payment.payment_method] || payment.payment_method}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">إجمالي المبلغ المسدد:</span>
                    <strong className="font-mono text-emerald-300 text-sm">{money(payment.amount)}</strong>
                  </div>

                  {payment.allocations && payment.allocations.length > 0 && (
                    <div className="rounded-xl bg-slate-900/90 p-2.5 border border-slate-800/80 space-y-1.5">
                      <span className="text-[10px] text-slate-400 font-bold block">التوزيع على الفواتير:</span>
                      {payment.allocations.map((allocation) => (
                        <div key={allocation.id} className="text-xs font-mono flex items-center justify-between">
                          <span className="text-cyan-300">فاتورة {allocation.invoice?.invoice_number || `#${allocation.supplier_invoice_id}`}</span>
                          <strong className="text-slate-200">{money(allocation.amount)}</strong>
                        </div>
                      ))}
                    </div>
                  )}

                  {Number(payment.overpayment_amount || 0) > 0 && (
                    <div className="flex items-center justify-between text-xs text-cyan-300 bg-cyan-950/40 p-2 rounded-lg border border-cyan-800/50">
                      <span>رصيد دائن / دفع زائد:</span>
                      <strong className="font-mono">{money(payment.overpayment_amount)}</strong>
                    </div>
                  )}

                  {(payment.reference_number || payment.notes) && (
                    <div className="text-[11px] text-slate-400 space-y-1 pt-1 border-t border-slate-800/60">
                      {payment.reference_number && <div><span className="text-slate-500">المرجع:</span> <span className="font-mono text-slate-300">{payment.reference_number}</span></div>}
                      {payment.notes && <div><span className="text-slate-500">الملاحظات:</span> {payment.notes}</div>}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="py-8 text-center text-sm text-slate-500 bg-slate-950/40 rounded-xl border border-slate-800/60">
            لا توجد دفعات مسجلة لهذا المورد حتى الآن.
          </div>
        )}
      </Card>

      {/* Section 3: Approved Price Quotes Archive */}
      <Card className="space-y-4 border-slate-800 bg-slate-900/90">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-black text-slate-100 flex items-center gap-2">
              <span>📑</span>
              <span>أرشيف عروض الأسعار المعتمدة للمورد ({quotes.length})</span>
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">
              جميع عروض الأسعار المقدمة من هذا المورد والتي تم اعتمادها من الإدارة مع ملفات الـ PDF الأصلية
            </p>
          </div>
        </div>

        {quotesLoading ? (
          <div className="py-8 text-center text-xs text-cyan-400 animate-pulse">
            جاري تحميل أرشيف عروض الأسعار...
          </div>
        ) : quotes.length > 0 ? (
          <>
            <div className="hidden min-w-0 md:block overflow-x-auto">
              <Table className="min-w-[750px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">طلب الشراء</TableHead>
                    <TableHead className="whitespace-nowrap">أمر الشراء</TableHead>
                    <TableHead className="whitespace-nowrap">القسم</TableHead>
                    <TableHead className="whitespace-nowrap">تاريخ الاعتماد</TableHead>
                    <TableHead className="whitespace-nowrap">سعر الوحدة</TableHead>
                    <TableHead className="whitespace-nowrap">إجمالي العرض</TableHead>
                    <TableHead className="whitespace-nowrap">شروط وملاحظات المورد</TableHead>
                    <TableHead className="whitespace-nowrap text-center">مستند العرض الرسمي</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quotes.map((quote) => (
                    <TableRow key={quote.id}>
                      <TableCell className="whitespace-nowrap font-mono font-bold text-cyan-300">
                        {quote.request_number || `#PR-${quote.purchase_request_id}`}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-slate-300">
                        {quote.po_number || '—'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-slate-300">
                        {quote.department_name || '—'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-slate-400">
                        {quote.selected_at ? String(quote.selected_at).slice(0, 10) : '—'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono font-bold text-amber-300">
                        {quote.unit_price} ج.م
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono font-black text-emerald-300">
                        {money(quote.total_amount)}
                      </TableCell>
                      <TableCell className="max-w-[200px] text-xs text-slate-400 truncate">
                        {quote.notes || '—'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-center">
                        {getQuoteFileUrl(quote) ? (
                          <a
                            href={getQuoteFileUrl(quote)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-950/90 hover:bg-cyan-900 border border-cyan-600/70 text-cyan-300 text-xs font-bold transition-all shadow-sm"
                          >
                            <span>📄</span>
                            <span>معاينة PDF</span>
                            <span className="text-[10px]">↗</span>
                          </a>
                        ) : (
                          <span className="text-[11px] text-slate-500">لا يوجد ملف</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-3 md:hidden">
              {quotes.map((quote) => (
                <article
                  key={`mobile-quote-${quote.id}`}
                  className="min-w-0 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 shadow-sm space-y-3"
                >
                  <div className="flex min-w-0 items-start justify-between gap-3 border-b border-slate-800 pb-2.5">
                    <div>
                      <span className="font-mono text-sm font-black text-cyan-300 block">
                        طلب {quote.request_number || `#PR-${quote.purchase_request_id}`}
                      </span>
                      {quote.po_number && (
                        <span className="text-[11px] font-mono text-slate-400">أمر شراء: {quote.po_number}</span>
                      )}
                    </div>
                    <span className="font-mono font-black text-emerald-300 text-sm">
                      {money(quote.total_amount)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
                    <div>القسم: <strong className="text-slate-200">{quote.department_name || '—'}</strong></div>
                    <div>سعر الوحدة: <strong className="text-amber-300 font-mono">{quote.unit_price} ج.م</strong></div>
                  </div>

                  {quote.notes && (
                    <div className="text-xs text-slate-400 bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                      {quote.notes}
                    </div>
                  )}

                  {getQuoteFileUrl(quote) ? (
                    <a
                      href={getQuoteFileUrl(quote)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-950/90 hover:bg-cyan-900 border border-cyan-600/70 text-cyan-200 text-xs font-bold transition-all shadow-sm"
                    >
                      <span>📄</span>
                      <span>فتح ومعاينة عرض السعر PDF</span>
                      <span>↗</span>
                    </a>
                  ) : (
                    <div className="text-center text-xs text-slate-500">لا يوجد ملف مرفق</div>
                  )}
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="py-8 text-center text-sm text-slate-500 bg-slate-950/40 rounded-xl border border-slate-800/60">
            لا توجد عروض أسعار معتمدة مسجلة لهذا المورد حتى الآن.
          </div>
        )}
      </Card>
    </div>
  );
};

export const SupplierAccountsPage: React.FC = () => {
  const [accounts, setAccounts] = useState<SupplierAccountSummary[]>([]);
  const [selected, setSelected] = useState<SupplierAccountDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const [paymentAccount, setPaymentAccount] = useState<SupplierAccountSummary | null>(null);
  const [paymentForm, setPaymentForm] = useState<CreateSupplierPaymentPayload>({
    amount: 0,
    payment_date: today(),
    payment_method: 'BANK_TRANSFER',
    reference_number: '',
    notes: '',
  });

  const loadAccounts = async () => {
    setLoading(true);
    setError(null);
    try {
      setAccounts(await getSupplierAccountsApi());
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAccounts();
  }, []);

  // Handle URL query parameter `?supplier_id=X`
  const supplierIdParam = searchParams.get('supplier_id');
  useEffect(() => {
    if (supplierIdParam) {
      const supplierId = Number(supplierIdParam);
      if (supplierId && (!selected || selected.supplier.id !== supplierId)) {
        setDetailsLoading(true);
        getSupplierAccountApi(supplierId)
          .then((details) => {
            setSelected(details);
            window.scrollTo({ top: 0, behavior: 'instant' });
          })
          .catch((err) => {
            setError(parseApiError(err).message);
          })
          .finally(() => {
            setDetailsLoading(false);
          });
      }
    } else {
      setSelected(null);
    }
  }, [supplierIdParam]);

  const openAccount = async (account: SupplierAccountSummary) => {
    setDetailsLoading(true);
    setError(null);
    try {
      const details = await getSupplierAccountApi(account.supplier_id);
      setSelected(details);
      setSearchParams({ supplier_id: String(account.supplier_id) });
      window.scrollTo({ top: 0, behavior: 'instant' });
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setDetailsLoading(false);
    }
  };

  const closeAccount = () => {
    setSelected(null);
    setSearchParams({});
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const openPaymentForm = (account: SupplierAccountSummary) => {
    setError(null);
    setNotice(null);
    setPaymentAccount(account);
    setPaymentForm({
      amount: Math.max(Number(account.balance || 0), 0),
      payment_date: today(),
      payment_method: 'BANK_TRANSFER',
      reference_number: '',
      notes: '',
    });
    if (account.balance <= 0) {
      setNotice('تنبيه: لا توجد مديونية موجبة حاليًا لهذا المورد؛ سيتم تسجيل أي مبلغ كدفعة مقدمة أو رصيد دائن.');
    }
  };

  const submitPayment = async (event: FormEvent) => {
    event.preventDefault();
    if (!paymentAccount) return;
    const amount = Number(paymentForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('قيمة الدفعة يجب أن تكون رقماً أكبر من صفر.');
      return;
    }
    setSavingPayment(true);
    setError(null);
    try {
      const result = await recordSupplierPaymentApi(paymentAccount.supplier_id, {
        ...paymentForm,
        amount,
        reference_number: paymentForm.reference_number?.trim() || undefined,
        notes: paymentForm.notes?.trim() || undefined,
      });
      setNotice(result.overpayment_warning ? `تحذير: ${result.message}` : result.message);
      setPaymentAccount(null);
      await loadAccounts();
      if (selected && selected.supplier.id === paymentAccount.supplier_id) {
        const updatedDetails = await getSupplierAccountApi(paymentAccount.supplier_id);
        setSelected(updatedDetails);
      }
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setSavingPayment(false);
    }
  };

  const filteredAccounts = useMemo(() => {
    const normalized = supplierSearch.trim().toLocaleLowerCase('ar-EG');
    if (!normalized) return accounts;
    return accounts.filter((account) =>
      `${account.company_name} ${account.code || ''} ${account.email || ''} ${account.phone || ''} ${account.supplier_id}`
        .toLocaleLowerCase('ar-EG')
        .includes(normalized)
    );
  }, [accounts, supplierSearch]);

  const totalInvoiced = accounts.reduce((sum, account) => sum + account.total_invoiced, 0);
  const totalPaid = accounts.reduce((sum, account) => sum + account.total_paid, 0);
  const totalBalance = accounts.reduce((sum, account) => sum + Math.max(account.balance, 0), 0);
  const overpaidCount = accounts.filter(account => account.is_overpaid).length;

  if (loading) {
    return (
      <div className="min-h-[360px] flex items-center justify-center p-6 text-sm font-bold text-cyan-300" dir="rtl">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
          <span>جاري تحميل حسابات الموردين...</span>
        </div>
      </div>
    );
  }

  // If a supplier is selected, show the Dedicated Full-Page View!
  if (selected) {
    return (
      <>
        <SupplierAccountDedicatedPage
          selected={selected}
          onBack={closeAccount}
          onRecordPayment={openPaymentForm}
        />

        {paymentAccount && createPortal(
          <div className="modal-top-viewport fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/85 p-2 sm:p-4" role="dialog" aria-modal="true">
            <form onSubmit={submitPayment} className="max-h-[calc(100vh-1rem)] w-full max-w-xl space-y-5 overflow-y-auto rounded-2xl border border-cyan-800/70 bg-slate-900 p-4 shadow-2xl sm:max-h-[calc(100vh-3rem)] sm:p-5">
              <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-3">
                <div>
                  <h2 className="text-lg font-black text-slate-100 flex items-center gap-2">
                    <span>💳</span>
                    <span>تسجيل دفعة على حساب المورد</span>
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">{paymentAccount.company_name} — سيتم خصم المبلغ من مديونية المورد.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setPaymentAccount(null)}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-2xl font-black text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
                  aria-label="إغلاق النافذة"
                >
                  ×
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 rounded-xl border border-cyan-800/50 bg-cyan-950/20 p-3 text-center text-xs">
                <div><span className="text-slate-500">إجمالي الفواتير</span><strong className="mt-1 block font-mono text-cyan-200">{money(paymentAccount.total_invoiced)}</strong></div>
                <div><span className="text-slate-500">إجمالي المدفوع</span><strong className="mt-1 block font-mono text-emerald-300">{money(paymentAccount.total_paid)}</strong></div>
                <div><span className="text-slate-500">الرصيد المستحق</span><strong className="mt-1 block font-mono text-amber-300">{money(Math.max(paymentAccount.balance, 0))}</strong></div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-300">
                  قيمة الدفعة (ج.م) *
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={paymentForm.amount}
                    onChange={event => setPaymentForm({ ...paymentForm, amount: Number(event.target.value) })}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 font-mono"
                  />
                </label>
                <label className="text-xs font-bold text-slate-300">
                  تاريخ الدفع *
                  <input
                    type="date"
                    required
                    value={paymentForm.payment_date}
                    onChange={event => setPaymentForm({ ...paymentForm, payment_date: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  />
                </label>
                <label className="text-xs font-bold text-slate-300">
                  طريقة الدفع
                  <select
                    value={paymentForm.payment_method}
                    onChange={event => setPaymentForm({ ...paymentForm, payment_method: event.target.value as CreateSupplierPaymentPayload['payment_method'] })}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  >
                    <option value="BANK_TRANSFER">تحويل بنكي</option>
                    <option value="CASH">نقدي</option>
                    <option value="CHEQUE">شيك</option>
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-300">
                  رقم المرجع (شيك / تحويل)
                  <input
                    value={paymentForm.reference_number || ''}
                    onChange={event => setPaymentForm({ ...paymentForm, reference_number: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  />
                </label>
              </div>

              <label className="block text-xs font-bold text-slate-300">
                ملاحظات
                <textarea
                  value={paymentForm.notes || ''}
                  onChange={event => setPaymentForm({ ...paymentForm, notes: event.target.value })}
                  className="mt-1 min-h-20 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-slate-100"
                />
              </label>

              <div className="flex justify-end gap-2 border-t border-slate-800 pt-3">
                <Button type="button" variant="secondary" onClick={() => setPaymentAccount(null)}>
                  إلغاء
                </Button>
                <Button type="submit" variant="success" isLoading={savingPayment}>
                  تسجيل الدفعة وتحديث الرصيد
                </Button>
              </div>
            </form>
          </div>,
          document.body
        )}
      </>
    );
  }

  // All Suppliers Overview Page
  return (
    <div className="min-w-0 space-y-6 animate-fade-in" dir="rtl">
      <div className="flex flex-col gap-3 border-b border-slate-800 pb-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-black text-slate-100">حسابات الموردين</h1>
          <p className="mt-1 break-normal text-xs leading-6 text-slate-400">
            كشف مستقل لمديونية المورد والفواتير والمدفوعات والتوزيع على أقدم مديونية.
          </p>
        </div>
        <Link to="/accounting/supplier-payments" className="w-full md:w-auto">
          <Button variant="primary" className="w-full whitespace-nowrap md:w-auto">
            الفواتير وتسجيل الدفعات
          </Button>
        </Link>
      </div>

      {error && <ErrorMessage error={error} onDismiss={() => setError(null)} onRetry={() => void loadAccounts()} />}
      {notice && (
        <div className="rounded-xl border border-cyan-700/60 bg-cyan-950/30 p-3 text-sm font-bold text-cyan-200">
          {notice}
          <button type="button" className="mr-3 text-cyan-400 underline" onClick={() => setNotice(null)}>
            إغلاق
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><div className="text-xs text-slate-400">إجمالي الفواتير المطابقة</div><div className="mt-2 whitespace-nowrap text-xl font-black text-cyan-300">{money(totalInvoiced)}</div></Card>
        <Card><div className="text-xs text-slate-400">إجمالي المدفوعات</div><div className="mt-2 whitespace-nowrap text-xl font-black text-emerald-300">{money(totalPaid)}</div></Card>
        <Card><div className="text-xs text-slate-400">إجمالي المديونية الحالية</div><div className="mt-2 whitespace-nowrap text-xl font-black text-amber-300">{money(totalBalance)}</div></Card>
        <Card><div className="text-xs text-slate-400">حسابات بها دفع زائد</div><div className="mt-2 text-xl font-black text-rose-300">{overpaidCount}</div></Card>
      </div>

      <Card className="min-w-0 space-y-4">
        <div>
          <h2 className="text-base font-black text-slate-100">ملخص الموردين ({filteredAccounts.length} من {accounts.length})</h2>
          <p className="mt-1 break-normal text-xs leading-6 text-slate-400">
            اضغط على أي مورد لفتح كشف حسابه الكامل وسجل الفواتير والدفعات في صفحة مخصصة ومستقلة.
          </p>
        </div>

        <TableColumnFilters
          filters={[{ key: 'supplier', label: 'اسم المورد أو الكود أو الرقم', value: supplierSearch, onChange: setSupplierSearch }]}
          hasActiveFilters={Boolean(supplierSearch)}
          onClear={() => setSupplierSearch('')}
        />

        <div className="hidden min-w-0 md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">المورد</TableHead>
                <TableHead className="whitespace-nowrap">عدد الفواتير</TableHead>
                <TableHead className="whitespace-nowrap">إجمالي الفواتير</TableHead>
                <TableHead className="whitespace-nowrap">إجمالي المدفوع</TableHead>
                <TableHead className="whitespace-nowrap">المديونية</TableHead>
                <TableHead className="whitespace-nowrap">الدفعات</TableHead>
                <TableHead className="whitespace-nowrap">الحالة</TableHead>
                <TableHead className="whitespace-nowrap">الإجراء</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAccounts.map(account => (
                <TableRow key={account.supplier_id}>
                  <TableCell className="max-w-[200px] font-bold text-slate-100">{account.company_name}</TableCell>
                  <TableCell>{account.invoices_count}</TableCell>
                  <TableCell className="whitespace-nowrap font-mono">{money(account.total_invoiced)}</TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-emerald-300">{money(account.total_paid)}</TableCell>
                  <TableCell className={`whitespace-nowrap font-mono font-bold ${account.balance < 0 ? 'text-rose-300' : 'text-amber-300'}`}>{money(account.balance)}</TableCell>
                  <TableCell>{account.payments_count}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span className={`rounded-md px-2 py-1 text-[11px] font-bold ${account.is_overpaid ? 'bg-rose-950 text-rose-300' : account.balance > 0 ? 'bg-amber-950 text-amber-300' : 'bg-slate-800 text-slate-300'}`}>
                      {account.is_overpaid ? 'دفع زائد' : account.balance > 0 ? 'مديونية قائمة' : 'مسدد'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" isLoading={detailsLoading} onClick={() => void openAccount(account)}>
                        فتح كشف الحساب
                      </Button>
                      <Button size="sm" variant="success" onClick={() => openPaymentForm(account)}>
                        تسجيل دفعة
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="space-y-3 md:hidden">
          {filteredAccounts.map(account => (
            <article key={`mobile-${account.supplier_id}`} className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <span className="min-w-0 break-normal text-sm font-black text-slate-100">{account.company_name}</span>
                <span className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-bold ${account.is_overpaid ? 'bg-rose-950 text-rose-300' : account.balance > 0 ? 'bg-amber-950 text-amber-300' : 'bg-slate-800 text-slate-300'}`}>
                  {account.is_overpaid ? 'دفع زائد' : account.balance > 0 ? 'مديونية قائمة' : 'مسدد'}
                </span>
              </div>
              <dl className="mt-4 grid min-w-0 grid-cols-1 gap-3 text-xs min-[420px]:grid-cols-2">
                <div><dt className="text-slate-500">عدد الفواتير</dt><dd className="mt-1 font-bold text-slate-200">{account.invoices_count}</dd></div>
                <div><dt className="text-slate-500">عدد الدفعات</dt><dd className="mt-1 font-bold text-slate-200">{account.payments_count}</dd></div>
                <div><dt className="text-slate-500">إجمالي الفواتير</dt><dd className="mt-1 whitespace-nowrap font-mono text-cyan-300">{money(account.total_invoiced)}</dd></div>
                <div><dt className="text-slate-500">إجمالي المدفوع</dt><dd className="mt-1 whitespace-nowrap font-mono text-emerald-300">{money(account.total_paid)}</dd></div>
                <div className="min-[420px]:col-span-2"><dt className="text-slate-500">الرصيد الحالي</dt><dd className={`mt-1 whitespace-nowrap font-mono font-black ${account.balance < 0 ? 'text-rose-300' : 'text-amber-300'}`}>{money(account.balance)}</dd></div>
              </dl>
              <div className="mt-4 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
                <Button size="sm" variant="secondary" className="w-full whitespace-nowrap font-bold" isLoading={detailsLoading} onClick={() => void openAccount(account)}>
                  فتح كشف الحساب
                </Button>
                <Button size="sm" variant="success" className="w-full whitespace-nowrap font-bold" onClick={() => openPaymentForm(account)}>
                  تسجيل دفعة
                </Button>
              </div>
            </article>
          ))}
        </div>

        {!filteredAccounts.length && <div className="py-8 text-center text-sm text-slate-500">{accounts.length ? 'لا توجد نتائج مطابقة للبحث الحالي.' : 'لا توجد حسابات موردين متاحة.'}</div>}
      </Card>

      {paymentAccount && createPortal(
        <div className="modal-top-viewport fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/80 p-2 sm:p-4" role="dialog" aria-modal="true">
          <form onSubmit={submitPayment} className="max-h-[calc(100vh-1rem)] w-full max-w-xl space-y-5 overflow-y-auto rounded-2xl border border-cyan-800/70 bg-slate-900 p-4 shadow-2xl sm:max-h-[calc(100vh-3rem)] sm:p-5">
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-lg font-black text-slate-100 flex items-center gap-2">
                  <span>💳</span>
                  <span>تسجيل دفعة على حساب المورد</span>
                </h2>
                <p className="mt-1 text-xs text-slate-400">{paymentAccount.company_name} — سيتم خصم المبلغ من مديونية المورد.</p>
              </div>
              <button
                type="button"
                onClick={() => setPaymentAccount(null)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-2xl font-black text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
                aria-label="إغلاق النافذة"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 rounded-xl border border-cyan-800/50 bg-cyan-950/20 p-3 text-center text-xs">
              <div><span className="text-slate-500">إجمالي الفواتير</span><strong className="mt-1 block font-mono text-cyan-200">{money(paymentAccount.total_invoiced)}</strong></div>
              <div><span className="text-slate-500">إجمالي المدفوع</span><strong className="mt-1 block font-mono text-emerald-300">{money(paymentAccount.total_paid)}</strong></div>
              <div><span className="text-slate-500">الرصيد المستحق</span><strong className="mt-1 block font-mono text-amber-300">{money(Math.max(paymentAccount.balance, 0))}</strong></div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold text-slate-300">
                قيمة الدفعة (ج.م) *
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={paymentForm.amount}
                  onChange={event => setPaymentForm({ ...paymentForm, amount: Number(event.target.value) })}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 font-mono"
                />
              </label>
              <label className="text-xs font-bold text-slate-300">
                تاريخ الدفع *
                <input
                  type="date"
                  required
                  value={paymentForm.payment_date}
                  onChange={event => setPaymentForm({ ...paymentForm, payment_date: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                />
              </label>
              <label className="text-xs font-bold text-slate-300">
                طريقة الدفع
                <select
                  value={paymentForm.payment_method}
                  onChange={event => setPaymentForm({ ...paymentForm, payment_method: event.target.value as CreateSupplierPaymentPayload['payment_method'] })}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                >
                  <option value="BANK_TRANSFER">تحويل بنكي</option>
                  <option value="CASH">نقدي</option>
                  <option value="CHEQUE">شيك</option>
                </select>
              </label>
              <label className="text-xs font-bold text-slate-300">
                رقم المرجع (شيك / تحويل)
                <input
                  value={paymentForm.reference_number || ''}
                  onChange={event => setPaymentForm({ ...paymentForm, reference_number: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                />
              </label>
            </div>

            <label className="block text-xs font-bold text-slate-300">
              ملاحظات
              <textarea
                value={paymentForm.notes || ''}
                onChange={event => setPaymentForm({ ...paymentForm, notes: event.target.value })}
                className="mt-1 min-h-20 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-slate-100"
              />
            </label>

            <div className="flex justify-end gap-2 border-t border-slate-800 pt-3">
              <Button type="button" variant="secondary" onClick={() => setPaymentAccount(null)}>
                إلغاء
              </Button>
              <Button type="submit" variant="success" isLoading={savingPayment}>
                تسجيل الدفعة وتحديث الرصيد
              </Button>
            </div>
          </form>
        </div>,
        document.body
      )}
    </div>
  );
};

export default SupplierAccountsPage;
