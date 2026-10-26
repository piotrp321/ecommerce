import { createCatalogSource } from './index';

// STORE_BACKEND_URL decides at runtime where the catalog comes from (ADR-0009).
describe('createCatalogSource', () => {
  it('uses the demo data when STORE_BACKEND_URL is not set', () => {
    expect(createCatalogSource({}).isDemo).toBe(true);
  });

  it('treats an empty STORE_BACKEND_URL as not set (Compose: STORE_BACKEND_URL= selects the demo)', () => {
    expect(createCatalogSource({ STORE_BACKEND_URL: '' }).isDemo).toBe(true);
    expect(createCatalogSource({ STORE_BACKEND_URL: '  ' }).isDemo).toBe(true);
  });

  it('uses the backend API when STORE_BACKEND_URL is an http(s) URL', () => {
    expect(createCatalogSource({ STORE_BACKEND_URL: 'http://backend:80' }).isDemo).toBe(false);
    expect(createCatalogSource({ STORE_BACKEND_URL: 'https://api.example.test' }).isDemo).toBe(false);
  });

  it('fails with a readable error for an invalid STORE_BACKEND_URL instead of falling back to the demo', () => {
    expect(() => createCatalogSource({ STORE_BACKEND_URL: 'backend:80' })).toThrow(
      'STORE_BACKEND_URL is not an absolute http(s) URL (e.g. http://backend:80)',
    );
  });

  it('calls the backend at STORE_BACKEND_URL', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(Response.json({ items: [] })));
    vi.stubGlobal('fetch', fetchMock);
    try {
      expect(await createCatalogSource({ STORE_BACKEND_URL: 'http://backend:80' }).listCategories()).toEqual([]);
      expect(fetchMock).toHaveBeenCalledWith('http://backend/catalog/categories', expect.anything());
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
