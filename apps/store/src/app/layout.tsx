import type { Metadata, Viewport } from 'next';
import { Geist, Instrument_Serif } from 'next/font/google';
import type { ReactNode } from 'react';
import { catalog } from '@/catalog';
import { DemoNotice } from '@/components/layout/demo-notice';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import './globals.css';

// Self-hosted by next/font (downloaded at build time, no requests to Google at runtime).
const sans = Geist({ subsets: ['latin', 'latin-ext'], variable: '--font-geist-sans' });
const display = Instrument_Serif({ subsets: ['latin', 'latin-ext'], weight: '400', variable: '--font-instrument-serif' });

export const metadata: Metadata = {
  title: { default: 'Sklep', template: '%s · Sklep' },
  description: 'Sklep internetowy: elektronika, dom i wnętrze, kuchnia i akcesoria.',
  // Sample data must not end up in search engines as a real catalog.
  ...(catalog.isDemo ? { robots: { index: false, follow: false } } : {}),
};

export const viewport: Viewport = {
  themeColor: '#faf9f6',
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
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
        <SiteFooter categories={categories} />
      </body>
    </html>
  );
}
