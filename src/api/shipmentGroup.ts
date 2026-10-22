import apiClient from './client';
import { ShipmentGroup, EligibleShipmentItem } from '../types/shipmentGroup';

export interface EligibleShipmentItemsResponse {
  purchase_order_id: number;
  po_number: string;
  supplier_id: number;
  items: EligibleShipmentItem[];
  count: number;
}

export interface CreateShipmentGroupPayload {
  purchase_order_id: number;
  item_ids: number[];
  group_name?: string;
  vehicle_plate_number?: string;
  notes?: string;
}

/**
 * Fetch items eligible for shared shipment group in a purchase order.
 */
export const getEligibleShipmentItemsApi = async (poId: number): Promise<EligibleShipmentItemsResponse> => {
  const response = await apiClient.get<EligibleShipmentItemsResponse>(`/shipment-groups/eligible/${poId}`);
  return response.data;
};

/**
 * Create a new shared shipment group.
 */
export const createShipmentGroupApi = async (payload: CreateShipmentGroupPayload): Promise<ShipmentGroup> => {
  const response = await apiClient.post<{ message: string; data: ShipmentGroup }>('/shipment-groups', payload);
  return response.data.data;
};

/**
 * Fetch shared shipment groups for a specific purchase order.
 */
export const getShipmentGroupsByPoApi = async (poId: number): Promise<ShipmentGroup[]> => {
  const response = await apiClient.get<{ data: ShipmentGroup[] }>(`/shipment-groups/po/${poId}`);
  return response.data.data;
};

/**
 * Fetch a single shipment group by ID.
 */
export const getShipmentGroupByIdApi = async (id: number): Promise<ShipmentGroup> => {
  const response = await apiClient.get<{ data: ShipmentGroup }>(`/shipment-groups/${id}`);
  return response.data.data;
};

/**
 * Safely un-group a shared shipment group.
 */
export const ungroupShipmentGroupApi = async (id: number, reason?: string): Promise<ShipmentGroup> => {
  const response = await apiClient.post<{ message: string; data: ShipmentGroup }>(`/shipment-groups/${id}/ungroup`, { reason });
  return response.data.data;
};
