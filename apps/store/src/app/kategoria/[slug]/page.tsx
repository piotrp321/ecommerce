import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { catalog } from '@/catalog';
import {
  isPastLastPage,
  listingHref,
  parseListingParams,
  pastLastPageMetadata,
  toProductQuery,
  type ListingParams,
} from '@/catalog/query';
import { ALL_PRODUCTS_HREF, categoryHref } from '@/components/catalog/category-tree';
import { ProductGridSkeleton } from '@/components/catalog/product-grid';
import { ListingLayout, ListingResults } from '@/components/catalog/product-listing';

// The category is checked before anything streams, so an unknown slug answers HTTP 404;
// only the product results stream in behind a skeleton.

export async function generateMetadata({ params, searchParams }: PageProps<'/kategoria/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const category = await catalog.getCategory(slug);
  if (!category) return {};
  const listing = parseListingParams(await searchParams);
  const result = await catalog.listProducts(toProductQuery(listing, category.slug));
  if (isPastLastPage(listing.page, result.totalPages)) return pastLastPageMetadata(catalog.isDemo);
  const path = [...category.ancestors.map((ancestor) => ancestor.name), category.name].join(' › ');

  return {
    title: listing.page > 1 ? `${category.name}, strona ${String(listing.page)}` : category.name,
    description: `Produkty z kategorii ${path}.`,
    alternates: { canonical: listingHref(categoryHref(category.slug), listing) },
  };
}

async function Results({ slug, params }: { slug: string; params: ListingParams }) {
  const result = await catalog.listProducts(toProductQuery(params, slug));

  return <ListingResults pathname={categoryHref(slug)} params={params} result={result} />;
}

export default async function CategoryPage({ params, searchParams }: PageProps<'/kategoria/[slug]'>) {
  const { slug } = await params;
  const [category, categories, listing] = await Promise.all([
    catalog.getCategory(slug),
    catalog.listCategories(),
    searchParams.then(parseListingParams),
  ]);
  if (!category) notFound();

  return (
    <ListingLayout
      title={category.name}
      pathname={categoryHref(category.slug)}
      trail={[
        { label: 'Wszystkie produkty', href: ALL_PRODUCTS_HREF },
        ...category.ancestors.map((ancestor) => ({ label: ancestor.name, href: categoryHref(ancestor.slug) })),
      ]}
      categories={categories}
      activeSlug={category.slug}
      subcategories={category.children}
      sort={listing.sort}
    >
      <Suspense key={`${listing.sort}-${String(listing.page)}`} fallback={<ProductGridSkeleton />}>
        <Results slug={category.slug} params={listing} />
      </Suspense>
    </ListingLayout>
  );
}
