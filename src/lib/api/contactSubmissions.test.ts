import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteContactSubmission, listContactSubmissions } from './contactSubmissions';

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('contactSubmissions API module', () => {
  it('listContactSubmissions GETs /api/contact-submissions', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    vi.stubGlobal('fetch', mockFetch);

    await listContactSubmissions();

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/contact-submissions');
    expect(init.method).toBe('GET');
  });

  it('deleteContactSubmission DELETEs /api/contact-submissions/:id', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => { throw new Error('no body'); } });
    vi.stubGlobal('fetch', mockFetch);

    await deleteContactSubmission('1');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/contact-submissions/1');
    expect(init.method).toBe('DELETE');
  });
});
