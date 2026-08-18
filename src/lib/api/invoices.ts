import { apiClient } from './client';

export interface InvoiceLineItem {
  id: string;
  invoice_id: string;
  service_name: string;
  description: string | null;
  quantity: number;
  rate: number;
  amount: number;
  created_at: string;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  client_name: string;
  client_email: string;
  client_company: string | null;
  client_phone: string | null;
  client_address: string | null;
  issue_date: string;
  due_date: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  status: string;
  payment_instructions: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceWithLineItems extends Invoice {
  line_items: InvoiceLineItem[];
}

export interface InvoiceLineItemInput {
  service_name: string;
  description?: string | null;
  quantity: number;
  rate: number;
  amount: number;
}

export interface InvoiceInput {
  invoice_number: string;
  client_name: string;
  client_email: string;
  client_company?: string | null;
  client_phone?: string | null;
  client_address?: string | null;
  issue_date?: string;
  due_date: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  status: string;
  payment_instructions?: string | null;
  line_items: InvoiceLineItemInput[];
}

export function listInvoices(): Promise<Invoice[]> {
  return apiClient.get<Invoice[]>('/invoices');
}

export function createInvoice(input: InvoiceInput): Promise<InvoiceWithLineItems> {
  return apiClient.post<InvoiceWithLineItems>('/invoices', input);
}

export function deleteInvoice(id: string): Promise<void> {
  return apiClient.delete<void>(`/invoices/${id}`);
}
