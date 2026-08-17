import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getHomepageContent, saveHomepageContent } from './homepageContent';

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

describe('homepageContent API module', () => {
  it('getHomepageContent GETs /api/homepage-content', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => null });
    vi.stubGlobal('fetch', mockFetch);

    const result = await getHomepageContent();

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/homepage-content');
    expect(init.method).toBe('GET');
    expect(result).toBeNull();
  });

  it('saveHomepageContent PUTs /api/homepage-content', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: '1' }) });
    vi.stubGlobal('fetch', mockFetch);

    await saveHomepageContent({
      hero_title: 'Hi',
      hero_subtitle: 'Sub',
      hero_cta_primary: 'Go',
      hero_cta_secondary: 'See',
      about_title: 'About',
      about_description: 'Desc',
      clients_count: 1,
      projects_count: 2,
      satisfaction_rate: 99,
      team_size: 5,
    });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/homepage-content');
    expect(init.method).toBe('PUT');
  });
});
