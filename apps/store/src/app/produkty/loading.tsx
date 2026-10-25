import { Skeleton } from '@/components/ui/skeleton';
import { ProductGridSkeleton } from '@/components/catalog/product-grid';

export default function Loading() {
  return (
    <main className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="mt-8 h-14 w-80 max-w-full" />
      <div className="mt-8 grid gap-10 border-t pt-8 lg:grid-cols-[240px_1fr]">
        <div className="hidden flex-col gap-2 lg:flex">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-8" />
          ))}
        </div>
        <ProductGridSkeleton />
      </div>
    </main>
  );
}
