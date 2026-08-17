import { apiClient } from './client';

export interface Service {
  id: string;
  title: string;
  description: string;
  icon: string;
  features: string[];
  order_index: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type ServiceInput = Omit<Service, 'id' | 'created_at' | 'updated_at'>;

export function listServices(): Promise<Service[]> {
  return apiClient.get<Service[]>('/services');
}

export function createService(input: Partial<ServiceInput>): Promise<Service> {
  return apiClient.post<Service>('/services', input);
}

export function updateService(id: string, input: Partial<ServiceInput>): Promise<Service> {
  return apiClient.patch<Service>(`/services/${id}`, input);
}

export function deleteService(id: string): Promise<void> {
  return apiClient.delete<void>(`/services/${id}`);
}
