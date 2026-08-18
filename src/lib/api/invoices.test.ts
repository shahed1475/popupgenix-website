import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInvoice, deleteInvoice, listInvoices } from './invoices';

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('invoices API module', () => {
  it('listInvoices GETs /api/invoices', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    vi.stubGlobal('fetch', mockFetch);

    await listInvoices();

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/invoices');
    expect(init.method).toBe('GET');
  });

  it('createInvoice POSTs the invoice with line items to /api/invoices', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: '1', line_items: [] }) });
    vi.stubGlobal('fetch', mockFetch);

    await createInvoice({
      invoice_number: 'INV-1',
      client_name: 'Jane',
      client_email: 'jane@example.com',
      due_date: '2026-09-01',
      subtotal: 100,
      discount: 0,
      tax: 0,
      total: 100,
      status: 'pending',
      line_items: [{ service_name: 'Design', quantity: 1, rate: 100, amount: 100 }],
    });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/invoices');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.line_items).toHaveLength(1);
  });

  it('deleteInvoice DELETEs /api/invoices/:id', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => { throw new Error('no body'); } });
    vi.stubGlobal('fetch', mockFetch);

    await deleteInvoice('1');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/invoices/1');
    expect(init.method).toBe('DELETE');
  });
});
