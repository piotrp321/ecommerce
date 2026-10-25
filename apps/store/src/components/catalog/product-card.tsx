import Link from 'next/link';
import type { Product } from '@/catalog/types';
import { Badge } from '@/components/ui/badge';
import { Availability } from './availability';
import { Price } from './price';
import { ProductImage } from './product-image';

interface ProductCardProps {
  product: Product;
  /** Load the image eagerly (first row above the fold). */
  eager?: boolean;
}

export const productHref = (slug: string): string => `/produkt/${slug}`;

export function ProductCard({ product, eager = false }: ProductCardProps) {
  return (
    <article className="group relative flex w-full flex-col gap-4">
      <div className="relative">
        <ProductImage
          image={product.image}
          sizes="(min-width: 1280px) 22vw, (min-width: 768px) 30vw, 50vw"
          loading={eager ? 'eager' : 'lazy'}
          className="aspect-[4/5] rounded-2xl"
          imageClassName={
            'transition-transform duration-500 ease-out group-hover:scale-[1.04] motion-reduce:transition-none' +
            (product.inStock ? '' : ' opacity-80 grayscale-[35%]')
          }
        />
        {product.inStock ? null : (
          <Badge variant="outline" className="absolute top-3 left-3" aria-hidden="true">
            Niedostępny
          </Badge>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 px-0.5">
        {product.category ? (
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{product.category.name}</p>
        ) : null}
        <h3 className="text-[15px] leading-snug font-medium text-balance">
          <Link
            href={productHref(product.slug)}
            className="rounded-sm outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50"
          >
            {product.name}
          </Link>
        </h3>
        <div className="mt-auto flex flex-wrap items-end justify-between gap-x-3 gap-y-1 pt-1">
          <Price price={product.price} className="text-base" />
          <Availability inStock={product.inStock} compact className="text-xs" />
        </div>
      </div>
    </article>
  );
}
