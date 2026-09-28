import React, { useEffect, useState } from 'react';
import {
  SupplierAdmin,
  getSuppliersAdminApi,
  createSupplierAdminApi,
  updateSupplierAdminApi,
  deleteSupplierAdminApi,
  SupplierInput,
} from '../../api/admin/suppliers';
import { TableSkeleton } from '../../components/ui/StateFeedback';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import ErrorMessage from '../../components/ErrorMessage';
import { parseApiError } from '../../utils/apiError';
import { formatCleanNumber } from '../../utils/numberFormat';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table';
import TableFilterBar from '../../components/ui/TableFilterBar';
import TableColumnFilters from '../../components/ui/TableColumnFilters';
import { Modal } from '../../components/ui/Modal';
import { FormField, Input, Textarea } from '../../components/ui/FormField';

export const SuppliersPage: React.FC = () => {
  const [suppliers, setSuppliers] = useState<SupplierAdmin[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [columnFilters, setColumnFilters] = useState({ code: '', name: '', contact: '', contactData: '', status: '', action: '' });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [supplierToDelete, setSupplierToDelete] = useState<SupplierAdmin | null>(null);
  const [deletingSupplierId, setDeletingSupplierId] = useState<number | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierAdmin | null>(null);
  const [formData, setFormData] = useState<SupplierInput>({
    name: '',
    contact_name: '',
    email: '',
    phone: '',
    address: '',
    opening_balance: 0,
    opening_balance_notes: '',
    is_active: true,
  });
  const [submitting, setSubmitting] = useState<boolean>(false);

  const { hasPermission } = useAuth();

  const loadSuppliers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSuppliersAdminApi();
      setSuppliers(data);
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      setError(parsed.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, []);

  const handleOpenAdd = () => {
    setEditingSupplier(null);
    setFormData({
      name: '',
      contact_name: '',
      email: '',
      phone: '',
      address: '',
      opening_balance: 0,
      opening_balance_notes: '',
      is_active: true,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (sup: SupplierAdmin) => {
    setEditingSupplier(sup);
    setFormData({
      name: sup.name,
      contact_name: sup.contact_name || '',
      email: sup.email || '',
      phone: sup.phone || '',
      address: sup.address || '',
      opening_balance: Number(sup.opening_balance || 0),
      opening_balance_notes: sup.opening_balance_notes || '',
      is_active: sup.is_active,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingSupplier) {
        await updateSupplierAdminApi(editingSupplier.id, formData);
      } else {
        await createSupplierAdminApi(formData);
      }
      setIsModalOpen(false);
      await loadSuppliers();
    } catch (err: unknown) {
      setError(parseApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  const executeDelete = async (id: number) => {
    setDeletingSupplierId(id);
    try {
      await deleteSupplierAdminApi(id);
      setSupplierToDelete(null);
      await loadSuppliers();
    } catch (err: unknown) {
      setError(parseApiError(err).message);
    } finally {
      setDeletingSupplierId(null);
    }
  };

  const handleDelete = (supplier: SupplierAdmin) => {
    setSupplierToDelete(supplier);
  };

  if (!hasPermission('system.suppliers.manage') && !hasPermission('supplier.view')) {
    return (
      <div className="p-6 text-center text-rose-400 bg-rose-950/40 border border-rose-800/80 rounded-xl" dir="rtl">
        عفواً، لا تملك الصلاحية اللازمة للوصول لإدارة الموردين.
      </div>
    );
  }

  if (loading) {
    return <TableSkeleton rows={7} columns={6} className="min-h-[300px]" />;
  }

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredSuppliers = suppliers.filter((sup) => {
    const matchesSearch = !normalizedSearch || [sup.name, sup.code, sup.contact_name, sup.email, sup.phone, sup.address].filter(Boolean).join(' ').toLowerCase().includes(normalizedSearch);
    const contains = (value: unknown, filter: string) => !filter || String(value ?? '').toLocaleLowerCase('ar-EG').includes(filter.toLocaleLowerCase('ar-EG'));
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? sup.is_active : !sup.is_active);
    return matchesSearch && matchesStatus && contains(sup.code || `SUP-${sup.id}`, columnFilters.code) && contains(sup.name, columnFilters.name) && contains(sup.contact_name, columnFilters.contact) && contains(`${sup.email || ''} ${sup.phone || ''}`, columnFilters.contactData) && contains(sup.is_active ? 'معتمد' : 'غير مفعّل', columnFilters.status) && contains('تعديل حذف', columnFilters.action);
  });

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      {/* Header */}
      <div className="pb-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-100 flex items-center gap-2">
            <span>🏭</span> إدارة الموردين والشركات
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            إدارة وتحديث بيانات الشركات والموردين المعتمدين لأوامر الشراء
          </p>
        </div>

        <Button variant="primary" size="md" onClick={handleOpenAdd}>
          + إضافة مورد جديد
        </Button>
      </div>

      <ErrorMessage error={error} onDismiss={() => setError(null)} />

      <TableFilterBar
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="بحث باسم المورد أو الكود أو البريد أو الهاتف..."
        selects={[{
          label: 'حالة المورد',
          value: statusFilter,
          onChange: setStatusFilter,
          options: [
            { value: 'all', label: 'كل الحالات' },
            { value: 'active', label: 'معتمد / نشط' },
            { value: 'inactive', label: 'غير مفعّل' },
          ],
        }]}
        onClear={() => { setSearchTerm(''); setStatusFilter('all'); }}
        hasActiveFilters={Boolean(searchTerm || statusFilter !== 'all')}
        resultCount={filteredSuppliers.length}
        totalCount={suppliers.length}
        resultLabel="مورد"
      />

      <TableColumnFilters filters={[{ key: 'code', label: 'الكود', value: columnFilters.code, onChange: (value) => setColumnFilters(current => ({ ...current, code: value })) }, { key: 'name', label: 'اسم الشركة / المورد', value: columnFilters.name, onChange: (value) => setColumnFilters(current => ({ ...current, name: value })) }, { key: 'contact', label: 'مسؤول التواصل', value: columnFilters.contact, onChange: (value) => setColumnFilters(current => ({ ...current, contact: value })) }, { key: 'contactData', label: 'البريد والهاتف', value: columnFilters.contactData, onChange: (value) => setColumnFilters(current => ({ ...current, contactData: value })) }, { key: 'status', label: 'الحالة', value: columnFilters.status, onChange: (value) => setColumnFilters(current => ({ ...current, status: value })) }, { key: 'action', label: 'الإجراءات', value: columnFilters.action, onChange: (value) => setColumnFilters(current => ({ ...current, action: value })) }]} hasActiveFilters={Object.values(columnFilters).some(Boolean)} onClear={() => setColumnFilters({ code: '', name: '', contact: '', contactData: '', status: '', action: '' })} />

      {/* الموردون Table */}
      <div className="hidden min-w-0 md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>الكود</TableHead>
              <TableHead>اسم الشركة / المورد</TableHead>
              <TableHead>مسؤول التواصل</TableHead>
              <TableHead>البريد والهاتف</TableHead>
              <TableHead>الرصيد الافتتاحي</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead className="text-center">الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSuppliers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-slate-400 text-xs">
                  <div className="space-y-2">
                    <p>{suppliers.length === 0 ? 'لا يوجد موردون مسجلون حتى الآن.' : 'لم نجد موردين مطابقين للفلاتر الحالية.'}</p>
                    {searchTerm ? (
                      <Button variant="secondary" size="sm" onClick={() => setSearchTerm('')}>مسح البحث</Button>
                    ) : (
                      <Button variant="secondary" size="sm" onClick={() => void loadSuppliers()}>إعادة التحميل</Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredSuppliers.map((sup) => (
              <TableRow key={sup.id}>
                <TableCell className="font-mono font-bold text-cyan-400">
                  {sup.code || `SUP-${sup.id}`}
                </TableCell>
                <TableCell className="font-bold text-slate-100">
                  <div>{sup.name}</div>
                  {sup.address && <div className="text-[11px] text-slate-400 font-normal">{sup.address}</div>}
                </TableCell>
                <TableCell className="font-bold text-slate-200">{sup.contact_name || 'غير محدد'}</TableCell>
                <TableCell>
                  <div className="font-mono text-cyan-400">{sup.email || '—'}</div>
                  <div className="text-[11px] text-slate-400 font-mono" dir="ltr">{sup.phone || '—'}</div>
                </TableCell>
                <TableCell>
                  {Number(sup.opening_balance || 0) > 0 ? (
                    <div className="font-mono font-bold text-amber-300">
                      {formatCleanNumber(sup.opening_balance)} ج.م
                      {sup.opening_balance_notes && (
                        <div className="text-[10px] text-slate-400 font-normal truncate max-w-[140px]" title={sup.opening_balance_notes}>
                          {sup.opening_balance_notes}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-slate-500 font-mono">0 ج.م</span>
                  )}
                </TableCell>
                <TableCell>
                  {sup.is_active ? (
                    <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800/60 rounded">
                      معتمد
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700 rounded">
                      غير مفعّل
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleOpenEdit(sup)}
                      className="px-2.5 py-1 text-[11px]"
                    >
                      تعديل
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleDelete(sup)}
                      className="px-2.5 py-1 text-[11px]"
                    >
                      حذف
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 md:hidden">
        {filteredSuppliers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/50 p-8 text-center text-xs text-slate-400 space-y-2">
            <p>{suppliers.length === 0 ? 'لا يوجد موردون مسجلون حتى الآن.' : 'لم نجد موردين مطابقين للفلاتر الحالية.'}</p>
            {searchTerm ? (
              <Button variant="secondary" size="sm" onClick={() => setSearchTerm('')} className="w-full min-h-10">مسح البحث</Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => void loadSuppliers()} className="w-full min-h-10">إعادة التحميل</Button>
            )}
          </div>
        ) : (
          filteredSuppliers.map((sup) => (
            <article key={`mobile-admin-sup-${sup.id}`} className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
              <div className="flex min-w-0 items-start justify-between gap-3 border-b border-slate-800 pb-3">
                <div className="min-w-0">
                  <h3 className="break-normal font-bold text-sm text-slate-100">{`المورد: ${sup.name}`}</h3>
                  <span className="font-mono text-xs text-cyan-400 font-semibold">{`كود: ${sup.code || `SUP-${sup.id}`}`}</span>
                  {sup.address && <p className="text-[11px] text-slate-400 mt-0.5">{sup.address}</p>}
                </div>
                <span className={`shrink-0 inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded ${
                  sup.is_active ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60' : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}>
                  {sup.is_active ? 'معتمد' : 'غير مفعّل'}
                </span>
              </div>
              <dl className="mt-3 grid min-w-0 grid-cols-1 gap-2 text-xs min-[420px]:grid-cols-2">
                <div>
                  <dt className="text-slate-500">مسؤول التواصل</dt>
                  <dd className="mt-1 font-bold text-slate-200">{sup.contact_name || 'غير محدد'}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">الهاتف</dt>
                  <dd className="mt-1 font-mono text-slate-300" dir="ltr">{sup.phone || '—'}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">الرصيد الافتتاحي</dt>
                  <dd className="mt-1 font-mono font-bold text-amber-300">
                    {formatCleanNumber(sup.opening_balance)} ج.م
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">البريد الإلكتروني</dt>
                  <dd className="mt-1 font-mono text-cyan-400 break-all">{sup.email || '—'}</dd>
                </div>
              </dl>
              <div className="mt-4 flex items-center gap-2 border-t border-slate-800 pt-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleOpenEdit(sup)}
                  className="flex-1 min-h-10 text-xs font-bold"
                >
                  تعديل
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => handleDelete(sup)}
                  className="flex-1 min-h-10 text-xs font-bold"
                >
                  حذف
                </Button>
              </div>
            </article>
          ))
        )}
      </div>

      {/* Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingSupplier ? 'تعديل بيانات المورد' : 'إضافة مورد جديد'}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setIsModalOpen(false)}>
              إلغاء
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSubmit}
              isLoading={submitting}
            >
              {editingSupplier ? 'تحديث البيانات' : 'إضافة المورد'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <FormField label="اسم الشركة / المورد" required>
            <Input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="مثال: شركة الفلك للتكنولوجيا"
            />
          </FormField>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormField label="مسؤول التواصل">
              <Input
                type="text"
                value={formData.contact_name}
                onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
              />
            </FormField>

            <FormField label="البريد الإلكتروني">
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </FormField>

            <FormField label="رقم الهاتف">
              <Input
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </FormField>
          </div>

          <FormField label="العنوان">
            <Textarea
              rows={2}
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            />
          </FormField>

          {/* Opening Balance / Previous Liability Section */}
          <div className="rounded-xl border border-amber-800/60 bg-amber-950/20 p-3.5 space-y-2.5">
            <div className="text-xs font-black text-amber-300 flex items-center gap-1.5">
              <span>💰</span>
              <span>الرصيد الافتتاحي للمديونية (مديونية سابقة مستحقة للمورد):</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-5">
              إذا كان للمورد مديونية سابقة قبل تفعيل النظام، سجل المبلغ هنا ليتم إدراجه تلقائياً كمديونية افتتاحية في كشف حسابه ومحاسبته.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <FormField label="الرصيد الافتتاحي المستحق للمورد (ج.م)">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.opening_balance ?? 0}
                  onChange={(e) => setFormData({ ...formData, opening_balance: e.target.value === '' ? '' : Number(e.target.value) })}
                  placeholder="0.00"
                />
              </FormField>

              <FormField label="ملاحظات / مرجع الرصيد الافتتاحي">
                <Input
                  type="text"
                  value={formData.opening_balance_notes || ''}
                  onChange={(e) => setFormData({ ...formData, opening_balance_notes: e.target.value })}
                  placeholder="مثال: رصيد مرحل من الدفاتر القديمة 2025"
                />
              </FormField>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="rounded bg-slate-950 border-slate-700 text-cyan-500 focus:ring-cyan-500"
            />
            <label htmlFor="is_active" className="text-xs text-slate-300 font-bold">
              مورد معتمد ونشط بالنظام
            </label>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!supplierToDelete}
        title="تأكيد حذف المورد"
        message={supplierToDelete ? `هل أنت متأكد من حذف المورد «${supplierToDelete.name}»؟ لن يظهر في اختيارات الموردين بعد الحذف.` : ''}
        confirmLabel="حذف المورد"
        isLoading={deletingSupplierId === supplierToDelete?.id}
        onClose={() => setSupplierToDelete(null)}
        onConfirm={() => {
          if (supplierToDelete) void executeDelete(supplierToDelete.id);
        }}
      />
    </div>
  );
};

export default SuppliersPage;
