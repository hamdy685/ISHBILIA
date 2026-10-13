import client from '../client';

// ─── Types ───────────────────────────────────────────────

export interface TrackerPrSummary {
  id: number;
  request_number: string;
  request_type: string | null;
  procurement_route: string | null;
  status: string;
  stage: string;
  priority: string | null;
  total_estimated_cost: string | null;
  is_archived: boolean;
  days_in_stage: number;
  current_responsible: {
    id: number;
    name: string;
    role: string;
  } | null;
  requester: { id: number; name: string } | null;
  department: { id: number; name: string; code?: string | null } | null;
  assigned_reviewer: { id: number; name: string } | null;
  land_parcel: { id: number; name: string } | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface TrackerPaginationMeta {
  current_page: number;
  last_page: number;
  per_page: number;
  from: number | null;
  to: number | null;
  total: number;
}

export interface TrackerIndexResponse {
  data: TrackerPrSummary[];
  meta: TrackerPaginationMeta;
}

export interface TrackerStats {
  total: number;
  active: number;
  completed: number;
  rejected: number;
  drafts: number;
  stalled: number;
  by_status: Record<string, number>;
}

export interface TrackerPrDetail extends Omit<TrackerPrSummary, 'assigned_reviewer'> {
  parcel_reference: string | null;
  region: string | null;
  date_needed: string | null;
  notes: string | null;
  rejection_reason: string | null;
  return_reason: string | null;
  requester: { id: number; name: string; email?: string } | null;
  target_department: { id: number; name: string } | null;
  assigned_reviewer: { id: number; name: string } | null;
  site_engineer: { id: number; name: string } | null;
  direct_supplier: { id: number; name: string } | null;
  items: Array<{
    id: number;
    item_description: string;
    quantity: string;
    uom: string | null;
    estimated_price: string | null;
    specifications: string | null;
  }>;
  purchase_orders: Array<{
    id: number;
    po_number: string;
    status: string;
    grand_total: string;
    supplier: string | null;
    created_at: string | null;
    has_receipts: boolean;
  }>;
  approval_history: Array<{
    action: string;
    from_state: string | null;
    to_state: string | null;
    comments: string | null;
    actor: { id: number; name: string } | null;
    created_at: string | null;
  }>;
  system_events: Array<{
    id: number;
    event_type: string;
    action: string;
    from_state: string | null;
    to_state: string | null;
    description: string | null;
    actor: { id: number; name: string } | null;
    occurred_at: string | null;
  }>;
  admin_actions: {
    can_cancel: boolean;
    can_archive: boolean;
    can_restore: boolean;
    can_reopen?: boolean;
    has_linked_po: boolean;
    has_issued_po: boolean;
    has_linked_receipts: boolean;
    cancel_warning: string | null;
  };
  submitted_at: string | null;
  deleted_at: string | null;
}

export interface TrackerFilters {
  status?: string;
  stage?: string;
  department_id?: number | string;
  request_type?: string;
  priority?: string;
  search?: string;
  stalled_days?: number | string;
  include_archived?: boolean;
  sort?: string;
  dir?: 'asc' | 'desc';
  page?: number;
  per_page?: number;
}

// ─── API Calls ───────────────────────────────────────────

export const getTrackerListApi = async (filters: TrackerFilters = {}): Promise<TrackerIndexResponse> => {
  const params: Record<string, unknown> = {};
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '' && value !== null) {
      params[key] = value;
    }
  });
  const response = await client.get<TrackerIndexResponse>('/admin/request-tracker', { params });
  return response.data;
};

export const getTrackerStatsApi = async (): Promise<TrackerStats> => {
  const response = await client.get<{ data: TrackerStats }>('/admin/request-tracker/stats');
  return response.data.data;
};

export const getTrackerDetailApi = async (id: number): Promise<TrackerPrDetail> => {
  const response = await client.get<{ data: TrackerPrDetail }>(`/admin/request-tracker/${id}`);
  return response.data.data;
};

export const cancelRequestApi = async (id: number, reason: string): Promise<void> => {
  await client.post(`/admin/request-tracker/${id}/cancel`, { reason });
};

export const archiveRequestApi = async (id: number, reason?: string): Promise<void> => {
  await client.post(`/admin/request-tracker/${id}/archive`, { reason });
};

export const restoreRequestApi = async (id: number): Promise<void> => {
  await client.post(`/admin/request-tracker/${id}/restore`);
};

export const reopenRequestApi = async (id: number, targetStatus: string = 'PENDING_PROCUREMENT_APPROVAL', reason?: string): Promise<void> => {
  await client.post(`/admin/request-tracker/${id}/reopen`, { target_status: targetStatus, reason });
};

export const addAdminNoteApi = async (id: number, note: string): Promise<void> => {
  await client.post(`/admin/request-tracker/${id}/note`, { note });
};
