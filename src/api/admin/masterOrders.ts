import apiClient from '../client';

export interface MasterOrderItem {
  id: number;
  item_description: string;
  item_reference?: string | null;
  region?: string | null;
  quantity: number;
  uom: string;
  unit_price: number;
  line_total: number;
  received_quantity?: number | null;
  specifications?: string | null;
}

export interface MasterOrderRow {
  unique_key: string;
  order_id: number | null;
  request_id: number | null;
  po_number: string;
  manual_po_number?: string | null;
  pr_number: string;
  department: {
    id?: number | null;
    name: string;
    code: string;
  };
  requester: {
    id?: number | null;
    name: string;
  };
  supplier: {
    id?: number | null;
    name: string;
    code: string;
  };
  project_site: {
    parcel_reference: string;
    region: string;
  };
  po_status: string | null;
  pr_status: string;
  cycle_stage: string;
  cycle_stage_label: string;
  cycle_stage_color: string;
  cycle_stage_desc: string;
  responsible_party: string;
  is_actual_po: boolean;
  finalized_at?: string | null;
  grand_total: number;
  subtotal: number;
  items_count: number;
  items: MasterOrderItem[];
  receipt?: {
    id: number;
    receipt_number: string;
    status: string;
    received_at?: string | null;
    photo_url?: string | null;
  } | null;
  invoice?: {
    id: number;
    invoice_number: string;
    status: string;
    matching_status?: string | null;
    amount: number;
  } | null;
  delivery_date?: string | null;
  actual_delivery_date?: string | null;
  notes?: string | null;
  financial_notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface MasterOrdersStats {
  total_count: number;
  invoiced_count: number;
  actual_po_count: number;
  pending_actual_po_count: number;
  grn_pending_count: number;
  po_issued_count: number;
  pending_po_count: number;
  under_review_count: number;
  rejected_count: number;
  total_financial_value: number;
}

export interface MasterOrdersResponse {
  success: boolean;
  data: MasterOrderRow[];
  meta: {
    current_page: number;
    per_page: number;
    total: number;
    last_page: number;
    from: number;
    to: number;
  };
  stats: MasterOrdersStats;
  lookups: {
    departments: Array<{ id: number; name: string; code: string }>;
    suppliers: Array<{ id: number; company_name: string; name: string; code: string }>;
  };
}

export interface ForceUpdateItemPayload {
  id?: number | null;
  item_description: string;
  item_reference?: string | null;
  region?: string | null;
  quantity: number;
  uom: string;
  unit_price: number;
  specifications?: string | null;
  delete?: boolean;
}

export interface ForceUpdateOrderPayload {
  status?: string;
  supplier_id?: number | null;
  delivery_date?: string | null;
  actual_delivery_date?: string | null;
  delivery_notes?: string | null;
  notes?: string | null;
  financial_notes?: string | null;
  rejection_reason?: string | null;
  is_actual_po?: boolean;
  finalized_at?: string | null;
  admin_reason: string;
  sync_receipt?: boolean;
  sync_pr?: boolean;
  items?: ForceUpdateItemPayload[];
}

export interface OrderMasterDetailsResponse {
  success: boolean;
  data: {
    order: any;
    request?: any;
    cycle_stage: {
      stage: string;
      label: string;
      color: string;
      description: string;
      responsible: string;
    };
    audit_logs: any[];
    available_suppliers: Array<{ id: number; company_name: string; name: string; code: string }>;
    allowed_statuses: Array<{ value: string; label: string }>;
  };
}

export const getMasterOrdersApi = async (params: {
  search?: string;
  stage?: string;
  department_id?: number | string;
  supplier_id?: number | string;
  date_from?: string;
  date_to?: string;
  page?: number;
  per_page?: number | string;
}): Promise<MasterOrdersResponse> => {
  const response = await apiClient.get<MasterOrdersResponse>('/admin/all-orders-master', { params });
  return response.data;
};

export const getOrderMasterDetailsApi = async (id: number): Promise<OrderMasterDetailsResponse> => {
  const response = await apiClient.get<OrderMasterDetailsResponse>(`/admin/orders/${id}/details`);
  return response.data;
};

export const forceUpdateOrderApi = async (
  id: number,
  payload: ForceUpdateOrderPayload
): Promise<{ success: boolean; message: string; data: any }> => {
  const response = await apiClient.put<{ success: boolean; message: string; data: any }>(
    `/admin/orders/${id}/force-update`,
    payload
  );
  return response.data;
};
