import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { catalog } from '@/catalog';
import { ALL_PRODUCTS_HREF } from '@/components/catalog/category-tree';
import { ProductGrid } from '@/components/catalog/product-grid';
import { CategoryShowcase } from '@/components/home/category-showcase';
import { EditorialBanner } from '@/components/home/editorial-banner';
import { Hero } from '@/components/home/hero';
import { SectionHeading } from '@/components/home/section-heading';
import { ValueProps } from '@/components/home/value-props';
import { Button } from '@/components/ui/button';
import { categoryVisuals, heroImage } from '@/content/home';
import { loadHomeData } from '@/content/load-home';

// Rendered on the server for every request (SSR): the catalog is request-time data.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const { categories, featured, banner } = await loadHomeData(catalog);

  return (
    <main className="flex flex-col gap-20 pb-4 sm:gap-24 [&>section]:w-full">
      <Hero image={heroImage} isDemo={catalog.isDemo} />
      <ValueProps />
      {categories.length > 0 ? <CategoryShowcase categories={categories} visuals={categoryVisuals} /> : null}
      {featured.length > 0 ? (
        <section aria-labelledby="featured-title" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            id="featured-title"
            eyebrow="Wybrane produkty"
            title="Polecamy"
            action={
              <Button asChild variant="outline">
                <Link href={ALL_PRODUCTS_HREF}>
                  Wszystkie produkty
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            }
          />
          <ProductGrid products={featured} className="mt-8 lg:grid-cols-4" />
        </section>
      ) : null}
      {banner ? <EditorialBanner {...banner} /> : null}
    </main>
  );
}
