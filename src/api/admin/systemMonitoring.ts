import client from '../client';

export type MonitoringAlertSeverity = 'critical' | 'high' | 'medium' | 'info';
export type MonitoringAlertStatus = 'open' | 'resolved';

export interface MonitoringAlert {
  severity: MonitoringAlertSeverity;
  title: string;
  message: string;
  status: MonitoringAlertStatus;
}

export interface MonitoringSnapshot {
  checked_at: string;
  application: {
    status: string;
    environment: string;
    version: string;
    commit: string;
  };
  database: {
    status: 'connected' | 'disconnected';
    driver?: string;
    latency_ms?: number | null;
    error?: string;
  };
  migrations: {
    status: 'up_to_date' | 'pending' | 'unknown';
    applied_count?: number | null;
    pending_count?: number | null;
    pending: string[];
    error?: string;
  };
  realtime: {
    status: string;
    endpoint: string;
    last_system_event_at?: string | null;
    client_connections?: number | null;
    client_connections_note?: string;
  };
  deployment: {
    status: 'configured' | 'not_configured';
    version: string;
    commit: string;
    deployed_at?: string | null;
    source: string;
    message: string;
  };
  counts: {
    users: number;
    active_users: number;
    departments: number;
    categories: number;
    items: number;
    active_items: number;
    suppliers: number;
    active_suppliers: number;
    purchase_requests: number;
    purchase_orders: number;
    system_events: number;
    failed_jobs: number;
  };
  workflow: {
    purchase_requests_by_status: Record<string, number>;
    purchase_orders_by_status: Record<string, number>;
  };
  data_integrity: {
    purchase_request_items_missing_reference: number | null;
    purchase_order_items_missing_reference: number | null;
    missing_reference_fields: number | null;
  };
  alerts: MonitoringAlert[];
}

export interface DataQualitySection {
  key: string;
  title: string;
  count: number;
  records: Array<Record<string, unknown>>;
}

export interface DataQualityReport {
  checked_at: string;
  total_issues: number;
  sections: DataQualitySection[];
}

export interface AdminSecurityEvent {
  id: number;
  action: string;
  permission?: string | null;
  path?: string | null;
  method?: string | null;
  user?: { id: number; name: string } | null;
  ip_address?: string | null;
  created_at?: string | null;
}

export interface AdminAuditEvent {
  id: number;
  event_type: string;
  action: string;
  entity_type: string;
  entity_id: number;
  entity_label?: string | null;
  actor?: { id: number; name: string } | null;
  occurred_at?: string | null;
}

export const getAdminSystemMonitoringApi = async (): Promise<MonitoringSnapshot> => {
  const response = await client.get<{ data: MonitoringSnapshot }>('/admin/system/monitoring');
  return response.data.data;
};

export interface AdminSystemHealth {
  healthy: boolean;
  checked_at: string;
  checks: Record<string, unknown>;
}

export const getAdminSystemHealthApi = async (): Promise<AdminSystemHealth> => {
  const response = await client.get<{ data: AdminSystemHealth }>('/admin/system/health');
  return response.data.data;
};

export const getAdminSystemAlertsApi = async (): Promise<MonitoringAlert[]> => {
  const response = await client.get<{ data: MonitoringAlert[] }>('/admin/system/alerts');
  return response.data.data;
};

export const getAdminAuditLogApi = async (): Promise<AdminAuditEvent[]> => {
  const response = await client.get<{ data: AdminAuditEvent[] }>('/admin/system/audit-log');
  return response.data.data;
};

export const getAdminDataQualityApi = async (): Promise<DataQualityReport> => {
  const response = await client.get<{ data: DataQualityReport }>('/admin/system/data-quality');
  return response.data.data;
};

export const getAdminSecurityEventsApi = async (): Promise<AdminSecurityEvent[]> => {
  const response = await client.get<{ data: AdminSecurityEvent[] }>('/admin/system/security-events');
  return response.data.data;
};

export interface RunMigrationsResult {
  success: boolean;
  message: string;
  output?: string;
  snapshot?: MonitoringSnapshot;
}

export const runAdminMigrationsApi = async (): Promise<RunMigrationsResult> => {
  const response = await client.post<RunMigrationsResult>('/admin/system/run-migrations');
  return response.data;
};

