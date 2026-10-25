import { categoryVisuals, editorialBanner, featuredProductSlugs } from '@/content/home';
import type { CategoryNode } from '../types';
import { demoCategoryTree, demoProducts } from './data';

// Formats from the catalog contract (docs/api/openapi.yaml): Slug, Sku, Amount, Uuid.
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SKU = /^[A-Z0-9][A-Z0-9_-]{0,63}$/;
const AMOUNT = /^(0|[1-9]\d{0,8})\.\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const flatten = (nodes: CategoryNode[]): CategoryNode[] => nodes.flatMap((node) => [node, ...flatten(node.children)]);
const categories = flatten(demoCategoryTree);
const bySlug = new Map(categories.map((category) => [category.slug, category]));
const unique = (values: string[]): boolean => new Set(values).size === values.length;

describe('demo catalog data', () => {
  it('categories have contract-valid, unique ids and slugs, siblings ordered by name', () => {
    for (const category of categories) {
      expect(category.id).toMatch(UUID);
      expect(category.slug).toMatch(SLUG);
    }
    expect(unique(categories.map((c) => c.id))).toBe(true);
    expect(unique(categories.map((c) => c.slug))).toBe(true);

    const checkOrder = (nodes: CategoryNode[]) => {
      const names = nodes.map((node) => node.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'pl')));
      nodes.forEach((node) => { checkOrder(node.children); });
    };
    checkOrder(demoCategoryTree);
  });

  it('products follow the contract formats and are labelled as demo', () => {
    for (const product of demoProducts) {
      expect(product.id).toMatch(UUID);
      expect(product.slug).toMatch(SLUG);
      expect(product.sku).toMatch(SKU);
      expect(product.sku.startsWith('DEMO-')).toBe(true);
      expect(product.price.gross.amount).toMatch(AMOUNT);
      expect(product.price.gross.currency).toBe('PLN');
      expect([23, 8, 5, 0]).toContain(product.price.vatRate);
      expect(product.image?.url).toMatch(/^https:\/\/images\.unsplash\.com\/photo-/);
    }
    expect(unique(demoProducts.map((p) => p.id))).toBe(true);
    expect(unique(demoProducts.map((p) => p.slug))).toBe(true);
    expect(unique(demoProducts.map((p) => p.sku))).toBe(true);
  });

  it('product categories exist in the tree with the same id, slug and name', () => {
    for (const product of demoProducts) {
      const node = product.category ? bySlug.get(product.category.slug) : undefined;
      expect(node && { id: node.id, slug: node.slug, name: node.name }).toEqual(product.category);
    }
  });

  it('home page content refers to existing products and categories', () => {
    const productSlugs = new Set(demoProducts.map((p) => p.slug));
    for (const slug of featuredProductSlugs) expect(productSlugs).toContain(slug);
    for (const slug of Object.keys(categoryVisuals)) expect(bySlug.has(slug)).toBe(true);
    expect(bySlug.has(editorialBanner.categorySlug)).toBe(true);
  });
});
