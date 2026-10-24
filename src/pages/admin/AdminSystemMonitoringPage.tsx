import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import { Card, KpiCard } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { parseApiError } from '../../utils/apiError';
import {
  AdminAuditEvent,
  AdminSecurityEvent,
  DataQualityReport,
  getAdminAuditLogApi,
  getAdminDataQualityApi,
  getAdminSecurityEventsApi,
  getAdminSystemMonitoringApi,
  runAdminMigrationsApi,
  MonitoringAlert,
  MonitoringSnapshot,
} from '../../api/admin/systemMonitoring';

const statusLabel: Record<string, string> = {
  DRAFT: 'مسودة',
  SUBMITTED: 'مرسل للمراجعة',
  UNDER_REVIEW: 'قيد المراجعة',
  PENDING_PROCUREMENT_APPROVAL: 'بانتظار المشتريات',
  APPROVED_BY_PROCUREMENT: 'معتمد من المشتريات',
  REJECTED: 'مرفوض',
  ISSUED: 'صادر',
  PENDING_ACCOUNTING_REVIEW: 'بانتظار الحسابات',
  APPROVED_BY_ACCOUNTING: 'معتمد حسابيًا',
  PO_DRAFT: 'مسودة أمر',
};

const alertClasses: Record<string, string> = {
  critical: 'border-red-500/40 bg-red-950/30 text-red-200',
  high: 'border-orange-500/40 bg-orange-950/30 text-orange-200',
  medium: 'border-amber-500/40 bg-amber-950/30 text-amber-200',
  info: 'border-cyan-500/30 bg-cyan-950/20 text-cyan-200',
};

const alertLabel: Record<string, string> = {
  critical: 'حرج',
  high: 'مرتفع',
  medium: 'متوسط',
  info: 'معلوماتي',
};

const formatDate = (value?: string | null): string => {
  if (!value) return 'غير متاح';
  return new Date(value).toLocaleString('ar-EG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

const formatStatus = (value: string): string => statusLabel[value] ?? value;

const StatusPill: React.FC<{ ok: boolean; label: string }> = ({ ok, label }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold ${
      ok
        ? 'border-emerald-500/30 bg-emerald-950/40 text-emerald-300'
        : 'border-red-500/30 bg-red-950/40 text-red-300'
    }`}
  >
    <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
    {label}
  </span>
);

const StatusList: React.FC<{ title: string; values: Record<string, number> }> = ({ title, values }) => {
  const rows = Object.entries(values);
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <h3 className="text-sm font-bold text-slate-100">{title}</h3>
        <span className="text-[11px] text-slate-500">إجمالي الحالات</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-500">لا توجد بيانات حتى الآن.</p>
      ) : (
        <div className="space-y-2">
          {rows.map(([status, count]) => (
            <div key={status} className="flex items-center justify-between rounded-lg bg-slate-900/60 px-3 py-2">
              <span className="text-xs text-slate-300">{formatStatus(status)}</span>
              <span className="text-sm font-black text-cyan-300">{count}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

export const AdminSystemMonitoringPage: React.FC = () => {
  const [snapshot, setSnapshot] = useState<MonitoringSnapshot | null>(null);
  const [auditEvents, setAuditEvents] = useState<AdminAuditEvent[]>([]);
  const [dataQuality, setDataQuality] = useState<DataQualityReport | null>(null);
  const [securityEvents, setSecurityEvents] = useState<AdminSecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [runningMigrations, setRunningMigrations] = useState(false);
  const [migrationMsg, setMigrationMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRunMigrations = async () => {
    setRunningMigrations(true);
    setMigrationMsg(null);
    try {
      const res = await runAdminMigrationsApi();
      setMigrationMsg(res.message || 'تم تطبيق الترحيلات بنجاح.');
      await loadMonitoring(true);
    } catch (err: unknown) {
      setMigrationMsg(parseApiError(err).message);
    } finally {
      setRunningMigrations(false);
    }
  };

  const loadMonitoring = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const data = await getAdminSystemMonitoringApi();
      setSnapshot(data);
      try {
        setAuditEvents(await getAdminAuditLogApi());
      } catch {
        // The health dashboard remains available if the optional audit feed is unavailable.
        setAuditEvents([]);
      }
      try {
        setDataQuality(await getAdminDataQualityApi());
      } catch {
        // تقرير الجودة اختياري ولا يمنع عرض حالة النظام إذا لم يتوفر endpoint بعد.
        setDataQuality(null);
      }
      try {
        setSecurityEvents(await getAdminSecurityEventsApi());
      } catch {
        setSecurityEvents([]);
      }
    } catch (err: unknown) {
      setError(parseApiError(err).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadMonitoring();
    const interval = window.setInterval(() => loadMonitoring(true), 30_000);
    return () => window.clearInterval(interval);
  }, [loadMonitoring]);

  const openAlerts = useMemo(
    () => snapshot?.alerts.filter((alert) => alert.status === 'open') ?? [],
    [snapshot],
  );

  if (loading && !snapshot) {
    return <LoadingSpinner fullScreen message="جاري فحص صحة النظام والـDeploy..." />;
  }

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <div className="flex flex-col gap-4 border-b border-slate-800 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
            <Link to="/admin" className="transition-colors hover:text-cyan-300">لوحة مدير النظام</Link>
            <span>←</span>
            <span>مراقبة النظام</span>
          </div>
          <h1 className="text-xl font-black text-slate-100">مركز مراقبة النظام والـDeploy</h1>
          <p className="mt-1 text-xs text-slate-400">
            فحص تلقائي كل 30 ثانية لصحة التطبيق، قاعدة البيانات، الإشعارات، الـMigrations وسجل التشغيل.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => loadMonitoring(true)} disabled={refreshing}>
          {refreshing ? 'جاري الفحص...' : 'إعادة الفحص الآن'}
        </Button>
      </div>

      {error && <ErrorMessage error={error} />}

      {snapshot?.migrations?.pending_count && snapshot.migrations.pending_count > 0 ? (
        <div className="rounded-2xl border-2 border-amber-500/50 bg-gradient-to-r from-amber-950/40 via-slate-900 to-amber-950/20 p-4 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xl font-black animate-pulse">
              ⚠️
            </span>
            <div>
              <h3 className="text-sm font-black text-amber-200">
                يوجد {snapshot.migrations.pending_count} ترحيل قاعدة بيانات معلق
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                تحديثات الجداول وقاعدة البيانات جاهزة للتطبيق.
              </p>
            </div>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={handleRunMigrations}
            disabled={runningMigrations}
            className="bg-amber-600 hover:bg-amber-500 text-slate-950 font-black shadow-lg shadow-amber-900/40 shrink-0 flex items-center gap-2"
          >
            <span>⚡</span>
            <span>{runningMigrations ? 'جاري تطبيق الترحيلات...' : 'تطبيق الترحيلات الآن بضغطة واحدة'}</span>
          </Button>
        </div>
      ) : null}

      {migrationMsg && (
        <div className="rounded-xl border border-cyan-500/50 bg-cyan-950/40 p-3 text-xs text-cyan-200 flex items-center justify-between">
          <span>{migrationMsg}</span>
          <button onClick={() => setMigrationMsg(null)} className="text-slate-400 hover:text-white text-sm font-bold">✕</button>
        </div>
      )}

      {snapshot && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              title="حالة التطبيق"
              value={snapshot.application.status === 'ok' ? 'سليم' : 'تحذير'}
              accentColor="emerald"
              icon={<span className="text-sm">◉</span>}
            />
            <KpiCard
              title="قاعدة البيانات"
              value={snapshot.database.status === 'connected' ? `${snapshot.database.latency_ms ?? '—'} ms` : 'غير متصلة'}
              accentColor={snapshot.database.status === 'connected' ? 'cyan' : 'rose'}
              icon={<span className="text-sm">◈</span>}
            />
            <KpiCard
              title="Migrations معلقة"
              value={snapshot.migrations.pending_count ?? '—'}
              accentColor={snapshot.migrations.pending_count === 0 ? 'emerald' : 'rose'}
              icon={<span className="text-sm">⇄</span>}
            />
            <KpiCard
              title="التنبيهات المفتوحة"
              value={openAlerts.length}
              accentColor={openAlerts.some((alert) => alert.severity === 'critical') ? 'rose' : 'amber'}
              icon={<span className="text-sm">!</span>}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-100">الحالة التشغيلية</h2>
                  <p className="mt-1 text-[11px] text-slate-500">آخر فحص: {formatDate(snapshot.checked_at)}</p>
                </div>
                <StatusPill ok={snapshot.database.status === 'connected'} label={snapshot.database.status === 'connected' ? 'النظام يعمل' : 'يوجد عطل'} />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300">قاعدة البيانات</span>
                    <StatusPill ok={snapshot.database.status === 'connected'} label={snapshot.database.status === 'connected' ? 'متصلة' : 'منقطعة'} />
                  </div>
                  <p className="text-[11px] text-slate-500">المحرك: {snapshot.database.driver ?? 'غير متاح'}</p>
                  <p className="mt-1 text-[11px] text-slate-500">زمن الاستجابة: {snapshot.database.latency_ms ?? '—'} ms</p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300">الإشعارات Realtime</span>
                    <StatusPill ok={snapshot.realtime.status === 'configured'} label="SSE مفعّل" />
                  </div>
                  <p className="text-[11px] text-slate-500">آخر حدث: {formatDate(snapshot.realtime.last_system_event_at)}</p>
                  <p className="mt-1 text-[11px] text-slate-500">المسار: {snapshot.realtime.endpoint}</p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300">حالة الـDeploy</span>
                    <StatusPill ok={snapshot.deployment.status === 'configured'} label={snapshot.deployment.status === 'configured' ? 'بيانات متاحة' : 'غير مربوط'} />
                  </div>
                  <p className="text-[11px] text-slate-500">الإصدار: {snapshot.deployment.version}</p>
                  <p className="mt-1 text-[11px] text-slate-500">Commit: {snapshot.deployment.commit}</p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300">سلامة البيانات</span>
                    <StatusPill ok={snapshot.data_integrity.missing_reference_fields === 0} label={snapshot.data_integrity.missing_reference_fields === 0 ? 'سليمة' : 'تحتاج مراجعة'} />
                  </div>
                  <p className="text-[11px] text-slate-500">بنود ناقصة رقم قطعة الأرض/المنطقة: {snapshot.data_integrity.missing_reference_fields ?? 'غير متاح'}</p>
                </div>
              </div>
            </Card>

            <Card className="space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <h2 className="text-sm font-bold text-slate-100">معلومات الإصدار</h2>
                <p className="mt-1 text-[11px] text-slate-500">بيانات البيئة الحالية</p>
              </div>
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between gap-3"><span className="text-slate-500">البيئة</span><b className="text-slate-200">{snapshot.application.environment}</b></div>
                <div className="flex items-center justify-between gap-3"><span className="text-slate-500">الإصدار</span><b className="text-slate-200">{snapshot.application.version}</b></div>
                <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Commit</span><b className="max-w-[160px] truncate text-slate-200">{snapshot.application.commit}</b></div>
                <div className="flex items-center justify-between gap-3"><span className="text-slate-500">مصدر البيانات</span><b className="text-slate-200">{snapshot.deployment.source}</b></div>
              </div>
              <p className="rounded-lg border border-cyan-500/20 bg-cyan-950/20 p-3 text-[11px] leading-6 text-cyan-200">{snapshot.deployment.message}</p>
            </Card>
          </div>

          {dataQuality && (
            <Card className="space-y-4">
              <div className="flex flex-col gap-2 border-b border-slate-800 pb-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-100">تقرير جودة البيانات</h2>
                  <p className="mt-1 text-[11px] text-slate-500">فحص قراءة فقط للسجلات الناقصة. لا يتم تعديل أي بيانات تلقائيًا.</p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-[11px] font-bold ${dataQuality.total_issues === 0 ? 'border-emerald-700/60 bg-emerald-950/30 text-emerald-300' : 'border-amber-700/60 bg-amber-950/30 text-amber-300'}`}>
                  {dataQuality.total_issues === 0 ? 'لا توجد ملاحظات' : `${dataQuality.total_issues} ملاحظة تحتاج مراجعة`}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {dataQuality.sections.map((section) => (
                  <div key={section.key} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-xs font-bold text-slate-200">{section.title}</h3>
                      <span className="text-sm font-black text-cyan-300">{section.count}</span>
                    </div>
                    {section.count > 0 && (
                      <div className="mt-3 space-y-2">
                        {section.records.slice(0, 3).map((record, index) => (
                          <div key={`${section.key}-${index}`} className="rounded border border-slate-800/80 bg-slate-900/60 p-2 text-[10px] text-slate-400">
                            {Object.entries(record).slice(0, 4).map(([key, value]) => (
                              <span key={key} className="ml-3 inline-block"><b className="text-slate-300">{key}:</b> {Array.isArray(value) ? value.join('، ') : String(value ?? 'غير محدد')}</span>
                            ))}
                          </div>
                        ))}
                        {section.count > 3 && <p className="text-[10px] text-slate-500">يتم عرض أول 3 سجلات فقط. إجمالي القسم: {section.count}.</p>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <StatusList title="حالة طلبات الشراء" values={snapshot.workflow.purchase_requests_by_status} />
            <StatusList title="حالة أوامر الشراء" values={snapshot.workflow.purchase_orders_by_status} />
          </div>

          <Card className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-100">التنبيهات</h2>
                <p className="mt-1 text-[11px] text-slate-500">التنبيهات الناتجة من آخر فحص فعلي</p>
              </div>
              <span className="text-xs font-bold text-slate-400">{openAlerts.length} مفتوح</span>
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {snapshot.alerts.map((alert: MonitoringAlert, index) => (
                <div key={`${alert.title}-${index}`} className={`rounded-lg border p-3 ${alertClasses[alert.severity] ?? alertClasses.info}`}>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-xs font-bold">{alert.title}</h3>
                    <span className="text-[10px] font-bold">{alertLabel[alert.severity] ?? alert.severity}</span>
                  </div>
                  <p className="mt-2 text-[11px] leading-5 opacity-90">{alert.message}</p>
                </div>
              ))}
            </div>
          </Card>

          {securityEvents.length > 0 && (
            <Card className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-100">محاولات الوصول غير المصرح بها</h2>
                  <p className="mt-1 text-[11px] text-slate-500">سجل أمني للطلبات التي رفضتها صلاحيات Backend.</p>
                </div>
                <span className="rounded-full border border-rose-800/60 bg-rose-950/30 px-3 py-1 text-[11px] font-bold text-rose-300">{securityEvents.length} محاولة</span>
              </div>
              <div className="space-y-2">
                {securityEvents.slice(0, 10).map((event) => (
                  <div key={event.id} className="flex flex-col gap-1 rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-[11px] sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-200">{event.user?.name || 'مستخدم غير معروف'} — {event.permission || 'صلاحية غير محددة'}</p>
                      <p className="mt-1 truncate text-slate-500">{event.method || '—'} {event.path || '—'} {event.ip_address ? `— ${event.ip_address}` : ''}</p>
                    </div>
                    <span className="whitespace-nowrap text-slate-500">{formatDate(event.created_at)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-100">ملخص سجلات النظام</h2>
                <p className="mt-1 text-[11px] text-slate-500">الأرقام التشغيلية الحالية من قاعدة البيانات</p>
              </div>
              <Link to="/admin" className="text-xs font-bold text-cyan-300 hover:text-cyan-200">العودة للإدارة</Link>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ['المستخدمون', snapshot.counts.users],
                ['الأقسام', snapshot.counts.departments],
                ['الأصناف', snapshot.counts.items],
                ['الموردون', snapshot.counts.suppliers],
                ['طلبات الشراء', snapshot.counts.purchase_requests],
                ['أوامر الشراء', snapshot.counts.purchase_orders],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-lg bg-slate-900/60 p-3 text-center">
                  <p className="text-[11px] text-slate-500">{label}</p>
                  <p className="mt-1 text-lg font-black text-slate-100">{value}</p>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-500">عدد Failed Jobs: {snapshot.counts.failed_jobs} — إجمالي System Events: {snapshot.counts.system_events}</p>
          </Card>

          {auditEvents.length > 0 && (
            <Card className="space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <h2 className="text-sm font-bold text-slate-100">آخر أحداث النظام</h2>
                <p className="mt-1 text-[11px] text-slate-500">يتم تحميلها من سجل System Events عند ربط endpoint السجل.</p>
              </div>
              {auditEvents.slice(0, 10).map((event) => (
                <div key={event.id} className="flex items-start justify-between gap-4 border-b border-slate-800/70 pb-3 last:border-0">
                  <div>
                    <p className="text-xs font-bold text-slate-200">{event.action || event.event_type}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{event.actor?.name ?? 'النظام'} — {event.entity_label ?? `${event.entity_type} #${event.entity_id}`}</p>
                  </div>
                  <span className="whitespace-nowrap text-[10px] text-slate-500">{formatDate(event.occurred_at)}</span>
                </div>
              ))}
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default AdminSystemMonitoringPage;
