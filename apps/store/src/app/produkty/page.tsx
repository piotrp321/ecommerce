import type { Metadata } from 'next';
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
import { ALL_PRODUCTS_HREF } from '@/components/catalog/category-tree';
import { ProductGridSkeleton } from '@/components/catalog/product-grid';
import { ListingLayout, ListingResults } from '@/components/catalog/product-listing';

export async function generateMetadata({ searchParams }: PageProps<'/produkty'>): Promise<Metadata> {
  const params = parseListingParams(await searchParams);
  const result = await catalog.listProducts(toProductQuery(params));
  if (isPastLastPage(params.page, result.totalPages)) return pastLastPageMetadata;

  return {
    title: params.page > 1 ? `Wszystkie produkty, strona ${String(params.page)}` : 'Wszystkie produkty',
    description: 'Wszystkie produkty sklepu: elektronika, dom i wnętrze, kuchnia i akcesoria.',
    alternates: { canonical: listingHref(ALL_PRODUCTS_HREF, params) },
  };
}

async function Results({ params }: { params: ListingParams }) {
  const result = await catalog.listProducts(toProductQuery(params));

  return <ListingResults pathname={ALL_PRODUCTS_HREF} params={params} result={result} />;
}

export default async function ProductsPage({ searchParams }: PageProps<'/produkty'>) {
  const params = parseListingParams(await searchParams);
  const categories = await catalog.listCategories();

  return (
    <ListingLayout
      title="Wszystkie produkty"
      pathname={ALL_PRODUCTS_HREF}
      trail={[]}
      categories={categories}
      activeSlug={null}
      subcategories={categories}
      sort={params.sort}
    >
      <Suspense key={`${params.sort}-${String(params.page)}`} fallback={<ProductGridSkeleton />}>
        <Results params={params} />
      </Suspense>
    </ListingLayout>
  );
}
