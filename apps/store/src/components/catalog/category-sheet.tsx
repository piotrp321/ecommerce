'use client';

import { usePathname } from 'next/navigation';
import { useState, type MouseEvent, type ReactNode } from 'react';
import type { CategoryNode } from '@/catalog/types';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ALL_PRODUCTS_HREF, CategoryTree } from './category-tree';

/** Current category from the URL: its slug, `null` on all products, undefined elsewhere. */
export function activeSlugFromPath(pathname: string): string | null | undefined {
  if (pathname === ALL_PRODUCTS_HREF) return null;
  const match = /^\/kategoria\/([^/]+)$/.exec(pathname);
  return match?.[1];
}

interface CategorySheetProps {
  categories: CategoryNode[];
  /** The trigger button (rendered as is, via asChild). */
  trigger: ReactNode;
  side?: 'left' | 'right';
}

/** The category tree in a side panel, for small screens. Closes after choosing a link. */
export function CategorySheet({ categories, trigger, side = 'left' }: CategorySheetProps) {
  const [open, setOpen] = useState(false);
  const activeSlug = activeSlugFromPath(usePathname());
  const closeOnLink = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest('a')) setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side={side}>
        <SheetHeader className="border-b">
          <SheetTitle>Kategorie</SheetTitle>
          <SheetDescription>Wybierz kategorię, aby zobaczyć jej produkty.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-3 pb-6" onClick={closeOnLink}>
          <CategoryTree categories={categories} activeSlug={activeSlug} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
