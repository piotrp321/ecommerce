// Catalog data as the store presents it.
//
// INTERIM: these types follow the public catalog contract
// (docs/api/openapi.yaml, ADR-0005: PublicProduct, PublicCategoryNode,
// PublicCategoryDetails, Pagination). They are replaced by the types generated from
// OpenAPI in packages/sdk (roadmap stage 5). Keep them structurally identical to the
// contract; the only store-side addition is `image`, which the contract does not have yet.

/** Decimal amount with exactly two fractional digits, e.g. "129.00". Never parsed into a float. */
export type Amount = string;

export interface Money {
  amount: Amount;
  currency: 'PLN';
}

/** Price shown to B2C customers (spec R13). Calculated by the backend, presented as is. */
export interface PublicPrice {
  gross: Money;
  vatRate: 23 | 8 | 5 | 0;
}

export interface CategoryRef {
  id: string;
  slug: string;
  name: string;
}

export interface CategoryNode extends CategoryRef {
  children: CategoryNode[];
}

export interface CategoryDetails extends CategoryRef {
  /** From the root down to the parent; empty for a root category. */
  ancestors: CategoryRef[];
  children: CategoryNode[];
}

/** Not part of the API contract yet: only the demo data source provides images. */
export interface CatalogImage {
  url: string;
  alt: string;
  /** Page of the photo at its source, for attribution. */
  sourceUrl: string;
}

export interface Product {
  id: string;
  sku: string;
  slug: string;
  name: string;
  description: string | null;
  price: PublicPrice;
  category: CategoryRef | null;
  /** Whether at least one unit is available for sale; decided by the backend. */
  inStock: boolean;
  image: CatalogImage | null;
}

export type ProductSort = 'name' | 'price' | '-price';

export interface ProductQuery {
  /** Category slug: products of the category and all its subcategories. */
  category?: string;
  sort: ProductSort;
  page: number;
  perPage: number;
}

export interface ProductPage {
  items: Product[];
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
}
