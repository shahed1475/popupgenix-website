import { apiClient, clearToken, getToken, setToken } from './client';

export interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

interface LoginResponse {
  token: string;
  user: AdminUser;
}

export async function login(email: string, password: string): Promise<AdminUser> {
  const { token, user } = await apiClient.post<LoginResponse>('/auth/login', { email, password });
  setToken(token);
  return user;
}

export async function getCurrentUser(): Promise<AdminUser | null> {
  if (!getToken()) return null;
  try {
    return await apiClient.get<AdminUser>('/auth/me');
  } catch {
    return null;
  }
}

export function logout(): void {
  clearToken();
}
