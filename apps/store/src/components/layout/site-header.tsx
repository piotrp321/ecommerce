import { Menu, UserRound } from 'lucide-react';
import Link from 'next/link';
import type { CategoryNode } from '@/catalog/types';
import { CategorySheet } from '@/components/catalog/category-sheet';
import { ALL_PRODUCTS_HREF, categoryHref } from '@/components/catalog/category-tree';
import { Button } from '@/components/ui/button';

interface SiteHeaderProps {
  categories: CategoryNode[];
  /** From the presence of the session cookie only; null when login is disabled (no link). */
  signedIn: boolean | null;
}

/** Login starts in a Route Handler that redirects to Keycloak: a plain link, never prefetched. */
export const LOGIN_HREF = '/logowanie?powrot=%2Fkonto';
export const ACCOUNT_HREF = '/konto';

const navLinkClass =
  'rounded-full px-3 py-2 text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50';

export function SiteHeader({ categories, signedIn }: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <CategorySheet
          categories={categories}
          trigger={
            <Button variant="ghost" size="icon" className="-ml-2 lg:hidden" aria-label="Otwórz menu kategorii">
              <Menu className="size-5" aria-hidden="true" />
            </Button>
          }
        />
        <Link
          href="/"
          className="rounded-md font-display text-[28px] leading-none tracking-tight outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          Sklep<span className="text-brand">.</span>
        </Link>
        <nav aria-label="Główna" className="ml-auto hidden lg:block">
          <ul className="flex items-center gap-1">
            {categories.map((category) => (
              <li key={category.id}>
                <Link href={categoryHref(category.slug)} className={navLinkClass}>
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <Button asChild size="sm" variant="outline" className="ml-auto lg:ml-2">
          <Link href={ALL_PRODUCTS_HREF}>Wszystkie produkty</Link>
        </Button>
        {signedIn === null ? null : (
          <Button asChild size="sm" variant="ghost">
            {signedIn ? (
              <Link href={ACCOUNT_HREF} prefetch={false}>
                <UserRound aria-hidden="true" />
                Moje konto
              </Link>
            ) : (
              <a href={LOGIN_HREF}>
                <UserRound aria-hidden="true" />
                Zaloguj
              </a>
            )}
          </Button>
        )}
      </div>
    </header>
  );
}
