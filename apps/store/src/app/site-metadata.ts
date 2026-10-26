import type { Metadata } from 'next';
import { connection } from 'next/server';
import { catalog } from '@/catalog';

/** Metadata of every page; sample data must not end up in search engines as a real catalog. */
export function siteMetadata(isDemo: boolean): Metadata {
  return {
    title: { default: 'Sklep', template: '%s · Sklep' },
    description: 'Sklep internetowy: elektronika, dom i wnętrze, kuchnia i akcesoria.',
    ...(isDemo ? { robots: { index: false, follow: false } } : {}),
  };
}

/**
 * Metadata of the root layout, decided per request: the catalog source (and so `robots`)
 * comes from the runtime environment, never from the one of `next build` (ADR-0009).
 */
export async function requestSiteMetadata(): Promise<Metadata> {
  await connection();
  return siteMetadata(catalog.isDemo);
}
