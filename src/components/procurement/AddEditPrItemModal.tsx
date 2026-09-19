import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { FormField, Input, Select, Textarea } from '../ui/FormField';
import {
  PurchaseRequest,
  PurchaseRequestItem,
  CatalogItem,
} from '../../types/purchaseRequest';
import {
  addPurchaseRequestItemApi,
  updatePurchaseRequestItemApi,
} from '../../api/purchaseRequests';
import { getCatalogItemsApi } from '../../api/catalog';
import { getSuppliersApi } from '../../api/suppliers';
import { المورد as Supplier } from '../../types/purchaseOrder';
import { DEFAULT_PR_UNIT_CODES, getUnitOptions } from '../../utils/units';
import { parseApiError } from '../../utils/apiError';
import { ItemAutocompleteInput } from '../common/ItemAutocompleteInput';

const UNIT_OPTIONS = getUnitOptions(DEFAULT_PR_UNIT_CODES);

interface AddEditPrItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  pr: PurchaseRequest;
  item?: PurchaseRequestItem | null;
  onSuccess: (updatedPr: PurchaseRequest) => void;
}

export const AddEditPrItemModal: React.FC<AddEditPrItemModalProps> = ({
  isOpen,
  onClose,
  pr,
  item,
  onSuccess,
}) => {
  const isEditing = Boolean(item);

  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  const [itemId, setItemId] = useState<number | null>(null);
  const [itemDescription, setItemDescription] = useState('');
  const [itemReference, setItemReference] = useState('');
  const [region, setRegion] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [uom, setUom] = useState('PCS');
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [estimatedUnitPrice, setEstimatedUnitPrice] = useState<number | ''>('');
  const [specifications, setSpecifications] = useState('');
  const [notes, setNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isDirect = pr.procurement_route === 'DIRECT';

  // Load catalog and suppliers on open
  useEffect(() => {
    if (!isOpen) return;

    setFormError(null);
    setLoadingCatalog(true);

    Promise.all([
      getCatalogItemsApi().catch(() => [] as CatalogItem[]),
      getSuppliersApi().catch(() => [] as Supplier[]),
    ]).then(([catalogList, supplierList]) => {
      setCatalogItems(catalogList);
      setSuppliers(supplierList);
      setLoadingCatalog(false);
    });

    if (item) {
      setItemId(item.item_id || null);
      setItemDescription(item.item_description || '');
      setItemReference(item.item_reference || pr.parcel_reference || '');
      setRegion(item.region || pr.region || '');
      setQuantity(Number(item.quantity) || 1);
      setUom(item.uom || 'PCS');
      setSupplierId(item.supplier_id || pr.direct_supplier_id || null);
      setEstimatedUnitPrice(
        item.estimated_unit_price !== null && item.estimated_unit_price !== undefined
          ? Number(item.estimated_unit_price)
          : ''
      );
      setSpecifications(item.specifications || '');
      setNotes(item.notes || '');
    } else {
      setItemId(null);
      setItemDescription('');
      setItemReference(pr.parcel_reference || '');
      setRegion(pr.region || '');
      setQuantity(1);
      setUom('PCS');
      setSupplierId(pr.direct_supplier_id || null);
      setEstimatedUnitPrice('');
      setSpecifications('');
      setNotes('');
    }
  }, [isOpen, item, pr]);

  const handleCatalogSelect = (idStr: string) => {
    const id = idStr ? parseInt(idStr, 10) : null;
    setItemId(id);
    if (id) {
      const selected = catalogItems.find((c) => c.id === id);
      if (selected) {
        setItemDescription(selected.name);
        if (selected.uom) setUom(selected.uom);
        if (selected.description && !specifications) {
          setSpecifications(selected.description);
        }
      }
    }
  };

  const lineTotal = (Number(quantity) || 0) * (Number(estimatedUnitPrice) || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!itemDescription.trim()) {
      setFormError('يرجى كتابة وصف البند / المواد المطلوبة.');
      return;
    }

    if (!quantity || Number(quantity) <= 0) {
      setFormError('الكمية يجب أن تكون أكبر من الصفر.');
      return;
    }

    if (estimatedUnitPrice !== '' && Number(estimatedUnitPrice) < 0) {
      setFormError('سعر الوحدة التقديري يجب ألا يكون سالبًا.');
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    try {
      const payload = {
        item_id: itemId || null,
        item_description: itemDescription.trim(),
        item_reference: itemReference.trim() || undefined,
        region: region.trim() || undefined,
        quantity: Number(quantity),
        uom: uom || 'PCS',
        supplier_id: supplierId ? Number(supplierId) : null,
        estimated_unit_price:
          estimatedUnitPrice !== '' ? Number(estimatedUnitPrice) : null,
        specifications: specifications.trim() || undefined,
        notes: notes.trim() || undefined,
      };

      let updatedPr: PurchaseRequest;
      if (isEditing && item) {
        updatedPr = await updatePurchaseRequestItemApi(pr.id, item.id, payload);
      } else {
        updatedPr = await addPurchaseRequestItemApi(pr.id, payload);
      }

      onSuccess(updatedPr);
      onClose();
    } catch (err) {
      const parsed = parseApiError(err);
      setFormError(parsed.message || 'فشلت العملية، يرجى المحاولة لاحقاً.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'تعديل بند طلب الشراء' : 'إضافة بند جديد لطلب الشراء'}
      subtitle={`طلب شراء رقم #${pr.request_number}`}
      size="xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            إلغاء
          </Button>
          <Button
            type="submit"
            form="add-edit-pr-item-form"
            variant="primary"
            isLoading={isSubmitting}
          >
            {isEditing ? 'حفظ التعديلات' : '+ إضافة البند'}
          </Button>
        </div>
      }
    >
      <form id="add-edit-pr-item-form" onSubmit={handleSubmit} className="space-y-4" dir="rtl">
        {formError && (
          <div className="rounded-xl border border-rose-500/50 bg-rose-950/40 p-3 text-xs text-rose-300">
            {formError}
          </div>
        )}

        {/* Catalog Selector (if catalog has items) */}
        {catalogItems.length > 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2">
            <label className="text-xs font-bold text-slate-300 block">
              اختيار صنف جاهز من الدليل (اختياري)
            </label>
            <select
              value={itemId || ''}
              onChange={(e) => handleCatalogSelect(e.target.value)}
              disabled={loadingCatalog || isSubmitting}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
            >
              <option value="">-- أو كتابة صنف مخصص بالأسفل --</option>
              {catalogItems.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name} {cat.code ? `(${cat.code})` : ''} - {cat.uom}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Item Description with Autocomplete */}
        <FormField label="وصف البند / المواد المطلوبة *" required>
          <ItemAutocompleteInput
            value={itemDescription}
            onChange={setItemDescription}
            placeholder="مثال: أسمنت بورتلاندي عادي 50 كجم، حديد تسليح 12 مم..."
            disabled={isSubmitting}
            required
          />
        </FormField>

        {/* Parcel Reference & Region (Relevant for projects) */}
        {pr.request_type !== 'OFFICE_SUPPLIES' && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="رقم قطعة الأرض">
              <Input
                value={itemReference}
                onChange={(e) => setItemReference(e.target.value)}
                placeholder="رقم القطعة أو الموقع"
                disabled={isSubmitting}
              />
            </FormField>
            <FormField label="المنطقة">
              <Input
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="المنطقة أو المخطط"
                disabled={isSubmitting}
              />
            </FormField>
          </div>
        )}

        {/* Quantity and Unit of Measure */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="الكمية المطلوبة *" required>
            <Input
              type="number"
              step="any"
              min="0.01"
              value={quantity}
              onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
              disabled={isSubmitting}
              required
            />
          </FormField>
          <FormField label="وحدة القياس *" required>
            <Select
              value={uom}
              onChange={(e) => setUom(e.target.value)}
              disabled={isSubmitting}
            >
              {UNIT_OPTIONS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </Select>
          </FormField>
        </div>

        {/* Pricing and Supplier (Shown for direct route or if pricing enabled) */}
        <div className="rounded-xl border border-cyan-900/30 bg-cyan-950/10 p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-cyan-300">
              {isDirect ? 'التسعير المباشر وتعيين المورد' : 'البيانات المالية التقديرية (اختياري)'}
            </span>
            {lineTotal > 0 && (
              <span className="font-mono text-xs font-black text-emerald-400 bg-emerald-950/50 border border-emerald-800/40 px-2.5 py-0.5 rounded-md">
                إجمالي البند: {lineTotal.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="سعر الوحدة التقديري (ج.م)">
              <Input
                type="number"
                step="any"
                min="0"
                value={estimatedUnitPrice}
                onChange={(e) =>
                  setEstimatedUnitPrice(
                    e.target.value === '' ? '' : parseFloat(e.target.value) || 0
                  )
                }
                placeholder="0.00"
                disabled={isSubmitting}
              />
            </FormField>

            <FormField label="المورد المقترح">
              <select
                value={supplierId || ''}
                onChange={(e) =>
                  setSupplierId(e.target.value ? parseInt(e.target.value, 10) : null)
                }
                disabled={isSubmitting}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
              >
                <option value="">-- بدون مورد محدد --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.company_name} {s.phone ? `(${s.phone})` : ''}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
        </div>

        {/* Specifications */}
        <FormField label="المواصفات الفنية">
          <Textarea
            value={specifications}
            onChange={(e) => setSpecifications(e.target.value)}
            placeholder="المواصفات والاشتراطات الفنية الخاصة بالبند..."
            rows={2}
            disabled={isSubmitting}
          />
        </FormField>

        {/* Notes */}
        <FormField label="ملاحظات إضافية">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="أي ملاحظات أو تعليمات خاصة..."
            rows={2}
            disabled={isSubmitting}
          />
        </FormField>
      </form>
    </Modal>
  );
};

export default AddEditPrItemModal;
