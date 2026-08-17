import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient, ApiError, clearToken, getToken, setToken } from './client';

function stubStorage() {
  const store: Record<string, string> = {};
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  });
}

beforeEach(() => {
  stubStorage();
  vi.stubGlobal('window', { location: { href: '' } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('token storage', () => {
  it('round-trips a token through localStorage', () => {
    expect(getToken()).toBeNull();
    setToken('abc123');
    expect(getToken()).toBe('abc123');
    clearToken();
    expect(getToken()).toBeNull();
  });
});

describe('apiClient', () => {
  it('GETs a relative /api path and attaches the Bearer token when present', async () => {
    setToken('my-token');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ hello: 'world' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await apiClient.get<{ hello: string }>('/services');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/services');
    expect(init.method).toBe('GET');
    expect(init.headers.get('Authorization')).toBe('Bearer my-token');
    expect(result).toEqual({ hello: 'world' });
  });

  it('omits the Authorization header when no token is stored', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    vi.stubGlobal('fetch', mockFetch);

    await apiClient.get('/testimonials');

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers.get('Authorization')).toBeNull();
  });

  it('POSTs a JSON body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: '1' }) });
    vi.stubGlobal('fetch', mockFetch);

    await apiClient.post('/services', { title: 'Web Dev' });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/services');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ title: 'Web Dev' }));
    expect(init.headers.get('Content-Type')).toBe('application/json');
  });

  it('returns undefined for a 204 No Content response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => { throw new Error('no body'); } });
    vi.stubGlobal('fetch', mockFetch);

    const result = await apiClient.delete('/services/abc');

    expect(result).toBeUndefined();
  });

  it('throws ApiError with the backend error message on a non-2xx response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Service not found' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(apiClient.get('/services/missing')).rejects.toMatchObject(
      new ApiError(404, 'Service not found')
    );
  });

  it('includes zod validation details on a 400 response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Validation failed', details: [{ path: ['title'], message: 'Required' }] }),
    });
    vi.stubGlobal('fetch', mockFetch);

    try {
      await apiClient.post('/services', {});
      throw new Error('expected apiClient.post to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).details).toEqual([{ path: ['title'], message: 'Required' }]);
    }
  });

  it('on a 401, clears the token and redirects to /admin', async () => {
    setToken('stale-token');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid or expired token' }),
    });
    vi.stubGlobal('fetch', mockFetch);
    const win = { location: { href: '' } };
    vi.stubGlobal('window', win);

    await expect(apiClient.get('/auth/me')).rejects.toBeInstanceOf(ApiError);

    expect(getToken()).toBeNull();
    expect(win.location.href).toBe('/admin');
  });
});
