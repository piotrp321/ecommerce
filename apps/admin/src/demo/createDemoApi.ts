/**
 * DEMO ADAPTER. An in-memory stand-in for the catalog API, so the panel can be
 * reviewed before the backend is merged and before admin login exists.
 *
 * - Nothing leaves the browser: no network, no storage; a reload restores the
 *   demo data.
 * - It mimics the catalog contract's answers (problem details, 409/422) only
 *   roughly, to exercise the error states of the UI. It is NOT a second
 *   implementation of the business rules: the backend stays the source of
 *   truth and this file is deleted together with the demo mode.
 * - It never calculates VAT: a price change clears the gross price.
 */
import type { AdminApi } from '../api/AdminApi';
import { ApiError } from '../api/errors';
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
} from '../api/types';
import { demoCategories, demoId, demoProducts, type DemoCategoryRecord, type DemoProductRecord } from './fixtures';

const SKU = /^[A-Z0-9][A-Z0-9_-]{0,63}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NET_PRICE = /^(0|[1-9]\d{0,6})\.\d{2}$/;
const VAT_RATES: readonly number[] = [23, 8, 5, 0];
const MAX_DEPTH = 10;
const MAX_ON_HAND = 1_000_000;

export interface DemoApiOptions {
  /** Simulated network latency; tests use 0. */
  latencyMs?: number;
}

function notFound(what: string): ApiError {
  return new ApiError({ status: 404, title: 'Not Found', detail: `${what} nie istnieje.` });
}

function conflict(detail: string): ApiError {
  return new ApiError({ status: 409, title: 'Conflict', detail });
}

function businessRule(detail: string): ApiError {
  return new ApiError({ status: 422, title: 'Unprocessable Content', detail });
}

function invalid(violations: { propertyPath: string; title: string }[]): ApiError {
  return new ApiError({ status: 422, title: 'Validation Failed', violations });
}

function validateProduct(input: ProductInput, sku?: string): void {
  const violations: { propertyPath: string; title: string }[] = [];
  if (sku !== undefined && !SKU.test(sku)) {
    violations.push({ propertyPath: 'sku', title: 'Nieprawidłowy format SKU.' });
  }
  if (!SLUG.test(input.slug) || input.slug.length > 120) {
    violations.push({ propertyPath: 'slug', title: 'Nieprawidłowy format sluga.' });
  }
  const name = input.name.trim();
  if (name === '' || name.length > 200) {
    violations.push({ propertyPath: 'name', title: 'Nazwa musi mieć od 1 do 200 znaków.' });
  }
  if ((input.description ?? '').length > 10_000) {
    violations.push({ propertyPath: 'description', title: 'Opis może mieć najwyżej 10 000 znaków.' });
  }
  if (!NET_PRICE.test(input.netPrice)) {
    violations.push({ propertyPath: 'netPrice', title: 'Podaj kwotę w formacie 123.45.' });
  }
  if (!VAT_RATES.includes(input.vatRate)) {
    violations.push({ propertyPath: 'vatRate', title: 'Niedozwolona stawka VAT.' });
  }
  if (violations.length > 0) {
    throw invalid(violations);
  }
  if (input.netPrice === '0.00') {
    throw businessRule('Cena netto musi być większa od zera.');
  }
}

function validateCategory(input: CategoryInput): void {
  const violations: { propertyPath: string; title: string }[] = [];
  if (!SLUG.test(input.slug) || input.slug.length > 120) {
    violations.push({ propertyPath: 'slug', title: 'Nieprawidłowy format sluga.' });
  }
  const name = input.name.trim();
  if (name === '' || name.length > 100) {
    violations.push({ propertyPath: 'name', title: 'Nazwa musi mieć od 1 do 100 znaków.' });
  }
  if (violations.length > 0) {
    throw invalid(violations);
  }
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, 'pl', { sensitivity: 'base' });
}

/** Compares "123.45" strings exactly, as integers of grosze. */
function compareAmount(a: string, b: string): number {
  const diff = BigInt(a.replace('.', '')) - BigInt(b.replace('.', ''));

  return diff === 0n ? 0 : diff < 0n ? -1 : 1;
}

export function createDemoApi(options: DemoApiOptions = {}): AdminApi {
  const latencyMs = options.latencyMs ?? 300;
  let categories: DemoCategoryRecord[] = demoCategories();
  const products: DemoProductRecord[] = demoProducts();
  let sequence = 0;

  function respond<T>(produce: () => T): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      setTimeout(() => {
        try {
          resolve(structuredClone(produce()));
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      }, latencyMs);
    });
  }

  function now(): string {
    return new Date().toISOString();
  }

  function findCategory(id: Uuid): DemoCategoryRecord {
    const category = categories.find((c) => c.id === id);
    if (category === undefined) {
      throw notFound('Kategoria');
    }

    return category;
  }

  function findProduct(id: Uuid): DemoProductRecord {
    const product = products.find((p) => p.id === id);
    if (product === undefined) {
      throw notFound('Produkt');
    }

    return product;
  }

  function toProduct(record: DemoProductRecord): Product {
    const category = record.categoryId === null ? undefined : categories.find((c) => c.id === record.categoryId);

    return {
      id: record.id,
      sku: record.sku,
      slug: record.slug,
      name: record.name,
      description: record.description,
      price: {
        net: { amount: record.netPrice, currency: 'PLN' },
        vatRate: record.vatRate,
        gross: record.grossPrice === null ? null : { amount: record.grossPrice, currency: 'PLN' },
      },
      category: category === undefined ? null : { id: category.id, slug: category.slug, name: category.name },
      active: record.active,
      stock: stockOf(record),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  function stockOf(record: DemoProductRecord) {
    return { onHand: record.onHand, reserved: record.reserved, available: record.onHand - record.reserved };
  }

  function toNode(record: DemoCategoryRecord): CategoryNode {
    return {
      id: record.id,
      slug: record.slug,
      name: record.name,
      parentId: record.parentId,
      productCount: products.filter((p) => p.categoryId === record.id).length,
      children: categories
        .filter((c) => c.parentId === record.id)
        .sort((a, b) => compareText(a.name, b.name))
        .map(toNode),
    };
  }

  /** The category and all its descendants. */
  function subtreeIds(id: Uuid): Set<Uuid> {
    const ids = new Set<Uuid>([id]);
    let added = true;
    while (added) {
      added = false;
      for (const category of categories) {
        if (category.parentId !== null && ids.has(category.parentId) && !ids.has(category.id)) {
          ids.add(category.id);
          added = true;
        }
      }
    }

    return ids;
  }

  function depthOf(id: Uuid | null): number {
    let depth = 0;
    let current = id === null ? undefined : categories.find((c) => c.id === id);
    while (current !== undefined) {
      depth += 1;
      const parentId = current.parentId;
      current = parentId === null ? undefined : categories.find((c) => c.id === parentId);
    }

    return depth;
  }

  function heightOf(id: Uuid): number {
    const children = categories.filter((c) => c.parentId === id);

    return 1 + Math.max(0, ...children.map((c) => heightOf(c.id)));
  }

  function assertUniqueProduct(input: { sku?: string; slug: string }, exceptId?: Uuid): void {
    if (input.sku !== undefined && products.some((p) => p.sku === input.sku && p.id !== exceptId)) {
      throw conflict(`Produkt z SKU ${input.sku} już istnieje.`);
    }
    if (products.some((p) => p.slug === input.slug && p.id !== exceptId)) {
      throw conflict(`Slug „${input.slug}” jest już używany przez inny produkt.`);
    }
  }

  function assertCategoryExists(id: Uuid | null): void {
    if (id !== null && !categories.some((c) => c.id === id)) {
      throw businessRule('Wybrana kategoria nie istnieje.');
    }
  }

  function assertUniqueCategorySlug(slug: string, exceptId?: Uuid): void {
    if (categories.some((c) => c.slug === slug && c.id !== exceptId)) {
      throw conflict(`Slug „${slug}” jest już używany przez inną kategorię.`);
    }
  }

  return {
    mode: 'demo',

    listProducts(query: ProductQuery): Promise<Page<Product>> {
      return respond(() => {
        const perPage = query.perPage ?? 20;
        const page = query.page ?? 1;
        const needle = query.q?.trim().toLocaleLowerCase('pl') ?? '';
        const inCategory = query.categoryId === undefined ? undefined : subtreeIds(query.categoryId);

        const matching = products
          .filter((p) => (query.status ?? 'all') === 'all' || p.active === (query.status === 'active'))
          .filter((p) => inCategory === undefined || (p.categoryId !== null && inCategory.has(p.categoryId)))
          .filter(
            (p) =>
              needle === '' ||
              p.name.toLocaleLowerCase('pl').includes(needle) ||
              p.sku.toLocaleLowerCase('pl').includes(needle),
          );

        const sort = query.sort ?? 'newest';
        matching.sort((a, b) => {
          switch (sort) {
            case 'name':
              return compareText(a.name, b.name);
            case '-name':
              return compareText(b.name, a.name);
            case 'price':
              return compareAmount(a.netPrice, b.netPrice);
            case '-price':
              return compareAmount(b.netPrice, a.netPrice);
            case 'newest':
              return b.createdAt.localeCompare(a.createdAt);
          }
        });

        const start = (page - 1) * perPage;

        return {
          items: matching.slice(start, start + perPage).map(toProduct),
          page,
          perPage,
          totalItems: matching.length,
          totalPages: Math.ceil(matching.length / perPage),
        };
      });
    },

    getProduct(id) {
      return respond(() => toProduct(findProduct(id)));
    },

    createProduct(input: CreateProductInput) {
      return respond(() => {
        validateProduct(input, input.sku);
        assertCategoryExists(input.categoryId);
        assertUniqueProduct(input);
        sequence += 1;
        const timestamp = now();
        const record: DemoProductRecord = {
          id: demoId('d', sequence),
          sku: input.sku,
          slug: input.slug,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          netPrice: input.netPrice,
          vatRate: input.vatRate,
          grossPrice: null,
          categoryId: input.categoryId,
          active: false,
          onHand: 0,
          reserved: 0,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        products.push(record);

        return toProduct(record);
      });
    },

    updateProduct(id, input) {
      return respond(() => {
        const record = findProduct(id);
        validateProduct(input);
        assertCategoryExists(input.categoryId);
        assertUniqueProduct({ slug: input.slug }, id);
        if (record.netPrice !== input.netPrice || record.vatRate !== input.vatRate) {
          record.grossPrice = null;
        }
        Object.assign(record, {
          slug: input.slug,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          netPrice: input.netPrice,
          vatRate: input.vatRate,
          categoryId: input.categoryId,
          updatedAt: now(),
        });

        return toProduct(record);
      });
    },

    activateProduct(id) {
      return respond(() => {
        const record = findProduct(id);
        record.active = true;
        record.updatedAt = now();

        return toProduct(record);
      });
    },

    deactivateProduct(id) {
      return respond(() => {
        const record = findProduct(id);
        record.active = false;
        record.updatedAt = now();

        return toProduct(record);
      });
    },

    listCategories() {
      return respond(() =>
        categories
          .filter((c) => c.parentId === null)
          .sort((a, b) => compareText(a.name, b.name))
          .map(toNode),
      );
    },

    createCategory(input: CreateCategoryInput) {
      return respond(() => {
        validateCategory(input);
        assertCategoryExists(input.parentId);
        assertUniqueCategorySlug(input.slug);
        if (depthOf(input.parentId) + 1 > MAX_DEPTH) {
          throw conflict(`Drzewo kategorii może mieć najwyżej ${String(MAX_DEPTH)} poziomów.`);
        }
        sequence += 1;
        const record: DemoCategoryRecord = {
          id: demoId('d', sequence),
          slug: input.slug,
          name: input.name.trim(),
          parentId: input.parentId,
        };
        categories.push(record);

        return toNode(record);
      });
    },

    updateCategory(id, input) {
      return respond(() => {
        const record = findCategory(id);
        validateCategory(input);
        assertUniqueCategorySlug(input.slug, id);
        record.slug = input.slug;
        record.name = input.name.trim();

        return toNode(record);
      });
    },

    moveCategory(id, parentId) {
      return respond(() => {
        const record = findCategory(id);
        assertCategoryExists(parentId);
        if (parentId !== null && subtreeIds(id).has(parentId)) {
          throw conflict('Nie można przenieść kategorii do niej samej ani do jej podkategorii (powstałby cykl).');
        }
        if (depthOf(parentId) + heightOf(id) > MAX_DEPTH) {
          throw conflict(`Po przeniesieniu drzewo miałoby więcej niż ${String(MAX_DEPTH)} poziomów.`);
        }
        record.parentId = parentId;

        return toNode(record);
      });
    },

    deleteCategory(id) {
      return respond(() => {
        findCategory(id);
        if (categories.some((c) => c.parentId === id)) {
          throw conflict('Kategoria ma podkategorie. Najpierw je usuń lub przenieś.');
        }
        if (products.some((p) => p.categoryId === id)) {
          throw conflict('Kategoria zawiera produkty. Najpierw przenieś je do innej kategorii.');
        }
        categories = categories.filter((c) => c.id !== id);
      });
    },

    setStock(productId, onHand): Promise<StockLevel> {
      return respond(() => {
        const record = findProduct(productId);
        if (!Number.isInteger(onHand) || onHand < 0 || onHand > MAX_ON_HAND) {
          throw invalid([{ propertyPath: 'onHand', title: 'Podaj liczbę całkowitą od 0 do 1 000 000.' }]);
        }
        if (onHand < record.reserved) {
          throw conflict(`Stan nie może być mniejszy niż liczba zarezerwowanych sztuk (${String(record.reserved)}).`);
        }
        record.onHand = onHand;
        record.updatedAt = now();

        return { productId, ...stockOf(record) };
      });
    },
  };
}
