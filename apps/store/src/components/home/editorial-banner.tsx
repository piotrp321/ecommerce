import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { CatalogImage } from '@/catalog/types';
import { ProductImage } from '@/components/catalog/product-image';
import { categoryHref } from '@/components/catalog/category-tree';
import { Button } from '@/components/ui/button';

interface EditorialBannerProps {
  categorySlug: string;
  eyebrow: string;
  title: string;
  text: string;
  image: CatalogImage;
}

export function EditorialBanner({ categorySlug, eyebrow, title, text, image }: EditorialBannerProps) {
  return (
    <section aria-labelledby="editorial-title" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="grid overflow-hidden rounded-[2rem] bg-secondary md:grid-cols-2">
        <ProductImage image={image} sizes="(min-width: 768px) 50vw, 100vw" className="aspect-[4/3] md:aspect-auto md:min-h-[420px]" />
        <div className="flex flex-col justify-center gap-4 p-8 sm:p-12">
          <p className="text-xs font-medium tracking-[0.18em] text-brand uppercase">{eyebrow}</p>
          <h2 id="editorial-title" className="font-display text-4xl tracking-tight sm:text-5xl">
            {title}
          </h2>
          <p className="max-w-md text-muted-foreground">{text}</p>
          <Button asChild className="mt-2 w-fit">
            <Link href={categoryHref(categorySlug)}>
              Zobacz kolekcję
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
