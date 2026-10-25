import type { Metadata } from 'next';

/** Metadata of every page; sample data must not end up in search engines as a real catalog. */
export function siteMetadata(isDemo: boolean): Metadata {
  return {
    title: { default: 'Sklep', template: '%s · Sklep' },
    description: 'Sklep internetowy: elektronika, dom i wnętrze, kuchnia i akcesoria.',
    ...(isDemo ? { robots: { index: false, follow: false } } : {}),
  };
}
