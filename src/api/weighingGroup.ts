import apiClient from './client';
import { WeighingGroup, EligibleSteelItem } from '../types/weighingGroup';

export interface EligibleSteelItemsResponse {
  purchase_order_id: number;
  po_number: string;
  supplier_id: number;
  items: EligibleSteelItem[];
  count: number;
}

export interface CreateWeighingGroupPayload {
  purchase_order_id: number;
  item_ids: number[];
  notes?: string;
}

export interface ReceiveWeighingGroupPayload {
  received_total_weight: number;
  scale_ticket_photo?: string;
  item_distributions?: Record<number, number>;
  notes?: string;
}

/**
 * Fetch steel items eligible for weighing group in a purchase order.
 */
export const getEligibleSteelItemsApi = async (poId: number): Promise<EligibleSteelItemsResponse> => {
  const response = await apiClient.get<EligibleSteelItemsResponse>(`/weighing-groups/eligible/${poId}`);
  return response.data;
};

/**
 * Create a new steel weighing group.
 */
export const createWeighingGroupApi = async (payload: CreateWeighingGroupPayload): Promise<WeighingGroup> => {
  const response = await apiClient.post<{ message: string; data: WeighingGroup }>('/weighing-groups', payload);
  return response.data.data;
};

/**
 * Fetch weighing groups for a specific purchase order.
 */
export const getWeighingGroupsByPoApi = async (poId: number): Promise<WeighingGroup[]> => {
  const response = await apiClient.get<{ data: WeighingGroup[] }>(`/weighing-groups/po/${poId}`);
  return response.data.data;
};

/**
 * Fetch a single weighing group by ID.
 */
export const getWeighingGroupByIdApi = async (id: number): Promise<WeighingGroup> => {
  const response = await apiClient.get<{ data: WeighingGroup }>(`/weighing-groups/${id}`);
  return response.data.data;
};

/**
 * Record receiving for a steel weighing group (from scale ticket).
 */
export const receiveWeighingGroupApi = async (id: number, payload: ReceiveWeighingGroupPayload): Promise<any> => {
  const response = await apiClient.post<{ message: string; data: any }>(`/weighing-groups/${id}/receive`, payload);
  return response.data.data;
};

/**
 * Cancel an unreceived weighing group.
 */
export const cancelWeighingGroupApi = async (id: number, reason?: string): Promise<WeighingGroup> => {
  const response = await apiClient.post<{ message: string; data: WeighingGroup }>(`/weighing-groups/${id}/cancel`, { reason });
  return response.data.data;
};
