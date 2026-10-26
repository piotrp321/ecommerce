import type { Metadata, Viewport } from 'next';
import { Geist, Instrument_Serif } from 'next/font/google';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { catalog } from '@/catalog';
import { DemoNotice } from '@/components/layout/demo-notice';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import './globals.css';
import { requestSiteMetadata } from './site-metadata';

// Self-hosted by next/font (downloaded at build time, no requests to Google at runtime).
const sans = Geist({ subsets: ['latin', 'latin-ext'], variable: '--font-geist-sans' });
const display = Instrument_Serif({ subsets: ['latin', 'latin-ext'], weight: '400', variable: '--font-instrument-serif' });

export function generateMetadata(): Promise<Metadata> {
  return requestSiteMetadata();
}

export const viewport: Viewport = {
  themeColor: '#faf9f6',
};

// Every page, the 404 page included, is rendered per request: the catalog source and its
// demo labels come from the runtime environment, and `next build` never calls the backend.
export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  await connection();
  const categories = await catalog.listCategories();

  return (
    <html lang="pl" className={`${sans.variable} ${display.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#tresc"
          className="sr-only z-50 rounded-full bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Przejdź do treści
        </a>
        {catalog.isDemo ? <DemoNotice /> : null}
        <SiteHeader categories={categories} />
        <div id="tresc" className="flex-1">
          {children}
        </div>
        <SiteFooter categories={categories} isDemo={catalog.isDemo} />
      </body>
    </html>
  );
}
