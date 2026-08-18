import { apiClient } from './client';

export interface QuoteRequest {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  project_type: string;
  project_description: string;
  budget_range: string;
  timeline: string | null;
  additional_requirements: string | null;
  status: string;
  estimated_cost: number | null;
  notes: string | null;
}

export function listQuoteRequests(): Promise<QuoteRequest[]> {
  return apiClient.get<QuoteRequest[]>('/quote-requests');
}

export function deleteQuoteRequest(id: string): Promise<void> {
  return apiClient.delete<void>(`/quote-requests/${id}`);
}
