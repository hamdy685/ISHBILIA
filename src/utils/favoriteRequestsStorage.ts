import { PurchaseRequestPriority, PurchaseRequestType } from '../types/purchaseRequest';

export interface FavoriteRequestItem {
  item_description: string;
  uom?: string;
  unit?: string;
  quantity: number;
  specifications?: string;
  notes?: string;
}

export interface FavoriteRequest {
  id: string;
  userId?: number | string;
  title: string;
  createdAt: string;
  target_department_id?: number;
  request_type?: PurchaseRequestType;
  priority?: PurchaseRequestPriority;
  notes?: string;
  items: FavoriteRequestItem[];
}

const STORAGE_PREFIX = 'purchasing_favorites_';

export const getFavoriteStorageKey = (userId?: number | string): string => {
  return `${STORAGE_PREFIX}${userId ? String(userId) : 'guest'}`;
};

export const getFavoriteRequests = (userId?: number | string): FavoriteRequest[] => {
  try {
    const raw = localStorage.getItem(getFavoriteStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to load favorite requests:', error);
    return [];
  }
};

export const saveFavoriteRequest = (
  payload: Omit<FavoriteRequest, 'id' | 'createdAt'>,
  userId?: number | string
): FavoriteRequest => {
  const currentList = getFavoriteRequests(userId);
  const newFavorite: FavoriteRequest = {
    ...payload,
    id: `fav_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    createdAt: new Date().toISOString(),
    items: payload.items.map((it) => {
      const unitVal = it.uom?.trim() || it.unit?.trim() || 'قطعة';
      return {
        item_description: it.item_description.trim(),
        uom: unitVal,
        unit: unitVal,
        quantity: Number(it.quantity) || 1,
        specifications: it.specifications?.trim() || '',
        notes: it.notes?.trim() || '',
      };
    }),
  };

  const updatedList = [newFavorite, ...currentList];
  try {
    localStorage.setItem(getFavoriteStorageKey(userId), JSON.stringify(updatedList));
  } catch (error) {
    console.error('Failed to save favorite request:', error);
  }

  return newFavorite;
};

export const deleteFavoriteRequest = (id: string, userId?: number | string): boolean => {
  try {
    const currentList = getFavoriteRequests(userId);
    const filtered = currentList.filter((item) => item.id !== id);
    localStorage.setItem(getFavoriteStorageKey(userId), JSON.stringify(filtered));
    return true;
  } catch (error) {
    console.error('Failed to delete favorite request:', error);
    return false;
  }
};

export const updateFavoriteRequestTitle = (
  id: string,
  newTitle: string,
  userId?: number | string
): boolean => {
  try {
    const currentList = getFavoriteRequests(userId);
    const updated = currentList.map((item) =>
      item.id === id ? { ...item, title: newTitle.trim() } : item
    );
    localStorage.setItem(getFavoriteStorageKey(userId), JSON.stringify(updated));
    return true;
  } catch (error) {
    console.error('Failed to update favorite request title:', error);
    return false;
  }
};
