import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import ErrorMessage from '../../components/ErrorMessage';
import { TableSkeleton } from '../../components/ui/StateFeedback';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import {
  AdminUser,
  getUsersAdminApi,
  createUserAdminApi,
  updateUserAdminApi,
  toggleUserActiveAdminApi,
  UserInput,
} from '../../api/admin/users';
import { getRolesAdminApi, AdminRole } from '../../api/admin/roles';
import { getDepartmentsAdminApi, AdminDepartment } from '../../api/admin/departments';
import { parseApiError } from '../../utils/apiError';
import { Button } from '../../components/ui/Button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table';
import TableFilterBar from '../../components/ui/TableFilterBar';
import TableColumnFilters from '../../components/ui/TableColumnFilters';
import { Modal } from '../../components/ui/Modal';
import { FormField, Input, Select, SearchableSelect } from '../../components/ui/FormField';

const ROLE_LABELS: Record<string, string> = {
  admin: 'مدير النظام',
  general_manager: 'المدير العام',
  execution_manager: 'مدير مشروعات التنفيذ',
  accountant: 'المدير المالي',
  site_accountant: 'الحسابات',
  procurement_manager: 'مدير المشتريات',
  reviewer: 'المراجع',
  employee: 'الموظف',
  site_engineer: 'مهندس الموقع',
  warehouse_keeper: 'أمين المخزن',
};

export const UsersPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [departments, setDepartments] = useState<AdminDepartment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [columnFilters, setColumnFilters] = useState({ name: '', email: '', roles: '', department: '', status: '', action: '' });
  const [userToToggle, setUserToToggle] = useState<AdminUser | null>(null);
  const [togglingUserId, setTogglingUserId] = useState<number | null>(null);

  // Password Reset State
  const [resetPasswordUser, setResetPasswordUser] = useState<AdminUser | null>(null);
  const [tempPassword, setTempPassword] = useState<string>('');
  const [resettingPassword, setResettingPassword] = useState<boolean>(false);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [formData, setFormData] = useState<UserInput>({
    name: '',
    email: '',
    password: '',
    role_ids: [],
    department_id: null,
    manager_id: null,
    is_active: true,
  });
  const [submitting, setSubmitting] = useState<boolean>(false);

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*';
    let pass = 'Ash@';
    for (let i = 0; i < 8; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pass;
  };

  const handleOpenResetPassword = (u: AdminUser) => {
    setResetPasswordUser(u);
    setTempPassword(generateRandomPassword());
    setCopySuccess(false);
    setResetSuccessMessage(null);
  };

  const handleConfirmPasswordReset = async () => {
    if (!resetPasswordUser || !tempPassword) return;
    setResettingPassword(true);
    try {
      await updateUserAdminApi(resetPasswordUser.id, {
        name: resetPasswordUser.name,
        email: resetPasswordUser.email,
        password: tempPassword,
      });
      setResetSuccessMessage(`تمت إعادة تعيين كلمة المرور للمستخدم ${resetPasswordUser.name} بنجاح!`);
      setTimeout(() => {
        setResetPasswordUser(null);
        setResetSuccessMessage(null);
      }, 3500);
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      setError(parsed.message);
    } finally {
      setResettingPassword(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [uData, rData, dData] = await Promise.all([
        getUsersAdminApi(),
        getRolesAdminApi().catch(() => []),
        getDepartmentsAdminApi().catch(() => []),
      ]);
      setUsers(uData || []);
      setRoles(rData || []);
      setDepartments(dData || []);
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      setError(parsed.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const managerOptions = useMemo(() => {
    return users
      .filter((u) => {
        if (editingUser && u.id === editingUser.id) return false;
        const userRoles = u.roles?.map((r) => (typeof r === 'object' ? r.slug : r)) || [];
        return userRoles.some((r) => ['general_manager', 'execution_manager'].includes(r));
      })
      .map((u) => {
        const userRoles = u.roles?.map((r) => (typeof r === 'object' ? r.slug : r)) || [];
        const isGm = userRoles.includes('general_manager');
        const isEm = userRoles.includes('execution_manager');
        const roleLabel = isGm ? 'المدير العام' : isEm ? 'مدير مشروعات التنفيذ' : 'مدير';
        return {
          value: u.id,
          label: `${u.name} — (${roleLabel})`,
        };
      });
  }, [users, editingUser]);

  const handleOpenAdd = () => {
    setEditingUser(null);
    setFormData({
      name: '',
      email: '',
      password: '',
      role_ids: [],
      department_id: null,
      manager_id: null,
      is_active: true,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (user: AdminUser) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      password: '',
      role_ids: user.roles ? user.roles.map((r) => (typeof r === 'object' ? r.id : (r as any))) : [],
      department_id: user.department?.id || null,
      manager_id: user.manager_id || null,
      is_active: user.is_active,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingUser) {
        await updateUserAdminApi(editingUser.id, formData);
      } else {
        await createUserAdminApi(formData);
      }
      setIsModalOpen(false);
      await loadData();
    } catch (err: unknown) {
      setError(parseApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  const executeToggleActive = async (id: number) => {
    setTogglingUserId(id);
    try {
      await toggleUserActiveAdminApi(id);
      setUserToToggle(null);
      await loadData();
    } catch (err: unknown) {
      setError(parseApiError(err).message);
    } finally {
      setTogglingUserId(null);
    }
  };

  const handleToggleActive = (user: AdminUser) => {
    if (user.is_active) {
      setUserToToggle(user);
      return;
    }
    void executeToggleActive(user.id);
  };

  if (!hasPermission('system.users.manage')) {
    return (
      <div className="p-6 text-center text-rose-400 bg-rose-950/40 border border-rose-800/80 rounded-xl" dir="rtl">
        عفواً، لا تملك الصلاحية اللازمة للوصول لإدارة المستخدمين.
      </div>
    );
  }

  if (loading) {
    return <TableSkeleton rows={7} columns={6} className="min-h-[280px]" />;
  }

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredUsers = users.filter((user) => {
    const roles = (user.roles || []).map((role) => typeof role === 'string' ? role : role.name || role.slug).join(' ');
    const assignedDepartments = (user.site_engineer_departments || []).map((department) => department.name).join('، ');
    const departmentLabel = [user.department?.name, assignedDepartments].filter(Boolean).join('، ');
    const contains = (value: unknown, filter: string) => !filter || String(value ?? '').toLocaleLowerCase('ar-EG').includes(filter.toLocaleLowerCase('ar-EG'));
    const matchesSearch = !normalizedSearch || [user.name, user.email, departmentLabel, roles].filter(Boolean).join(' ').toLowerCase().includes(normalizedSearch);
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? user.is_active : !user.is_active);
    return matchesSearch && matchesStatus && contains(user.name, columnFilters.name) && contains(user.email, columnFilters.email) && contains(roles, columnFilters.roles) && contains(departmentLabel, columnFilters.department) && contains(user.is_active ? 'نشط' : 'معطل', columnFilters.status) && contains('تعديل تفعيل تعطيل', columnFilters.action);
  });

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      {/* Header */}
      <div className="pb-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-100">إدارة المستخدمين</h1>
          <p className="mt-1 text-xs text-slate-400">إدارة الحسابات والأدوار الوظيفية والأقسام المخصصة</p>
        </div>

        <Button variant="primary" size="md" onClick={handleOpenAdd}>
          + إضافة مستخدم جديد
        </Button>
      </div>

      <ErrorMessage error={error} onDismiss={() => setError(null)} />

      <TableFilterBar
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="بحث بالاسم أو البريد أو الدور أو القسم..."
        selects={[{
          label: 'حالة المستخدم',
          value: statusFilter,
          onChange: setStatusFilter,
          options: [
            { value: 'all', label: 'كل الحالات' },
            { value: 'active', label: 'نشط' },
            { value: 'inactive', label: 'معطل' },
          ],
        }]}
        onClear={() => { setSearchTerm(''); setStatusFilter('all'); }}
        hasActiveFilters={Boolean(searchTerm || statusFilter !== 'all')}
        resultCount={filteredUsers.length}
        totalCount={users.length}
        resultLabel="مستخدم"
      />

      <TableColumnFilters filters={[{ key: 'name', label: 'الاسم', value: columnFilters.name, onChange: (value) => setColumnFilters(current => ({ ...current, name: value })) }, { key: 'email', label: 'البريد الإلكتروني', value: columnFilters.email, onChange: (value) => setColumnFilters(current => ({ ...current, email: value })) }, { key: 'roles', label: 'الأدوار', value: columnFilters.roles, onChange: (value) => setColumnFilters(current => ({ ...current, roles: value })) }, { key: 'department', label: 'القسم', value: columnFilters.department, onChange: (value) => setColumnFilters(current => ({ ...current, department: value })) }, { key: 'status', label: 'الحالة', value: columnFilters.status, onChange: (value) => setColumnFilters(current => ({ ...current, status: value })) }, { key: 'action', label: 'الإجراءات', value: columnFilters.action, onChange: (value) => setColumnFilters(current => ({ ...current, action: value })) }]} hasActiveFilters={Object.values(columnFilters).some(Boolean)} onClear={() => setColumnFilters({ name: '', email: '', roles: '', department: '', status: '', action: '' })} />

      {/* Table */}
      <div className="hidden min-w-0 md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>الاسم</TableHead>
              <TableHead>البريد الإلكتروني</TableHead>
              <TableHead>الأدوار</TableHead>
              <TableHead>القسم</TableHead>
              <TableHead>المدير المباشر</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead className="text-center">الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-bold text-slate-100">{u.name}</TableCell>
                <TableCell className="font-mono text-cyan-400">{u.email}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {u.roles?.map((r, idx) => {
                      const roleSlug = typeof r === 'string' ? r : (r as any).slug || (r as any).name;
                      const roleName = ROLE_LABELS[roleSlug] || 'مستخدم';
                      return (
                        <span
                          key={typeof r === 'object' && r ? (r as any).id || idx : idx}
                          className="px-2 py-0.5 text-[10px] font-semibold bg-cyan-950 text-cyan-300 border border-cyan-800/60 rounded"
                        >
                          {roleName}
                        </span>
                      );
                    })}
                  </div>
                </TableCell>
                <TableCell className="text-slate-300 font-bold">
                  <div>{u.department?.name || 'غير معين'}</div>
                  {u.site_engineer_departments && u.site_engineer_departments.length > 0 && (
                    <div className="mt-1 text-[10px] font-normal text-amber-300">
                      مهندس موقع لأقسام: {u.site_engineer_departments.map((department) => department.name).join('، ')}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-slate-300">
                  {u.manager ? (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-indigo-950/80 border border-indigo-800/60 text-indigo-300 text-xs font-bold">
                      👔 {u.manager.name}
                    </span>
                  ) : (
                    <span className="text-slate-500 text-xs">— (الإدارة العامة)</span>
                  )}
                </TableCell>
                <TableCell>
                  {u.is_active ? (
                    <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800/60 rounded">
                      نشط
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold bg-rose-950 text-rose-400 border border-rose-800/60 rounded">
                      معطل
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleOpenResetPassword(u)}
                      className="px-2 py-1 text-[11px] text-amber-300 hover:text-amber-200 border-amber-800/60 bg-amber-950/30"
                      title="إعادة تعيين كلمة المرور"
                    >
                      🔑 كلمة المرور
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleOpenEdit(u)}
                      className="px-2.5 py-1 text-[11px]"
                    >
                      تعديل
                    </Button>
                    <Button
                      variant={u.is_active ? 'warning' : 'success'}
                      size="sm"
                      onClick={() => handleToggleActive(u)}
                      className="px-2.5 py-1 text-[11px]"
                    >
                      {u.is_active ? 'تعطيل' : 'تفعيل'}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filteredUsers.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="p-8 text-center text-slate-400 text-xs">
                  {users.length === 0 ? 'لا يوجد مستخدمون مسجلون حتى الآن.' : 'لم نجد مستخدمين مطابقين للبحث الحالي.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 md:hidden">
        {filteredUsers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/50 p-8 text-center text-xs text-slate-400">
            {users.length === 0 ? 'لا يوجد مستخدمون مسجلون حتى الآن.' : 'لم نجد مستخدمين مطابقين للبحث الحالي.'}
          </div>
        ) : (
          filteredUsers.map((u) => (
            <article key={`mobile-user-${u.id}`} className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
              <div className="flex min-w-0 items-start justify-between gap-3 border-b border-slate-800 pb-3">
                <div className="min-w-0">
                  <h3 className="break-normal font-bold text-sm text-slate-100">{u.name}</h3>
                  <span className="font-mono text-xs text-cyan-400 break-all">{u.email}</span>
                </div>
                <span className={`shrink-0 inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded ${
                  u.is_active ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60' : 'bg-rose-950 text-rose-400 border border-rose-800/60'
                }`}>
                  {u.is_active ? 'نشط' : 'معطل'}
                </span>
              </div>
              <dl className="mt-3 space-y-2 text-xs">
                <div>
                  <dt className="text-slate-500">الأدوار</dt>
                  <dd className="mt-1 flex flex-wrap gap-1">
                    {u.roles?.map((r, idx) => {
                      const roleSlug = typeof r === 'string' ? r : (r as any).slug || (r as any).name;
                      const roleName = ROLE_LABELS[roleSlug] || 'مستخدم';
                      return (
                        <span
                          key={typeof r === 'object' && r ? (r as any).id || idx : idx}
                          className="px-2 py-0.5 text-[10px] font-semibold bg-cyan-950 text-cyan-300 border border-cyan-800/60 rounded"
                        >
                          {roleName}
                        </span>
                      );
                    })}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">القسم</dt>
                  <dd className="mt-1 text-slate-200 font-medium">
                    {u.department?.name || 'غير معين'}
                    {u.site_engineer_departments && u.site_engineer_departments.length > 0 && (
                      <div className="mt-1 text-[10px] text-amber-300">
                        مهندس موقع لأقسام: {u.site_engineer_departments.map((department) => department.name).join('، ')}
                      </div>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">المدير المباشر</dt>
                  <dd className="mt-1 text-slate-200 font-medium">
                    {u.manager ? `👔 ${u.manager.name}` : '— (الإدارة العامة)'}
                  </dd>
                </div>
              </dl>
              <div className="flex items-center gap-2 border-t border-slate-800 pt-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleOpenResetPassword(u)}
                  className="flex-1 min-h-10 text-xs font-bold text-amber-300 border-amber-800/60 bg-amber-950/20"
                >
                  🔑 كلمة المرور
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleOpenEdit(u)}
                  className="flex-1 min-h-10 text-xs font-bold"
                >
                  تعديل
                </Button>
                <Button
                  variant={u.is_active ? 'warning' : 'success'}
                  size="sm"
                  onClick={() => handleToggleActive(u)}
                  className="flex-1 min-h-10 text-xs font-bold"
                >
                  {u.is_active ? 'تعطيل' : 'تفعيل'}
                </Button>
              </div>
            </article>
          ))
        )}
      </div>

      {/* Password Reset Modal */}
      <Modal
        isOpen={Boolean(resetPasswordUser)}
        onClose={() => setResetPasswordUser(null)}
        title={`🔑 إعادة تعيين كلمة المرور: ${resetPasswordUser?.name || ''}`}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setResetPasswordUser(null)}>
              إلغاء
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleConfirmPasswordReset}
              isLoading={resettingPassword}
              disabled={!tempPassword || resettingPassword}
            >
              تأكيد وتعيين كلمة المرور
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-xs" dir="rtl">
          {resetSuccessMessage ? (
            <div className="rounded-xl border border-emerald-800 bg-emerald-950/40 p-4 text-emerald-200 font-bold text-center">
              🎉 {resetSuccessMessage}
            </div>
          ) : (
            <>
              <p className="text-slate-300 leading-relaxed">
                سيتم تعيين كلمة مرور جديدة ومؤقتة للمستخدم: <strong className="text-cyan-300">{resetPasswordUser?.name}</strong> ({resetPasswordUser?.email}).
              </p>

              <FormField label="كلمة المرور الجديدة المقترحة" required>
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    required
                    value={tempPassword}
                    onChange={(e) => setTempPassword(e.target.value)}
                    dir="ltr"
                    className="font-mono text-center text-sm font-bold text-amber-300"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(tempPassword);
                      setCopySuccess(true);
                      setTimeout(() => setCopySuccess(false), 2000);
                    }}
                    className="shrink-0 whitespace-nowrap text-xs font-bold"
                  >
                    {copySuccess ? '✓ تم النسخ' : '📋 نسخ'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setTempPassword(generateRandomPassword())}
                    className="shrink-0 whitespace-nowrap text-xs"
                    title="توليد كلمة مرور أخرى"
                  >
                    🔄
                  </Button>
                </div>
              </FormField>

              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-[11px] text-slate-400 space-y-1">
                <span className="font-bold text-slate-300 block">📌 نصيحة أمنية:</span>
                <p>انسخ كلمة المرور وزوّد بها الموظف لتسجيل الدخول، واطلب منه تغييرها عند أول تسجيل دخول.</p>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Main User Edit / Add Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingUser ? 'تعديل بيانات المستخدم' : 'إضافة مستخدم جديد'}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setIsModalOpen(false)}>
              إلغاء
            </Button>
            <Button variant="primary" size="sm" onClick={handleSubmit} isLoading={submitting}>
              حفظ البيانات
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <FormField label="الاسم الكامل" required>
            <Input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="مثال: أحمد محمد"
            />
          </FormField>

          <FormField label="البريد الإلكتروني" required>
            <Input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="name@ashbiliya.com"
            />
          </FormField>

          <FormField label={editingUser ? 'كلمة المرور (اختياري للتغيير)' : 'كلمة المرور'} required={!editingUser}>
            <Input
              type="password"
              required={!editingUser}
              value={formData.password || ''}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="••••••••"
            />
          </FormField>

          <FormField label="القسم الأساسي للحساب" helperText="بالنسبة لمهندس الموقع، هذا القسم الأساسي اختياري فقط. تعيينه كمهندس موقع لقسم أو أكثر يتم من شاشة «الأقسام».">
            <SearchableSelect
              options={departments.map((d) => ({
                value: d.id,
                label: d.name,
                subLabel: d.code || undefined,
              }))}
              value={formData.department_id || ''}
              onChange={(val) =>
                setFormData({
                  ...formData,
                  department_id: val ? Number(val) : null,
                })
              }
              clearable
              onClear={() => setFormData({ ...formData, department_id: null })}
              placeholder="-- بدون قسم (أو ابحث عن القسم) --"
              searchPlaceholder="ابحث باسم القسم أو الكود..."
              emptyMessage="لا يوجد قسم بهذا الاسم"
            />
          </FormField>

          <FormField
            label="المدير المباشر / المدير التنفيذي (الهيكل الإداري)"
            helperText="المدير المباشر المسؤول عن اعتماد طلبات الشراء لهذا المستخدم (مثلاً: م. كريم كمدير مشروعات التنفيذ، أو م. محمد عبدالكريم كمدير عام)."
          >
            <SearchableSelect
              options={managerOptions}
              value={formData.manager_id || ''}
              onChange={(val) =>
                setFormData({
                  ...formData,
                  manager_id: val ? Number(val) : null,
                })
              }
              clearable
              onClear={() => setFormData({ ...formData, manager_id: null })}
              placeholder="-- بدون مدير مباشر (يتبع الإدارة العامة تلقائيًا) --"
              searchPlaceholder="ابحث باسم المدير..."
              emptyMessage="لا يوجد مدير مطابق"
            />
          </FormField>

          <FormField label="الأدوار والصلاحيات">
            <div className="grid grid-cols-2 gap-2 p-3 bg-slate-950/60 border border-slate-800 rounded-lg">
              {roles.map((r) => {
                const isChecked = (formData.role_ids || []).includes(r.id);
                return (
                  <label key={r.id} className="flex items-center gap-2 cursor-pointer text-slate-300 text-xs">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        const currentIds = formData.role_ids || [];
                        if (e.target.checked) {
                          setFormData({ ...formData, role_ids: [...currentIds, r.id] });
                        } else {
                          setFormData({
                            ...formData,
                            role_ids: currentIds.filter((id) => id !== r.id),
                          });
                        }
                      }}
                      className="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-cyan-500"
                    />
                    <span>{r.name}</span>
                  </label>
                );
              })}
            </div>
          </FormField>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="user_is_active"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="rounded bg-slate-950 border-slate-700 text-cyan-500 focus:ring-cyan-500"
            />
            <label htmlFor="user_is_active" className="text-xs text-slate-300 font-bold">
              تفعيل الحساب والسماح بالدخول للنظام
            </label>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!userToToggle}
        title="تأكيد تعطيل المستخدم"
        message={userToToggle ? `هل أنت متأكد من تعطيل حساب «${userToToggle.name}»؟ لن يتمكن من تسجيل الدخول أثناء التعطيل.` : ''}
        confirmLabel="تعطيل الحساب"
        isLoading={togglingUserId === userToToggle?.id}
        onClose={() => setUserToToggle(null)}
        onConfirm={() => {
          if (userToToggle) void executeToggleActive(userToToggle.id);
        }}
      />
    </div>
  );
};

export default UsersPage;
