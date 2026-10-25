import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { catalog } from '@/catalog';
import type { Product } from '@/catalog/types';
import { CatalogBreadcrumbs } from '@/components/catalog/catalog-breadcrumbs';
import { ALL_PRODUCTS_HREF, categoryHref } from '@/components/catalog/category-tree';
import { productHref } from '@/components/catalog/product-card';
import { ProductDetails } from '@/components/catalog/product-details';
import { ProductGrid, ProductGridSkeleton } from '@/components/catalog/product-grid';
import imageLoader from '@/lib/image-loader';

// The product is loaded before anything streams, so an unknown slug answers HTTP 404;
// related products stream in behind a skeleton.

export async function generateMetadata({ params }: PageProps<'/produkt/[slug]'>): Promise<Metadata> {
  const product = await catalog.getProduct((await params).slug);
  if (!product) return {};

  return {
    title: product.name,
    description: product.description ?? `${product.name}: cena, dostępność i szczegóły produktu.`,
    alternates: { canonical: productHref(product.slug) },
    openGraph: {
      type: 'website',
      title: product.name,
      ...(product.image
        ? { images: [{ url: imageLoader({ src: product.image.url, width: 1200 }), alt: product.image.alt }] }
        : {}),
    },
  };
}

async function RelatedProducts({ product }: { product: Product }) {
  if (!product.category) return null;
  const related = await catalog.listProducts({ category: product.category.slug, sort: 'name', page: 1, perPage: 5 });
  const others = related.items.filter((item) => item.id !== product.id).slice(0, 4);
  if (others.length === 0) return null;

  return (
    <RelatedSection>
      <ProductGrid products={others} className="mt-8 lg:grid-cols-4" />
    </RelatedSection>
  );
}

function RelatedSection({ children }: { children: ReactNode }) {
  return (
    <section aria-labelledby="related-title" className="mt-24">
      <h2 id="related-title" className="font-display text-4xl tracking-tight">
        Z tej samej kategorii
      </h2>
      {children}
    </section>
  );
}

export default async function ProductPage({ params }: PageProps<'/produkt/[slug]'>) {
  const product = await catalog.getProduct((await params).slug);
  if (!product) notFound();

  const category = product.category ? await catalog.getCategory(product.category.slug) : null;
  const trail = [
    { label: 'Wszystkie produkty', href: ALL_PRODUCTS_HREF },
    ...(category ? [...category.ancestors, category] : []).map((ref) => ({ label: ref.name, href: categoryHref(ref.slug) })),
  ];

  return (
    <main className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
      <CatalogBreadcrumbs trail={trail} current={product.name} />
      <div className="mt-8">
        <ProductDetails product={product} />
      </div>
      <Suspense
        fallback={
          <RelatedSection>
            <ProductGridSkeleton count={4} className="mt-8 lg:grid-cols-4" />
          </RelatedSection>
        }
      >
        <RelatedProducts product={product} />
      </Suspense>
    </main>
  );
}
