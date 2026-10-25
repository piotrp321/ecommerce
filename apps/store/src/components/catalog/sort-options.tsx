import { ArrowDownUp } from 'lucide-react';
import Link from 'next/link';
import { listingHref, sortOptions, type SortParam } from '@/catalog/query';
import { cn } from '@/lib/utils';

interface SortOptionsProps {
  pathname: string;
  current: SortParam;
}

/** Sorting as plain links: works without JavaScript and every order has its own URL. */
export function SortOptions({ pathname, current }: SortOptionsProps) {
  return (
    <nav aria-labelledby="sort-label" className="flex min-w-0 items-center gap-3">
      <span id="sort-label" className="hidden items-center gap-1.5 text-sm text-muted-foreground sm:inline-flex">
        <ArrowDownUp className="size-4" aria-hidden="true" />
        Sortuj
      </span>
      <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 py-1 [scrollbar-width:none]">
        {sortOptions.map((option) => {
          const active = option.value === current;
          return (
            <li key={option.value} className="shrink-0">
              <Link
                href={listingHref(pathname, { sort: option.value, page: 1 })}
                aria-current={active ? 'true' : undefined}
                aria-label={`Sortuj: ${option.label}`}
                className={cn(
                  'inline-flex h-8 items-center rounded-full border px-3 text-[13px] transition-colors sm:h-9 sm:px-4 sm:text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-card text-foreground hover:border-foreground/30 hover:bg-accent',
                )}
              >
                {option.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
