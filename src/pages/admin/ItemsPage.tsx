import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import ErrorMessage from '../../components/ErrorMessage';
import { TableSkeleton } from '../../components/ui/StateFeedback';
import {
  AdminItem,
  getCatalogItemsAdminApi,
  createItemAdminApi,
  updateItemAdminApi,
  toggleItemActiveAdminApi,
  ItemInput,
} from '../../api/admin/items';
import { parseApiError } from '../../utils/apiError';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table';
import TableFilterBar from '../../components/ui/TableFilterBar';
import { Modal } from '../../components/ui/Modal';
import { FormField, Input, Select, Textarea } from '../../components/ui/FormField';
import { DEFAULT_PR_UNIT_CODES, getUnitLabel, getUnitOptions, getUnitValue } from '../../utils/units';

const UNIT_OPTIONS = getUnitOptions(DEFAULT_PR_UNIT_CODES);

export const ItemsPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const [items, setItems] = useState<AdminItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<AdminItem | null>(null);
  const [formData, setFormData] = useState<ItemInput>({
    name: '',
    sku: '',
    uom: 'UNIT',
    description: '',
    is_active: true,
  });
  const [submitting, setSubmitting] = useState<boolean>(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const iData = await getCatalogItemsAdminApi();
      setItems(iData || []);
    } catch (err: unknown) {
      setError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenAdd = () => {
    setEditingItem(null);
    setFormData({
      name: '',
      sku: `SKU-${Date.now().toString().slice(-4)}`,
      uom: 'UNIT',
      description: '',
      is_active: true,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: AdminItem) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      sku: item.sku,
      uom: getUnitValue(item.uom),
      description: item.description || '',
      is_active: item.is_active,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingItem) {
        await updateItemAdminApi(editingItem.id, formData);
      } else {
        await createItemAdminApi(formData);
      }
      setIsModalOpen(false);
      await loadData();
    } catch (err: unknown) {
      setError(parseApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (id: number) => {
    try {
      await toggleItemActiveAdminApi(id);
      await loadData();
    } catch (err: unknown) {
      setError(parseApiError(err).message);
    }
  };

  if (!hasPermission('system.items.manage') && !hasPermission('purchase_request.create')) {
    return (
      <div className="p-6 text-center text-rose-400 bg-rose-950/40 border border-rose-800/80 rounded-xl" dir="rtl">
        عفواً، لا تملك الصلاحية اللازمة للوصول لكتالوج الأصناف.
      </div>
    );
  }

  if (loading) {
    return <TableSkeleton rows={8} columns={5} className="min-h-[320px]" />;
  }

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredItems = items.filter((item) => {
    const matchesSearch = !normalizedSearch || [item.name, item.sku, item.description].filter(Boolean).join(' ').toLowerCase().includes(normalizedSearch);
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? item.is_active : !item.is_active);
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      {/* Header */}
      <div className="pb-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-100 flex items-center gap-2">
            <span>📦</span> الأصناف والكتالوج
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            أصناف ومواد المشتريات المعتمدة ووحدات القياس وحالتها
          </p>
        </div>

        <Button variant="primary" size="md" onClick={handleOpenAdd}>
          + إضافة صنف جديد
        </Button>
      </div>

      <ErrorMessage error={error} onDismiss={() => setError(null)} />

      <TableFilterBar
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="بحث باسم الصنف أو الكود أو الوصف..."
        selects={[
          {
            label: 'الحالة',
            value: statusFilter,
            onChange: setStatusFilter,
            options: [
              { value: 'all', label: 'كل الحالات' },
              { value: 'active', label: 'نشط' },
              { value: 'inactive', label: 'معطل' },
            ],
          },
        ]}
        onClear={() => { setSearchTerm(''); setStatusFilter('all'); }}
        hasActiveFilters={Boolean(searchTerm || statusFilter !== 'all')}
        resultCount={filteredItems.length}
        totalCount={items.length}
        resultLabel="صنف"
      />

      {/* Table */}
      <div className="hidden min-w-0 md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>اسم الصنف</TableHead>
              <TableHead>الوحدة</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead className="text-center">الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="p-8 text-center text-slate-400 text-xs">
                  {items.length === 0 ? 'لا توجد أصناف مسجلة حتى الآن. ستضاف الأصناف تلقائياً عند إنشاء طلبات الشراء.' : 'لم نجد أصنافًا مطابقة للفلاتر الحالية.'}
                </TableCell>
              </TableRow>
            ) : filteredItems.map((item) => (
                <TableRow key={item.id}>
                <TableCell className="font-bold text-slate-100">
                  <div>{item.name}</div>
                  {item.description && <div className="text-[11px] text-slate-400 font-normal">{item.description}</div>}
                </TableCell>
                <TableCell className="text-slate-400">{getUnitLabel(item.uom)}</TableCell>
                <TableCell>
                  {item.is_active ? (
                    <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800/60 rounded">
                      نشط
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700 rounded">
                      معطل
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleOpenEdit(item)}
                      className="px-2.5 py-1 text-[11px]"
                    >
                      تعديل
                    </Button>
                    <Button
                      variant={item.is_active ? 'warning' : 'success'}
                      size="sm"
                      onClick={() => handleToggleActive(item.id)}
                      className="px-2.5 py-1 text-[11px]"
                    >
                      {item.is_active ? 'تعطيل' : 'تفعيل'}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 md:hidden">
        {filteredItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/50 p-8 text-center text-xs text-slate-400">
            {items.length === 0 ? 'لا توجد أصناف مسجلة حتى الآن.' : 'لم نجد أصنافًا مطابقة للفلاتر الحالية.'}
          </div>
        ) : (
          filteredItems.map((item) => (
            <article key={`mobile-item-${item.id}`} className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
              <div className="flex min-w-0 items-start justify-between gap-3 border-b border-slate-800 pb-3">
                <div className="min-w-0">
                  <h3 className="break-normal font-bold text-sm text-slate-100">{`الصنف: ${item.name}`}</h3>
                  {item.description && <p className="text-[11px] text-slate-400 mt-0.5">{item.description}</p>}
                </div>
                <span className={`shrink-0 inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded ${
                  item.is_active ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60' : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}>
                  {item.is_active ? 'نشط' : 'معطل'}
                </span>
              </div>
              <dl className="mt-3 grid min-w-0 grid-cols-1 gap-2 text-xs min-[420px]:grid-cols-2">
                <div>
                  <dt className="text-slate-500">التصنيف</dt>
                  <dd className="mt-1 font-bold text-slate-200">{item.category?.name || 'غير مصنف'}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">الوحدة</dt>
                  <dd className="mt-1 text-slate-300">{getUnitLabel(item.uom)}</dd>
                </div>
              </dl>
              <div className="mt-4 flex items-center gap-2 border-t border-slate-800 pt-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleOpenEdit(item)}
                  className="flex-1 min-h-10 text-xs font-bold"
                >
                  تعديل
                </Button>
                <Button
                  variant={item.is_active ? 'warning' : 'success'}
                  size="sm"
                  onClick={() => handleToggleActive(item.id)}
                  className="flex-1 min-h-10 text-xs font-bold"
                >
                  {item.is_active ? 'تعطيل' : 'تفعيل'}
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
        title={editingItem ? 'تعديل صنف الكتالوج' : 'إضافة صنف جديد'}
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
              {editingItem ? 'تحديث البيانات' : 'إضافة الصنف'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <FormField label="اسم الصنف" required>
            <Input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="مثال: شاشة للعرض 27 بوصة"
            />
          </FormField>

          <FormField label="الوحدة" required>
            <Select
              value={getUnitValue(formData.uom)}
              onChange={(e) => setFormData({ ...formData, uom: e.target.value })}
            >
              {UNIT_OPTIONS.map((unit) => (
                <option key={unit.value} value={unit.value}>{unit.label}</option>
              ))}
            </Select>
          </FormField>

          <FormField label="وصف الصنف والمواصفات الافتراضية">
            <Textarea
              rows={2}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </FormField>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="item_is_active"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="rounded bg-slate-950 border-slate-700 text-cyan-500 focus:ring-cyan-500"
            />
            <label htmlFor="item_is_active" className="text-xs text-slate-300 font-bold">
              صنف نشط ومتاح في طلبات الشراء
            </label>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default ItemsPage;
