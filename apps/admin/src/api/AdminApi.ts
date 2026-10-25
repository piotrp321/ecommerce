import type {
  CategoryInput,
  CategoryNode,
  CreateCategoryInput,
  CreateProductInput,
  Page,
  Product,
  ProductInput,
  ProductQuery,
  StockLevel,
  Uuid,
} from './types';

/**
 * Data port of the admin panel. Screens depend only on this interface.
 *
 * Today the only implementation is the in-memory demo adapter (`src/demo`).
 * The real client will implement the same methods on top of the generated SDK,
 * with the session cookie and CSRF token handled by the browser and the backend,
 * so screens do not change. Every method rejects with `ApiError` on a problem
 * response.
 */
export interface AdminApi {
  /** `demo` keeps everything in memory; nothing reaches a server. */
  readonly mode: 'demo';

  listProducts(query: ProductQuery): Promise<Page<Product>>;
  getProduct(id: Uuid): Promise<Product>;
  createProduct(input: CreateProductInput): Promise<Product>;
  updateProduct(id: Uuid, input: ProductInput): Promise<Product>;
  activateProduct(id: Uuid): Promise<Product>;
  deactivateProduct(id: Uuid): Promise<Product>;

  listCategories(): Promise<CategoryNode[]>;
  createCategory(input: CreateCategoryInput): Promise<CategoryNode>;
  updateCategory(id: Uuid, input: CategoryInput): Promise<CategoryNode>;
  moveCategory(id: Uuid, parentId: Uuid | null): Promise<CategoryNode>;
  deleteCategory(id: Uuid): Promise<void>;

  setStock(productId: Uuid, onHand: number): Promise<StockLevel>;
}
