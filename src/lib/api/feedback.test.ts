import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteFeedback, listAdminFeedback, updateFeedback } from './feedback';

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('feedback API module', () => {
  it('listAdminFeedback GETs /api/testimonials/admin', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    vi.stubGlobal('fetch', mockFetch);

    await listAdminFeedback();

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/testimonials/admin');
    expect(init.method).toBe('GET');
  });

  it('updateFeedback PATCHes /api/testimonials/:id', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: '1' }) });
    vi.stubGlobal('fetch', mockFetch);

    await updateFeedback('1', { status: 'approved' });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/testimonials/1');
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe(JSON.stringify({ status: 'approved' }));
  });

  it('deleteFeedback DELETEs /api/testimonials/:id', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => { throw new Error('no body'); } });
    vi.stubGlobal('fetch', mockFetch);

    await deleteFeedback('1');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/testimonials/1');
    expect(init.method).toBe('DELETE');
  });
});
