import { cache } from 'react';
import { createDemoCatalogSource } from './demo/demo-source';
import type { CatalogSource } from './source';
import type { ProductQuery } from './types';

// The single place that decides where the catalog comes from. Connecting the API means
// adding an HTTP CatalogSource (backend address from a runtime server-side variable) and
// returning it here; pages and components only use the CatalogSource interface.
const source: CatalogSource = createDemoCatalogSource({
  delayMs: Number(process.env.STORE_DEMO_DELAY_MS ?? 0) || 0,
});

export const catalog = {
  isDemo: source.isDemo,
  listCategories: cache(() => source.listCategories()),
  getCategory: cache((slug: string) => source.getCategory(slug)),
  listProducts: (query: ProductQuery) => source.listProducts(query),
  getProduct: cache((slug: string) => source.getProduct(slug)),
};
