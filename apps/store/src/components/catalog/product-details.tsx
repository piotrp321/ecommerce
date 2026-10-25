import { Info } from 'lucide-react';
import Link from 'next/link';
import type { Product } from '@/catalog/types';
import { Availability } from './availability';
import { categoryHref } from './category-tree';
import { Price } from './price';
import { ProductImage } from './product-image';

/** Main section of the product page: photo, name, gross price, availability and details. */
export function ProductDetails({ product }: { product: Product }) {
  return (
    <article className="grid gap-8 md:grid-cols-2 lg:gap-16">
      <figure className="flex flex-col gap-2">
        <ProductImage
          image={product.image}
          sizes="(min-width: 768px) 50vw, 100vw"
          loading="preload"
          className="aspect-square rounded-3xl"
        />
        {product.image ? (
          <figcaption className="text-xs text-muted-foreground">
            Zdjęcie poglądowe:{' '}
            <a href={product.image.sourceUrl} className="underline underline-offset-4 hover:text-foreground">
              Unsplash
            </a>
          </figcaption>
        ) : null}
      </figure>

      <div className="flex flex-col gap-6 md:py-4">
        <div className="flex flex-col gap-3">
          {product.category ? (
            <Link
              href={categoryHref(product.category.slug)}
              className="w-fit text-xs font-medium tracking-[0.18em] text-brand uppercase hover:underline"
            >
              {product.category.name}
            </Link>
          ) : null}
          <h1 className="font-display text-4xl leading-tight tracking-tight text-balance sm:text-5xl">{product.name}</h1>
        </div>

        <div className="flex flex-col gap-3 border-y py-6">
          <Price price={product.price} withVatNote className="text-3xl" />
          <Availability inStock={product.inStock} className="text-base" />
        </div>

        {product.description ? (
          <section aria-labelledby="description-title">
            <h2 id="description-title" className="text-sm font-semibold">
              Opis
            </h2>
            <p className="mt-2 leading-relaxed text-muted-foreground">{product.description}</p>
          </section>
        ) : null}

        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-2xl bg-secondary p-5 text-sm">
          <dt className="text-muted-foreground">Kategoria</dt>
          <dd>{product.category ? product.category.name : 'Bez kategorii'}</dd>
          <dt className="text-muted-foreground">Kod produktu</dt>
          <dd className="font-mono text-xs leading-5">{product.sku}</dd>
          <dt className="text-muted-foreground">Dostępność</dt>
          <dd>{product.inStock ? 'Dostępny' : 'Chwilowo niedostępny'}</dd>
        </dl>

        <p className="flex gap-3 rounded-2xl border p-4 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Zamawianie nie jest jeszcze dostępne: to demonstracyjna wersja sklepu, a koszyk powstanie w kolejnym etapie.
        </p>
      </div>
    </article>
  );
}
