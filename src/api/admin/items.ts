import client from '../client';

export interface AdminItem {
  id: number;
  sku: string;
  name: string;
  uom: string;
  description?: string | null;
  is_active?: boolean;
  category?: {
    id: number;
    name: string;
    code?: string;
  } | null;
}

export interface ItemInput {
  name: string;
  sku: string;
  category_id?: number | null;
  uom: string;
  description?: string;
  is_active?: boolean;
}

export const getItemsAdminApi = async (): Promise<AdminItem[]> => {
  const res = await client.get<{ data: AdminItem[] }>('/admin/items');
  return res.data.data;
};

export const getCatalogItemsAdminApi = getItemsAdminApi;

export const createItemAdminApi = async (data: ItemInput): Promise<AdminItem> => {
  const res = await client.post<{ data: AdminItem }>('/admin/items', data);
  return res.data.data;
};

export const updateItemAdminApi = async (id: number, data: ItemInput): Promise<AdminItem> => {
  const res = await client.put<{ data: AdminItem }>(`/admin/items/${id}`, data);
  return res.data.data;
};

export const toggleItemActiveAdminApi = async (id: number): Promise<{ is_active: boolean }> => {
  const res = await client.delete<{ is_active: boolean }>(`/admin/items/${id}`);
  return res.data;
};
