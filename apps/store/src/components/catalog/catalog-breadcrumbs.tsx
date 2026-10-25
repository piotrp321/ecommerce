import Link from 'next/link';
import { Fragment } from 'react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

export interface Crumb {
  label: string;
  href: string;
}

interface CatalogBreadcrumbsProps {
  /** Links above the current page, after "Strona główna". */
  trail: Crumb[];
  current: string;
}

export function CatalogBreadcrumbs({ trail, current }: CatalogBreadcrumbsProps) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {[{ label: 'Strona główna', href: '/' }, ...trail].map((crumb) => (
          <Fragment key={crumb.href}>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href={crumb.href}>{crumb.label}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
          </Fragment>
        ))}
        <BreadcrumbItem>
          <BreadcrumbPage>{current}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
