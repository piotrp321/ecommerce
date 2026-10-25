import type { CategoryDetails, CategoryNode, Product, ProductPage, ProductQuery } from './types';

/**
 * Where the store reads the catalog from. One method per public catalog operation of the
 * API contract (listCategories, getCategory, listProducts, getProduct), so an HTTP
 * implementation can replace the demo one without changes in the UI.
 */
export interface CatalogSource {
  /** True for sample data that must not be presented as a real catalog. */
  readonly isDemo: boolean;
  listCategories(): Promise<CategoryNode[]>;
  /** `null` when there is no such category (HTTP 404). */
  getCategory(slug: string): Promise<CategoryDetails | null>;
  listProducts(query: ProductQuery): Promise<ProductPage>;
  /** `null` when there is no such active product (HTTP 404). */
  getProduct(slug: string): Promise<Product | null>;
}
