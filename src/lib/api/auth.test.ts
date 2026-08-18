import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getToken, setToken } from './client';
import { getCurrentUser, login, logout } from './auth';

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

const USER = {
  id: 'u1',
  email: 'owner@popupgenix.com',
  full_name: null,
  is_admin: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  stubStorage();
  vi.stubGlobal('window', { location: { href: '' } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('login', () => {
  it('stores the returned token and resolves the user', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ token: 'jwt-token', user: USER }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const user = await login('owner@popupgenix.com', 'correct-password');

    expect(user).toEqual(USER);
    expect(getToken()).toBe('jwt-token');
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/auth/login');
    expect(init.body).toBe(JSON.stringify({ email: 'owner@popupgenix.com', password: 'correct-password' }));
  });
});

describe('getCurrentUser', () => {
  it('returns null immediately when no token is stored, without calling fetch', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const user = await getCurrentUser();

    expect(user).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns the user when the stored token is valid', async () => {
    setToken('valid-token');
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => USER });
    vi.stubGlobal('fetch', mockFetch);

    const user = await getCurrentUser();

    expect(user).toEqual(USER);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/auth/me');
  });

  it('returns null when the stored token is rejected (401)', async () => {
    setToken('stale-token');
    const win = { location: { href: '' } };
    vi.stubGlobal('window', win);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid or expired token' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const user = await getCurrentUser();

    expect(user).toBeNull();
    expect(getToken()).toBeNull();
  });
});

describe('logout', () => {
  it('clears the stored token', () => {
    setToken('some-token');
    logout();
    expect(getToken()).toBeNull();
  });
});
