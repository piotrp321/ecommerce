import type { ProductQuery, ProductSort, ProductStatusFilter } from '../../api/types';

const STATUSES: readonly ProductStatusFilter[] = ['all', 'active', 'inactive'];
const SORTS: readonly ProductSort[] = ['newest', 'name', '-name', 'price', '-price'];
export const DEFAULT_PER_PAGE = 20;

function positiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = value === null ? Number.NaN : Number(value);

  return Number.isInteger(parsed) && parsed >= 1 ? Math.min(parsed, max) : fallback;
}

/** Reads the list state from the URL, so filters survive a reload and can be shared. */
export function productQueryFromParams(params: URLSearchParams): Required<Omit<ProductQuery, 'categoryId'>> & {
  categoryId: string | undefined;
} {
  const status = params.get('status');
  const sort = params.get('sort');

  return {
    q: params.get('q') ?? '',
    status: STATUSES.find((s) => s === status) ?? 'all',
    categoryId: params.get('category') ?? undefined,
    sort: SORTS.find((s) => s === sort) ?? 'newest',
    page: positiveInt(params.get('page'), 1, 1_000_000),
    perPage: positiveInt(params.get('perPage'), DEFAULT_PER_PAGE, 100),
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
