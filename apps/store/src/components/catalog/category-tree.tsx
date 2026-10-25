import Link from 'next/link';
import type { CategoryNode } from '@/catalog/types';
import { cn } from '@/lib/utils';

export const categoryHref = (slug: string): string => `/kategoria/${slug}`;
export const ALL_PRODUCTS_HREF = '/produkty';

interface CategoryTreeProps {
  categories: CategoryNode[];
  /** Slug of the current category; `null` on the "all products" listing, undefined elsewhere. */
  activeSlug?: string | null;
  className?: string;
}

const linkClass =
  'flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-[current=page]:bg-primary aria-[current=page]:font-medium aria-[current=page]:text-primary-foreground';

function Branch({ nodes, activeSlug, depth }: { nodes: CategoryNode[]; activeSlug?: string | null; depth: number }) {
  return (
    <ul className={cn('flex flex-col gap-0.5', depth > 0 && 'mt-0.5 ml-3 border-l pl-2')}>
      {nodes.map((node) => (
        <li key={node.id}>
          <Link
            href={categoryHref(node.slug)}
            aria-current={node.slug === activeSlug ? 'page' : undefined}
            className={cn(linkClass, depth === 0 ? 'font-medium text-foreground' : 'text-muted-foreground')}
          >
            {node.name}
          </Link>
          {node.children.length > 0 ? <Branch nodes={node.children} activeSlug={activeSlug} depth={depth + 1} /> : null}
        </li>
      ))}
    </ul>
  );
}

/** The whole category tree as nested lists of links; the current category is marked. */
export function CategoryTree({ categories, activeSlug, className }: CategoryTreeProps) {
  return (
    <nav aria-label="Kategorie" className={className}>
      <ul className="flex flex-col gap-0.5">
        <li>
          <Link
            href={ALL_PRODUCTS_HREF}
            aria-current={activeSlug === null ? 'page' : undefined}
            className={cn(linkClass, 'font-medium text-foreground')}
          >
            Wszystkie produkty
          </Link>
        </li>
      </ul>
      <div className="mt-2 border-t pt-2">
        <Branch nodes={categories} activeSlug={activeSlug} depth={0} />
      </div>
    </nav>
  );
}
