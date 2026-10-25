import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import type { ComponentProps } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// shadcn/ui pagination, with next/link for the page links.

function Pagination({ className, ...props }: ComponentProps<'nav'>) {
  return <nav data-slot="pagination" className={cn('mx-auto flex w-full justify-center', className)} {...props} />;
}

function PaginationContent({ className, ...props }: ComponentProps<'ul'>) {
  return <ul data-slot="pagination-content" className={cn('flex flex-row items-center gap-1', className)} {...props} />;
}

function PaginationItem(props: ComponentProps<'li'>) {
  return <li data-slot="pagination-item" {...props} />;
}

type PaginationLinkProps = { isActive?: boolean } & ComponentProps<typeof Link>;

function PaginationLink({ className, isActive, ...props }: PaginationLinkProps) {
  return (
    <Link
      aria-current={isActive ? 'page' : undefined}
      data-slot="pagination-link"
      data-active={isActive}
      className={cn(buttonVariants({ variant: isActive ? 'default' : 'ghost', size: 'icon' }), className)}
      {...props}
    />
  );
}

function PaginationPrevious({ className, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      rel="prev"
      className={cn(buttonVariants({ variant: 'ghost' }), 'gap-1 px-3', className)}
      {...props}
    >
      <ChevronLeft aria-hidden="true" />
      <span>Poprzednia</span>
    </Link>
  );
}

function PaginationNext({ className, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link rel="next" className={cn(buttonVariants({ variant: 'ghost' }), 'gap-1 px-3', className)} {...props}>
      <span>Następna</span>
      <ChevronRight aria-hidden="true" />
    </Link>
  );
}

function PaginationEllipsis({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span aria-hidden="true" data-slot="pagination-ellipsis" className={cn('flex size-10 items-center justify-center', className)} {...props}>
      <MoreHorizontal className="size-4" />
    </span>
  );
}

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
};
