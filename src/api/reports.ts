import { apiClient } from './client';

export interface PurchasesReportRow {
  id: string;
  invoice_id?: number | null;
  receipt_id?: number | null;
  purchase_order_id: number;
  date_basis?: string;
  primary_date?: string;
  primary_date_formatted?: string;
  po_date?: string;
  po_date_formatted?: string;
  pr_number?: string;
  pr_date?: string;
  pr_date_formatted?: string;
  delivery_date: string;
  delivery_date_formatted: string;
  po_number: string;
  po_number_short: string;
  item_name: string;
  uom: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  received_quantity?: number | null;
  receipt_status?: string | null;
  supplier_name: string;
  supplier_id: number;
  parcel_reference: string;
  region: string;
  department_id?: number | null;
  department_name: string;
  works: string;
  invoice_number?: string;
  matching_status?: string;
  accounting_status?: string;
  accounting_status_label?: string;
  order_status?: string;
  accountant_name?: string;
  photo_url?: string | null;
  receipt_number?: string | null;
  grand_total?: number;
  created_at?: string;
}

export interface PurchasesReportMetrics {
  total_amount: number;
  total_quantity: number;
  total_orders_count: number;
  total_items_count: number;
  suppliers_count: number;
  parcels_count: number;
  verified_items_count?: number;
}

export interface PurchasesReportDepartment {
  id: number;
  name: string;
  code: string;
}

export interface PurchasesReportResponse {
  filters: {
    filter_type: 'daily' | 'monthly' | 'custom';
    date_basis?: 'po_date' | 'delivery_date' | 'pr_date';
    date?: string;
    month?: string;
    from_date?: string;
    to_date?: string;
    department_id?: number | null;
    accounting_filter?: string;
    date_label?: string;
  };
  pagination?: {
    current_page: number;
    per_page: number;
    total: number;
    last_page: number;
    from: number;
    to: number;
  };
  metrics: PurchasesReportMetrics;
  departments: PurchasesReportDepartment[];
  rows: PurchasesReportRow[];
}

export interface PurchasesReportParams {
  filter_type?: 'daily' | 'monthly' | 'custom';
  date_basis?: 'po_date' | 'delivery_date' | 'pr_date';
  date?: string;
  month?: string;
  from_date?: string;
  to_date?: string;
  department_id?: number | string;
  accounting_filter?: 'ALL' | 'VERIFIED_ONLY' | 'PENDING';
  search?: string;
  page?: number;
  per_page?: number | string;
}

export const getPurchasesReportApi = async (
  params: PurchasesReportParams = {}
): Promise<PurchasesReportResponse> => {
  const queryParams = new URLSearchParams();

  if (params.filter_type) queryParams.set('filter_type', params.filter_type);
  if (params.date_basis) queryParams.set('date_basis', params.date_basis);
  if (params.date) queryParams.set('date', params.date);
  if (params.month) queryParams.set('month', params.month);
  if (params.from_date) queryParams.set('from_date', params.from_date);
  if (params.to_date) queryParams.set('to_date', params.to_date);
  if (params.department_id !== undefined && params.department_id !== '' && params.department_id !== 'ALL') {
    queryParams.set('department_id', String(params.department_id));
  }
  if (params.accounting_filter) queryParams.set('accounting_filter', params.accounting_filter);
  if (params.search) queryParams.set('search', params.search);
  if (params.page !== undefined) queryParams.set('page', String(params.page));
  if (params.per_page !== undefined) queryParams.set('per_page', String(params.per_page));

  const response = await apiClient.get<PurchasesReportResponse>(
    `/reports/purchases?${queryParams.toString()}`
  );
  return response.data;
};
