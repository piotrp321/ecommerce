import type { ProductQuery } from '../types';
import { createDemoCatalogSource } from './demo-source';

const source = createDemoCatalogSource();
const query = (overrides: Partial<ProductQuery> = {}): ProductQuery => ({ sort: 'name', page: 1, perPage: 100, ...overrides });

describe('demo catalog source', () => {
  it('returns products of a category and all its subcategories', async () => {
    const audio = await source.listProducts(query({ category: 'audio' }));
    const slugs = new Set(audio.items.map((product) => product.category?.slug));

    expect(audio.totalItems).toBe(6);
    expect(slugs).toEqual(new Set(['glosniki', 'sluchawki']));
    expect((await source.listProducts(query({ category: 'elektronika' }))).totalItems).toBe(9);
  });

  it('gives an empty list for an empty or unknown category', async () => {
    expect((await source.listProducts(query({ category: 'inteligentny-dom' }))).totalItems).toBe(0);
    expect((await source.listProducts(query({ category: 'nie-ma-takiej' }))).items).toEqual([]);
  });

  it('sorts by name (Polish collation) and by gross price in both directions', async () => {
    const byName = (await source.listProducts(query({ category: 'glosniki' }))).items.map((p) => p.name);
    expect(byName).toEqual(['Głośnik przenośny Pebble', 'Głośnik Terra']);

    const asc = (await source.listProducts(query({ sort: 'price' }))).items.map((p) => p.price.gross.amount);
    const desc = (await source.listProducts(query({ sort: '-price' }))).items.map((p) => p.price.gross.amount);
    expect(asc[0]).toBe('69.00');
    expect(asc.at(-1)).toBe('1590.00');
    expect(desc[0]).toBe('1590.00');
  });

  it('pages the results', async () => {
    const page = await source.listProducts(query({ page: 3, perPage: 12 }));

    expect(page).toMatchObject({ page: 3, perPage: 12, totalItems: 27, totalPages: 3 });
    expect(page.items).toHaveLength(3);
  });

  it('finds a category with its ancestors and children', async () => {
    const category = await source.getCategory('sluchawki');

    expect(category?.ancestors.map((ancestor) => ancestor.slug)).toEqual(['elektronika', 'audio']);
    expect((await source.getCategory('audio'))?.children.map((child) => child.slug)).toEqual(['glosniki', 'sluchawki']);
    expect(await source.getCategory('nie-ma-takiej')).toBeNull();
  });

  it('finds a product by slug, null when unknown', async () => {
    expect((await source.getProduct('lampa-biurkowa-arc'))?.name).toBe('Lampa biurkowa Arc');
    expect(await source.getProduct('nie-ma-takiego')).toBeNull();
  });

  it('marks itself as demo data', () => {
    expect(source.isDemo).toBe(true);
  });
});
