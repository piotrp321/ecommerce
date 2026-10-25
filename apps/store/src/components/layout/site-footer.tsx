import Link from 'next/link';
import type { CategoryNode } from '@/catalog/types';
import { ALL_PRODUCTS_HREF, categoryHref } from '@/components/catalog/category-tree';

interface SiteFooterProps {
  categories: CategoryNode[];
  /** The catalog is sample data (ADR-0006): the footer says so. */
  isDemo: boolean;
}

export function SiteFooter({ categories, isDemo }: SiteFooterProps) {
  return (
    <footer className="mt-24 border-t bg-card">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[2fr_1fr_1fr] lg:px-8">
        <div className="max-w-sm">
          <p className="font-display text-3xl">
            Sklep<span className="text-brand">.</span>
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            {isDemo
              ? 'Edukacyjny projekt e-commerce. Katalog jest demonstracyjny: produkty, ceny i dostępność są przykładowe.'
              : 'Edukacyjny projekt e-commerce.'}
          </p>
        </div>
        <nav aria-label="Kategorie w stopce">
          <h2 className="text-sm font-semibold">Kategorie</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
            {categories.map((category) => (
              <li key={category.id}>
                <Link href={categoryHref(category.slug)} className="hover:text-foreground">
                  {category.name}
                </Link>
              </li>
            ))}
            <li>
              <Link href={ALL_PRODUCTS_HREF} className="hover:text-foreground">
                Wszystkie produkty
              </Link>
            </li>
          </ul>
        </nav>
        <div>
          <h2 className="text-sm font-semibold">Zdjęcia</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            {isDemo ? 'Zdjęcia demonstracyjne' : 'Zdjęcia poglądowe'} pochodzą z{' '}
            <a href="https://unsplash.com" className="underline underline-offset-4 hover:text-foreground">
              Unsplash
            </a>{' '}
            i są używane zgodnie z{' '}
            <a href="https://unsplash.com/license" className="underline underline-offset-4 hover:text-foreground">
              licencją Unsplash
            </a>
            .
          </p>
        </div>
      </div>
      <div className="border-t">
        <p className="mx-auto max-w-7xl px-4 py-5 text-xs text-muted-foreground sm:px-6 lg:px-8">
          © {new Date().getFullYear()} Sklep · {isDemo ? 'projekt demonstracyjny' : 'projekt edukacyjny'}
        </p>
      </div>
    </footer>
  );
}
