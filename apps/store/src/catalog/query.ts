import type { ProductQuery, ProductSort } from './types';

// Store URLs use Polish query parameters (?sortowanie=cena-rosnaco&strona=2); this module
// maps them to the API query and back. Invalid values fall back to the defaults.

export const PER_PAGE = 12;

export const sortOptions = [
  { value: 'nazwa', sort: 'name', label: 'Nazwa A–Z' },
  { value: 'cena-rosnaco', sort: 'price', label: 'Cena rosnąco' },
  { value: 'cena-malejaco', sort: '-price', label: 'Cena malejąco' },
] as const satisfies readonly { value: string; sort: ProductSort; label: string }[];

export type SortParam = (typeof sortOptions)[number]['value'];

export const DEFAULT_SORT: SortParam = 'nazwa';

export type SearchParams = Record<string, string | string[] | undefined>;

export interface ListingParams {
  sort: SortParam;
  page: number;
}

const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

export function parseListingParams(searchParams: SearchParams): ListingParams {
  const sortValue = first(searchParams.sortowanie);
  const sort = sortOptions.find((option) => option.value === sortValue)?.value ?? DEFAULT_SORT;
  const pageValue = first(searchParams.strona) ?? '';
  const page = /^[1-9]\d{0,5}$/.test(pageValue) ? Number(pageValue) : 1;

  return { sort, page };
}

export function toProductQuery({ sort, page }: ListingParams, category?: string): ProductQuery {
  const apiSort = sortOptions.find((option) => option.value === sort)?.sort ?? 'name';

  return { ...(category === undefined ? {} : { category }), sort: apiSort, page, perPage: PER_PAGE };
}

/** Link to a listing page; default values are left out so every page has one canonical URL. */
export function listingHref(pathname: string, { sort, page }: ListingParams): string {
  const params = new URLSearchParams();
  if (sort !== DEFAULT_SORT) params.set('sortowanie', sort);
  if (page > 1) params.set('strona', String(page));
  const query = params.toString();

  return query ? `${pathname}?${query}` : pathname;
}

/** A page number past the last page of results (page 1 of an empty listing is valid). */
export function isPastLastPage(page: number, totalPages: number): boolean {
  return page > Math.max(totalPages, 1);
}

/** Metadata of a listing page past the last one: not indexed and without a canonical URL. */
export const pastLastPageMetadata = {
  title: 'Nie ma takiej strony',
  robots: { index: false, follow: true },
} as const;
