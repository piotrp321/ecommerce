import { PackageOpen, SearchX, SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { ListingParams, SortParam } from '@/catalog/query';
import type { CategoryNode, CategoryRef, ProductPage } from '@/catalog/types';
import { Button } from '@/components/ui/button';
import { CatalogBreadcrumbs, type Crumb } from './catalog-breadcrumbs';
import { CatalogPagination } from './catalog-pagination';
import { CategorySheet } from './category-sheet';
import { ALL_PRODUCTS_HREF, CategoryTree, categoryHref } from './category-tree';
import { EmptyState } from './empty-state';
import { ProductGrid } from './product-grid';
import { SortOptions } from './sort-options';

export function productCountLabel(count: number): string {
  const last = count % 10;
  const lastTwo = count % 100;
  if (count === 1) return '1 produkt';
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${String(count)} produkty`;
  return `${String(count)} produktów`;
}

interface ListingLayoutProps {
  title: string;
  pathname: string;
  trail: Crumb[];
  categories: CategoryNode[];
  /** Current category slug, `null` for all products. */
  activeSlug: string | null;
  subcategories: CategoryRef[];
  sort: SortParam;
  /** The results (or their loading skeleton). */
  children: ReactNode;
}

/** Frame of a listing page (all products or one category): heading, category tree and sorting. */
export function ListingLayout({
  title,
  pathname,
  trail,
  categories,
  activeSlug,
  subcategories,
  sort,
  children,
}: ListingLayoutProps) {
  return (
    <main className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
      <CatalogBreadcrumbs trail={trail} current={title} />
      <header className="mt-6 flex flex-col gap-5 border-b pb-8">
        <h1 className="font-display text-5xl tracking-tight sm:text-6xl">{title}</h1>
        {subcategories.length > 0 ? (
          <nav aria-label="Podkategorie">
            <ul className="flex flex-wrap gap-2">
              {subcategories.map((sub) => (
                <li key={sub.id}>
                  <Button asChild variant="secondary" size="sm">
                    <Link href={categoryHref(sub.slug)}>{sub.name}</Link>
                  </Button>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[240px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <CategoryTree categories={categories} activeSlug={activeSlug} />
          </div>
        </aside>

        <section aria-label="Produkty" className="min-w-0">
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <CategorySheet
              categories={categories}
              trigger={
                <Button variant="outline" size="sm" className="shrink-0 sm:h-9 lg:hidden">
                  <SlidersHorizontal aria-hidden="true" />
                  Kategorie
                </Button>
              }
            />
            <SortOptions pathname={pathname} current={sort} />
          </div>
          {children}
        </section>
      </div>
    </main>
  );
}

interface ListingResultsProps {
  pathname: string;
  params: ListingParams;
  result: ProductPage;
}

/** One page of products with pagination, or the matching empty state. */
export function ListingResults({ pathname, params, result }: ListingResultsProps) {
  if (result.totalItems === 0) {
    return (
      <EmptyState
        icon={PackageOpen}
        title="Brak produktów"
        description="W tej kategorii nie ma jeszcze produktów. Zajrzyj do innych kategorii albo przejrzyj cały katalog."
        action={
          <Button asChild>
            <Link href={ALL_PRODUCTS_HREF}>Wszystkie produkty</Link>
          </Button>
        }
      />
    );
  }

  if (result.items.length === 0) {
    return (
      <EmptyState
        icon={SearchX}
        title="Nie ma takiej strony"
        description="Wybrana strona wykracza poza listę wyników."
        action={
          <Button asChild>
            <Link href={pathname}>Wróć do pierwszej strony</Link>
          </Button>
        }
      />
    );
  }

  return (
    <>
      <p className="mb-6 text-sm text-muted-foreground">
        {productCountLabel(result.totalItems)}
        {result.totalPages > 1 ? ` · strona ${String(result.page)} z ${String(result.totalPages)}` : null}
      </p>
      <ProductGrid products={result.items} priorityCount={3} />
      <div className="mt-14">
        <CatalogPagination pathname={pathname} sort={params.sort} page={result.page} totalPages={result.totalPages} />
      </div>
    </>
  );
}
