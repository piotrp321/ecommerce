import { cache } from 'react';
import { createDemoCatalogSource } from './demo/demo-source';
import { createHttpCatalogSource } from './http/http-source';
import type { CatalogSource } from './source';
import type { ProductQuery, ProductSort } from './types';

/** Server environment: STORE_BACKEND_URL and STORE_DEMO_DELAY_MS are read. */
type Env = Record<string, string | undefined>;

/**
 * The single place that decides where the catalog comes from (ADR-0009). STORE_BACKEND_URL
 * set to an http(s) URL selects the backend API; unset or empty selects the demo data.
 * An invalid URL is an error, never a silent fallback to the demo data.
 */
export function createCatalogSource(env: Env): CatalogSource {
  const backendUrl = env.STORE_BACKEND_URL?.trim() ?? '';
  if (backendUrl === '') {
    return createDemoCatalogSource({ delayMs: Number(env.STORE_DEMO_DELAY_MS ?? 0) || 0 });
  }

  return createHttpCatalogSource({ baseUrl: backendUrl });
}

// Created on first use, from the environment of the running server (not of `next build`),
// so one build serves both the demo and the API.
let source: CatalogSource | undefined;
const current = (): CatalogSource => (source ??= createCatalogSource(process.env));

// React's cache compares arguments by identity, so the query object is passed as primitives:
// generateMetadata and the page then share one request per listing.
const listProducts = cache((category: string | undefined, sort: ProductSort, page: number, perPage: number) =>
  current().listProducts({ ...(category === undefined ? {} : { category }), sort, page, perPage }),
);

export const catalog = {
  /** Read during rendering only (layouts and pages that render per request). */
  get isDemo(): boolean {
    return current().isDemo;
  },
  listCategories: cache(() => current().listCategories()),
  getCategory: cache((slug: string) => current().getCategory(slug)),
  listProducts: ({ category, sort, page, perPage }: ProductQuery) => listProducts(category, sort, page, perPage),
  getProduct: cache((slug: string) => current().getProduct(slug)),
};
