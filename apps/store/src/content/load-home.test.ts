import { createDemoCatalogSource } from '@/catalog/demo/demo-source';
import type { CatalogSource } from '@/catalog/source';
import type { Product, ProductQuery } from '@/catalog/types';
import { categories as fixtureCategories, product } from '@/test/fixtures';
import { editorialBanner, featuredProductSlugs } from './home';
import { loadHomeData } from './load-home';

describe('loadHomeData', () => {
  it('returns the editorial picks in order and the banner from the demo catalog', async () => {
    const data = await loadHomeData(createDemoCatalogSource());

    expect(data.featured.map((p) => p.slug)).toEqual(featuredProductSlugs);
    expect(data.banner?.categorySlug).toBe(editorialBanner.categorySlug);
    expect(data.categories).not.toHaveLength(0);
  });

  it('skips picks the catalog does not have', async () => {
    const data = await loadHomeData(createDemoCatalogSource(), { picks: ['nie-ma', 'lampa-biurkowa-arc'] });

    expect(data.featured.map((p) => p.slug)).toEqual(['lampa-biurkowa-arc']);
  });

  it('falls back to the first products by name when no pick exists, and hides a banner without its category', async () => {
    const products = [product({ id: 'b', slug: 'b', name: 'Beta' }), product({ id: 'a', slug: 'a', name: 'Alfa' })];
    const data = await loadHomeData(createDemoCatalogSource({ categories: [], products }));

    expect(data.featured.map((p) => p.name)).toEqual(['Alfa', 'Beta']);
    expect(data.banner).toBeNull();
  });

  it('has nothing to feature in an empty catalog', async () => {
    const data = await loadHomeData(createDemoCatalogSource({ categories: [], products: [] }));

    expect(data).toEqual({ categories: [], featured: [], banner: null });
  });
});

describe('loadHomeData with the API catalog', () => {
  // The API catalog, here backed by in-memory data that also has products with the demo slugs.
  function apiCatalog(products: Product[], categories = fixtureCategories) {
    const data = createDemoCatalogSource({ categories, products });
    return {
      isDemo: false,
      listCategories: vi.fn(() => data.listCategories()),
      getCategory: vi.fn((slug: string) => data.getCategory(slug)),
      listProducts: vi.fn((query: ProductQuery) => data.listProducts(query)),
      getProduct: vi.fn((slug: string) => data.getProduct(slug)),
    } satisfies CatalogSource;
  }

  it('features the first active products by name, never the editorial picks of the demo data', async () => {
    const products = [
      ...featuredProductSlugs.map((slug, index) => product({ id: slug, slug, name: `Wybrany ${String(index)}` })),
      ...['Kubek', 'Dzbanek', 'Ażurowa misa', 'Lampa', 'Zegar', 'Brelok', 'Czajnik', 'Fotel', 'Ekspres'].map((name) =>
        product({ id: name, slug: name.toLowerCase(), name }),
      ),
    ];
    const catalog = apiCatalog(products);

    const data = await loadHomeData(catalog);

    expect(data.featured.map((p) => p.name)).toEqual([
      'Ażurowa misa',
      'Brelok',
      'Czajnik',
      'Dzbanek',
      'Ekspres',
      'Fotel',
      'Kubek',
      'Lampa',
    ]);
    expect(catalog.listProducts).toHaveBeenCalledExactlyOnceWith({ sort: 'name', page: 1, perPage: 8 });
    expect(catalog.getProduct).not.toHaveBeenCalled();
  });

  it('renders an empty API catalog without products, categories or banner', async () => {
    const data = await loadHomeData(apiCatalog([], []));

    expect(data).toEqual({ categories: [], featured: [], banner: null });
  });
});
