import React, { useState, useEffect } from 'react';
import { getCatalogItemsApi } from '../../api/catalog';
import { CatalogItem } from '../../types/purchaseRequest';
import { ReviewItemPayload } from '../../api/reviewer';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { FormField, Input, Select } from '../ui/FormField';
import { DEFAULT_PR_UNIT_CODES, getUnitOptions } from '../../utils/units';
import { ItemAutocompleteInput } from '../common/ItemAutocompleteInput';

const UNIT_OPTIONS = getUnitOptions(DEFAULT_PR_UNIT_CODES);

interface Props {
  isOpen: boolean;
  isAdding: boolean;
  defaultParcelReference?: string;
  defaultRegion?: string;
  onConfirm: (payload: ReviewItemPayload) => void;
  onCancel: () => void;
}

export const AddReviewItemDialog: React.FC<Props> = ({
  isOpen,
  isAdding,
  defaultParcelReference = '',
  defaultRegion = '',
  onConfirm,
  onCancel,
}) => {
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [itemId, setItemId] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [itemReference, setItemReference] = useState(defaultParcelReference);
  const [region, setRegion] = useState(defaultRegion);
  const [quantity, setQuantity] = useState<number>(1);
  const [uom, setUom] = useState('PCS');
  const [specifications, setSpecifications] = useState('');
  const [notes, setNotes] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setItemReference(defaultParcelReference);
      setRegion(defaultRegion);
      getCatalogItemsApi()
        .then((data) => setCatalogItems(data))
        .catch((err) => console.error('Failed to load catalog', err));
    }
  }, [isOpen, defaultParcelReference, defaultRegion]);

  const handleCatalogSelect = (idStr: string) => {
    const id = idStr ? parseInt(idStr, 10) : null;
    setItemId(id);
    if (id) {
      const selected = catalogItems.find((c) => c.id === id);
      if (selected) {
        setDescription(selected.name);
        setUom(selected.uom);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setValidationError('وصف العنصر مطلوب.');
      return;
    }
    if (!itemReference.trim()) {
      setValidationError('رقم قطعة الأرض مطلوب.');
      return;
    }
    if (!region.trim()) {
      setValidationError('المنطقة مطلوبة.');
      return;
    }
    if (quantity <= 0) {
      setValidationError('الكمية يجب أن تكون أكبر من 0> 0.');
      return;
    }

    setValidationError(null);
    onConfirm({
      item_id: itemId,
      item_description: description,
      item_reference: itemReference.trim(),
      region: region.trim(),
      quantity,
      uom: uom || 'PCS',
      specifications: specifications || undefined,
      notes: notes || undefined,
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title="إضافة بند جديد أثناء المراجعة"
      size="lg"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={isAdding}>
            إلغاء
          </Button>
          <Button
            type="button"
            variant="success"
            size="sm"
            onClick={handleSubmit}
            isLoading={isAdding}
          >
            إضافة البند
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {validationError && (
          <div className="text-xs text-rose-300 font-semibold bg-rose-950/60 p-2.5 rounded-lg border border-rose-800/80">
            {validationError}
          </div>
        )}

        <div className="space-y-3">
          {catalogItems.length > 0 && (
            <FormField label="اختر من الكتالوج (اختياري)">
              <Select
                value={itemId || ''}
                onChange={(e) => handleCatalogSelect(e.target.value)}
              >
                <option value="">-- بند مخصص</option>
                {catalogItems.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </Select>
            </FormField>
          )}

          <FormField label="وصف البند" required>
            <ItemAutocompleteInput
              required
              value={description}
              onChange={setDescription}
              placeholder="وصف البند المطلوب..."
            />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="رقم قطعة الأرض" required>
              <Input
                type="text"
                required
                value={itemReference}
                onChange={(e) => setItemReference(e.target.value)}
                placeholder="أدخل رقم قطعة الأرض"
                dir="ltr"
              />
            </FormField>
            <FormField label="المنطقة" required>
              <Input
                type="text"
                required
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="أدخل اسم المنطقة"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="الكمية" required>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={quantity}
                onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
              />
            </FormField>

            <FormField label="الوحدة">
              <Select value={uom} onChange={(e) => setUom(e.target.value)}>
                {UNIT_OPTIONS.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
              </Select>
            </FormField>
          </div>
        </div>
      </form>
    </Modal>
  );
};

export default AddReviewItemDialog;
