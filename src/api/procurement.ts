import apiClient, { cachedGetData, invalidateCachedGet } from './client';
import { PurchaseRequest } from '../types/purchaseRequest';
import { PurchaseOrder } from '../types/purchaseOrder';

export interface ProcurementAnalyticsFilterParams {
  period?: string;
  status?: string;
  date?: string;
  month?: string | number;
  year?: string | number;
  from_date?: string;
  to_date?: string;
}

export interface ProcurementAnalyticsResponse {
  filters: {
    period: string;
    status: string | null;
    date_label?: string;
    start_date?: string | null;
    end_date?: string | null;
  };
  metrics: {
    purchase_requests_count?: number;
    approved_requests_count: number;
    draft_request_count?: number;
    submitted_request_count?: number;
    under_review_request_count?: number;
    rejected_request_count?: number;
    pending_procurement_count: number;
    purchase_orders_count: number;
    draft_count: number;
    pending_accounting_count: number;
    returned_count: number;
    accounting_approved_count: number;
    completed_delivery_count?: number;
    late_delivery_count?: number;
    on_time_delivery_count?: number;
    on_time_delivery_rate?: string | number;
    average_po_cycle_days?: string | number;
    pending_delivery_count?: number;
    supplier_count: number;
    active_supplier_count: number;
    total_value: string;
    average_value: string;
  };
  status_breakdown: Array<{
    status: string;
    count: number;
    total_value: string;
  }>;
  request_status_breakdown?: Array<{
    status: string;
    count: number;
  }>;
  delivery_breakdown?: Array<{
    status: string;
    count: number;
    total_value: string;
  }>;
  supplier_breakdown: Array<{
    supplier_id: number | null;
    company_name: string | null;
    code: string | null;
    is_active: boolean;
    count: number;
    total_value: string;
  }>;
  department_breakdown: Array<{
    department_id: number | null;
    name: string | null;
    code: string | null;
    count: number;
    total_value: string;
  }>;
  recent_purchase_orders: Array<{
    id: number;
    po_number: string;
    status: string;
    grand_total: string;
    supplier_name: string | null;
    supplier_phone?: string | null;
    payment_terms?: string | null;
    request_number: string | null;
    department_name: string | null;
    created_at?: string;
    updated_at: string;
    items: Array<{
      id: number;
      item_description: string;
      item_reference?: string | null;
      region?: string | null;
      quantity?: string | number;
      uom?: string | null;
      unit_price?: string | number | null;
      line_total?: string | number | null;
      grand_total?: string | number | null;
    }>;
  }>;
  recent_purchase_requests: Array<{
    id: number;
    request_number: string;
    status: string;
    requester_name: string | null;
    department_name: string | null;
    updated_at: string;
  }>;
}

export interface DirectPoPayload {
  supplier_id?: number;
  one_time_supplier_name?: string;
  department_id: number;
  site_engineer_user_id: number;
  requires_warehouse_receipt?: boolean;
  delivery_date?: string;
  notes?: string;
  items: Array<{
    item_id?: number | null;
    supplier_id?: number;
    one_time_supplier_name?: string;
    item_description: string;
    item_reference?: string;
    region?: string;
    quantity: number;
    uom?: string;
    unit_price: number;
    specifications?: string;
  }>;
}

export interface ProcurementDepartmentOption {
  id: number;
  name: string;
  code?: string | null;
  manager?: { id: number; name: string } | null;
  site_engineer?: { id: number; name: string } | null;
  site_engineer_user_id?: number | null;
}

export const getProcurementDepartmentsApi = async (): Promise<ProcurementDepartmentOption[]> =>
  (await cachedGetData<{ data: ProcurementDepartmentOption[] }>('/procurement/departments')).data;

export interface ProcurementSiteEngineerOption {
  id: number;
  name: string;
  email?: string | null;
  department_id?: number | null;
  department_name?: string | null;
}

export const getProcurementSiteEngineersApi = async (): Promise<ProcurementSiteEngineerOption[]> =>
  (await cachedGetData<{ data: ProcurementSiteEngineerOption[] }>('/procurement/site-engineers')).data;

export interface ProcurementCatalogItemOption {
  id: number;
  sku: string;
  name: string;
  uom: string;
  is_active?: boolean;
  category?: { id: number; name: string; code?: string } | null;
}

export const getProcurementCatalogItemsApi = async (): Promise<ProcurementCatalogItemOption[]> =>
  (await cachedGetData<{ data: ProcurementCatalogItemOption[] }>('/catalog-items')).data;

/** PRs pending Procurement Manager approval (PENDING_PROCUREMENT_APPROVAL) */
export const getPendingProcurementApprovalApi = async (): Promise<PurchaseRequest[]> =>
  (await apiClient.get<{ data: PurchaseRequest[] }>('/procurement/purchase-requests')).data.data;

/** PRs ready for PO creation: quote path approved by procurement or direct path approved by accounting. */
export const getApprovedByProcurementPrsApi = async (): Promise<PurchaseRequest[]> =>
  (await apiClient.get<{ data: PurchaseRequest[] }>('/procurement/approved-purchase-requests')).data.data;

export const getPendingQuoteRequestsApi = async (): Promise<PurchaseRequest[]> =>
  (await apiClient.get<{ data: PurchaseRequest[] }>('/procurement/purchase-requests/quotes')).data.data;

/** For backward compatibility in pages still using the old name */
export const getApprovedPurchaseRequestsApi = getPendingProcurementApprovalApi;

export const getApprovedPurchaseRequestApi = async (id: number): Promise<PurchaseRequest> =>
  (await apiClient.get<{ data: PurchaseRequest }>(`/procurement/purchase-requests/${id}`)).data.data;

/** Procurement Manager chooses quotes or direct accounting review. */
export interface DirectAccountingFinancialData {
  supplier_id?: number;
  one_time_supplier_name?: string;
  items: Array<{
    pr_item_id: number;
    supplier_id?: number;
    one_time_supplier_name?: string;
    quantity: number;
    unit_price: number;
    uom?: string;
  }>;
  notes?: string | null;
}

export const approveProcurementPrApi = async (
  id: number,
  options: { use_quotes?: boolean; comment?: string; financial_data?: DirectAccountingFinancialData } = {},
): Promise<{ message: string; data: PurchaseRequest }> => {
  const response = await apiClient.post<{ message: string; data: PurchaseRequest }>(`/procurement/purchase-requests/${id}/approve`, {
    use_quotes: options.use_quotes ?? true,
    comment: options.comment,
    financial_data: options.financial_data,
  });
  return response.data;
};

/** Procurement Manager rejects a PR */
export const rejectProcurementPrApi = async (id: number, comment: string): Promise<PurchaseRequest> =>
  (await apiClient.post<{ data: PurchaseRequest }>(`/procurement/purchase-requests/${id}/reject`, { comment })).data.data;

export const getPurchaseRequestQuotesApi = async (id: number): Promise<PurchaseRequest> =>
  (await apiClient.get<{ data: PurchaseRequest }>(`/procurement/purchase-requests/${id}/quotes`)).data.data;

export const createPurchaseQuotesApi = async (
  id: number,
  quotes: Array<{ supplier_id?: number; one_time_supplier_name?: string; unit_price: number; total_amount: number; notes?: string; file?: File | null }>,
): Promise<PurchaseRequest> => {
  const hasFiles = quotes.some(q => q.file instanceof File);
  if (hasFiles) {
    const formData = new FormData();
    quotes.forEach((quote, index) => {
      if (quote.supplier_id) formData.append(`quotes[${index}][supplier_id]`, String(quote.supplier_id));
      if (quote.one_time_supplier_name) formData.append(`quotes[${index}][one_time_supplier_name]`, quote.one_time_supplier_name);
      formData.append(`quotes[${index}][unit_price]`, String(quote.unit_price));
      formData.append(`quotes[${index}][total_amount]`, String(quote.total_amount));
      if (quote.notes) formData.append(`quotes[${index}][notes]`, quote.notes);
      if (quote.file instanceof File) formData.append(`quotes[${index}][file]`, quote.file);
    });
    return (await apiClient.post<{ data: PurchaseRequest }>(`/procurement/purchase-requests/${id}/quotes`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })).data.data;
  }
  return (await apiClient.post<{ data: PurchaseRequest }>(`/procurement/purchase-requests/${id}/quotes`, { quotes })).data.data;
};

export const getProcurementAnalyticsApi = async (
  period: string = '90',
  status?: string,
  extraParams?: Partial<ProcurementAnalyticsFilterParams>
) => {
  const params: Record<string, string> = { period };
  if (status) params.status = status;
  if (extraParams) {
    Object.entries(extraParams).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        params[k] = String(v);
      }
    });
  }
  return (await apiClient.get<ProcurementAnalyticsResponse>('/procurement/analytics', { params })).data;
};

export const createDirectPoApi = async (payload: DirectPoPayload): Promise<PurchaseRequest> =>
  (await apiClient.post<{ data: PurchaseRequest }>('/procurement/direct-purchase-request', payload)).data.data;

export const updateDeliveryStatusApi = async (
  id: number,
  payload: {
    delivery_status: string;
    actual_delivery_date?: string;
    delivery_notes?: string;
  }
): Promise<PurchaseOrder> => {
  const response = await apiClient.put<{ data: PurchaseOrder }>(`/procurement/purchase-orders/${id}/delivery`, payload);
  invalidateCachedGet('/procurement/purchase-orders');
  return response.data.data;
};

