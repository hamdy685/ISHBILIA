import apiClient from './client';
import { ActionInboxItem } from '../components/dashboard/ActionRequiredInbox';

export interface DashboardPendingTasksResponse {
  count: number;
  data: ActionInboxItem[];
}

export const getDashboardPendingTasksApi = async (): Promise<ActionInboxItem[]> => {
  const response = await apiClient.get<DashboardPendingTasksResponse>('/dashboard/pending-tasks');
  return response.data?.data || [];
};
