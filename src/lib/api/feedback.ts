import { apiClient } from './client';

export interface Feedback {
  id: string;
  client_id: string | null;
  client_name: string;
  client_email: string;
  client_company: string | null;
  project_id: string | null;
  rating: number;
  testimonial: string;
  status: string;
  featured: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export function listAdminFeedback(): Promise<Feedback[]> {
  return apiClient.get<Feedback[]>('/testimonials/admin');
}

export function updateFeedback(id: string, input: { status?: string; featured?: boolean }): Promise<Feedback> {
  return apiClient.patch<Feedback>(`/testimonials/${id}`, input);
}

export function deleteFeedback(id: string): Promise<void> {
  return apiClient.delete<void>(`/testimonials/${id}`);
}
