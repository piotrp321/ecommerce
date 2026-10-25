import type { CatalogSource } from '../source';
import type { CategoryDetails, CategoryNode, CategoryRef, Product, ProductPage, ProductQuery, ProductSort } from '../types';
import { demoCategoryTree, demoProducts } from './data';

// In-memory stand-in for the public catalog API. Filtering, sorting and paging emulate
// the query parameters of GET /catalog/products; prices and availability come from the
// data as they are.

interface DemoOptions {
  categories?: CategoryNode[];
  products?: Product[];
  /** Artificial latency in milliseconds, to see loading states during development. */
  delayMs?: number;
}

const ref = ({ id, slug, name }: CategoryRef): CategoryRef => ({ id, slug, name });

function findPath(slug: string, nodes: CategoryNode[], ancestors: CategoryRef[] = []): CategoryDetails | null {
  for (const node of nodes) {
    if (node.slug === slug) return { ...ref(node), ancestors, children: node.children };
    const found = findPath(slug, node.children, [...ancestors, ref(node)]);
    if (found) return found;
  }
  return null;
}

function subtreeSlugs(node: CategoryNode): string[] {
  return [node.slug, ...node.children.flatMap(subtreeSlugs)];
}

/** Amounts are "123.45" strings; comparing them as whole grosze avoids float rounding. */
const grosze = (product: Product): number => Number(product.price.gross.amount.replace('.', ''));

const byName = (a: Product, b: Product): number => a.name.localeCompare(b.name, 'pl');

const comparators: Record<ProductSort, (a: Product, b: Product) => number> = {
  name: byName,
  price: (a, b) => grosze(a) - grosze(b) || byName(a, b),
  '-price': (a, b) => grosze(b) - grosze(a) || byName(a, b),
};

export function createDemoCatalogSource({
  categories = demoCategoryTree,
  products = demoProducts,
  delayMs = 0,
}: DemoOptions = {}): CatalogSource {
  const delay = <T>(value: T): Promise<T> =>
    delayMs > 0 ? new Promise((resolve) => setTimeout(() => { resolve(value); }, delayMs)) : Promise.resolve(value);

  return {
    isDemo: true,

    listCategories: () => delay(categories),

    getCategory: (slug) => delay(findPath(slug, categories)),

    listProducts: ({ category, sort, page, perPage }: ProductQuery): Promise<ProductPage> => {
      let items = products;
      if (category !== undefined) {
        const details = findPath(category, categories);
        const slugs = new Set(details ? subtreeSlugs(details) : []);
        items = items.filter((product) => product.category !== null && slugs.has(product.category.slug));
      }
      const sorted = [...items].sort(comparators[sort]);
      const start = (page - 1) * perPage;

      return delay({
        items: sorted.slice(start, start + perPage),
        page,
        perPage,
        totalItems: sorted.length,
        totalPages: Math.ceil(sorted.length / perPage),
      });
    },

    getProduct: (slug) => delay(products.find((product) => product.slug === slug) ?? null),
  };
}
