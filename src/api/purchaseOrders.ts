import apiClient, { cachedGetData, invalidateCachedGet } from './client';
import { PurchaseOrder, PurchaseOrderItemPayload, PurchaseOrderPayload, FinalizeActualPoPayload } from '../types/purchaseOrder';

const base = '/procurement/purchase-orders';

export interface PurchaseOrderQueryParams {
  page?: number;
  per_page?: number;
  search?: string;
  status?: string;
  supplier_id?: number;
  department_id?: number;
  date_from?: string;
  date_to?: string;
}

export interface PurchaseOrderPaginationMeta {
  current_page: number;
  from: number | null;
  last_page: number;
  per_page: number;
  to: number | null;
  total: number;
}

export interface PurchaseOrderPage {
  data: PurchaseOrder[];
  meta: PurchaseOrderPaginationMeta;
  links?: {
    first?: string | null;
    last?: string | null;
    prev?: string | null;
    next?: string | null;
  };
}

export const getPurchaseOrdersApi = async (params: PurchaseOrderQueryParams = {}): Promise<PurchaseOrderPage> => {
  const response = await apiClient.get<PurchaseOrderPage>(base, { params });
  return response.data;
};

export const getPurchaseOrderApi = async (id: number) =>
  (await apiClient.get<{ data: PurchaseOrder }>(`${base}/${id}`)).data.data;

export const createPurchaseOrderApi = async (p: PurchaseOrderPayload) => {
  const response = await apiClient.post<{ data: PurchaseOrder }>(base, p);
  invalidateCachedGet(base);
  return response.data.data;
};

export const createBatchPurchaseOrdersApi = async (p: PurchaseOrderPayload) => {
  const response = await apiClient.post<{ message: string; data: PurchaseOrder[] }>(`${base}/batch`, p);
  invalidateCachedGet(base);
  return response.data.data;
};

export const updatePurchaseOrderApi = async (id: number, p: PurchaseOrderPayload) => {
  const response = await apiClient.put<{ data: PurchaseOrder }>(`${base}/${id}`, p);
  invalidateCachedGet(base);
  return response.data.data;
};

export const addPurchaseOrderItemApi = async (id: number, p: PurchaseOrderItemPayload) => {
  const response = await apiClient.post<{ data: PurchaseOrder }>(`${base}/${id}/items`, p);
  invalidateCachedGet(base);
  return response.data.data;
};

export const updatePurchaseOrderItemApi = async (id: number, itemId: number, p: Partial<PurchaseOrderItemPayload>) => {
  const response = await apiClient.put<{ data: PurchaseOrder }>(`${base}/${id}/items/${itemId}`, p);
  invalidateCachedGet(base);
  return response.data.data;
};

export const removePurchaseOrderItemApi = async (id: number, itemId: number) => {
  const response = await apiClient.delete<{ data: PurchaseOrder }>(`${base}/${id}/items/${itemId}`);
  invalidateCachedGet(base);
  return response.data.data;
};

export const submitPurchaseOrderApi = async (id: number) => {
  const response = await apiClient.post<{ data: PurchaseOrder }>(`${base}/${id}/submit`);
  invalidateCachedGet(base);
  return response.data.data;
};

export interface CombinedPoPrDocument {
  purchase_order: PurchaseOrder;
  purchase_request: any;
  receipt?: any;
  receipts?: any[];
}

export const getCombinedPoPrDocumentApi = async (id: number): Promise<CombinedPoPrDocument> => {
  const response = await apiClient.get<{ data: CombinedPoPrDocument }>(`${base}/${id}/combined-document`);
  return response.data.data;
};

export const getPendingActualPosApi = async (params: { page?: number; per_page?: number; search?: string } = {}): Promise<PurchaseOrderPage> => {
  const response = await apiClient.get<PurchaseOrderPage>('/procurement/pending-actual-pos', { params });
  return response.data;
};

export const finalizeActualPurchaseOrderApi = async (id: number, payload: FinalizeActualPoPayload): Promise<PurchaseOrder> => {
  const response = await apiClient.post<{ message: string; data: PurchaseOrder }>(`${base}/${id}/finalize`, payload);
  invalidateCachedGet(base);
  invalidateCachedGet('/procurement/pending-actual-pos');
  return response.data.data;
};
