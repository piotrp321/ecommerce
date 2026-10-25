import type { ProductQuery, ProductSort, ProductStatusFilter } from '../../api/types';

const STATUSES: readonly ProductStatusFilter[] = ['all', 'active', 'inactive'];
const SORTS: readonly ProductSort[] = ['newest', 'name', '-name', 'price', '-price'];
/** Page sizes offered by the list; the contract allows up to 100. */
export const PER_PAGE_OPTIONS: readonly number[] = [10, 20, 50];
export const DEFAULT_PER_PAGE = 20;
/** The contract limits `q` to 100 characters. */
export const MAX_QUERY_LENGTH = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function positiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = value === null ? Number.NaN : Number(value);

  return Number.isInteger(parsed) && parsed >= 1 ? Math.min(parsed, max) : fallback;
}

/**
 * Reads the list state from the URL, so filters survive a reload and can be
 * shared. Values the UI cannot show or the contract would reject (unknown page
 * size, malformed category id, overlong phrase) fall back to defaults.
 */
export function productQueryFromParams(params: URLSearchParams): Required<Omit<ProductQuery, 'categoryId'>> & {
  categoryId: string | undefined;
} {
  const status = params.get('status');
  const sort = params.get('sort');
  const perPage = Number(params.get('perPage'));
  const category = params.get('category');

  return {
    q: (params.get('q') ?? '').slice(0, MAX_QUERY_LENGTH),
    status: STATUSES.find((s) => s === status) ?? 'all',
    categoryId: category !== null && UUID.test(category) ? category : undefined,
    sort: SORTS.find((s) => s === sort) ?? 'newest',
    page: positiveInt(params.get('page'), 1, 1_000_000),
    perPage: PER_PAGE_OPTIONS.includes(perPage) ? perPage : DEFAULT_PER_PAGE,
  };
}

/** Builds "?q=…&status=…" leaving out default values. */
export function productQueryToSearch(query: ReturnType<typeof productQueryFromParams>): string {
  const params = new URLSearchParams();
  if (query.q !== '') params.set('q', query.q);
  if (query.status !== 'all') params.set('status', query.status);
  if (query.categoryId !== undefined) params.set('category', query.categoryId);
  if (query.sort !== 'newest') params.set('sort', query.sort);
  if (query.page !== 1) params.set('page', String(query.page));
  if (query.perPage !== DEFAULT_PER_PAGE) params.set('perPage', String(query.perPage));
  const search = params.toString();

  return search === '' ? '' : `?${search}`;
}
