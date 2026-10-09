import apiClient from './client';
import { PurchaseRequest } from '../types/purchaseRequest';

export interface UpdateReviewHeaderPayload {
  title?: string;
  date_needed?: string;
  notes?: string;
  parcel_reference?: string | null;
  region?: string | null;
  land_parcel_id?: number | null;
  requires_warehouse_receipt?: boolean;
}

export interface ReviewItemPayload {
  item_id?: number | null;
  item_description: string;
  item_reference?: string | null;
  region?: string | null;
  quantity: number | string;
  uom?: string;
  specifications?: string;
  notes?: string;
}

export interface ReviewerRequestFilters {
  request_number?: string;
  requester_name?: string;
  status?: string;
  item_reference?: string;
  region?: string;
  from_date?: string;
  to_date?: string;
}

export const getReviewableRequestsApi = async (filters: ReviewerRequestFilters = {}): Promise<PurchaseRequest[]> => {
  const response = await apiClient.get<{ data: PurchaseRequest[] }>('/reviewer/purchase-requests', {
    params: Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined && value !== '')),
  });
  return response.data.data;
};

export const getReviewerPurchaseRequestApi = async (id: number): Promise<PurchaseRequest> => {
  const response = await apiClient.get<{ data: PurchaseRequest }>(`/reviewer/purchase-requests/${id}`);
  return response.data.data;
};

export const startReviewApi = async (id: number): Promise<PurchaseRequest> => {
  const response = await apiClient.post<{ data: PurchaseRequest }>(`/reviewer/purchase-requests/${id}/review`);
  return response.data.data;
};

export const updateReviewHeaderApi = async (
  id: number,
  payload: UpdateReviewHeaderPayload
): Promise<PurchaseRequest> => {
  const response = await apiClient.put<{ data: PurchaseRequest }>(`/reviewer/purchase-requests/${id}`, payload);
  return response.data.data;
};

export const updateReviewItemApi = async (
  id: number,
  itemId: number,
  payload: Partial<ReviewItemPayload>
): Promise<PurchaseRequest> => {
  const response = await apiClient.put<{ data: PurchaseRequest }>(
    `/reviewer/purchase-requests/${id}/items/${itemId}`,
    payload
  );
  return response.data.data;
};

export const addReviewItemApi = async (
  id: number,
  payload: ReviewItemPayload
): Promise<PurchaseRequest> => {
  const response = await apiClient.post<{ data: PurchaseRequest }>(
    `/reviewer/purchase-requests/${id}/items`,
    payload
  );
  return response.data.data;
};

export const deleteReviewItemApi = async (id: number, itemId: number): Promise<PurchaseRequest> => {
  const response = await apiClient.delete<{ data: PurchaseRequest }>(
    `/reviewer/purchase-requests/${id}/items/${itemId}`
  );
  return response.data.data;
};

export const approvePurchaseRequestApi = async (
  id: number,
  comment?: string,
  siteEngineerUserId?: number | null,
  requiresWarehouseReceipt?: boolean | null,
  isComplementary?: boolean | null
): Promise<PurchaseRequest> => {
  const response = await apiClient.post<{ message: string; data: PurchaseRequest }>(
    `/reviewer/purchase-requests/${id}/approve`,
    {
      comment,
      site_engineer_user_id: siteEngineerUserId,
      requires_warehouse_receipt: requiresWarehouseReceipt,
      is_complementary: isComplementary,
    }
  );
  return response.data.data;
};

export const rejectPurchaseRequestApi = async (
  id: number,
  comment: string
): Promise<PurchaseRequest> => {
  const response = await apiClient.post<{ message: string; data: PurchaseRequest }>(
    `/reviewer/purchase-requests/${id}/reject`,
    { comment }
  );
  return response.data.data;
};

