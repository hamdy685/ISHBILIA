import apiClient from './client';
import { MaterialTransferPayload, MaterialTransferRequest } from '../types/materialTransfer';

export interface MaterialTransferListResponse {
  data: MaterialTransferRequest[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}

export interface MaterialTransferSingleResponse {
  data: MaterialTransferRequest;
  message?: string;
}

// 1. My transfer requests (Requester)
export const getMyMaterialTransfersApi = async (params?: Record<string, any>): Promise<MaterialTransferListResponse> => {
  const response = await apiClient.get<MaterialTransferListResponse>('/material-transfers', { params });
  return response.data;
};

// 2. Single transfer request details
export const getMaterialTransferDetailsApi = async (id: number): Promise<MaterialTransferRequest> => {
  const response = await apiClient.get<MaterialTransferSingleResponse>(`/material-transfers/${id}`);
  return response.data.data;
};

// 3. Create transfer request (draft or submit)
export const createMaterialTransferApi = async (payload: MaterialTransferPayload): Promise<MaterialTransferRequest> => {
  const response = await apiClient.post<MaterialTransferSingleResponse>('/material-transfers', payload);
  return response.data.data;
};

// 4. Update transfer request (draft or returned)
export const updateMaterialTransferApi = async (id: number, payload: Partial<MaterialTransferPayload>): Promise<MaterialTransferRequest> => {
  const response = await apiClient.put<MaterialTransferSingleResponse>(`/material-transfers/${id}`, payload);
  return response.data.data;
};

// 5. Submit draft or returned request
export const submitMaterialTransferApi = async (id: number): Promise<MaterialTransferRequest> => {
  const response = await apiClient.post<MaterialTransferSingleResponse>(`/material-transfers/${id}/submit`);
  return response.data.data;
};

// 6. Delete draft request
export const deleteMaterialTransferApi = async (id: number): Promise<{ message: string }> => {
  const response = await apiClient.delete<{ message: string }>(`/material-transfers/${id}`);
  return response.data;
};

// 7. Reviewer pending list
export const getReviewerPendingMaterialTransfersApi = async (params?: Record<string, any>): Promise<MaterialTransferListResponse> => {
  const response = await apiClient.get<MaterialTransferListResponse>('/material-transfers/reviewer/pending', { params });
  return response.data;
};

// 8. Reviewer approve (moves to accounting)
export const approveReviewerMaterialTransferApi = async (id: number, notes?: string): Promise<MaterialTransferRequest> => {
  const response = await apiClient.post<MaterialTransferSingleResponse>(`/material-transfers/${id}/approve`, { notes });
  return response.data.data;
};

// 9. Reviewer reject
export const rejectReviewerMaterialTransferApi = async (id: number, rejection_reason: string): Promise<MaterialTransferRequest> => {
  const response = await apiClient.post<MaterialTransferSingleResponse>(`/material-transfers/${id}/reject`, { rejection_reason });
  return response.data.data;
};

// 10. Reviewer return for modification
export const returnReviewerMaterialTransferApi = async (id: number, return_reason: string): Promise<MaterialTransferRequest> => {
  const response = await apiClient.post<MaterialTransferSingleResponse>(`/material-transfers/${id}/return`, { return_reason });
  return response.data.data;
};

// 11. Accounting pending list
export const getAccountingPendingMaterialTransfersApi = async (params?: Record<string, any>): Promise<MaterialTransferListResponse> => {
  const response = await apiClient.get<MaterialTransferListResponse>('/material-transfers/accounting/pending', { params });
  return response.data;
};

// 12. Accounting process and archive
export const processAndArchiveMaterialTransferApi = async (id: number, accounting_notes?: string): Promise<MaterialTransferRequest> => {
  const response = await apiClient.post<MaterialTransferSingleResponse>(`/material-transfers/${id}/process-archive`, { accounting_notes });
  return response.data.data;
};

// 13. Transfer archive (أرشيف المنقولات)
export const getMaterialTransferArchiveApi = async (params?: Record<string, any>): Promise<MaterialTransferListResponse> => {
  const response = await apiClient.get<MaterialTransferListResponse>('/material-transfers/archive', { params });
  return response.data;
};
