import { createDemoCatalogSource } from '@/catalog/demo/demo-source';
import { product } from '@/test/fixtures';
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
