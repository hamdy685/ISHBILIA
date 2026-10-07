import React, { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { FormField, Textarea, Select } from '../ui/FormField';
import { getSiteEngineerReceiverOptionsApi } from '../../api/purchaseRequests';
import { SiteEngineerReceiverOption } from '../../types/purchaseRequest';
import { useAuth } from '../../context/AuthContext';

interface Props {
  isOpen: boolean;
  requestNumber: string;
  initialSiteEngineerId?: number | null;
  initialRequiresWarehouseReceipt?: boolean;
  isApproving: boolean;
  onConfirm: (comment?: string, siteEngineerUserId?: number | null, requiresWarehouseReceipt?: boolean) => void;
  onCancel: () => void;
  title?: string;
  subtitle?: string;
  confirmButtonText?: string;
  promptText?: string;
}

export const ApproveRequestDialog: React.FC<Props> = ({
  isOpen,
  requestNumber,
  initialSiteEngineerId,
  initialRequiresWarehouseReceipt = true,
  isApproving,
  onConfirm,
  onCancel,
  title,
  subtitle,
  confirmButtonText,
  promptText,
}) => {
  const { user } = useAuth();
  const [comment, setComment] = useState('');
  const [selectedEngineerId, setSelectedEngineerId] = useState<number | ''>(
    initialSiteEngineerId || ''
  );
  const [requiresWarehouseReceipt, setRequiresWarehouseReceipt] = useState<boolean>(
    initialRequiresWarehouseReceipt ?? true
  );
  const [siteEngineers, setSiteEngineers] = useState<SiteEngineerReceiverOption[]>([]);
  const [warehouseKeepers, setWarehouseKeepers] = useState<SiteEngineerReceiverOption[]>([]);
  const [otherUsers, setOtherUsers] = useState<SiteEngineerReceiverOption[]>([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedEngineerId(initialSiteEngineerId || '');
      setRequiresWarehouseReceipt(initialRequiresWarehouseReceipt ?? true);
      setIsLoadingOptions(true);
      setSelectionError(null);
      getSiteEngineerReceiverOptionsApi()
        .then((res) => {
          setSiteEngineers(res.site_engineers || []);
          setWarehouseKeepers(res.warehouse_keepers || []);
          setOtherUsers(res.other_users || []);
        })
        .catch(() => {
          // Fallback if needed
        })
        .finally(() => {
          setIsLoadingOptions(false);
        });
    } else {
      setComment('');
      setSelectedEngineerId('');
      setRequiresWarehouseReceipt(true);
      setSelectionError(null);
    }
  }, [isOpen, initialSiteEngineerId, initialRequiresWarehouseReceipt]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isApproving) return;
    if (!selectedEngineerId) {
      setSelectionError('يرجى اختيار المسؤول عن الاستلام (مهندس الموقع أو أمين المخزن أو المراجع نفسه) أولاً قبل اعتماد الطلب.');
      return;
    }
    setSelectionError(null);
    onConfirm(comment || undefined, Number(selectedEngineerId), requiresWarehouseReceipt);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title || "اعتماد طلب الشراء وتحديد مسؤول الاستلام"}
      subtitle={subtitle || (requestNumber ? `طلب رقم ${requestNumber}` : undefined)}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={isApproving}>
            إلغاء
          </Button>
          <Button
            type="button"
            variant="success"
            size="sm"
            onClick={handleSubmit}
            isLoading={isApproving}
            disabled={isApproving}
          >
            {confirmButtonText || "اعتماد الطلب"}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {promptText ? (
          <p className="text-slate-200">{promptText}</p>
        ) : (
          <p className="text-slate-200">
            هل أنت متأكد من اعتماد طلب الشراء <strong className="text-emerald-400 font-mono">{requestNumber}</strong> وتحويله للمدير التنفيذي؟
          </p>
        )}

        <FormField
          label="المسؤول عن استلام المواد (مهندس الموقع أو أمين المخزن أو المراجع نفسه) *"
          error={selectionError || undefined}
        >
          {user && (
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setSelectedEngineerId(user.id);
                  setSelectionError(null);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                  selectedEngineerId === user.id
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400 shadow-sm shadow-cyan-500/20'
                    : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700'
                }`}
              >
                <span>⭐</span>
                <span>أنا المستلم بنفسي ({user.name})</span>
              </button>
              <span className="text-[10px] text-slate-400">أو اختر مهندس موقع / مستلم آخر من القائمة:</span>
            </div>
          )}

          {isLoadingOptions ? (
            <div className="text-slate-400 text-xs py-2">جاري تحميل قائمة المهندسين وأمناء المخازن...</div>
          ) : (
            <Select
              value={selectedEngineerId}
              onChange={(e) => {
                setSelectedEngineerId(e.target.value ? Number(e.target.value) : '');
                setSelectionError(null);
              }}
              className={`font-bold text-slate-100 bg-slate-900 ${selectionError ? 'border-rose-500' : 'border-slate-700'}`}
            >
              <option value="">-- اختر المسؤول عن الاستلام (مهندس الموقع أو أمين المخزن أو نفسك) --</option>
              {user && (
                <optgroup label="⭐ خيار الاستلام الذاتي (المراجع نفسه)">
                  <option value={user.id}>
                    ⭐ أنا المراجع ({user.name}) — سأقوم بالاستلام والفحص بنفسي
                  </option>
                </optgroup>
              )}
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
              {otherUsers.filter((u) => u.id !== user?.id).length > 0 && (
                <optgroup label="👥 مستخدمو النظام الآخرون (تفويض أي دور آخر)">
                  {otherUsers
                    .filter((u) => u.id !== user?.id)
                    .map((u) => (
                      <option key={`other-${u.id}`} value={u.id}>
                        {u.name} — {u.role_name || 'مستخدم'} {u.department_name ? `(${u.department_name})` : ''}
                      </option>
                    ))}
                </optgroup>
              )}
            </Select>
          )}
          <p className="mt-1 text-[11px] text-slate-400">
            الشخص المختار سيتولى مراجعة إذن الاستلام واعتماده فور توريد الأصناف من المورد.
          </p>
        </FormField>

        {/* خيار استلام وفحص المخزن (عم سلامة) */}
        <div className="rounded-xl border border-slate-700/80 bg-slate-800/60 p-3.5 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <span className="text-xl shrink-0 mt-0.5">🏬</span>
              <div>
                <span className="font-bold text-slate-100 text-xs block">
                  استلام وفحص بالمخزن (عم سلامة)
                </span>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  {requiresWarehouseReceipt
                    ? 'نعم (الافتراضي) — يمر أمر الشراء على عم سلامة في المخزن لاستلام البضاعة وفحصها وإصدار إذن الاستلام.'
                    : 'لا (توريد مباشر) — يتم توريد البضاعة مباشرة للموقع لمهندس الموقع دون المرور على المخزن أو إشعار عم سلامة.'}
                </span>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                checked={requiresWarehouseReceipt}
                onChange={(e) => setRequiresWarehouseReceipt(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>
          <div className="flex items-center gap-2 pt-2 border-t border-slate-700/50 text-[11px]">
            <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${requiresWarehouseReceipt ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-amber-950 text-amber-300 border border-amber-800'}`}>
              {requiresWarehouseReceipt ? '✅ يمر على عم سلامة في المخزن' : '⚡ توريد مباشر للموقع (يتخطى عم سلامة)'}
            </span>
          </div>
        </div>

        <FormField label="ملاحظات الاعتماد (اختياري)">
          <Textarea
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="ملاحظات اختيارية للمدير التنفيذي..."
          />
        </FormField>
      </form>
    </Modal>
  );
};

export default ApproveRequestDialog;
