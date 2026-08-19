import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listMyFeedback, submitFeedback } from './feedback';

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

describe('listMyFeedback', () => {
  it('calls GET /testimonials/mine', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    vi.stubGlobal('fetch', mockFetch);

    await listMyFeedback();

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/testimonials/mine');
    expect(init.method).toBe('GET');
  });
});

describe('submitFeedback', () => {
  it('calls POST /testimonials with the given input', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: 'f1', testimonial: 'Great work', rating: 5 }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const input = { client_name: 'Jane', client_email: 'jane@drickly.test', rating: 5, testimonial: 'Great work' };
    await submitFeedback(input);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/testimonials');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify(input));
  });
});
