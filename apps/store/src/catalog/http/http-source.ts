import type { CatalogSource } from '../source';
import type { CategoryDetails, CategoryNode, CategoryRef, Money, Product, ProductPage, PublicPrice } from '../types';

// Public catalog API of the backend (docs/api/openapi.yaml: listCategories, getCategory,
// listProducts, getProduct), called server to server inside the network (ADR-0009):
// Symfony routes have no /api prefix. Responses are mapped field by field onto the
// store's types, so unknown fields never reach the UI. Errors carry only the method
// and the path, never the backend address.

interface HttpCatalogOptions {
  /** Absolute http(s) URL of the backend, e.g. http://backend:80 (STORE_BACKEND_URL). */
  baseUrl: string;
  /** Per request; a slower backend counts as unavailable. */
  timeoutMs?: number;
  fetch?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 5000;

/** `Slug` of the contract; other values cannot name a category or a product. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const VAT_RATES: readonly PublicPrice['vatRate'][] = [23, 8, 5, 0];

class CatalogApiError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(`Catalog API: ${message}`, options);
    this.name = 'CatalogApiError';
  }
}

type Json = Record<string, unknown>;

/** Reads typed fields of a JSON object; `path` names the place in the response for errors. */
function reader(value: unknown, path: string) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError(`${path} is not an object`);
  const object = value as Json;
  const fail = (key: string, expected: string): never => {
    throw new TypeError(`${path}.${key} is not ${expected}`);
  };

  return {
    string: (key: string): string => {
      const field = object[key];
      return typeof field === 'string' ? field : fail(key, 'a string');
    },
    nullableString: (key: string): string | null => {
      const field = object[key];
      return field === null || typeof field === 'string' ? field : fail(key, 'a string or null');
    },
    boolean: (key: string): boolean => {
      const field = object[key];
      return typeof field === 'boolean' ? field : fail(key, 'a boolean');
    },
    integer: (key: string): number => {
      const field = object[key];
      return Number.isInteger(field) ? (field as number) : fail(key, 'an integer');
    },
    array: <T>(key: string, map: (item: unknown, path: string) => T): T[] => {
      const field = object[key];
      return Array.isArray(field) ? field.map((item, index) => map(item, `${path}.${key}[${String(index)}]`)) : fail(key, 'an array');
    },
    nested: <T>(key: string, map: (item: unknown, path: string) => T): T => map(object[key], `${path}.${key}`),
  };
}

function categoryRef(value: unknown, path: string): CategoryRef {
  const r = reader(value, path);
  return { id: r.string('id'), slug: r.string('slug'), name: r.string('name') };
}

function categoryNode(value: unknown, path: string): CategoryNode {
  const r = reader(value, path);
  return { ...categoryRef(value, path), children: r.array('children', categoryNode) };
}

function categoryDetails(value: unknown, path: string): CategoryDetails {
  const r = reader(value, path);
  return {
    ...categoryRef(value, path),
    ancestors: r.array('ancestors', categoryRef),
    children: r.array('children', categoryNode),
  };
}

function price(value: unknown, path: string): PublicPrice {
  const r = reader(value, path);
  const gross = r.nested('gross', (money, moneyPath): Money => {
    const m = reader(money, moneyPath);
    if (m.string('currency') !== 'PLN') throw new TypeError(`${moneyPath}.currency is not PLN`);
    return { amount: m.string('amount'), currency: 'PLN' };
  });
  const vatRate = VAT_RATES.find((rate) => rate === r.integer('vatRate'));
  if (vatRate === undefined) throw new TypeError(`${path}.vatRate is not a VAT rate of the contract`);

  return { gross, vatRate };
}

function product(value: unknown, path: string): Product {
  const r = reader(value, path);
  return {
    id: r.string('id'),
    sku: r.string('sku'),
    slug: r.string('slug'),
    name: r.string('name'),
    description: r.nullableString('description'),
    price: r.nested('price', price),
    category: r.nested('category', (category, categoryPath) => (category === null ? null : categoryRef(category, categoryPath))),
    inStock: r.boolean('inStock'),
    // The contract has no product images yet (ADR-0009): the UI shows its placeholder.
    image: null,
  };
}

function productPage(value: unknown, path: string): ProductPage {
  const r = reader(value, path);
  return {
    items: r.array('items', product),
    page: r.integer('page'),
    perPage: r.integer('perPage'),
    totalItems: r.integer('totalItems'),
    totalPages: r.integer('totalPages'),
  };
}

function backendBase(baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new CatalogApiError('STORE_BACKEND_URL is not an absolute http(s) URL (e.g. http://backend:80)');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new CatalogApiError('STORE_BACKEND_URL is not an absolute http(s) URL (e.g. http://backend:80)');
  }

  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

export function createHttpCatalogSource({
  baseUrl,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetch: fetchImpl = globalThis.fetch,
}: HttpCatalogOptions): CatalogSource {
  const base = backendBase(baseUrl);

  /** GET a contract path and map the body; `notFound` is returned for HTTP 404 if given, other failures throw. */
  async function get<T, N = never>(
    path: string,
    map: (value: unknown, path: string) => T,
    notFound?: { value: N },
  ): Promise<T | N> {
    const operation = `GET ${path.split('?')[0] ?? path}`;
    let response: Response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        headers: { Accept: 'application/json' },
        // Catalog data of the moment of the request; React's cache() dedupes within a render.
        cache: 'no-store',
        // The backend never redirects its catalog routes (e.g. a trailing slash would).
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      // The cause (connection refused, timeout) stays in the server log only.
      throw new CatalogApiError(`${operation} failed`, { cause: error });
    }
    if (response.status === 404 && notFound) return notFound.value;
    if (!response.ok) throw new CatalogApiError(`${operation} answered HTTP ${String(response.status)}`);

    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      throw new CatalogApiError(`${operation} returned malformed JSON`, { cause: error });
    }
    try {
      return map(body, 'response');
    } catch (error) {
      throw new CatalogApiError(`${operation} returned data outside the contract`, { cause: error });
    }
  }

  /** A single entity by slug: `null` when it does not exist (HTTP 404, or a slug outside the contract). */
  const find = <T>(collection: string, slug: string, map: (value: unknown, path: string) => T): Promise<T | null> =>
    SLUG.test(slug) ? get(`/catalog/${collection}/${encodeURIComponent(slug)}`, map, { value: null }) : Promise.resolve(null);

  return {
    isDemo: false,

    listCategories: () => get('/catalog/categories', (body, path) => reader(body, path).array('items', categoryNode)),

    getCategory: (slug) => find('categories', slug, categoryDetails),

    listProducts: ({ category, sort, page, perPage }) => {
      const params = new URLSearchParams({
        ...(category === undefined ? {} : { category }),
        sort,
        page: String(page),
        perPage: String(perPage),
      });
      return get(`/catalog/products?${params.toString()}`, productPage);
    },

    getProduct: (slug) => find('products', slug, product),
  };
}
