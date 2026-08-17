import { apiClient } from './client';

export interface ContactSubmission {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  subject: string | null;
  message: string;
  budget_range: string | null;
  preferred_contact: string | null;
  status: string;
  priority: string;
}

export function listContactSubmissions(): Promise<ContactSubmission[]> {
  return apiClient.get<ContactSubmission[]>('/contact-submissions');
}

export function deleteContactSubmission(id: string): Promise<void> {
  return apiClient.delete<void>(`/contact-submissions/${id}`);
}
