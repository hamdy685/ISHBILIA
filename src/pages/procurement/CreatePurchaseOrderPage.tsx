import React, { useEffect, useState, useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { getApprovedPurchaseRequestApi } from '../../api/procurement';
import { getSuppliersApi } from '../../api/suppliers';
import { createPurchaseOrderApi, submitPurchaseOrderApi } from '../../api/purchaseOrders';
import { المورد } from '../../types/purchaseOrder';
import { PurchaseRequest } from '../../types/purchaseRequest';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import DirectPoModal from '../../components/procurement/DirectPoModal';
import { parseApiError } from '../../utils/apiError';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { CurrencyDisplay } from '../../components/ui/CurrencyDisplay';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { getUnitLabel } from '../../utils/units';
import { tafqeetCurrency } from '../../utils/tafqeet';
import { UnifiedNotesCard } from '../../components/common/UnifiedNotesCard';
import { SupplierSelectWithQuickAdd } from '../../components/common/SupplierSelectWithQuickAdd';
import { formatCleanNumber } from '../../utils/numberFormat';

const getLocalDateIso = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};

interface PoItemInput {
  pr_item_id: number;
  item_id?: number | null;
  item_description: string;
  item_reference: string;
  region: string;
  original_quantity: number;
  quantity: number | string;
  uom: string;
  unit_price: number | string;
  specifications: string;
}

export const CreatePurchaseOrderPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const prId = Number(searchParams.get('pr'));
  const quoteId = Number(searchParams.get('quote'));

  const [pr, setPr] = useState<PurchaseRequest | null>(null);
  const [suppliers, setSuppliers] = useState<المورد[]>([]);
  const [supplierId, setSupplierId] = useState<string>('');
  const [oneTimeSupplierName, setOneTimeSupplierName] = useState<string>('');
  const [paymentTerms, setPaymentTerms] = useState<string>('دفع عند الاستلام');
  const [deliveryDate, setDeliveryDate] = useState<string>(getLocalDateIso());
  const [budgetCode, setBudgetCode] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [poItems, setPoItems] = useState<PoItemInput[]>([]);

  const [loading, setLoading] = useState<boolean>(false);
  const [fetching, setFetching] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [isDirectPoModalOpen, setIsDirectPoModalOpen] = useState<boolean>(false);

  useEffect(() => {
    const init = async () => {
      setFetching(true);
      try {
        const sups = await getSuppliersApi();
        setSuppliers(sups || []);
        if (prId) {
          const prData = await getApprovedPurchaseRequestApi(prId);
          setPr(prData);
          if (quoteId && prData?.selected_quote?.id && quoteId !== prData.selected_quote.id) {
            throw new Error('العرض المختار في الرابط لا يطابق العرض المعتمد لهذا الطلب.');
          }
          let initialSupplierId = '';
          if (prData?.selected_quote?.supplier_id) {
            initialSupplierId = String(prData.selected_quote.supplier_id);
          } else if (prData?.procurement_route === 'DIRECT') {
            const firstItemSupplier = prData.items?.find((i) => i.supplier_id)?.supplier_id;
            initialSupplierId = String(firstItemSupplier || prData.direct_supplier_id || '');
          }
          setSupplierId(initialSupplierId);

          if (prData && prData.items) {
            let relevantItems = prData.items;
            if (prData.procurement_route === 'DIRECT' && initialSupplierId) {
              const sId = Number(initialSupplierId);
              const matching = prData.items.filter((i) => (i.supplier_id || prData.direct_supplier_id) === sId);
              if (matching.length > 0) {
                relevantItems = matching;
              }
            }
            setPoItems(
              relevantItems.map((i) => ({
                pr_item_id: i.id,
                item_id: i.item_id || null,
                item_description: i.item_description,
                item_reference: i.item_reference || '',
                region: i.region || '',
                original_quantity: parseFloat(i.quantity) || 1,
                quantity: parseFloat(i.quantity) || 1,
                uom: i.uom || 'PCS',
                unit_price: Number(prData.selected_quote?.unit_price || i.estimated_unit_price || 0),
                specifications: i.specifications || '',
              }))
            );
          }
        }
      } catch (err) {
        const parsed = parseApiError(err);
        setError(parsed.message);
      } finally {
        setFetching(false);
      }
    };
    init();
  }, [prId]);

  const syncPoItemsForSupplier = (targetSupplierId: string, currentPr: PurchaseRequest) => {
    if (!currentPr.items) return;
    let relevantItems = currentPr.items;
    if (currentPr.procurement_route === 'DIRECT' && targetSupplierId) {
      const sId = Number(targetSupplierId);
      const matching = currentPr.items.filter(
        (i) => (i.supplier_id || currentPr.direct_supplier_id) === sId
      );
      if (matching.length > 0) {
        relevantItems = matching;
      }
    }
    setPoItems(
      relevantItems.map((i) => ({
        pr_item_id: i.id,
        item_id: i.item_id || null,
        item_description: i.item_description,
        item_reference: i.item_reference || '',
        region: i.region || '',
        original_quantity: parseFloat(i.quantity) || 1,
        quantity: parseFloat(i.quantity) || 1,
        uom: i.uom || 'PCS',
        unit_price: Number(currentPr.selected_quote?.unit_price || i.estimated_unit_price || 0),
        specifications: i.specifications || '',
      }))
    );
  };

  const handleItemQuantityChange = (index: number, val: string) => {
    setPoItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], quantity: val === '' ? '' : (parseFloat(val) || 0) };
      return updated;
    });
  };

  const handleItemPriceChange = (index: number, val: string) => {
    setPoItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], unit_price: val === '' ? '' : (parseFloat(val) || 0) };
      return updated;
    });
  };

  const handleItemTextChange = (index: number, field: 'item_reference' | 'region', value: string) => {
    setPoItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const calculateGrandTotal = () => {
    return poItems.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0), 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prId) {
      setError('لا يوجد طلب شراء معتمد محدد. يمكنك اختيار أمر شراء مباشر.');
      return;
    }
    if (!supplierId && !oneTimeSupplierName.trim()) {
      setError('يرجى اختيار المورد من القائمة أو إدخال اسم مورد لعملية واحدة');
      return;
    }
    if (poItems.some(item => !item.item_reference.trim() || !item.region.trim())) {
      setError('رقم قطعة الأرض والمنطقة مطلوبان لكل بند قبل إصدار أمر الشراء.');
      return;
    }

    const itemsWithQtyChange = poItems.filter(item => item.quantity !== item.original_quantity);
    if (itemsWithQtyChange.length > 0 && !notes) {
      setError('تم تغيير كمية الاصناف عن طلب الشراء الاصلي. يرجى تدوين سبب تعديل الكمية في خانة الملاحظات.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const po = await createPurchaseOrderApi({
        purchase_request_id: prId,
        supplier_id: supplierId ? Number(supplierId) : undefined,
        one_time_supplier_name: oneTimeSupplierName.trim() || undefined,
        payment_terms: paymentTerms || undefined,
        delivery_date: deliveryDate || undefined,
        budget_code: budgetCode || undefined,
        notes: notes || undefined,
        items: poItems.map((item) => ({
          pr_item_id: item.pr_item_id,
          item_id: item.item_id,
          item_description: item.item_description,
          item_reference: item.item_reference,
          region: item.region,
          quantity: Number(item.quantity) || 1,
          uom: item.uom,
          unit_price: Number(item.unit_price) || 0,
          specifications: item.specifications,
        })),
      });

      if (po?.status === 'PO_DRAFT' || po?.status === 'RETURNED_TO_PROCUREMENT') {
        await submitPurchaseOrderApi(po.id);
      }
      const returnUrl = searchParams.get('returnUrl') || (location.state as { returnTo?: string })?.returnTo || '/procurement';
      navigate(returnUrl, {
        state: {
          successMessage: `تم إصدار أمر الشراء ${po?.po_number ? `#${po.po_number}` : ''} بنجاح. يمكنك مواصلة باقي الطلبات.`,
        },
      });
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed.message);
    } finally {
      setLoading(false);
    }
  };

  const directPrSuppliers = useMemo(() => {
    if (pr?.procurement_route !== 'DIRECT' || !pr?.items) return [];
    const map = new Map<number, { id: number; company_name: string; code?: string | null }>();
    for (const item of pr.items) {
      const sId = item.supplier_id || pr.direct_supplier_id;
      if (sId) {
        const found = suppliers.find((s) => s.id === sId) || item.supplier || (pr.direct_supplier?.id === sId ? pr.direct_supplier : null);
        map.set(sId, {
          id: sId,
          company_name: found?.company_name || `مورد #${sId}`,
          code: found?.code || null,
        });
      }
    }
    return Array.from(map.values());
  }, [pr, suppliers]);

  const hasMultipleDirectSuppliers = directPrSuppliers.length > 1;

  const supplierOptions = useMemo(() => {
    if (pr?.procurement_route === 'DIRECT' && hasMultipleDirectSuppliers) {
      return directPrSuppliers.map((s) => ({
        value: s.id,
        label: s.company_name,
        badge: s.code || `SUP-${s.id}`,
        searchTerms: [s.company_name, s.code || ''].filter(Boolean),
      }));
    }
    return suppliers.map((s) => ({
      value: s.id,
      label: s.company_name,
      subLabel: s.phone ? `هاتف: ${s.phone}` : undefined,
      badge: s.code || `SUP-${s.id}`,
      searchTerms: [s.contact_person || '', s.email || '', s.tax_number || '', s.commercial_register || ''].filter(Boolean),
    }));
  }, [suppliers, pr?.procurement_route, hasMultipleDirectSuppliers, directPrSuppliers]);

  const handleSupplierSelect = (val: string) => {
    setSupplierId(val);
    if (pr) {
      syncPoItemsForSupplier(val, pr);
    }
  };

  if (fetching) {
    return <LoadingSpinner message="جاري تجهيز بيانيات إنشاء أمر الشراء..." />;
  }

  return (
    <div className="procurement-reference-page space-y-6 animate-fade-in" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2 space-x-reverse">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
            <h1 className="text-xl font-bold text-slate-100">إصدار أمر شراء رسمي</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            تحويل طلب الشراء المعتمد إلى أمر شراء مالي ملزم للمورد وتحديد الشروط التجارية
          </p>
        </div>

        <div className="flex items-center space-x-2 space-x-reverse">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const returnUrl = searchParams.get('returnUrl') || (location.state as { returnTo?: string })?.returnTo || '/procurement';
              navigate(returnUrl);
            }}
          >
            &rarr; رجوع
          </Button>
          <button
            type="button"
            onClick={() => setIsDirectPoModalOpen(true)}
            className="bg-slate-800 hover:bg-slate-700 text-cyan-400 font-bold text-xs px-4 py-2.5 rounded-lg border border-slate-700 transition-colors"
          >
            + إصدار أمر شراء مباشر
          </button>
        </div>
      </div>

      {error && (
        <div className="space-y-3">
          <ErrorMessage error={error} />
          {error.includes('يوجد أمر شراء مصدر بالفعل') && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-amber-200">
                <span>⚠️ تم إصدار أمر شراء لهذا الطلب سابقاً. يمكنك متابعة واعتماد أو تعديل أمر الشراء من قائمة أوامر الشراء.</span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="primary" onClick={() => navigate('/procurement/purchase-orders')}>
                  <span>📑</span> الانتقال لأوامر الشراء
                </Button>
                <Button size="sm" variant="secondary" onClick={() => navigate('/procurement/approved-requests')}>
                  <span>📋</span> الطلبات المعتمدة
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* SECTION 1: REFERENCE PURCHASE REQUEST (READ ONLY) */}
        {pr && (
          <Card className="space-y-4 border-cyan-500/30 bg-slate-900/90">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-cyan-400 flex items-center gap-2">
                <span>📋</span> القسم الأول: بيانات طلب الشراء المصدر (للاطلاع فقط)
              </h2>
              <span className="text-[10px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-800/60 px-2 py-0.5 rounded font-bold">
                #{pr.request_number}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px]">القسم:</span>
                <span className="font-bold text-slate-200">{pr.department?.name || '-'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">صاحب الطلب:</span>
                <span className="font-bold text-slate-200">{pr.requester?.name || '-'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">رئيس القسم المعتمد:</span>
                <span className="font-bold text-emerald-300">{pr.assigned_reviewer?.name || 'غير محدد'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">تاريخ الحاجة:</span>
                <span className="font-mono text-slate-200">{pr.date_needed || '-'}</span>
              </div>
            </div>

            <div className="pt-2">
              <h3 className="text-xs font-semibold text-slate-300 mb-2">عناصر الطلب المعتمدة بالمواصفات الفنية:</h3>
              <div className="overflow-x-auto hidden md:block">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="p-2.5">#</th>
                      <th className="p-2.5">رقم قطعة الأرض</th>
                      <th className="p-2.5">المنطقة</th>
                      <th className="p-2.5">الصنف</th>
                      <th className="p-2.5">الوحدة</th>
                      <th className="p-2.5">الكمية المطلوبة</th>
                      <th className="p-2.5">المواصفات الفنية</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {pr.items?.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-800/30">
                        <td className="p-2.5 text-slate-500 font-mono">{idx + 1}</td>
                        <td className="p-2.5 font-mono text-cyan-300 font-bold">{item.item_reference || '-'}</td>
                        <td className="p-2.5 text-slate-300">{item.region || '-'}</td>
                        <td className="p-2.5 font-bold text-slate-100">{item.item_description || '-'}</td>
                        <td className="p-2.5 text-slate-400">{getUnitLabel(item.uom)}</td>
                        <td className="p-2.5 font-mono text-cyan-400 font-bold">{item.quantity}</td>
                        <td className="p-2.5 text-slate-400 max-w-xs truncate">{item.specifications || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile items preview */}
              <div className="space-y-3 md:hidden">
                {pr.items?.map((item, idx) => (
                  <article
                    key={`mobile-pr-item-${item.id}`}
                    className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2 border-b border-slate-800/80 pb-2">
                      <div>
                        <span className="text-[10px] font-mono text-cyan-300">بند {idx + 1}</span>
                        <h4 className="font-bold text-slate-100 mt-0.5">{item.item_description || '-'}</h4>
                      </div>
                      <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                        {getUnitLabel(item.uom)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-slate-400 block text-[10px]">القطعة:</span>
                        <strong className="font-mono text-cyan-300">{item.item_reference || '-'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">المنطقة:</span>
                        <strong className="text-slate-200">{item.region || '-'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">الكمية:</span>
                        <strong className="font-mono text-cyan-300">{item.quantity}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">المواصفات:</span>
                        <span className="text-slate-300 truncate block">{item.specifications || '-'}</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <UnifiedNotesCard request={pr} />
          </Card>
        )}

        {/* SECTION 2: PURCHASE ORDER COMMERCIAL DATA (EDITABLE) */}
        <Card className="space-y-6 bg-slate-950 border-slate-800">
          <div className="border-b border-slate-800 pb-3">
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <span>💳</span> القسم الثاني: البيانات التجارية والمالية لأمر الشراء
            </h2>
          </div>

          {/* المورد and Header Options */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <SupplierSelectWithQuickAdd
                suppliers={suppliers}
                selectedSupplierId={supplierId}
                onSelectSupplierId={handleSupplierSelect}
                oneTimeSupplierName={oneTimeSupplierName}
                onChangeOneTimeSupplierName={(name) => setOneTimeSupplierName(name)}
                onSupplierCreated={(newSup) => {
                  setSuppliers((prev) => [...prev, newSup]);
                  handleSupplierSelect(String(newSup.id));
                }}
                disabled={Boolean(pr?.selected_quote?.id || (pr?.procurement_route === 'DIRECT' && !hasMultipleDirectSuppliers))}
                label="اختر المورد المعتمد"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">تاريخ التوريد المتوقع</label>
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono min-h-10"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">شروط الدفع والائتمان</label>
              <input
                type="text"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                placeholder="مثال: دفع عند الاستلام، آجل 30 يوم"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 min-h-10"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">ملاحظات وشروط خاصة للمورد</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ملاحظات توريد أو شروط استلام..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 min-h-10"
              />
            </div>
          </div>

          {/* Multi-supplier Direct Purchase Helper Banner */}
          {hasMultipleDirectSuppliers && pr && (
            <div className="rounded-xl border border-violet-500/40 bg-violet-950/25 p-3.5 text-xs text-violet-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-base">ℹ️</span>
                <div>
                  <p className="font-bold text-violet-100">
                    طلب شراء مباشر مقسّم على موردين متعددين ({directPrSuppliers.length} موردين)
                  </p>
                  <p className="text-[11px] text-violet-300/80">
                    جاري إعداد أمر الشراء لبنود المورد المحدد ({poItems.length} من أصل {pr.items?.length || 0} بند). بعد إصداره يمكنك إصدار أمر الشراء للمورد التالي.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {directPrSuppliers.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleSupplierSelect(String(s.id))}
                    className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all ${
                      Number(supplierId) === s.id
                        ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30 ring-1 ring-violet-400'
                        : 'bg-slate-900/90 text-slate-300 hover:bg-slate-800 border border-slate-700'
                    }`}
                  >
                    {s.company_name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Commercial Line Items */}
          <div className="space-y-3 pt-2">
            <h3 className="text-xs font-bold text-slate-200">جدول البنود التجارية والأسعار (بالجنيه المصري EGP / ج.م):</h3>
            
            {/* Desktop Table */}
            <div className="hidden min-w-0 md:block overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/60">
              <table className="w-full text-right text-xs text-slate-200 border-collapse">
                <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                  <tr>
                    <th className="p-3">#</th>
                    <th className="p-3">رقم قطعة الأرض</th>
                    <th className="p-3">المنطقة</th>
                    <th className="p-3">الصنف</th>
                    <th className="p-3">الوحدة</th>
                    <th className="p-3">كمية طلب الشراء (PR)</th>
                    <th className="p-3">كمية أمر الشراء (PO)</th>
                    <th className="p-3">الفرق بين الكميتين</th>
                    <th className="p-3">سعر الوحدة (EGP / ج.م)</th>
                    <th className="p-3">إجمالي البند (EGP / ج.م)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {poItems.map((item, index) => {
                    const lineTotal = (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
                    const diff = (Number(item.quantity) || 0) - item.original_quantity;
                    const isQtyChanged = diff !== 0;

                    return (
                      <tr key={index} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-3 font-mono text-slate-400">{index + 1}</td>
                        <td className="p-3">
                          <input
                            type="text"
                            required
                            value={item.item_reference}
                            readOnly
                            aria-readonly="true"
                            placeholder="رقم قطعة الأرض"
                            dir="ltr"
                            className="w-32 bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 font-mono focus:border-cyan-500 focus:outline-none"
                          />
                        </td>
                        <td className="p-3">
                          <input
                            type="text"
                            required
                            value={item.region}
                            onChange={(e) => handleItemTextChange(index, 'region', e.target.value)}
                            placeholder="المنطقة"
                            className="w-32 bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
                          />
                        </td>
                        <td className="p-3 font-bold text-slate-100">
                          {item.item_description}
                          {item.specifications && (
                            <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                              المواصفات: {item.specifications}
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-slate-400">{getUnitLabel(item.uom)}</td>
                        <td className="p-3 font-mono font-semibold text-slate-400">
                          {item.original_quantity.toLocaleString()}
                        </td>
                        <td className="p-3">
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            required
                            value={item.quantity ?? ''}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => handleItemQuantityChange(index, e.target.value)}
                            className="w-24 bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 font-mono focus:border-cyan-500 focus:outline-none"
                          />
                        </td>
                        <td className="p-3 font-mono font-bold text-xs">
                          {isQtyChanged ? (
                            <span className={diff > 0 ? 'text-amber-400' : 'text-rose-400'}>
                              {diff > 0 ? `+${formatCleanNumber(diff)}` : formatCleanNumber(diff)}
                            </span>
                          ) : (
                            <span className="text-slate-500">0</span>
                          )}
                        </td>
                        <td className="p-3">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            required
                            value={item.unit_price ?? ''}
                            onFocus={(e) => e.target.select()}
                            readOnly={Boolean(pr?.selected_quote?.id)}
                            onChange={(e) => handleItemPriceChange(index, e.target.value)}
                            placeholder="0.00"
                            className="w-32 bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-emerald-400 font-mono font-bold focus:border-cyan-500 focus:outline-none"
                          />
                        </td>
                        <td className="p-3">
                          <CurrencyDisplay
                            amount={lineTotal}
                            amountClassName="font-mono text-emerald-400 font-bold"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Commercial Cards */}
            <div className="space-y-4 md:hidden">
              {poItems.map((item, index) => {
                const lineTotal = (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
                const diff = (Number(item.quantity) || 0) - item.original_quantity;
                const isQtyChanged = diff !== 0;

                return (
                  <article key={`mobile-po-item-${item.pr_item_id || index}`} className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 space-y-3 shadow-lg">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                      <span className="font-bold text-slate-100 text-sm">{item.item_description}</span>
                      <span className="shrink-0 rounded bg-cyan-950 border border-cyan-800/60 px-2 py-0.5 text-[10px] font-bold text-cyan-300 font-mono">
                        #{index + 1}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="block text-[10px] text-slate-400 font-semibold mb-1">رقم قطعة الأرض *</label>
                        <input
                          type="text"
                          required
                          value={item.item_reference}
                          onChange={(e) => handleItemTextChange(index, 'item_reference', e.target.value)}
                          placeholder="القطعة"
                          dir="ltr"
                          className="h-10 w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 text-xs text-slate-100 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 font-semibold mb-1">المنطقة *</label>
                        <input
                          type="text"
                          required
                          value={item.region}
                          onChange={(e) => handleItemTextChange(index, 'region', e.target.value)}
                          placeholder="المنطقة"
                          className="h-10 w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 text-xs text-slate-100"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] text-slate-400 font-semibold">الكمية</label>
                          <span className="text-[10px] text-slate-500 font-mono">PR: {item.original_quantity}</span>
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          required
                          value={item.quantity ?? ''}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => handleItemQuantityChange(index, e.target.value)}
                          className="h-10 w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 text-xs text-slate-100 font-mono font-bold"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] text-slate-400 font-semibold">السعر (ج.م)</label>
                          {isQtyChanged && (
                            <span className={`text-[10px] font-mono font-bold ${diff > 0 ? 'text-amber-400' : 'text-rose-400'}`}>
                              {diff > 0 ? `+${formatCleanNumber(diff)}` : formatCleanNumber(diff)}
                            </span>
                          )}
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          value={item.unit_price ?? ''}
                          onFocus={(e) => e.target.select()}
                          readOnly={Boolean(pr?.selected_quote?.id)}
                          onChange={(e) => handleItemPriceChange(index, e.target.value)}
                          placeholder="0.00"
                          className="h-10 w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 text-xs text-emerald-400 font-mono font-bold"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between bg-slate-950/80 rounded-xl px-3 py-2 border border-slate-800/80">
                      <span className="text-[11px] text-slate-400 font-semibold">إجمالي البند:</span>
                      <CurrencyDisplay
                        amount={lineTotal}
                        amountClassName="font-mono text-emerald-400 font-black text-sm"
                      />
                    </div>
                  </article>
                );
              })}
            </div>

            {/* Grand Total Summary Box (EGP) with Arabic Tafqeet */}
            <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200">
                  إجمالي أمر الشراء التجاري (بالجنيه المصري EGP / ج.م):
                </span>
                <CurrencyDisplay
                  amount={calculateGrandTotal()}
                  amountClassName="text-xl font-mono font-black text-emerald-400"
                />
              </div>
              <div className="text-xs font-bold text-emerald-300/90 border-t border-emerald-900/40 pt-2 font-sans flex items-center gap-1.5">
                <span className="text-slate-400 font-normal">المبلغ بالحروف:</span>
                <span>{tafqeetCurrency(calculateGrandTotal())}</span>
              </div>
            </div>
          </div>

          {/* Form الإجراءات */}
          <div className="flex items-center justify-end space-x-3 space-x-reverse pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs px-4 py-2.5 rounded-lg font-medium"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={loading || !supplierId || !prId}
              className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs px-6 py-2.5 rounded-lg font-bold shadow-lg shadow-cyan-600/20 disabled:opacity-50"
            >
              {loading ? 'جاري إصدار وإرسال أمر الشراء...' : 'إصدار وإرسال أمر الشراء للاستلام ←'}
            </button>
          </div>
        </Card>
      </form>

      {/* Direct purchase request modal */}
      <DirectPoModal
        isOpen={isDirectPoModalOpen}
        onClose={() => setIsDirectPoModalOpen(false)}
        onSuccess={() => navigate('/procurement')}
      />
    </div>
  );
};

export default CreatePurchaseOrderPage;
