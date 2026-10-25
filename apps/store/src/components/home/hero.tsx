import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { CatalogImage } from '@/catalog/types';
import { ALL_PRODUCTS_HREF } from '@/components/catalog/category-tree';
import { Button } from '@/components/ui/button';

export function Hero({ image }: { image: CatalogImage }) {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
      <div className="relative isolate overflow-hidden rounded-[2rem] bg-primary text-primary-foreground">
        <Image
          src={image.url}
          alt={image.alt}
          fill
          preload
          sizes="(min-width: 1280px) 1216px, 100vw"
          className="-z-10 object-cover"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/45 to-black/10 sm:bg-gradient-to-r sm:from-black/70 sm:via-black/40 sm:to-black/5" aria-hidden="true" />
        <div
          className="flex min-h-[460px] max-w-2xl flex-col justify-end gap-5 p-7 sm:min-h-[540px] sm:p-12 lg:p-16 [&>h1]:font-display [&>h1]:text-7xl [&>h1]:leading-[0.9] [&>h1]:tracking-tight sm:[&>h1]:text-8xl lg:[&>h1]:text-9xl"
        >
          <p className="w-fit rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-medium tracking-wide uppercase backdrop-blur">
            Kolekcja demonstracyjna
          </p>
          <h1>Sklep</h1>
          <p className="max-w-lg text-lg text-white/85 sm:text-xl">
            Przedmioty do domu, pracy i codziennych rytuałów. Prosta forma, dobre materiały, uczciwe ceny brutto.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button asChild size="lg" className="bg-white text-foreground hover:bg-white/90">
              <Link href={ALL_PRODUCTS_HREF}>
                Przeglądaj produkty
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              <Link href="#kategorie">Zobacz kategorie</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
