import { createHttpCatalogSource } from './http-source';

// Responses shaped exactly like the public catalog contract (docs/api/openapi.yaml):
// PublicProduct, PublicCategoryNode, PublicCategoryDetails, Pagination, Problem.
const apiProduct = {
  id: '0199f2a4-6f1e-7c39-9f7e-1d2b3c4d5e6f',
  sku: 'HP-ARIA-01',
  slug: 'sluchawki-aria',
  name: 'Słuchawki Aria',
  description: 'Bezprzewodowe słuchawki nauszne.',
  price: { gross: { amount: '1249.99', currency: 'PLN' }, vatRate: 23 },
  category: { id: '0199f2a4-0000-7000-8000-000000000003', slug: 'sluchawki', name: 'Słuchawki' },
  inStock: false,
};

const apiTree = {
  items: [
    {
      id: '0199f2a4-0000-7000-8000-000000000001',
      slug: 'elektronika',
      name: 'Elektronika',
      children: [{ id: '0199f2a4-0000-7000-8000-000000000003', slug: 'sluchawki', name: 'Słuchawki', children: [] }],
    },
  ],
};

const apiCategory = {
  id: '0199f2a4-0000-7000-8000-000000000002',
  slug: 'audio',
  name: 'Audio',
  ancestors: [{ id: '0199f2a4-0000-7000-8000-000000000001', slug: 'elektronika', name: 'Elektronika' }],
  children: [{ id: '0199f2a4-0000-7000-8000-000000000003', slug: 'sluchawki', name: 'Słuchawki', children: [] }],
};

const notFound = { type: 'about:blank', title: 'Not Found', status: 404, detail: 'Product "x" was not found.' };

const json = (body: unknown, status = 200, contentType = 'application/json'): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': contentType } });

const BASE = 'http://backend:8000';

function setup(respond: (url: string) => Response | Promise<Response> = () => json({}), baseUrl = BASE) {
  const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>((input) => Promise.resolve(respond(input)));
  const source = createHttpCatalogSource({ baseUrl, fetch: fetchMock as unknown as typeof fetch });
  const requested = () => fetchMock.mock.calls.map(([input]) => input);
  const init = (call = 0) => fetchMock.mock.calls[call]?.[1];

  return { source, fetchMock, requested, init };
}

describe('HTTP catalog source', () => {
  it('is not demo data', () => {
    expect(setup().source.isDemo).toBe(false);
  });

  describe('requests', () => {
    it('lists products with the category, sort and paging parameters of the contract', async () => {
      const { source, requested } = setup(() => json({ items: [], page: 2, perPage: 12, totalItems: 13, totalPages: 2 }));

      await source.listProducts({ category: 'audio', sort: '-price', page: 2, perPage: 12 });
      await source.listProducts({ sort: 'name', page: 1, perPage: 8 });

      expect(requested()).toEqual([
        `${BASE}/catalog/products?category=audio&sort=-price&page=2&perPage=12`,
        `${BASE}/catalog/products?sort=name&page=1&perPage=8`,
      ]);
    });

    it('reads categories and single entities from their contract paths', async () => {
      const { source, requested } = setup((url) => (url.endsWith('/catalog/categories') ? json(apiTree) : json(notFound, 404)));

      await source.listCategories();
      await source.getCategory('audio');
      await source.getProduct('sluchawki-aria');

      expect(requested()).toEqual([
        `${BASE}/catalog/categories`,
        `${BASE}/catalog/categories/audio`,
        `${BASE}/catalog/products/sluchawki-aria`,
      ]);
    });

    it('accepts a base URL with a path and a trailing slash', async () => {
      const { source, requested } = setup(() => json(apiTree), 'https://api.example.test/v1/');

      await source.listCategories();

      expect(requested()).toEqual(['https://api.example.test/v1/catalog/categories']);
    });

    it('asks for request-time data with a timeout and without following redirects', async () => {
      const { source, init } = setup(() => json(apiTree));

      await source.listCategories();

      expect(init()).toMatchObject({ cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' } });
      expect(init()?.signal).toBeInstanceOf(AbortSignal);
    });

    it('does not call the backend for slugs outside the contract pattern (they cannot exist)', async () => {
      const { source, fetchMock } = setup(() => json(apiProduct));

      for (const slug of ['', '.', '..', 'Duze-Litery', 'a/b', 'ala ma kota', '-abc', 'abc-', 'a--b']) {
        expect(await source.getProduct(slug)).toBeNull();
        expect(await source.getCategory(slug)).toBeNull();
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('mapping', () => {
    it('maps a product field by field: gross price and inStock as returned, no image, unknown fields dropped', async () => {
      const { source } = setup(() => json({ ...apiProduct, net: '1016.25', stock: 7 }));

      expect(await source.getProduct('sluchawki-aria')).toEqual({
        id: apiProduct.id,
        sku: 'HP-ARIA-01',
        slug: 'sluchawki-aria',
        name: 'Słuchawki Aria',
        description: 'Bezprzewodowe słuchawki nauszne.',
        price: { gross: { amount: '1249.99', currency: 'PLN' }, vatRate: 23 },
        category: { id: apiProduct.category.id, slug: 'sluchawki', name: 'Słuchawki' },
        inStock: false,
        image: null,
      });
    });

    it('keeps a missing description and category as null', async () => {
      const { source } = setup(() => json({ ...apiProduct, description: null, category: null }));

      expect(await source.getProduct('sluchawki-aria')).toMatchObject({ description: null, category: null, image: null });
    });

    it('maps a page of products with its pagination', async () => {
      const { source } = setup(() => json({ items: [apiProduct], page: 1, perPage: 12, totalItems: 1, totalPages: 1 }));

      const page = await source.listProducts({ sort: 'name', page: 1, perPage: 12 });

      expect(page).toMatchObject({ page: 1, perPage: 12, totalItems: 1, totalPages: 1 });
      expect(page.items.map((product) => [product.slug, product.price.gross.amount, product.image])).toEqual([
        ['sluchawki-aria', '1249.99', null],
      ]);
    });

    it('maps an empty catalog', async () => {
      const { source } = setup((url) =>
        url.includes('/products') ? json({ items: [], page: 1, perPage: 12, totalItems: 0, totalPages: 0 }) : json({ items: [] }),
      );

      expect(await source.listCategories()).toEqual([]);
      expect(await source.listProducts({ sort: 'name', page: 1, perPage: 12 })).toEqual({
        items: [],
        page: 1,
        perPage: 12,
        totalItems: 0,
        totalPages: 0,
      });
    });

    it('maps the nested category tree', async () => {
      const { source } = setup(() => json(apiTree));

      expect(await source.listCategories()).toEqual(apiTree.items);
    });

    it('maps a category with its ancestors and children', async () => {
      const { source } = setup(() => json({ ...apiCategory, productCount: 3 }));

      expect(await source.getCategory('audio')).toEqual(apiCategory);
    });

    it('returns null for an unknown category or product (HTTP 404)', async () => {
      const { source } = setup(() => json(notFound, 404, 'application/problem+json'));

      expect(await source.getCategory('nie-ma')).toBeNull();
      expect(await source.getProduct('nieaktywny-produkt')).toBeNull();
    });
  });

  describe('failures', () => {
    const failing: [string, () => Response | Promise<Response>][] = [
      ['HTTP 500', () => json({ type: 'about:blank', title: 'Internal Server Error', status: 500 }, 500)],
      ['HTTP 503', () => new Response('Service Unavailable', { status: 503 })],
      ['HTTP 404 of a list', () => json(notFound, 404)],
      ['a connection error', () => Promise.reject(new TypeError('fetch failed'))],
      ['a timeout', () => Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))],
      ['malformed JSON', () => new Response('<html>oops</html>', { status: 200, headers: { 'Content-Type': 'text/html' } })],
      ['JSON of another shape', () => json({ items: [{ id: 1 }] })],
    ];

    it.each(failing)('throws on %s instead of returning an empty catalog', async (_, respond) => {
      const { source } = setup(respond);

      await expect(source.listCategories()).rejects.toThrow(/Catalog API/);
      await expect(source.listProducts({ sort: 'name', page: 1, perPage: 12 })).rejects.toThrow(/Catalog API/);
    });

    it('throws for single entities on errors other than 404', async () => {
      const { source } = setup(() => json({ status: 500 }, 500));

      await expect(source.getProduct('sluchawki-aria')).rejects.toThrow('Catalog API: GET /catalog/products/sluchawki-aria answered HTTP 500');
      await expect(source.getCategory('audio')).rejects.toThrow(/HTTP 500/);
    });

    it('rejects a product with a price outside the contract', async () => {
      const { source } = setup(() => json({ ...apiProduct, price: { gross: { amount: 1249.99, currency: 'PLN' }, vatRate: 23 } }));

      await expect(source.getProduct('sluchawki-aria')).rejects.toThrow(/Catalog API/);
    });

    it('does not reveal the backend address in its errors', async () => {
      const { source } = setup(() => Promise.reject(new TypeError(`fetch failed: connect ECONNREFUSED ${BASE}`)));

      const error: unknown = await source.listCategories().catch((e: unknown) => e);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Catalog API: GET /catalog/categories failed');
      expect((error as Error).message).not.toContain('backend');
    });

    it('aborts a request that takes longer than the timeout', async () => {
      // Never answers by itself: only the abort signal of the source ends the request.
      const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(
        (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
            });
          }),
      );
      const source = createHttpCatalogSource({ baseUrl: BASE, timeoutMs: 20, fetch: fetchMock as unknown as typeof fetch });

      await expect(source.listCategories()).rejects.toThrow('Catalog API: GET /catalog/categories failed');
    });
  });

  it.each(['', 'backend:80', 'ftp://backend', 'not a url'])('refuses an invalid base URL %j', (baseUrl) => {
    expect(() => createHttpCatalogSource({ baseUrl })).toThrow(/absolute http\(s\) URL/);
  });
});
