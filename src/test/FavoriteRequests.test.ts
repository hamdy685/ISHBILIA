import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveFavoriteRequest,
  getFavoriteRequests,
  deleteFavoriteRequest,
  updateFavoriteRequestTitle,
  getFavoriteStorageKey,
} from '../utils/favoriteRequestsStorage';

describe('Favorite Requests Storage Utility', () => {
  const userId = 42;

  beforeEach(() => {
    localStorage.clear();
  });

  it('saves and retrieves favorite request correctly', () => {
    const saved = saveFavoriteRequest(
      {
        title: 'طلب أسمنت وحديد',
        target_department_id: 2,
        request_type: 'PROJECT',
        priority: 'URGENT',
        notes: 'توريد عاجل للموقع',
        items: [
          {
            item_description: 'حديد تسليح 12 مم',
            uom: 'طن',
            quantity: 5,
            specifications: 'مجدول معتمد',
          },
          {
            item_description: 'أسمنت بورتلاندي',
            uom: 'شيكارة',
            quantity: 100,
          },
        ],
      },
      userId
    );

    expect(saved.id).toBeDefined();
    expect(saved.title).toBe('طلب أسمنت وحديد');
    expect(saved.items).toHaveLength(2);
    expect(saved.items[0].uom).toBe('طن');

    const list = getFavoriteRequests(userId);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(saved.id);
  });

  it('updates title of an existing favorite request', () => {
    const saved = saveFavoriteRequest(
      {
        title: 'اسم قديم',
        items: [
          {
            item_description: 'صنف 1',
            quantity: 2,
          },
        ],
      },
      userId
    );

    const updated = updateFavoriteRequestTitle(saved.id, 'اسم جديد ومحدث', userId);
    expect(updated).toBe(true);

    const list = getFavoriteRequests(userId);
    expect(list[0].title).toBe('اسم جديد ومحدث');
  });

  it('deletes favorite request by id', () => {
    const fav1 = saveFavoriteRequest({ title: 'قالب 1', items: [] }, userId);
    const fav2 = saveFavoriteRequest({ title: 'قالب 2', items: [] }, userId);

    expect(getFavoriteRequests(userId)).toHaveLength(2);

    deleteFavoriteRequest(fav1.id, userId);

    const remaining = getFavoriteRequests(userId);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(fav2.id);
  });

  it('separates favorites by user id', () => {
    saveFavoriteRequest({ title: 'قالب مستخدم 1', items: [] }, 1);
    saveFavoriteRequest({ title: 'قالب مستخدم 2', items: [] }, 2);

    expect(getFavoriteRequests(1)).toHaveLength(1);
    expect(getFavoriteRequests(1)[0].title).toBe('قالب مستخدم 1');

    expect(getFavoriteRequests(2)).toHaveLength(1);
    expect(getFavoriteRequests(2)[0].title).toBe('قالب مستخدم 2');
  });
});
