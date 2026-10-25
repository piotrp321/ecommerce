import type { Product } from '@/catalog/types';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ProductCard } from './product-card';

const gridClass = 'grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 md:grid-cols-3';

interface ProductGridProps {
  products: Product[];
  className?: string;
  /** Number of leading cards whose images load eagerly. */
  eagerCount?: number;
}

export function ProductGrid({ products, className, eagerCount = 0 }: ProductGridProps) {
  return (
    <ul className={cn(gridClass, className)}>
      {products.map((product, index) => (
        <li key={product.id} className="flex">
          <ProductCard product={product} eager={index < eagerCount} />
        </li>
      ))}
    </ul>
  );
}

export function ProductGridSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn(gridClass, className)}>
      <span className="sr-only">Ładowanie produktów…</span>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex flex-col gap-4" aria-hidden="true">
          <Skeleton className="aspect-[4/5] rounded-2xl" />
          <div className="flex flex-col gap-2 px-0.5">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
