import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import type { CatalogImage, CategoryNode } from '@/catalog/types';
import { ProductImage } from '@/components/catalog/product-image';
import { categoryHref } from '@/components/catalog/category-tree';
import { SectionHeading } from './section-heading';

interface CategoryShowcaseProps {
  categories: CategoryNode[];
  visuals: Record<string, { image: CatalogImage; tagline: string } | undefined>;
}

export function CategoryShowcase({ categories, visuals }: CategoryShowcaseProps) {
  return (
    <section id="kategorie" aria-labelledby="kategorie-title" className="mx-auto max-w-7xl scroll-mt-24 px-4 sm:px-6 lg:px-8">
      <SectionHeading id="kategorie-title" eyebrow="Kategorie" title="Znajdź swój styl" />
      <ul className="mt-8 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
        {categories.map((category) => {
          const visual = visuals[category.slug];
          return (
            <li key={category.id}>
              <Link
                href={categoryHref(category.slug)}
                className="group relative block overflow-hidden rounded-2xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <ProductImage
                  image={visual?.image ?? null}
                  sizes="(min-width: 1024px) 25vw, 50vw"
                  className="aspect-[3/4]"
                  imageClassName="transition-transform duration-700 ease-out group-hover:scale-105 motion-reduce:transition-none"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" aria-hidden="true" />
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-4 text-white sm:p-5">
                  <div>
                    <h3 className="font-display text-2xl leading-tight sm:text-3xl">{category.name}</h3>
                    {visual ? <p className="mt-1 text-xs text-white/80 sm:text-sm">{visual.tagline}</p> : null}
                  </div>
                  <span className="hidden size-9 shrink-0 items-center justify-center rounded-full bg-white/15 backdrop-blur transition-colors group-hover:bg-white group-hover:text-foreground sm:flex">
                    <ArrowUpRight className="size-4" aria-hidden="true" />
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
