import apiClient from './client';
import { Notification } from '../types/notification';

export const getNotificationsApi = async (): Promise<Notification[]> => {
  const response = await apiClient.get<{ data: Notification[] }>('/notifications');
  return response.data.data;
};

export const getUnreadNotificationCountApi = async (): Promise<number> => {
  const response = await apiClient.get<{ unread_count?: number; count?: number }>('/notifications/unread-count');
  return response.data.unread_count ?? response.data.count ?? 0;
};

export const getUnreadCountApi = getUnreadNotificationCountApi;

export const markNotificationAsReadApi = async (id: number): Promise<Notification> => {
  const response = await apiClient.post<{ data: Notification } | Notification>(
    '/notifications/' + id + '/read'
  );
  const data = response.data;
  return (data && typeof data === 'object' && 'data' in data && (data as any).data)
    ? (data as { data: Notification }).data
    : (data as Notification);
};

export const markAllNotificationsAsReadApi = async (): Promise<void> => {
  await apiClient.post('/notifications/read-all');
};

export const sendTestPushApi = async (): Promise<{ message: string; device_count: number }> => {
  const response = await apiClient.post<{ message: string; device_count: number }>('/notifications/test-push');
  return response.data;
};

/**
 * SSE Realtime streaming is DISABLED to prevent blocking PHP workers.
 * php artisan serve has limited workers (10), and each SSE connection
 * holds a worker for the entire timeout duration, starving actual API requests.
 * 
 * Notifications are delivered via:
 * 1. Periodic polling (NotificationBell every 90s)
 * 2. Tab focus/visibility refresh
 * 3. Firebase Cloud Messaging (FCM) push notifications
 */

// No-op stubs to maintain API compatibility
export const startNotificationsRealtime = (_lastKnownId = 0) => {
  // Disabled — polling + FCM handles notification delivery
};

export const stopNotificationsRealtime = () => {
  // No-op
};
