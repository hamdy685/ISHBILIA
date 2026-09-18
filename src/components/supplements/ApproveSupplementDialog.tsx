import React, { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { FormField, Textarea, Select } from '../ui/FormField';
import { getSiteEngineerReceiverOptionsApi } from '../../api/purchaseRequests';
import { PurchaseRequest, SiteEngineerReceiverOption } from '../../types/purchaseRequest';
import { PurchaseRequestSupplement } from '../../types/supplement';

interface Props {
  isOpen: boolean;
  request: PurchaseRequest;
  supplement: PurchaseRequestSupplement;
  isApproving: boolean;
  onConfirm: (receiverUserId: number, notes?: string) => Promise<void> | void;
  onClose: () => void;
}

export const ApproveSupplementDialog: React.FC<Props> = ({
  isOpen,
  request,
  supplement,
  isApproving,
  onConfirm,
  onClose,
}) => {
  const [notes, setNotes] = useState('');
  const [selectedReceiverId, setSelectedReceiverId] = useState<number | ''>(
    request.site_engineer_user_id || ''
  );
  const [siteEngineers, setSiteEngineers] = useState<SiteEngineerReceiverOption[]>([]);
  const [warehouseKeepers, setWarehouseKeepers] = useState<SiteEngineerReceiverOption[]>([]);
  const [otherUsers, setOtherUsers] = useState<SiteEngineerReceiverOption[]>([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedReceiverId(request.site_engineer_user_id || '');
      setNotes('');
      setSelectionError(null);
      setIsLoadingOptions(true);
      getSiteEngineerReceiverOptionsApi()
        .then((res) => {
          setSiteEngineers(res.site_engineers || []);
          setWarehouseKeepers(res.warehouse_keepers || []);
          setOtherUsers(res.other_users || []);
        })
        .catch(() => {
          // Handled gracefully
        })
        .finally(() => {
          setIsLoadingOptions(false);
        });
    } else {
      setNotes('');
      setSelectedReceiverId('');
      setSelectionError(null);
    }
  }, [isOpen, request.site_engineer_user_id]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReceiverId) {
      setSelectionError('يرجى اختيار المسؤول عن الاستلام (مهندس الموقع أو أمين المخزن) أولاً قبل اعتماد طلب الكمالة.');
      return;
    }
    setSelectionError(null);
    void onConfirm(Number(selectedReceiverId), notes.trim() || undefined);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="اعتماد طلب الكمالة وتحديد مسؤول الاستلام"
      subtitle={`ملحق دفعة #${supplement.batch_number} — طلب رقم ${request.request_number}`}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={isApproving}>
            إلغاء
          </Button>
          <Button
            type="button"
            variant="success"
            size="sm"
            onClick={handleSubmit}
            isLoading={isApproving}
          >
            اعتماد وتوجيه للمشتريات
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <p className="text-slate-200">
          هل أنت متأكد من اعتماد بنود ملحق الكمالة (دفعة #{supplement.batch_number}) على الطلب{' '}
          <strong className="text-emerald-400 font-mono">{request.request_number}</strong>؟
        </p>

        <FormField
          label="المسؤول عن استلام بنود الكمالة (مهندس الموقع أو أمين المخزن) *"
          error={selectionError || undefined}
        >
          {isLoadingOptions ? (
            <div className="text-slate-400 text-xs py-2">جاري تحميل قائمة المهندسين وأمناء المخازن...</div>
          ) : (
            <Select
              value={selectedReceiverId}
              onChange={(e) => {
                setSelectedReceiverId(e.target.value ? Number(e.target.value) : '');
                setSelectionError(null);
              }}
              className={`font-bold text-slate-100 bg-slate-900 ${selectionError ? 'border-rose-500' : 'border-slate-700'}`}
            >
              <option value="">-- اختر المسؤول عن الاستلام (مهندس الموقع أو أمين المخزن) --</option>
              {siteEngineers.length > 0 && (
                <optgroup label="👷 مهندسو الموقع الأساسيون">
                  {siteEngineers.map((eng) => (
                    <option key={`se-${eng.id}`} value={eng.id}>
                      {eng.name} {eng.department_name ? `(${eng.department_name})` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
              {warehouseKeepers.length > 0 && (
                <optgroup label="🏬 أمناء المخازن (مسؤولو الاستلام بالمخزن)">
                  {warehouseKeepers.map((wh) => (
                    <option key={`wh-${wh.id}`} value={wh.id}>
                      {wh.name} {wh.department_name ? `(${wh.department_name})` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
              {otherUsers.length > 0 && (
                <optgroup label="👥 مستخدمو النظام الآخرون">
                  {otherUsers.map((u) => (
                    <option key={`other-${u.id}`} value={u.id}>
                      {u.name} — {u.role_name || 'مستخدم'} {u.department_name ? `(${u.department_name})` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
            </Select>
          )}
          <p className="mt-1 text-[11px] text-slate-400">
            سيتم توجيه إذن استلام بنود الكمالة فور توريدها إلى الشخص المحدد أعلاه.
          </p>
        </FormField>

        <FormField label="ملاحظات المراجع على الكمالة (اختياري)">
          <Textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="ملاحظات اختيارية لإدارة المشتريات للتسعير..."
          />
        </FormField>
      </form>
    </Modal>
  );
};

export default ApproveSupplementDialog;
