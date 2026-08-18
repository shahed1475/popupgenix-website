import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteQuoteRequest, listQuoteRequests } from './quoteRequests';

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('quoteRequests API module', () => {
  it('listQuoteRequests GETs /api/quote-requests', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    vi.stubGlobal('fetch', mockFetch);

    await listQuoteRequests();

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/quote-requests');
    expect(init.method).toBe('GET');
  });

  it('deleteQuoteRequest DELETEs /api/quote-requests/:id', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => { throw new Error('no body'); } });
    vi.stubGlobal('fetch', mockFetch);

    await deleteQuoteRequest('1');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/quote-requests/1');
    expect(init.method).toBe('DELETE');
  });
});
