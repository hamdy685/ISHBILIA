import apiClient from './client';
import { CatalogItem } from '../types/purchaseRequest';

export const getCatalogItemsApi = async (): Promise<CatalogItem[]> => {
  const response = await apiClient.get<{ data: CatalogItem[] }>('/catalog-items');
  return response.data.data;
};

export const getItemSuggestionsApi = async (query: string): Promise<string[]> => {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const response = await apiClient.get<string[] | { data: string[] }>('/items/suggestions', {
    params: { query: trimmed },
  });
  if (Array.isArray(response.data)) {
    return response.data;
  }
  return response.data?.data || [];
};

