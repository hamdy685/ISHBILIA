import React, { useEffect, useState, useMemo } from 'react';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning';
import { useNavigate } from 'react-router-dom';
import ErrorMessage from '../ErrorMessage';
import LoadingSpinner from '../LoadingSpinner';
import { getCatalogItemsApi } from '../../api/catalog';
import { getPurchaseRequestDepartmentOptionsApi, getSiteEngineerReceiverOptionsApi } from '../../api/purchaseRequests';
import { getLandParcelsApi, LandParcel } from '../../api/supplierFinance';
import { ApiError } from '../../types/api';
import {
  CatalogItem,
  CreatePurchaseRequestPayload,
  PurchaseRequest,
  PurchaseRequestItemFormInput,
  PurchaseRequestType,
  DepartmentOption,
  SiteEngineerReceiverOption,
} from '../../types/purchaseRequest';
import { parseApiError } from '../../utils/apiError';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { FormField, Input, Select, Textarea, SearchableSelect } from '../ui/FormField';
import { DEFAULT_PR_UNIT_CODES, getUnitLabel, getUnitOptions } from '../../utils/units';
import { useAuth } from '../../context/AuthContext';
import { PurchaseRequestItemsSummaryTable } from './PurchaseRequestItemsSummaryTable';
import { ItemAutocompleteInput } from '../common/ItemAutocompleteInput';

const UNIT_OPTIONS = getUnitOptions(DEFAULT_PR_UNIT_CODES);

const getTodayDateInputValue = (): string => {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${today.getFullYear()}-${month}-${day}`;
};

interface Props {
  initialData?: PurchaseRequest;
  onSubmit: (payload: CreatePurchaseRequestPayload) => Promise<void>;
  isSubmitting: boolean;
  submitButtonText?: string;
}

export const PurchaseRequestForm: React.FC<Props> = ({
  initialData,
  onSubmit,
  isSubmitting,
  submitButtonText = 'حفظ المسودة',
}) => {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const isGeneralManager = hasRole('general_manager');
  const [requestType, setRequestType] = useState<PurchaseRequestType>(initialData?.request_type || 'PROJECT');
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState<boolean>(true);
  const [landParcels, setLandParcels] = useState<LandParcel[]>([]);
  const [parcelReference, setParcelReference] = useState<string>(
    initialData?.parcel_reference || initialData?.items?.[0]?.item_reference || ''
  );
  const [region, setRegion] = useState<string>(
    initialData?.region || initialData?.items?.[0]?.region || ''
  );
  const [landParcelId, setLandParcelId] = useState<number | ''>(
    initialData?.land_parcel_id || ''
  );
  const [departmentOptions, setDepartmentOptions] = useState<DepartmentOption[]>([]);
  const [isLoadingDepartments, setIsLoadingDepartments] = useState<boolean>(true);

  const [targetDepartmentId, setTargetDepartmentId] = useState<number | ''>(initialData?.target_department_id || initialData?.department?.id || '');
  const [dateNeeded, setDateNeeded] = useState<string>(() => {
    const today = getTodayDateInputValue();
    if (!initialData?.date_needed) return today;
    return initialData.date_needed < today ? today : initialData.date_needed;
  });
  const [notes, setNotes] = useState<string>(initialData?.notes || '');
  const [items, setItems] = useState<PurchaseRequestItemFormInput[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const isDirty = !initialData && Boolean(targetDepartmentId || parcelReference.trim() || region.trim() || notes.trim() || items.some((item) => item.item_description.trim() || Number(item.quantity) !== 1));
  useUnsavedChangesWarning(isDirty && !isSubmitting);

  useEffect(() => {
    const fetchCatalog = async () => {
      try {
        const data = await getCatalogItemsApi();
        setCatalogItems(data);
      } catch (err) {
        console.error('Failed to load catalog items', err);
      } finally {
        setIsLoadingCatalog(false);
      }
    };
    fetchCatalog();
  }, []);

  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const data = await getPurchaseRequestDepartmentOptionsApi();
        setDepartmentOptions(data);
      } catch (err) {
        setError(parseApiError(err));
      } finally {
        setIsLoadingDepartments(false);
      }
    };
    void fetchDepartments();
  }, []);

  const [siteEngineerUserId, setSiteEngineerUserId] = useState<number | ''>(
    initialData?.site_engineer?.id || ''
  );
  const [siteEngineers, setSiteEngineers] = useState<SiteEngineerReceiverOption[]>([]);
  const [otherUsers, setOtherUsers] = useState<SiteEngineerReceiverOption[]>([]);
  const [isLoadingReceivers, setIsLoadingReceivers] = useState<boolean>(false);

  useEffect(() => {
    if (isGeneralManager) {
      setIsLoadingReceivers(true);
      getSiteEngineerReceiverOptionsApi()
        .then((res) => {
          setSiteEngineers(res.site_engineers || []);
          setOtherUsers(res.other_users || []);
        })
        .catch(() => {})
        .finally(() => setIsLoadingReceivers(false));
    }
  }, [isGeneralManager]);

  useEffect(() => {
    getLandParcelsApi()
      .then((data) => setLandParcels(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setTargetDepartmentId(initialData?.target_department_id || initialData?.department?.id || '');
    if (initialData?.site_engineer?.id) {
      setSiteEngineerUserId(initialData.site_engineer.id);
    }
    if (initialData) {
      setParcelReference(initialData.parcel_reference || initialData.items?.[0]?.item_reference || '');
      setRegion(initialData.region || initialData.items?.[0]?.region || '');
      setLandParcelId(initialData.land_parcel_id || '');
    }
    const today = getTodayDateInputValue();
    if (initialData?.date_needed) {
      setDateNeeded(initialData.date_needed < today ? today : initialData.date_needed);
    } else {
      setDateNeeded(today);
    }
  }, [initialData]);

  useEffect(() => {
    if (initialData && initialData.items && initialData.items.length > 0) {
      setItems(
        initialData.items.map((i) => ({
          item_id: i.item_id || null,
          item_description: i.item_description,
          item_reference: i.item_reference || '',
          region: i.region || '',
          quantity: parseFloat(i.quantity),
          uom: i.uom || '',
          specifications: i.specifications || '',
          notes: i.notes || '',
        }))
      );
    } else if (!initialData) {
      setItems([
        {
          item_id: null,
          item_description: '',
          item_reference: '',
          region: '',
          quantity: 1,
          uom: 'PCS',
          specifications: '',
          notes: '',
        },
      ]);
    }
  }, [initialData]);

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        item_id: null,
        item_description: '',
        quantity: 1,
        uom: 'PCS',
        specifications: '',
        notes: '',
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
      setError({ message: 'يجب تقديم عنصر واحد على الأقل.' });
      return;
    }
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (
    index: number,
    field: keyof PurchaseRequestItemFormInput,
    value: any
  ) => {
    setItems((prev) => {
      const updated = [...prev];
      const currentItem = { ...updated[index] };

      if (field === 'item_id') {
        const itemId = value ? parseInt(value, 10) : null;
        currentItem.item_id = itemId;
        if (itemId) {
          const selectedCatalog = catalogItems.find((c) => c.id === itemId);
          if (selectedCatalog) {
            currentItem.item_description = selectedCatalog.name;
            currentItem.uom = selectedCatalog.uom;
          }
        }
      } else {
        (currentItem as any)[field] = value;
      }

      updated[index] = currentItem;
      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    const nextFieldErrors: Record<string, string> = {};

    const isOffice = requestType === 'OFFICE_SUPPLIES';

    if (!targetDepartmentId) {
      nextFieldErrors.targetDepartment = 'اختر القسم المطلوب منه الشراء قبل حفظ الطلب.';
    }

    const selectedDepartment = departmentOptions.find((department) => department.id === Number(targetDepartmentId));
    if (targetDepartmentId && !isGeneralManager && !selectedDepartment?.manager && !['EXECUTION', 'BUILDINGS', 'FINISHING', 'LICENSES', 'BUFFET'].includes(selectedDepartment?.code || '')) {
      nextFieldErrors.targetDepartment = 'القسم المختار لا يحتوي على مدير قسم معين من الإدارة.';
    }

    if (!dateNeeded) {
      nextFieldErrors.dateNeeded = 'حدد تاريخ الاحتياج قبل حفظ الطلب.';
    } else if (dateNeeded < getTodayDateInputValue()) {
      nextFieldErrors.dateNeeded = 'تاريخ الاحتياج لا يمكن أن يكون في الماضي. اختر اليوم أو تاريخًا قادمًا.';
    }

    if (isGeneralManager && !isOffice && !siteEngineerUserId) {
      nextFieldErrors.siteEngineer = 'يجب على المدير التنفيذي تحديد مسؤول الاستلام / مهندس الموقع قبل الحفظ.';
    }

    if (!isOffice) {
      if (!parcelReference.trim()) {
        nextFieldErrors.parcelReference = 'رقم قطعة الأرض مطلوب للطلب.';
      }
      if (!region.trim()) {
        nextFieldErrors.region = 'المنطقة مطلوبة للطلب.';
      }
    }

    if (items.length === 0) {
      setError({ message: 'يجب إضافة عنصر واحد على الأقل.', status: 422 });
      return;
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.item_description.trim()) nextFieldErrors[`item_${i}_description`] = 'اكتب وصف الصنف المطلوب.';
      const qty = typeof item.quantity === 'number' ? item.quantity : parseFloat(String(item.quantity));
      if (!Number.isFinite(qty) || qty <= 0) nextFieldErrors[`item_${i}_quantity`] = 'أدخل كمية أكبر من صفر.';
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      const normalizedFieldErrors: Record<string, string[]> = Object.fromEntries(
        Object.entries(nextFieldErrors).map(([field, message]) => [field, [message]]),
      );
      setError({
        message: nextFieldErrors.targetDepartment || nextFieldErrors.siteEngineer || nextFieldErrors.parcelReference || nextFieldErrors.region || Object.values(nextFieldErrors)[0] || 'راجع الحقول المحددة باللون الأحمر ثم أعد المحاولة.',
        status: 422,
        errors: normalizedFieldErrors,
      });
      return;
    }

    const defaultParcel = isOffice ? 'مقر الشركة' : parcelReference.trim();
    const defaultRegion = isOffice ? 'إداري / المقر الرئيسي' : region.trim();

    try {
      await onSubmit({
        request_type: requestType,
        parcel_reference: defaultParcel,
        region: defaultRegion,
        land_parcel_id: !isOffice && landParcelId ? Number(landParcelId) : undefined,
        target_department_id: Number(targetDepartmentId),
        site_engineer_user_id: isOffice ? undefined : (siteEngineerUserId ? Number(siteEngineerUserId) : undefined),
        date_needed: dateNeeded || undefined,
        notes: notes.trim() || undefined,
        items: items.map((item) => ({
          ...item,
          item_description: item.item_description.trim(),
          item_reference: defaultParcel,
          region: defaultRegion,
          specifications: item.specifications?.trim(),
          notes: item.notes?.trim(),
          quantity: typeof item.quantity === 'string' ? Number(item.quantity) : item.quantity,
        })),
      });
    } catch (err) {
      setError(parseApiError(err));
    }
  };

  const departmentSelectOptions = useMemo(() => {
    return departmentOptions.map((d) => ({
      value: d.id,
      label: d.name,
      subLabel: d.manager?.name ? `المدير: ${d.manager.name}` : undefined,
      badge: d.code || undefined,
      searchTerms: [d.code || '', d.manager?.name || '', d.site_engineer?.name || ''].filter(Boolean),
    }));
  }, [departmentOptions]);

  const catalogOptions = useMemo(() => {
    return catalogItems.map((c) => ({
      value: c.id,
      label: c.name,
      subLabel: c.code ? `كود: ${c.code}` : c.category?.name,
      badge: getUnitLabel(c.uom),
      searchTerms: [c.description || '', c.code || '', c.category?.name || ''].filter(Boolean),
    }));
  }, [catalogItems]);

  return (
    <form onSubmit={handleSubmit} className="space-y-3.5 animate-fade-in" dir="rtl">
      <ErrorMessage error={error} onDismiss={() => setError(null)} />

      {/* Request Type Segmented Bar (Ultra-Compact & Clear) */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/95 p-2.5 sm:p-3 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-300">نوع الطلب والغرض منه:</span>
          <span className="text-[10px] text-slate-500">
            (الافتراضي: مشتريات مواقع)
          </span>
        </div>

        <div className="flex items-center gap-2 bg-slate-950/80 p-1 rounded-xl border border-slate-800/80">
          <button
            type="button"
            onClick={() => setRequestType('PROJECT')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
              requestType !== 'OFFICE_SUPPLIES'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <span>🏗️</span>
            <span>مشتريات مشروعات ومواقع</span>
          </button>

          <button
            type="button"
            onClick={() => setRequestType('OFFICE_SUPPLIES')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
              requestType === 'OFFICE_SUPPLIES'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <span>🏢</span>
            <span>مستلزمات مكتبية وإدارية</span>
          </button>
        </div>
      </div>

      {/* Header Fields */}
      <Card className="space-y-4">
        <h3 className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3 text-sm font-bold text-slate-100">
          <span>📝</span> بيانات الطلب والقسم المعالج
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="القسم المطلوب منه الشراء" required error={fieldErrors.targetDepartment}>
            <Select
              id="pr-form-target-department"
              value={targetDepartmentId || ''}
              onChange={(e) => setTargetDepartmentId(e.target.value ? Number(e.target.value) : '')}
              disabled={isLoadingDepartments || departmentOptions.length === 0}
              error={Boolean(fieldErrors.targetDepartment)}
              className="font-bold text-slate-100 bg-slate-950 border-slate-700"
            >
              <option value="" disabled>-- اختر القسم المستهدف --</option>
              {departmentOptions.map((dept) => {
                const icon =
                  dept.code === 'EXECUTION' ? '🏗️' :
                  dept.code === 'BUILDINGS' ? '🏢' :
                  dept.code === 'FINISHING' ? '🎨' :
                  dept.code === 'LICENSES' ? '📜' :
                  dept.code === 'BUFFET' ? '☕' : '🏢';
                const managerName =
                  dept.manager?.name ||
                  (dept.code === 'EXECUTION' ? 'م. أيمن ماهر' :
                   dept.code === 'BUILDINGS' ? 'المهندس حاتم' :
                   dept.code === 'FINISHING' ? 'المهندس مصطفى الخشن' :
                   dept.code === 'LICENSES' ? 'م. مصطفى' :
                   dept.code === 'BUFFET' ? 'أ. عمرو' : '');
                return (
                  <option key={dept.id} value={dept.id}>
                    {icon} {dept.name} {managerName ? `— (المراجع: ${managerName})` : ''}
                  </option>
                );
              })}
            </Select>
          </FormField>

          {isGeneralManager && requestType !== 'OFFICE_SUPPLIES' && (
            <div className="md:col-span-2 rounded-xl border border-emerald-700/60 bg-emerald-950/30 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-emerald-400 font-black flex items-center gap-1.5 text-xs">
                  <span>👷</span> مسؤول استلام الموقع / مهندس الاستلام (اختيار المدير التنفيذي) <span className="text-rose-400">*</span>
                </span>
                <span className="text-[10px] text-emerald-300 font-bold bg-emerald-950/90 px-2 py-0.5 rounded border border-emerald-600/50">
                  إرسال مباشر للمشتريات
                </span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                طالما أن طلب الشراء صادر من المدير التنفيذي فلن يمر على مراجع قسم، لذلك أنت الوحيد المخول بتحديد مهندس الموقع أو مسؤول الاستلام الذي سيتولى فحص واستلام الأصناف:
              </p>
              {isLoadingReceivers ? (
                <div className="text-xs text-slate-400 py-1 font-bold">جاري تحميل قائمة المهندسين والمستلمين...</div>
              ) : (
                <Select
                  id="pr-form-site-engineer"
                  value={siteEngineerUserId || ''}
                  onChange={(e) => setSiteEngineerUserId(e.target.value ? Number(e.target.value) : '')}
                  error={Boolean(fieldErrors.siteEngineer)}
                  className="font-bold text-slate-100 bg-slate-900 border-emerald-600/70 focus:border-emerald-400"
                >
                  <option value="" disabled>-- اختر مهندس الموقع أو مسؤول الاستلام المعتمد --</option>
                  {siteEngineers.length > 0 && (
                    <optgroup label="👷 مهندسو الموقع الأساسيون">
                      {siteEngineers.map((eng) => (
                        <option key={`edit-gm-se-${eng.id}`} value={eng.id}>
                          {eng.name} {eng.department_name ? `(${eng.department_name})` : ''}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {otherUsers.length > 0 && (
                    <optgroup label="👥 مستخدمو النظام الآخرون (تفويض أي دور)">
                      {otherUsers.map((u) => (
                        <option key={`edit-gm-oth-${u.id}`} value={u.id}>
                          {u.name} — {u.role_name || 'مستخدم'} {u.department_name ? `(${u.department_name})` : ''}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </Select>
              )}
              {fieldErrors.siteEngineer && (
                <p className="text-[11px] font-bold text-rose-300 mt-1">⚠️ {fieldErrors.siteEngineer}</p>
              )}
            </div>
          )}

          {/* Project Land Parcel & Region Selection (Single per PR) */}
          {requestType !== 'OFFICE_SUPPLIES' && (
            <div className="rounded-xl border border-amber-800/60 bg-amber-950/20 p-4 space-y-4 md:col-span-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-800/40 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-base">🏗️</span>
                  <div>
                    <h3 className="text-xs sm:text-sm font-black text-amber-300">
                      تحديد قطعة الأرض والمنطقة للطلب
                    </h3>
                  </div>
                </div>
                {landParcels.length > 0 && (
                  <span className="text-[10px] bg-amber-950 px-2 py-0.5 rounded-full border border-amber-700/60 text-amber-300 font-bold self-start sm:self-auto">
                    {landParcels.length} قطعة أرض مسجلة متاحة
                  </span>
                )}
              </div>

              {/* Quick Select from Registered Land Parcels */}
              {landParcels.length > 0 && (
                <FormField label="اختيار سريع من قطع الأراضي المسجلة (اختياري)">
                  <Select
                    value={landParcelId || ''}
                    onChange={(e) => {
                      const selectedId = Number(e.target.value);
                      const selectedParcel = landParcels.find((p) => p.id === selectedId);
                      if (selectedParcel) {
                        setLandParcelId(selectedParcel.id);
                        setParcelReference(selectedParcel.parcel_reference);
                        setRegion(selectedParcel.region);
                      } else {
                        setLandParcelId('');
                      }
                    }}
                    className="bg-slate-950 border-amber-800/60 text-slate-100 font-semibold"
                  >
                    <option value="">-- اختر قطعة مسجلة للتعبئة الفورية أو أدخل يدويًا أدناه --</option>
                    {landParcels.map((parcel) => (
                      <option key={parcel.id} value={parcel.id}>
                        🏷️ {parcel.parcel_reference} — {parcel.region}
                      </option>
                    ))}
                  </Select>
                </FormField>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  label="رقم قطعة الأرض"
                  required
                  error={fieldErrors.parcelReference}
                >
                  <Input
                    id="pr-form-parcel-reference"
                    type="text"
                    value={parcelReference}
                    onChange={(e) => {
                      setParcelReference(e.target.value);
                      const matched = landParcels.find(
                        (p) => p.id === Number(landParcelId) && p.parcel_reference === e.target.value
                      );
                      if (!matched) setLandParcelId('');
                    }}
                    placeholder="مثال: قطعة 256 أو A-14"
                    error={Boolean(fieldErrors.parcelReference)}
                    className="font-mono font-bold text-amber-200"
                  />
                </FormField>

                <FormField
                  label="المنطقة"
                  required
                  error={fieldErrors.region}
                >
                  <Input
                    id="pr-form-region"
                    type="text"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    placeholder="مثال: المنطقة السابعة أو التجمع الخامس"
                    error={Boolean(fieldErrors.region)}
                    className="font-bold text-slate-100"
                  />
                </FormField>
              </div>
            </div>
          )}

          <FormField label="تاريخ الحاجة والتوريد" error={fieldErrors.dateNeeded}>
            <Input
              type="date"
              min={getTodayDateInputValue()}
              value={dateNeeded}
              onChange={(e) => setDateNeeded(e.target.value)}
            />
          </FormField>

          <FormField label="ملاحظات عامة">
            <Input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="أي اشتراطات خاصة بالطلب"
            />
          </FormField>
        </div>
      </Card>

      {/* Items List */}
      <Card className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <span>📦</span> بنود وأصناف الطلب
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {requestType === 'OFFICE_SUPPLIES' ? 'حدد المواد المكتبية المطلوبة والمواصفات والكميات.' : 'حدد المواد المطلوبة والمواصفات الفنية والكميات.'}
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleAddItem}
            className="w-full sm:w-auto"
          >
            + إضافة عنصر جديد
          </Button>
        </div>



        <div className="space-y-3">
          {items.map((item, index) => (
            <div
              key={index}
              id={`pr-form-item-${index}`}
              className="relative space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3 transition-all sm:p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800/60 font-mono">
                  بند #{index + 1}
                </span>
                {items.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveItem(index)}
                    className="w-full text-xs text-rose-400 hover:text-rose-300 sm:w-auto"
                  >
                    حذف البند
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className={requestType === 'OFFICE_SUPPLIES' ? "md:col-span-2" : "md:col-span-3"}>
                  <FormField label="الصنف" required error={fieldErrors[`item_${index}_description`]}>
                    <ItemAutocompleteInput
                      id={`pr-form-item-${index}-description`}
                      required
                      error={Boolean(fieldErrors[`item_${index}_description`])}
                      value={item.item_description}
                      onChange={(val) => handleItemChange(index, 'item_description', val)}
                      placeholder={requestType === 'OFFICE_SUPPLIES' ? 'مثال: طابعة ليزر / كرتونة ورق تصوير A4 / أقلام' : 'اسم الصنف أو المادة المطلوبة بالتفصيل'}
                    />
                  </FormField>
                </div>

                {requestType === 'OFFICE_SUPPLIES' && (
                  <FormField label="مكتب / مكان الاستلام الداخلي (اختياري)">
                    <Input
                      type="text"
                      value={item.item_reference || ''}
                      onChange={(e) => {
                        handleItemChange(index, 'item_reference', e.target.value);
                        handleItemChange(index, 'region', e.target.value || 'مقر الشركة');
                      }}
                      placeholder="افتراضي: مقر الشركة / مكتب مقدم الطلب"
                    />
                  </FormField>
                )}

                <FormField label="الكمية المطلوبة" required error={fieldErrors[`item_${index}_quantity`]} >
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    error={Boolean(fieldErrors[`item_${index}_quantity`])}
                    value={item.quantity === 0 ? '' : (item.quantity ?? '')}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                  />
                </FormField>

                <FormField label="الوحدة">
                  <Select
                    value={item.uom || 'PCS'}
                    onChange={(e) => handleItemChange(index, 'uom', e.target.value)}
                  >
                    {UNIT_OPTIONS.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
                  </Select>
                </FormField>

                <div className="md:col-span-3">
                  <FormField label="المواصفات الفنية والتشغيلية">
                    <Input
                      type="text"
                      value={item.specifications || ''}
                      onChange={(e) => handleItemChange(index, 'specifications', e.target.value)}
                      placeholder="أدخل الأبعاد، الماركة، القياسات، أو المواصفات الدقيقة المطلوبة..."
                    />
                  </FormField>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Real-time Items Summary Table (similar to quotes table) */}
      <PurchaseRequestItemsSummaryTable
        items={items}
        requestType={requestType}
        parcelReference={parcelReference}
        region={region}
        onRemoveItem={items.length > 1 ? handleRemoveItem : undefined}
        onScrollToItem={(index) => {
          const el = document.getElementById(`pr-form-item-${index}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('ring-2', 'ring-cyan-400');
            setTimeout(() => el.classList.remove('ring-2', 'ring-cyan-400'), 1500);
          }
        }}
      />

      {/* Form الإجراءات */}
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
        <Button
          type="button"
          variant="secondary"
          size="md"
          onClick={() => navigate('/employee/requests')}
          className="w-full sm:w-auto"
        >
          إلغاء
        </Button>

        <Button
          type="submit"
          variant="primary"
          size="md"
          isLoading={isSubmitting}
          className="w-full sm:w-auto"
        >
          {submitButtonText}
        </Button>
      </div>
    </form>
  );
};

export default PurchaseRequestForm;
