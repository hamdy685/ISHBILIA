import React, { FormEvent, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CreateLandParcelPayload,
  CreateLandParcelFundingPayload,
  LandParcel,
  LandParcelAccountDetails,
  addCustomerFundingApi,
  createLandParcelApi,
  getLandParcelAccountApi,
  getLandParcelsApi,
} from '../../api/supplierFinance';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/Table';
import ErrorMessage from '../../components/ErrorMessage';
import { parseApiError } from '../../utils/apiError';
import { getTodayInputDate } from '../../utils/dateFilters';
import { getUnitLabel } from '../../utils/units';
import { tafqeetCurrency } from '../../utils/tafqeet';
import { formatCleanNumber } from '../../utils/numberFormat';

const today = getTodayInputDate;
const money = (value: string | number | null | undefined) =>
  `${formatCleanNumber(value)} ج.م`;

const cleanDate = (value: string | null | undefined): string => {
  if (!value) return '—';
  const raw = String(value).trim();
  if (!raw) return '—';
  const datePart = raw.includes('T') ? raw.split('T')[0] : raw.split(' ')[0];
  return datePart || '—';
};

const parcelTransactionLabels: Record<string, string> = {
  OPENING_BALANCE: 'دفعة المقدم',
  CUSTOMER_FUNDING: 'تحصيل من العميل',
  INVOICE_EXPENSE: 'مصروف فاتورة تنفيذ',
};

const LandParcelsPage: React.FC = () => {
  const [parcels, setParcels] = useState<LandParcel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [parcelDetails, setParcelDetails] = useState<LandParcelAccountDetails | null>(null);
  const [activeTab, setActiveTab] = useState<'materials' | 'collections' | 'invoices' | 'ledger' | 'departments'>('materials');
  const [parcelFormOpen, setParcelFormOpen] = useState(false);
  const [parcelFormError, setParcelFormError] = useState<string | null>(null);
  const [fundingParcel, setFundingParcel] = useState<LandParcel | null>(null);
  const [fundingFormError, setFundingFormError] = useState<string | null>(null);
  const [parcelForm, setParcelForm] = useState<CreateLandParcelPayload>({
    parcel_reference: '',
    region: '',
    opening_balance: 0,
    transaction_date: today(),
    reference_number: '',
    notes: '',
  });
  const [fundingForm, setFundingForm] = useState<CreateLandParcelFundingPayload>({
    amount: 0,
    transaction_date: today(),
    reference_number: '',
    notes: '',
  });

  const validatePositiveAmount = (value: number, label: string): string | null => {
    if (!Number.isFinite(value) || value <= 0) {
      return `${label} يجب أن يكون رقماً أكبر من صفر.`;
    }
    return null;
  };

  const refreshParcels = async () => {
    const data = await getLandParcelsApi();
    setParcels(data);
    return data;
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      await refreshParcels();
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openParcelForm = () => {
    setError(null);
    setNotice(null);
    setParcelForm({
      parcel_reference: '',
      region: '',
      opening_balance: 0,
      transaction_date: today(),
      reference_number: '',
      notes: '',
    });
    setParcelFormError(null);
    setParcelFormOpen(true);
  };

  const submitParcel = async (event: FormEvent) => {
    event.preventDefault();
    if (!parcelForm.parcel_reference.trim() || !parcelForm.region.trim()) {
      setParcelFormError('رقم قطعة الأرض والمنطقة مطلوبان.');
      return;
    }
    setSaving(true);
    setParcelFormError(null);
    try {
      await createLandParcelApi({
        ...parcelForm,
        parcel_reference: parcelForm.parcel_reference.trim(),
        region: parcelForm.region.trim(),
        opening_balance: Number(parcelForm.opening_balance || 0),
        reference_number: parcelForm.reference_number?.trim() || undefined,
        notes: parcelForm.notes?.trim() || undefined,
      });
      setParcelFormOpen(false);
      setNotice('تم إنشاء حساب قطعة الأرض وتسجيل دفعة المقدم بنجاح.');
      await refreshParcels();
    } catch (err) {
      setParcelFormError(parseApiError(err).message);
    } finally {
      setSaving(false);
    }
  };

  const openParcelDetails = async (parcel: LandParcel) => {
    setError(null);
    setNotice(null);
    setSaving(true);
    setActiveTab('materials');
    try {
      setParcelDetails(await getLandParcelAccountApi(parcel.id));
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setSaving(false);
    }
  };

  const openFundingForm = (parcel: LandParcel) => {
    setError(null);
    setNotice(null);
    setFundingParcel(parcel);
    setFundingFormError(null);
    setFundingForm({ amount: 0, transaction_date: today(), reference_number: '', notes: '' });
  };

  const submitFunding = async (event: FormEvent) => {
    event.preventDefault();
    if (!fundingParcel) return;
    const amount = Number(fundingForm.amount);
    const amountError = validatePositiveAmount(amount, 'مبلغ التحصيل');
    if (amountError) {
      setFundingFormError(amountError);
      return;
    }
    setSaving(true);
    setFundingFormError(null);
    try {
      await addCustomerFundingApi(fundingParcel.id, {
        ...fundingForm,
        amount,
        reference_number: fundingForm.reference_number?.trim() || undefined,
        notes: fundingForm.notes?.trim() || undefined,
      });
      setFundingParcel(null);
      setNotice('تم تسجيل دفعة التحصيل بنجاح وإضافتها إلى رصيد حساب العميل.');
      await refreshParcels();
    } catch (err) {
      setFundingFormError(parseApiError(err).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[360px] p-6 text-sm font-bold text-cyan-300" dir="rtl">
        جاري تحميل دفتر قطع الأراضي وحسابات العملاء...
      </div>
    );
  }

  const totalParcelBalance = parcels.reduce((sum, p) => sum + Number(p.balance || 0), 0);
  const totalOpenings = parcels.reduce((sum, p) => sum + Number(p.opening_balance || 0), 0);
  const totalFunded = parcels.reduce((sum, p) => sum + Number(p.funded_total || 0), 0);
  const totalReceivedAcross = totalOpenings + totalFunded;
  const totalExpenses = parcels.reduce((sum, p) => sum + Number(p.expense_total || 0), 0);
  const overallBurnRate = totalReceivedAcross > 0 ? Math.min(100, (totalExpenses / totalReceivedAcross) * 100) : 0;

  // Modal specific calculations
  const openingInModal = parcelDetails ? Number(parcelDetails.summary.opening_balance || 0) : 0;
  const fundedInModal = parcelDetails ? Number(parcelDetails.summary.funded_total || 0) : 0;
  const totalReceivedInModal = openingInModal + fundedInModal;
  const spentInModal = parcelDetails ? Number(parcelDetails.summary.expense_total || 0) : 0;
  const balanceInModal = parcelDetails ? Number(parcelDetails.summary.balance || 0) : 0;
  const burnRateInModal = totalReceivedInModal > 0 ? (spentInModal / totalReceivedInModal) * 100 : 0;
  const isNegativeInModal = parcelDetails ? parcelDetails.summary.is_negative : false;

  // Collections (Advance + Additional collections)
  const collectionsList = parcelDetails
    ? parcelDetails.transactions.filter(
        (t) => t.transaction_type === 'OPENING_BALANCE' || t.transaction_type === 'CUSTOMER_FUNDING'
      )
    : [];

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-slate-800 pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-100 flex items-center gap-2">
            <span>🏗️</span> دفتر قطع الأراضي وكشوف حسابات العملاء
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            متابعة المقدمات والتحصيلات، ونسب استهلاك الميزانيات، وتوريدات المواد والمصروفات المنفذة لكل موقع.
          </p>
        </div>
        <Button size="sm" variant="primary" onClick={openParcelForm} className="font-bold flex items-center gap-1.5">
          <span>➕</span> إضافة قطعة أرض / تسجيل المقدم
        </Button>
      </div>

      {error && <ErrorMessage error={error} />}
      {notice && (
        <div className="rounded-xl border border-emerald-700/60 bg-emerald-950/30 p-3 text-xs font-bold text-emerald-200">
          {notice}
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="border-slate-800 bg-slate-900/80">
          <div className="text-[11px] font-bold text-slate-400">عدد القطع المسجلة</div>
          <div className="mt-2 text-2xl font-black text-cyan-300">{parcels.length}</div>
          <div className="mt-1 text-[10px] text-slate-500 font-bold">مواقع وقطع نشطة</div>
        </Card>
        <Card className="border-emerald-800/50 bg-emerald-950/10">
          <div className="text-[11px] font-bold text-slate-400">إجمالي المقبوض (مقدم + تحصيلات)</div>
          <div className="mt-2 text-2xl font-black text-emerald-300">{money(totalReceivedAcross)}</div>
          <div className="mt-1 text-[10px] text-emerald-400/80 font-bold">
            مقدمات: {money(totalOpenings)} | تحصيلات: {money(totalFunded)}
          </div>
        </Card>
        <Card className="border-amber-800/50 bg-amber-950/10">
          <div className="text-[11px] font-bold text-slate-400">إجمالي المصروفات المنفذة</div>
          <div className="mt-2 text-2xl font-black text-amber-300">{money(totalExpenses)}</div>
          <div className="mt-1 text-[10px] text-amber-400/80 font-bold">مصروفات فواتير وتوريدات موزعة</div>
        </Card>
        <Card
          className={`border-cyan-800/50 ${
            totalParcelBalance < 0 ? 'border-rose-700/60 bg-rose-950/20' : 'bg-cyan-950/10'
          }`}
        >
          <div className="text-[11px] font-bold text-slate-400">صافي المتبقي من التحصيلات</div>
          <div
            className={`mt-2 text-2xl font-black ${
              totalParcelBalance < 0 ? 'text-rose-400' : 'text-cyan-300'
            }`}
          >
            {money(totalParcelBalance)}
          </div>
          <div className="mt-1 text-[10px] text-slate-400 font-bold">
            معدل الصرف الإجمالي: {overallBurnRate.toFixed(1)}%
          </div>
        </Card>
      </div>

      {/* Main Parcels Table */}
      <Card className="space-y-4">
        <div className="rounded-xl border border-cyan-800/50 bg-cyan-950/20 p-3 text-xs leading-6 text-cyan-100 flex items-center justify-between flex-wrap gap-2">
          <span>
            💡 <strong>ملاحظة مالية:</strong> تسجل دفعات العميل (المقدم + التحصيلات) في حساب القطعة، وتخصم منها
            المصروفات المنفذة للأقسام لتحديد المتبقي ونسبة الإنجاز المالي بدقة.
          </span>
          <span className="text-[11px] font-mono text-cyan-300 bg-cyan-900/60 px-2 py-0.5 rounded border border-cyan-700/60">
            إجمالي القطع: {parcels.length}
          </span>
        </div>

        <div className="hidden min-w-0 md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">رقم قطعة الأرض</TableHead>
                <TableHead className="whitespace-nowrap">المنطقة</TableHead>
                <TableHead className="whitespace-nowrap">المقدم</TableHead>
                <TableHead className="whitespace-nowrap">التحصيلات</TableHead>
                <TableHead className="whitespace-nowrap">إجمالي المقبوض</TableHead>
                <TableHead className="whitespace-nowrap">إجمالي المصروفات</TableHead>
                <TableHead className="whitespace-nowrap">مؤشر الصرف</TableHead>
                <TableHead className="whitespace-nowrap">الرصيد المتبقي</TableHead>
                <TableHead className="whitespace-nowrap text-center">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parcels.map((parcel) => {
                const openBal = Number(parcel.opening_balance || 0);
                const fundBal = Number(parcel.funded_total || 0);
                const totalRec = openBal + fundBal;
                const spent = Number(parcel.expense_total || 0);
                const pct = totalRec > 0 ? (spent / totalRec) * 100 : 0;
                const isNeg = Number(parcel.balance || 0) < 0;

                return (
                  <TableRow key={parcel.id}>
                    <TableCell className="font-mono font-bold text-cyan-300">{parcel.parcel_reference}</TableCell>
                    <TableCell className="font-bold text-slate-200">{parcel.region}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-300">{money(openBal)}</TableCell>
                    <TableCell className="font-mono text-xs text-emerald-300">{money(fundBal)}</TableCell>
                    <TableCell className="font-mono text-xs font-bold text-emerald-200">{money(totalRec)}</TableCell>
                    <TableCell className="font-mono text-xs font-bold text-amber-300">{money(spent)}</TableCell>
                    <TableCell className="min-w-[120px]">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-mono text-slate-400">
                          <span>{pct.toFixed(0)}%</span>
                          <span>{isNeg ? '⚠️ مكشوف' : pct > 85 ? '⚡ مرتفع' : '✅ آمن'}</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                          <div
                            className={`h-full rounded-full ${
                              isNeg || pct > 95
                                ? 'bg-rose-500'
                                : pct > 75
                                ? 'bg-amber-400'
                                : 'bg-emerald-400'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(pct, 2))}%` }}
                          />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className={`font-mono text-xs font-black ${isNeg ? 'text-rose-400' : 'text-cyan-300'}`}>
                      {money(parcel.balance)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1.5">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => openFundingForm(parcel)}
                          className="border-emerald-700/60 text-emerald-300 hover:bg-emerald-950 font-bold text-xs"
                          title="تسجيل دفعة تحصيل من العميل"
                        >
                          <span>💵</span> تحصيل
                        </Button>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => openParcelDetails(parcel)}
                          className="font-bold text-xs"
                        >
                          <span>👁️</span> كشف الحساب
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Mobile Cards */}
        <div className="space-y-3 md:hidden">
          {parcels.map((parcel) => {
            const openBal = Number(parcel.opening_balance || 0);
            const fundBal = Number(parcel.funded_total || 0);
            const totalRec = openBal + fundBal;
            const spent = Number(parcel.expense_total || 0);
            const isNeg = Number(parcel.balance || 0) < 0;

            return (
              <article key={parcel.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
                <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-2.5">
                  <div>
                    <span className="font-mono text-base font-black text-cyan-300 block">
                      قطعة: {parcel.parcel_reference}
                    </span>
                    <span className="text-xs text-slate-400">المنطقة: {parcel.region}</span>
                  </div>
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-mono font-bold ${
                      isNeg ? 'bg-rose-950 text-rose-300 border border-rose-800' : 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                    }`}
                  >
                    {money(parcel.balance)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-900/80 p-2 rounded-lg">
                    <span className="text-[10px] text-slate-400 block">المقدم:</span>
                    <span className="font-mono text-slate-200">{money(openBal)}</span>
                  </div>
                  <div className="bg-slate-900/80 p-2 rounded-lg">
                    <span className="text-[10px] text-slate-400 block">التحصيلات:</span>
                    <span className="font-mono text-emerald-300">{money(fundBal)}</span>
                  </div>
                  <div className="bg-slate-900/80 p-2 rounded-lg">
                    <span className="text-[10px] text-slate-400 block">إجمالي المقبوض:</span>
                    <span className="font-mono font-bold text-emerald-200">{money(totalRec)}</span>
                  </div>
                  <div className="bg-slate-900/80 p-2 rounded-lg">
                    <span className="text-[10px] text-slate-400 block">إجمالي المصروفات:</span>
                    <span className="font-mono font-bold text-amber-300">{money(spent)}</span>
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => openFundingForm(parcel)}
                    className="flex-1 border-emerald-700/60 text-emerald-300 hover:bg-emerald-950 font-bold"
                  >
                    <span>💵</span> تحصيل
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => openParcelDetails(parcel)}
                    className="flex-1 font-bold"
                  >
                    <span>👁️</span> كشف الحساب
                  </Button>
                </div>
              </article>
            );
          })}
        </div>

        {!parcels.length && (
          <div className="py-8 text-center text-sm text-slate-500">
            لم يتم إنشاء حسابات قطع أراضٍ بعد. أضف قطعة أرض وسجل دفعة المقدم الخاصة بالعميل.
          </div>
        )}
      </Card>

      {/* ── PARCEL DETAILS & CLIENT STATEMENT MODAL (With Comprehensive Print Support) ── */}
      {parcelDetails &&
        createPortal(
          <div
            className="modal-top-viewport print-container fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/85 p-2 sm:p-4 print:static print:block print:bg-white print:p-0"
            role="dialog"
            aria-modal="true"
          >
            <div className="print-document max-h-[calc(100vh-1rem)] w-full max-w-6xl space-y-5 overflow-y-auto rounded-2xl border border-cyan-800/70 bg-slate-900 p-4 shadow-2xl sm:max-h-[calc(100vh-2rem)] sm:p-6 print:bg-white print:text-black print:p-0 print:border-none print:shadow-none print:max-h-none print:overflow-visible">
              {/* Modal Header & Official Company Header for Print */}
              <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4 print:border-b-2 print:border-black">
                <div className="w-full">
                  <div className="hidden print:block text-center mb-3">
                    <img
                      src="/eshbelia-logo.png"
                      alt="شعار شركة اشبيلية"
                      className="document-logo mx-auto h-16 w-auto object-contain"
                    />
                    <h1 className="text-xl font-black text-slate-900">شركة اشبيلية للتطوير العقاري والمقاولات</h1>
                    <p className="text-xs text-slate-600">نظام إدارة ومتابعة المشروعات والرقابة المالية للمواقع</p>
                    <div className="mt-2 text-base font-black text-black bg-slate-100 py-1 px-4 border border-slate-300 rounded inline-block">
                      كشف حساب العميل — حركة المصروفات والتحصيلات والتوريدات للموقع
                    </div>
                  </div>

                  <h2 className="text-lg font-black text-slate-100 print:text-black flex items-center gap-2 print:hidden">
                    <span>🏗️</span> كشف حساب العميل لقطعة الأرض —{' '}
                    <span className="font-mono text-cyan-300 print:text-black">
                      {parcelDetails.parcel.parcel_reference}
                    </span>
                  </h2>

                  <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-slate-400 print:text-slate-900 bg-slate-950/40 print:bg-slate-50 p-2.5 rounded-lg border border-slate-800 print:border-slate-300">
                    <div>
                      <span className="text-slate-500 print:text-slate-600 block text-[10px]">رقم قطعة الأرض:</span>
                      <strong className="font-mono text-sm text-cyan-300 print:text-black">
                        {parcelDetails.parcel.parcel_reference}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500 print:text-slate-600 block text-[10px]">المنطقة / الموقع:</span>
                      <strong className="text-slate-200 print:text-black">{parcelDetails.parcel.region}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 print:text-slate-600 block text-[10px]">تاريخ الكشف:</span>
                      <strong className="font-mono text-slate-200 print:text-black">{today()}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 print:text-slate-600 block text-[10px]">العملة المعتمدة:</span>
                      <strong className="text-slate-200 print:text-black">الجنيه المصري (EGP)</strong>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 print:hidden shrink-0">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="font-bold flex items-center gap-1.5 border-cyan-700 text-cyan-200 hover:bg-cyan-950"
                    onClick={() => window.print()}
                  >
                    <span>🖨️</span>
                    <span>طباعة الكشف للعميل</span>
                  </Button>
                  <button
                    type="button"
                    onClick={() => setParcelDetails(null)}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-2xl font-black text-slate-300 hover:bg-slate-800 hover:text-white"
                    aria-label="إغلاق النافذة"
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* ── 1. EXECUTIVE FINANCIAL SUMMARY ── */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 print:border-b print:border-slate-400">
                  <h3 className="text-xs font-black text-cyan-300 print:text-black flex items-center gap-1.5">
                    <span>📊</span> الملخص المالي التنفيذي لحساب العميل
                  </h3>
                  <span className="text-[11px] font-mono text-slate-400 print:text-slate-700">
                    معدل الصرف: <strong>{burnRateInModal.toFixed(1)}%</strong>
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3 print:border print:border-slate-400 print:bg-white">
                    <div className="text-[11px] text-slate-400 print:text-slate-700 font-bold">المقدم (الدفعة المقدمة)</div>
                    <strong className="mt-1 block font-mono text-base text-slate-100 print:text-black">
                      {money(openingInModal)}
                    </strong>
                    <div className="mt-0.5 text-[9px] text-slate-500 font-normal">المسدد عند التعاقد</div>
                  </div>
                  <div className="rounded-xl border border-emerald-800/60 bg-emerald-950/20 p-3 print:border print:border-slate-400 print:bg-white">
                    <div className="text-[11px] text-slate-400 print:text-slate-700 font-bold">التحصيلات (الدفعات الإضافية)</div>
                    <strong className="mt-1 block font-mono text-base text-emerald-300 print:text-black">
                      {money(fundedInModal)}
                    </strong>
                    <div className="mt-0.5 text-[9px] text-emerald-400/80 font-normal">
                      عدد الدفعات: {collectionsList.length > 0 ? collectionsList.length : 0}
                    </div>
                  </div>
                  <div className="rounded-xl border border-cyan-800/60 bg-cyan-950/20 p-3 print:border print:border-slate-400 print:bg-white">
                    <div className="text-[11px] text-slate-400 print:text-slate-700 font-bold">إجمالي المقبوض من العميل</div>
                    <strong className="mt-1 block font-mono text-base text-cyan-200 print:text-black">
                      {money(totalReceivedInModal)}
                    </strong>
                    <div className="mt-0.5 text-[9px] text-cyan-400/80 font-normal">المقدم + إجمالي التحصيلات</div>
                  </div>
                  <div className="rounded-xl border border-amber-800/60 bg-amber-950/20 p-3 print:border print:border-slate-400 print:bg-white">
                    <div className="text-[11px] text-slate-400 print:text-slate-700 font-bold">إجمالي المصروفات المنفذة</div>
                    <strong className="mt-1 block font-mono text-base text-amber-300 print:text-black">
                      {money(spentInModal)}
                    </strong>
                    <div className="mt-0.5 text-[9px] text-amber-400/80 font-normal">
                      الفواتير والتوريدات الموزعة
                    </div>
                  </div>
                </div>

                {/* Balance Statement & Tafqeet */}
                <div
                  className={`rounded-xl border p-4 print:border print:border-slate-400 print:bg-slate-50 ${
                    isNegativeInModal
                      ? 'border-rose-800/70 bg-rose-950/30'
                      : 'border-cyan-800/70 bg-cyan-950/30'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div>
                      <div className="text-xs text-slate-300 print:text-slate-700 font-bold">
                        {balanceInModal >= 0
                          ? 'الرصيد المتبقي المتاح للصرف لصالح العميل:'
                          : 'المديونية / المبالغ المستحقة على العميل:'}
                      </div>
                      <div className="mt-1 font-sans text-xs font-bold text-slate-100 print:text-black">
                        المبلغ بالحروف:{' '}
                        <span className="underline decoration-cyan-400 underline-offset-4">
                          فقط {tafqeetCurrency(Math.abs(balanceInModal))} لا غير.
                        </span>
                      </div>
                    </div>
                    <div className="text-left">
                      <strong
                        className={`font-mono text-xl font-black ${
                          isNegativeInModal ? 'text-rose-300 print:text-black' : 'text-cyan-200 print:text-black'
                        }`}
                      >
                        {money(balanceInModal)}
                      </strong>
                      <span
                        className={`block text-[10px] font-bold ${
                          isNegativeInModal ? 'text-rose-400' : 'text-emerald-400'
                        }`}
                      >
                        {isNegativeInModal ? '⚠️ يتطلب تحصيل دفعة جديدة' : '✅ سيولة كافية للتنفيذ'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── 2. DEPARTMENT BREAKDOWN ── */}
              {parcelDetails.department_breakdown && parcelDetails.department_breakdown.length > 0 && (
                <div className="rounded-xl border border-cyan-800/60 bg-cyan-950/20 p-4 space-y-3 print:border print:border-slate-400 print:bg-white">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black text-cyan-200 print:text-black flex items-center gap-2">
                      <span>🏢</span> تفاصيل ما تم صرفه على الموقع حسب الأقسام (تطوير، تشطيبات، مشروعات...):
                    </h3>
                    <span className="text-[11px] font-mono text-slate-400 print:text-slate-600">
                      عدد الأقسام: {parcelDetails.department_breakdown.length}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {parcelDetails.department_breakdown.map((dept, idx) => {
                      const deptShare = spentInModal > 0 ? (dept.total_amount / spentInModal) * 100 : 0;
                      return (
                        <div
                          key={idx}
                          className="rounded-lg border border-slate-700 bg-slate-900/90 p-3 flex justify-between items-center print:border print:border-slate-300 print:bg-white"
                        >
                          <div>
                            <div className="text-xs font-bold text-slate-200 print:text-black">
                              {dept.department_name}
                            </div>
                            <div className="text-[10px] text-slate-400 print:text-slate-600 mt-0.5">
                              {dept.invoices_count} فاتورة ({deptShare.toFixed(0)}% من المصروفات)
                            </div>
                          </div>
                          <strong className="font-mono text-xs font-bold text-amber-300 print:text-black">
                            {money(dept.total_amount)}
                          </strong>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Navigation Tabs (Interactive in UI, All Shown in Print) */}
              <div className="flex border-b border-slate-800 gap-2 text-xs font-bold print:hidden">
                <button
                  type="button"
                  className={`pb-2.5 px-3 border-b-2 transition-colors ${
                    activeTab === 'materials'
                      ? 'border-cyan-400 text-cyan-300'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                  onClick={() => setActiveTab('materials')}
                >
                  🧱 المواد والأصناف الموردة ({parcelDetails.materials?.length || 0})
                </button>
                <button
                  type="button"
                  className={`pb-2.5 px-3 border-b-2 transition-colors ${
                    activeTab === 'collections'
                      ? 'border-cyan-400 text-cyan-300'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                  onClick={() => setActiveTab('collections')}
                >
                  📥 التحصيلات والمقدم ({collectionsList.length})
                </button>
                <button
                  type="button"
                  className={`pb-2.5 px-3 border-b-2 transition-colors ${
                    activeTab === 'invoices'
                      ? 'border-cyan-400 text-cyan-300'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                  onClick={() => setActiveTab('invoices')}
                >
                  🧾 فواتير المصروفات ({parcelDetails.invoice_allocations.length})
                </button>
                <button
                  type="button"
                  className={`pb-2.5 px-3 border-b-2 transition-colors ${
                    activeTab === 'ledger'
                      ? 'border-cyan-400 text-cyan-300'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                  onClick={() => setActiveTab('ledger')}
                >
                  📜 كشف الحساب التراكمي ({parcelDetails.transactions.length})
                </button>
              </div>

              {/* ── SECTION A: CUSTOMER COLLECTIONS & ADVANCE LOG ── */}
              <div className={`${activeTab === 'collections' ? 'block' : 'hidden'} print:block space-y-3`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-100 print:text-black flex items-center gap-1.5">
                    <span>📥</span> سجل التحصيلات والدفعات المسددة من العميل (المقدم والتمويلات)
                  </h3>
                  <span className="text-xs text-slate-400 print:text-slate-600">
                    إجمالي التحصيلات والمقدم: <strong>{money(totalReceivedInModal)}</strong>
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <Table className="print:text-black">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap text-center">م</TableHead>
                        <TableHead className="whitespace-nowrap text-center">تاريخ التحصيل</TableHead>
                        <TableHead className="whitespace-nowrap text-center">نوع الدفعة</TableHead>
                        <TableHead className="whitespace-nowrap text-center">رقم الإيصال / المرجع</TableHead>
                        <TableHead className="whitespace-nowrap text-center">المبلغ المحصل</TableHead>
                        <TableHead className="whitespace-nowrap text-center">الملاحظات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {collectionsList.length > 0 ? (
                        collectionsList.map((col, idx) => (
                          <TableRow key={col.id}>
                            <TableCell className="text-center font-mono text-xs">{idx + 1}</TableCell>
                            <TableCell className="font-mono text-center text-xs">
                              {cleanDate(col.transaction_date)}
                            </TableCell>
                            <TableCell className="font-bold text-center text-xs">
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] ${
                                  col.transaction_type === 'OPENING_BALANCE'
                                    ? 'bg-cyan-950 text-cyan-300 border border-cyan-800/60 print:bg-white print:border-black print:text-black'
                                    : 'bg-emerald-950 text-emerald-300 border border-emerald-800/60 print:bg-white print:border-black print:text-black'
                                }`}
                              >
                                {col.transaction_type === 'OPENING_BALANCE' ? 'الدفعة المقدمة' : 'دفعة تحصيل إضافية'}
                              </span>
                            </TableCell>
                            <TableCell className="font-mono text-center text-xs">
                              {col.reference_number || '—'}
                            </TableCell>
                            <TableCell className="font-mono font-bold text-center text-emerald-300 print:text-black text-xs">
                              {money(col.amount)}
                            </TableCell>
                            <TableCell className="text-xs">{col.notes || '—'}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={6} className="py-4 text-center text-xs text-slate-400">
                            لا توجد تحصيلات مسجلة بعد.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* ── SECTION B: INVOICES ALLOCATIONS (EXPENSES) ── */}
              <div className={`${activeTab === 'invoices' ? 'block' : 'hidden'} print:block space-y-3`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-100 print:text-black flex items-center gap-1.5">
                    <span>🧾</span> سجل فواتير المصروفات والتنفيذ الموزعة على الموقع
                  </h3>
                  <span className="text-xs text-slate-400 print:text-slate-600">
                    إجمالي المصروفات: <strong>{money(spentInModal)}</strong>
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <Table className="print:text-black">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap text-center">م</TableHead>
                        <TableHead className="whitespace-nowrap text-center">الفاتورة</TableHead>
                        <TableHead className="whitespace-nowrap text-center">المورد / المقاول</TableHead>
                        <TableHead className="whitespace-nowrap text-center">أمر الشراء</TableHead>
                        <TableHead className="whitespace-nowrap text-center">القسم</TableHead>
                        <TableHead className="whitespace-nowrap text-center">قيمة المصروف</TableHead>
                        <TableHead className="whitespace-nowrap text-center">ملاحظات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parcelDetails.invoice_allocations.length > 0 ? (
                        parcelDetails.invoice_allocations.map((allocation, idx) => (
                          <TableRow key={allocation.id}>
                            <TableCell className="text-center font-mono text-xs">{idx + 1}</TableCell>
                            <TableCell className="font-mono font-bold text-center text-cyan-300 print:text-black text-xs">
                              {allocation.invoice?.invoice_number || '—'}
                            </TableCell>
                            <TableCell className="text-xs font-bold">
                              {allocation.invoice?.supplier?.company_name || '—'}
                            </TableCell>
                            <TableCell className="font-mono text-center text-xs">
                              {allocation.invoice?.purchase_order?.po_number || '—'}
                            </TableCell>
                            <TableCell className="text-center">
                              <span className="inline-flex rounded bg-cyan-950/80 px-2 py-0.5 text-xs font-bold text-cyan-300 border border-cyan-800/60 print:bg-white print:border-black print:text-black">
                                {allocation.department?.name || 'عام'}
                              </span>
                            </TableCell>
                            <TableCell className="font-mono font-bold text-center text-amber-300 print:text-black text-xs">
                              {money(allocation.amount)}
                            </TableCell>
                            <TableCell className="text-xs">{allocation.notes || '—'}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={7} className="py-4 text-center text-xs text-slate-400">
                            لا توجد فواتير مصروفات موزعة على هذه القطعة بعد.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* ── SECTION C: DELIVERED MATERIALS & CONSTRUCTION ITEMS ── */}
              <div className={`${activeTab === 'materials' ? 'block' : 'hidden'} print:block space-y-3`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-100 print:text-black flex items-center gap-1.5">
                    <span>🧱</span> سجل تفاصيل المواد والأصناف المنفذة والموردة للموقع
                  </h3>
                  <span className="text-xs text-slate-400 print:text-slate-600">
                    إجمالي البنود: <strong>{parcelDetails.materials?.length || 0}</strong>
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <Table className="print:text-black">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap text-center">م</TableHead>
                        <TableHead className="whitespace-nowrap text-center">الصنف / المادة</TableHead>
                        <TableHead className="whitespace-nowrap text-center">أمر الشراء</TableHead>
                        <TableHead className="whitespace-nowrap text-center">المورد</TableHead>
                        <TableHead className="whitespace-nowrap text-center">المطلوب</TableHead>
                        <TableHead className="whitespace-nowrap text-center">المستلم</TableHead>
                        <TableHead className="whitespace-nowrap text-center">الوحدة</TableHead>
                        <TableHead className="whitespace-nowrap text-center">السعر</TableHead>
                        <TableHead className="whitespace-nowrap text-center">الإجمالي</TableHead>
                        <TableHead className="whitespace-nowrap text-center">التاريخ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parcelDetails.materials && parcelDetails.materials.length > 0 ? (
                        parcelDetails.materials.map((mat, idx) => (
                          <TableRow key={mat.id}>
                            <TableCell className="text-center font-mono text-xs">{idx + 1}</TableCell>
                            <TableCell className="font-bold text-slate-100 print:text-black">
                              <div>{mat.item_name}</div>
                              {mat.specifications && (
                                <div className="text-[10px] text-slate-400 print:text-slate-600 font-normal">
                                  {mat.specifications}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-center text-xs">{mat.po_number || '—'}</TableCell>
                            <TableCell className="text-xs">{mat.supplier_name || '—'}</TableCell>
                            <TableCell className="font-mono text-center text-slate-300 print:text-black">
                              {mat.ordered_quantity}
                            </TableCell>
                            <TableCell className="font-mono font-bold text-center text-emerald-300 print:text-black">
                              {mat.received_quantity}
                            </TableCell>
                            <TableCell className="text-center text-xs">{getUnitLabel(mat.uom)}</TableCell>
                            <TableCell className="font-mono text-center text-xs">{money(mat.unit_price)}</TableCell>
                            <TableCell className="font-mono font-bold text-center text-amber-300 print:text-black">
                              {money(mat.total_price)}
                            </TableCell>
                            <TableCell className="font-mono text-center text-xs">{cleanDate(mat.date)}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={10} className="py-4 text-center text-xs text-slate-400">
                            لا توجد بنود مواد أو أصناف مسجلة بأوامر الشراء لهذه القطعة بعد.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* ── SECTION D: RUNNING BALANCE MOVEMENT LEDGER ── */}
              <div className={`${activeTab === 'ledger' ? 'block' : 'hidden'} print:block space-y-3`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-100 print:text-black flex items-center gap-1.5">
                    <span>📜</span> كشف الحساب التراكمي اللحظي لحركات العميل
                  </h3>
                  <span className="text-xs text-slate-400 print:text-slate-600">
                    عدد الحركات: <strong>{parcelDetails.transactions.length}</strong>
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <Table className="print:text-black">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap text-center">م</TableHead>
                        <TableHead className="whitespace-nowrap text-center">التاريخ</TableHead>
                        <TableHead className="whitespace-nowrap text-center">البيان / نوع الحركة</TableHead>
                        <TableHead className="whitespace-nowrap text-center">المقبوضات (+)</TableHead>
                        <TableHead className="whitespace-nowrap text-center">المصروفات (-)</TableHead>
                        <TableHead className="whitespace-nowrap text-center">الرصيد بعد الحركة</TableHead>
                        <TableHead className="whitespace-nowrap text-center">المرجع</TableHead>
                        <TableHead className="whitespace-nowrap text-center">الملاحظات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parcelDetails.transactions.map((transaction, idx) => {
                        const isIncome =
                          transaction.transaction_type === 'OPENING_BALANCE' ||
                          transaction.transaction_type === 'CUSTOMER_FUNDING';
                        return (
                          <TableRow key={transaction.id}>
                            <TableCell className="text-center font-mono text-xs">{idx + 1}</TableCell>
                            <TableCell className="font-mono text-center whitespace-nowrap text-xs">
                              {cleanDate(transaction.transaction_date)}
                            </TableCell>
                            <TableCell className="font-bold text-xs">
                              {parcelTransactionLabels[transaction.transaction_type] || transaction.transaction_type}
                            </TableCell>
                            <TableCell className="font-mono font-bold text-center text-xs text-emerald-300 print:text-black">
                              {isIncome ? money(transaction.amount) : '—'}
                            </TableCell>
                            <TableCell className="font-mono font-bold text-center text-xs text-rose-300 print:text-black">
                              {!isIncome ? money(Math.abs(Number(transaction.amount))) : '—'}
                            </TableCell>
                            <TableCell
                              className={`font-mono font-bold text-center text-xs ${
                                Number(transaction.balance_after) < 0
                                  ? 'text-rose-300 print:text-black'
                                  : 'text-cyan-200 print:text-black'
                              }`}
                            >
                              {money(transaction.balance_after)}
                            </TableCell>
                            <TableCell className="font-mono text-center text-xs">
                              {transaction.reference_number || '—'}
                            </TableCell>
                            <TableCell className="text-xs">{transaction.notes || '—'}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Print Signatures Block */}
              <div className="hidden print:grid grid-cols-4 gap-6 pt-8 mt-6 border-t-2 border-slate-900 text-center text-xs">
                <div>
                  <p className="font-bold">المحاسب المالي المسؤول</p>
                  <div className="mt-8 border-b border-dotted border-black w-32 mx-auto"></div>
                </div>
                <div>
                  <p className="font-bold">المدير المالي</p>
                  <div className="mt-8 border-b border-dotted border-black w-32 mx-auto"></div>
                </div>
                <div>
                  <p className="font-bold">اعتماد الإدارة العامة</p>
                  <div className="mt-8 border-b border-dotted border-black w-32 mx-auto"></div>
                </div>
                <div>
                  <p className="font-bold">توقيع واستلام العميل</p>
                  <div className="mt-8 border-b border-dotted border-black w-32 mx-auto"></div>
                </div>
              </div>

              {/* Footer Close Button */}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800 print:hidden">
                <Button type="button" variant="secondary" onClick={() => setParcelDetails(null)}>
                  إغلاق
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ── CREATE PARCEL MODAL ── */}
      {parcelFormOpen &&
        createPortal(
          <div
            className="modal-top-viewport fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/85 p-2 sm:p-4"
            role="dialog"
            aria-modal="true"
          >
            <form
              onSubmit={submitParcel}
              className="max-h-[calc(100vh-1rem)] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl border border-cyan-800/70 bg-slate-900 p-4 shadow-2xl sm:max-h-[calc(100vh-3rem)] sm:p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-black text-slate-100">إنشاء حساب قطعة أرض وتسجيل المقدم</h2>
                  <p className="mt-1 text-xs leading-6 text-slate-400">
                    سجل رقم القطعة والمنطقة ودفعة المقدم المسددة من العميل. يمكن أن يكون المقدم صفرًا إذا لم يسدد بعد.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setParcelFormOpen(false)}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-2xl font-black text-slate-300 hover:bg-slate-800 hover:text-white"
                  aria-label="إغلاق النافذة"
                >
                  ×
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-300">
                  رقم قطعة الأرض *
                  <input
                    required
                    value={parcelForm.parcel_reference}
                    onChange={(event) => setParcelForm({ ...parcelForm, parcel_reference: event.target.value })}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
                    placeholder="مثال: قطعة 13"
                  />
                </label>
                <label className="text-xs font-bold text-slate-300">
                  المنطقة / الموقع *
                  <input
                    required
                    value={parcelForm.region}
                    onChange={(event) => setParcelForm({ ...parcelForm, region: event.target.value })}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
                    placeholder="مثال: المنطقة الخامسة"
                  />
                </label>
                <label className="text-xs font-bold text-slate-300">
                  المقدم (الدفعة المقدمة) (ج.م)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={parcelForm.opening_balance ?? 0}
                    onChange={(event) =>
                      setParcelForm({ ...parcelForm, opening_balance: Number(event.target.value) })
                    }
                    className="mt-1 h-10 w-full rounded-lg border border-emerald-700/60 bg-slate-950 px-3 text-sm text-slate-100"
                  />
                </label>
                <label className="text-xs font-bold text-slate-300">
                  تاريخ سداد المقدم
                  <input
                    type="date"
                    value={parcelForm.transaction_date || today()}
                    onChange={(event) =>
                      setParcelForm({ ...parcelForm, transaction_date: event.target.value })
                    }
                    className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
                  />
                </label>
                <label className="text-xs font-bold text-slate-300 sm:col-span-2">
                  رقم مرجع / إيصال سداد المقدم
                  <input
                    value={parcelForm.reference_number || ''}
                    onChange={(event) => setParcelForm({ ...parcelForm, reference_number: event.target.value })}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
                    placeholder="رقم الإيصال أو التحويل البنكي"
                  />
                </label>
              </div>
              <label className="block text-xs font-bold text-slate-300">
                ملاحظات
                <textarea
                  value={parcelForm.notes || ''}
                  onChange={(event) => setParcelForm({ ...parcelForm, notes: event.target.value })}
                  className="mt-1 min-h-24 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-slate-100"
                  placeholder="أي بيانات أو شروط تعاقدية إضافية"
                />
              </label>
              {parcelFormError && <p role="alert" className="text-xs font-bold text-rose-300">{parcelFormError}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setParcelFormOpen(false)}>
                  إلغاء
                </Button>
                <Button type="submit" variant="primary" isLoading={saving}>
                  حفظ حساب القطعة والمقدم
                </Button>
              </div>
            </form>
          </div>,
          document.body
        )}

      {/* ── CUSTOMER COLLECTION MODAL (التحصيلات) ── */}
      {fundingParcel &&
        createPortal(
          <div
            className="modal-top-viewport fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/85 p-2 sm:p-4"
            role="dialog"
            aria-modal="true"
          >
            <form
              onSubmit={submitFunding}
              className="max-h-[calc(100vh-1rem)] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl border border-emerald-800/70 bg-slate-900 p-4 shadow-2xl sm:max-h-[calc(100vh-3rem)] sm:p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-black text-slate-100">تسجيل تحصيل / دفعة إضافية من العميل</h2>
                  <p className="mt-1 text-xs leading-6 text-slate-400">
                    إضافة دفعة نقدية أو تحويل بنكي محصل من العميل إلى حساب قطعة الأرض لزيادة الرصيد المتاح للتنفيذ.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFundingParcel(null)}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-2xl font-black text-slate-300 hover:bg-slate-800 hover:text-white"
                  aria-label="إغلاق النافذة"
                >
                  ×
                </button>
              </div>
              <div className="rounded-lg border border-cyan-800/60 bg-cyan-950/20 p-3 text-xs">
                <div className="text-slate-400">قطعة الأرض والموقع</div>
                <strong className="text-cyan-200">
                  {fundingParcel.parcel_reference} — {fundingParcel.region}
                </strong>
                <div className="mt-2 text-slate-400">
                  الرصيد المتبقي الحالي:{' '}
                  <strong className={Number(fundingParcel.balance) < 0 ? 'text-rose-300' : 'text-emerald-300'}>
                    {money(fundingParcel.balance)}
                  </strong>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-300">
                  مبلغ التحصيل (ج.م) *
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={fundingForm.amount}
                    onChange={(event) => setFundingForm({ ...fundingForm, amount: Number(event.target.value) })}
                    className="mt-1 h-10 w-full rounded-lg border border-emerald-700/60 bg-slate-950 px-3 text-sm text-slate-100"
                  />
                </label>
                <label className="text-xs font-bold text-slate-300">
                  تاريخ التحصيل *
                  <input
                    type="date"
                    required
                    value={fundingForm.transaction_date || today()}
                    onChange={(event) =>
                      setFundingForm({ ...fundingForm, transaction_date: event.target.value })
                    }
                    className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
                  />
                </label>
                <label className="text-xs font-bold text-slate-300 sm:col-span-2">
                  رقم إيصال / سند التحصيل
                  <input
                    value={fundingForm.reference_number || ''}
                    onChange={(event) => setFundingForm({ ...fundingForm, reference_number: event.target.value })}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
                    placeholder="رقم السند، الشيك، أو التحويل البنكي"
                  />
                </label>
              </div>
              <label className="block text-xs font-bold text-slate-300">
                ملاحظات التحصيل
                <textarea
                  value={fundingForm.notes || ''}
                  onChange={(event) => setFundingForm({ ...fundingForm, notes: event.target.value })}
                  className="mt-1 min-h-24 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-slate-100"
                  placeholder="طريقة الدفع أو اسم المودع أو أي تفاصيل"
                />
              </label>
              {fundingFormError && <p role="alert" className="text-xs font-bold text-rose-300">{fundingFormError}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setFundingParcel(null)}>
                  إلغاء
                </Button>
                <Button type="submit" variant="success" isLoading={saving}>
                  حفظ دفعة التحصيل
                </Button>
              </div>
            </form>
          </div>,
          document.body
        )}
    </div>
  );
};

export default LandParcelsPage;
