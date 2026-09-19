import apiClient from './client';
import { getToken } from '../utils/authStorage';

export interface ReceiptOrderItem {
  id: number;
  item_description: string;
  item_reference?: string | null;
  region?: string | null;
  quantity: string | number;
  uom?: string | null;
  unit_price?: string | number | null;
  specifications?: string | null;
  notes?: string | null;
  item?: { id: number; name: string; sku?: string; category?: { name: string } } | null;
  pr_item?: { id: number; specifications?: string | null; notes?: string | null; item_description?: string | null; item_reference?: string | null; region?: string | null } | null;
  is_supplementary?: boolean;
  supplement_batch?: number | null;
}

export interface ReceiptPurchaseOrder {
  id: number;
  po_number: string;
  created_at?: string | null;
  notes?: string | null;
  supplier?: { id: number; company_name: string; contact_person?: string | null; phone?: string | null } | null;
  purchase_request?: {
    id: number;
    request_number: string;
    created_at?: string | null;
    project_name?: string | null;
    parcel_reference?: string | null;
    region?: string | null;
    requester?: { id: number; name: string; email?: string } | null;
    department?: { id: number; name: string } | null;
    site_engineer?: { id: number; name: string } | null;
  } | null;
  items?: ReceiptOrderItem[];
}

export interface ReceiptRecord {
  id: number;
  receipt_number: string;
  receipt_type?: string | null;
  status: string;
  created_at?: string | null;
  received_at?: string | null;
  warehouse_submitted_at?: string | null;
  warehouse_notes?: string | null;
  photo_path?: string | null;
  photo_name?: string | null;
  photo_url?: string | null;
  site_engineer_notes?: string | null;
  warehouse_keeper?: { id: number; name: string } | null;
  site_engineer?: { id: number; name: string } | null;
  purchase_order?: ReceiptPurchaseOrder | null;
  purchase_request?: ReceiptPurchaseOrder['purchase_request'];
  items?: Array<{
    id: number;
    received_quantity: string | number;
    ordered_quantity: string | number;
    notes?: string | null;
    purchase_order_item?: ReceiptOrderItem | null;
  }>;
}

export const getReceiptPhotoUrl = (receipt: { id?: number; photo_url?: string | null }): string => {
  if (!receipt) return '';
  const token = getToken();
  const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';

  if (receipt.photo_url) {
    if (receipt.photo_url.startsWith('data:') || receipt.photo_url.startsWith('blob:')) {
      return receipt.photo_url;
    }
    if (receipt.photo_url.startsWith('http://') || receipt.photo_url.startsWith('https://')) {
      return receipt.photo_url;
    }
    if (receipt.photo_url.startsWith('/')) {
      const apiBase = import.meta.env.VITE_API_BASE_URL || '/api/v1';
      const rootHost = apiBase.replace(/\/api\/v1\/?$/, '');
      const base = rootHost ? `${rootHost}${receipt.photo_url}` : receipt.photo_url;
      return base.includes('?') ? `${base}&token=${encodeURIComponent(token || '')}` : `${base}${tokenParam}`;
    }
  }
  if (receipt.id) {
    const apiBase = import.meta.env.VITE_API_BASE_URL || '/api/v1';
    const cleanBase = apiBase.replace(/\/+$/, '');
    return `${cleanBase}/purchase-receipts/${receipt.id}/photo${tokenParam}`;
  }
  return receipt.photo_url || '';
};

export const getWarehouseReceiptQueueApi = async (): Promise<ReceiptPurchaseOrder[]> =>
  (await apiClient.get<{ data: ReceiptPurchaseOrder[] }>('/purchase-receipts/warehouse-queue')).data.data;

export const getAssignedReceiptsApi = async (): Promise<ReceiptRecord[]> =>
  (await apiClient.get<{ data: ReceiptRecord[] }>('/purchase-receipts/assigned')).data.data;

export const getPurchaseReceiptArchiveApi = async (): Promise<ReceiptRecord[]> =>
  (await apiClient.get<{ data: ReceiptRecord[] }>('/purchase-receipts/archive')).data.data;

export const getPurchaseReceiptByIdApi = async (receiptId: number): Promise<ReceiptRecord> =>
  (await apiClient.get<{ data: ReceiptRecord }>(`/purchase-receipts/${receiptId}`)).data.data;

export const createPurchaseReceiptApi = async (
  purchaseOrderId: number,
  payload: {
    received_at?: string;
    warehouse_notes?: string;
    photo_base64?: string;
    photo_name?: string;
    items: Array<{ purchase_order_item_id: number; received_quantity: number; notes?: string }>;
  },
): Promise<ReceiptRecord> =>
  (await apiClient.post<{ data: ReceiptRecord }>(`/purchase-receipts/purchase-orders/${purchaseOrderId}`, payload)).data.data;

export const updatePurchaseReceiptApi = async (
  receiptId: number,
  payload: { site_engineer_notes?: string; items: Array<{ id: number; received_quantity: number; notes?: string }> },
): Promise<ReceiptRecord> =>
  (await apiClient.put<{ data: ReceiptRecord }>(`/purchase-receipts/${receiptId}`, payload)).data.data;

export const approvePurchaseReceiptApi = async (
  receiptId: number,
  payload?: { site_engineer_notes?: string; items?: Array<{ id: number; received_quantity: number; notes?: string }> } | string,
): Promise<ReceiptRecord> => {
  const body = typeof payload === 'string' ? { site_engineer_notes: payload } : (payload || {});
  return (await apiClient.post<{ data: ReceiptRecord }>(`/purchase-receipts/${receiptId}/approve`, body)).data.data;
};

export const confirmOfficeReceiptApi = async (
  purchaseOrderId: number,
  payload?: { notes?: string; items?: Array<{ purchase_order_item_id: number; received_quantity: number; notes?: string }> },
): Promise<{ message: string; data: ReceiptRecord }> =>
  (await apiClient.post<{ message: string; data: ReceiptRecord }>(`/purchase-receipts/purchase-orders/${purchaseOrderId}/confirm-office`, payload || {})).data;
