import { Compass } from 'lucide-react';
import Link from 'next/link';
import { ALL_PRODUCTS_HREF } from '@/components/catalog/category-tree';
import { EmptyState } from '@/components/catalog/empty-state';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <EmptyState
        icon={Compass}
        title="Nie znaleźliśmy tej strony"
        description="Produkt lub kategoria mogły zostać usunięte albo adres jest niepoprawny."
        action={
          <>
            <Button asChild>
              <Link href={ALL_PRODUCTS_HREF}>Przeglądaj produkty</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/">Strona główna</Link>
            </Button>
          </>
        }
      />
    </main>
  );
}
