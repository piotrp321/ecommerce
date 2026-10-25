import { listingHref, type SortParam } from '@/catalog/query';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';

interface CatalogPaginationProps {
  pathname: string;
  sort: SortParam;
  page: number;
  totalPages: number;
}

/** Page numbers to show: first, last and the neighbours of the current one; `null` is a gap. */
export function visiblePages(page: number, totalPages: number): (number | null)[] {
  const pages: (number | null)[] = [];
  for (let n = 1; n <= totalPages; n++) {
    if (n === 1 || n === totalPages || Math.abs(n - page) <= 1) {
      pages.push(n);
    } else if (pages.at(-1) !== null) {
      pages.push(null);
    }
  }
  return pages;
}

export function CatalogPagination({ pathname, sort, page, totalPages }: CatalogPaginationProps) {
  if (totalPages <= 1) return null;
  const href = (target: number) => listingHref(pathname, { sort, page: target });

  return (
    <Pagination aria-label="Strony wyników">
      <PaginationContent>
        {page > 1 ? (
          <PaginationItem>
            <PaginationPrevious href={href(page - 1)} />
          </PaginationItem>
        ) : null}
        {visiblePages(page, totalPages).map((n, index) => (
          <PaginationItem key={n ?? `gap-${String(index)}`} className={n === page ? undefined : 'max-sm:hidden'}>
            {n === null ? (
              <PaginationEllipsis />
            ) : (
              <PaginationLink href={href(n)} isActive={n === page} aria-label={`Strona ${String(n)}`}>
                {n}
              </PaginationLink>
            )}
          </PaginationItem>
        ))}
        {page < totalPages ? (
          <PaginationItem>
            <PaginationNext href={href(page + 1)} />
          </PaginationItem>
        ) : null}
      </PaginationContent>
    </Pagination>
  );
}
