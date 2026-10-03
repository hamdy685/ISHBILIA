import client from '../client';

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  phone?: string;
  is_active: boolean;
  department?: {
    id: number;
    name: string;
    code: string;
  };
  manager_id?: number | null;
  manager?: {
    id: number;
    name: string;
    email: string;
  } | null;
  site_engineer_departments?: Array<{
    id: number;
    name: string;
    code: string;
  }>;
  roles: Array<{
    id: number;
    name: string;
    slug: string;
  }>;
  created_at?: string;
}

export interface UserInput {
  name: string;
  email: string;
  password?: string;
  phone?: string;
  department_id?: number | null;
  manager_id?: number | null;
  role_ids?: number[];
  is_active?: boolean;
}

export const getUsersAdminApi = async (): Promise<AdminUser[]> => {
  const res = await client.get<{ data: AdminUser[] }>('/admin/users');
  return res.data.data;
};

export const createUserAdminApi = async (data: UserInput): Promise<AdminUser> => {
  const res = await client.post<{ data: AdminUser }>('/admin/users', data);
  return res.data.data;
};

export const updateUserAdminApi = async (id: number, data: UserInput): Promise<AdminUser> => {
  const res = await client.put<{ data: AdminUser }>(`/admin/users/${id}`, data);
  return res.data.data;
};

export const toggleUserActiveAdminApi = async (id: number): Promise<{ is_active: boolean }> => {
  const res = await client.delete<{ is_active: boolean }>(`/admin/users/${id}`);
  return res.data;
};
