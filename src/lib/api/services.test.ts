import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createService, deleteService, listServices, updateService } from './services';

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('services API module', () => {
  it('listServices GETs /api/services', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    vi.stubGlobal('fetch', mockFetch);

    await listServices();

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/services');
    expect(init.method).toBe('GET');
  });

  it('createService POSTs to /api/services', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: '1' }) });
    vi.stubGlobal('fetch', mockFetch);

    await createService({ title: 'Web Dev', description: 'x', icon: 'code', features: [], order_index: 0, active: true });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/services');
    expect(init.method).toBe('POST');
  });

  it('updateService PATCHes /api/services/:id', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: '1' }) });
    vi.stubGlobal('fetch', mockFetch);

    await updateService('1', { active: false });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/services/1');
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe(JSON.stringify({ active: false }));
  });

  it('deleteService DELETEs /api/services/:id', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => { throw new Error('no body'); } });
    vi.stubGlobal('fetch', mockFetch);

    await deleteService('1');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/services/1');
    expect(init.method).toBe('DELETE');
  });
});
