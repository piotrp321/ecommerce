import { cache } from 'react';
import { createDemoCatalogSource } from './demo/demo-source';
import type { CatalogSource } from './source';
import type { ProductQuery, ProductSort } from './types';

// The single place that decides where the catalog comes from. Connecting the API means
// adding an HTTP CatalogSource (backend address from a runtime server-side variable) and
// returning it here; pages and components only use the CatalogSource interface.
const source: CatalogSource = createDemoCatalogSource({
  delayMs: Number(process.env.STORE_DEMO_DELAY_MS ?? 0) || 0,
});

// React's cache compares arguments by identity, so the query object is passed as primitives:
// generateMetadata and the page then share one request per listing.
const listProducts = cache((category: string | undefined, sort: ProductSort, page: number, perPage: number) =>
  source.listProducts({ ...(category === undefined ? {} : { category }), sort, page, perPage }),
);

export const catalog = {
  isDemo: source.isDemo,
  listCategories: cache(() => source.listCategories()),
  getCategory: cache((slug: string) => source.getCategory(slug)),
  listProducts: ({ category, sort, page, perPage }: ProductQuery) => listProducts(category, sort, page, perPage),
  getProduct: cache((slug: string) => source.getProduct(slug)),
};
