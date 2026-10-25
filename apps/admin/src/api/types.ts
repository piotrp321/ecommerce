/**
 * PROVISIONAL types of the admin panel (an accepted exception until the SDK).
 *
 * They follow the catalog contract `docs/api/openapi.yaml` closely, so they are
 * close to its DTOs rather than screen-specific view models. This is accepted
 * only until the SDK generated from OpenAPI exists (`packages/sdk`, stage 5):
 * then use its types and map them in the real `AdminApi` adapter. Do not extend
 * these by hand to follow backend changes. They are NOT the API contract.
 */

export type Uuid = string;

/** Decimal amount with exactly two fractional digits, e.g. "1234.50". Never a JS number. */
export type DecimalString = string;

/** VAT rate in percent, as accepted by the backend (spec R12). */
export type VatRate = 23 | 8 | 5 | 0;

export interface Money {
  amount: DecimalString;
  currency: 'PLN';
}

export interface AdminPrice {
  net: Money;
  vatRate: VatRate;
  /**
   * Calculated only by the backend. `null` means "not known to the panel yet":
   * the demo adapter does not calculate VAT, so it clears the gross price after
   * a price change instead of guessing it.
   */
  gross: Money | null;
}

export interface CategoryRef {
  id: Uuid;
  slug: string;
  name: string;
}

export interface Stock {
  onHand: number;
  reserved: number;
  /** Provided by the backend (onHand - reserved); the panel never derives it. */
  available: number;
}

export interface StockLevel extends Stock {
  productId: Uuid;
}

export interface Product {
  id: Uuid;
  sku: string;
  slug: string;
  name: string;
  description: string | null;
  price: AdminPrice;
  category: CategoryRef | null;
  active: boolean;
  stock: Stock;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryNode {
  id: Uuid;
  slug: string;
  name: string;
  parentId: Uuid | null;
  /** Products directly in this category (active or not). */
  productCount: number;
  children: CategoryNode[];
}

export interface Page<T> {
  items: T[];
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
}

export type ProductStatusFilter = 'all' | 'active' | 'inactive';

/**
 * `sort` is not in the admin contract yet (it lists newest first);
 * the demo adapter supports it so the UI can be reviewed. See the integration requirements in apps/admin/AGENTS.md.
 */
export type ProductSort = 'newest' | 'name' | '-name' | 'price' | '-price';

export interface ProductQuery {
  q?: string;
  status?: ProductStatusFilter;
  categoryId?: Uuid;
  sort?: ProductSort;
  page?: number;
  perPage?: number;
}

export interface ProductInput {
  slug: string;
  name: string;
  description: string | null;
  netPrice: DecimalString;
  vatRate: VatRate;
  categoryId: Uuid | null;
}

export interface CreateProductInput extends ProductInput {
  sku: string;
}

export interface CategoryInput {
  slug: string;
  name: string;
}

export interface CreateCategoryInput extends CategoryInput {
  parentId: Uuid | null;
}
