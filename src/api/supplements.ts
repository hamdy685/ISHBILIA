import apiClient from './client';
import { PurchaseRequest } from '../types/purchaseRequest';
import {
  CreateSupplementPayload,
  ProcessSupplementPayload,
  PurchaseRequestSupplement,
} from '../types/supplement';

export interface PaginatedResponse<T> {
  data: T[];
  current_page: number;
  last_page: number;
  total: number;
  per_page: number;
}

export interface PrSupplementsResponse {
  data: PurchaseRequestSupplement[];
  can_accept_supplement: boolean;
}

/**
 * Fetch all purchase requests that are eligible for a supplement (issued/approved but not yet received).
 */
export const getEligibleRequestsForSupplementApi = async (
  page = 1,
  perPage = 15
): Promise<PaginatedResponse<PurchaseRequest>> => {
  const response = await apiClient.get<PaginatedResponse<PurchaseRequest>>(
    '/purchase-requests/eligible-for-supplement',
    { params: { page, per_page: perPage } }
  );
  return response.data;
};

/**
 * List all supplements belonging to a specific purchase request.
 */
export const getSupplementsForPrApi = async (prId: number): Promise<PrSupplementsResponse> => {
  const response = await apiClient.get<PrSupplementsResponse>(
    `/purchase-requests/${prId}/supplements`
  );
  return response.data;
};

/**
 * Create supplementary items on a purchase request.
 */
export const createSupplementApi = async (
  prId: number,
  payload: CreateSupplementPayload
): Promise<{ message: string; data: PurchaseRequestSupplement }> => {
  const response = await apiClient.post<{ message: string; data: PurchaseRequestSupplement }>(
    `/purchase-requests/${prId}/supplements`,
    payload
  );
  return response.data;
};

/**
 * Reviewer approves the supplement.
 */
export const approveSupplementReviewerApi = async (
  supplementId: number,
  notes?: string
): Promise<{ message: string; data: PurchaseRequestSupplement }> => {
  const response = await apiClient.post<{ message: string; data: PurchaseRequestSupplement }>(
    `/purchase-requests/supplements/${supplementId}/approve`,
    { notes }
  );
  return response.data;
};

/**
 * Procurement processes the supplement (selects supplier - same or different, inputs unit prices).
 */
export const processSupplementProcurementApi = async (
  supplementId: number,
  payload: ProcessSupplementPayload
): Promise<{ message: string; data: PurchaseRequestSupplement }> => {
  const response = await apiClient.post<{ message: string; data: PurchaseRequestSupplement }>(
    `/purchase-requests/supplements/${supplementId}/process-procurement`,
    payload
  );
  return response.data;
};
