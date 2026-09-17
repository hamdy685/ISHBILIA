import apiClient, { cachedGetData } from './client';
import {
  CreatePurchaseRequestPayload,
  PurchaseRequest,
  DepartmentOption,
  ReviewerOption,
  SiteEngineerOptionsResponse,
  SiteEngineerReceiverOption,
  UpdatePurchaseRequestPayload,
} from '../types/purchaseRequest';

export const getPurchaseRequestReviewerOptionsApi = async (): Promise<ReviewerOption[]> => {
  const response = await cachedGetData<{ data: ReviewerOption[] }>('/purchase-requests/reviewer-options', undefined, 60000);
  return response.data;
};

export const getPurchaseRequestSiteEngineerOptionsApi = async (): Promise<SiteEngineerReceiverOption[]> => {
  const response = await cachedGetData<{ data: SiteEngineerReceiverOption[] }>('/purchase-requests/site-engineer-options', undefined, 60000);
  return response.data;
};

export const getSiteEngineerReceiverOptionsApi = async (): Promise<SiteEngineerOptionsResponse> => {
  return await cachedGetData<SiteEngineerOptionsResponse>('/purchase-requests/site-engineer-options', undefined, 60000);
};

export const getPurchaseRequestDepartmentOptionsApi = async (): Promise<DepartmentOption[]> => {
  const response = await cachedGetData<{ data: DepartmentOption[] }>('/purchase-requests/department-options', undefined, 60000);
  return response.data;
};

export const getOwnPurchaseRequestsApi = async (): Promise<PurchaseRequest[]> => {
  const response = await apiClient.get<{ data: PurchaseRequest[] }>('/purchase-requests', {
    params: { per_page: 100 },
  });
  return response.data.data;
};

export const getPurchaseRequestApi = async (id: number): Promise<PurchaseRequest> => {
  const response = await apiClient.get<{ data: PurchaseRequest }>(`/purchase-requests/${id}`);
  return response.data.data;
};

export const createPurchaseRequestApi = async (
  payload: CreatePurchaseRequestPayload
): Promise<PurchaseRequest> => {
  const response = await apiClient.post<{ data: PurchaseRequest }>('/purchase-requests', payload);
  return response.data.data;
};

export const updatePurchaseRequestApi = async (
  id: number,
  payload: UpdatePurchaseRequestPayload
): Promise<PurchaseRequest> => {
  const response = await apiClient.put<{ data: PurchaseRequest }>(`/purchase-requests/${id}`, payload);
  return response.data.data;
};

export const deletePurchaseRequestApi = async (id: number): Promise<void> => {
  await apiClient.delete(`/purchase-requests/${id}`);
};

export const submitPurchaseRequestApi = async (
  id: number,
  payload?: { site_engineer_user_id?: number | null }
): Promise<PurchaseRequest> => {
  const response = await apiClient.post<{ message: string; data: PurchaseRequest }>(
    `/purchase-requests/${id}/submit`,
    payload
  );
  return response.data.data;
};

