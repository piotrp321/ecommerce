'use client';

import { useEffect } from 'react';
import './globals.css';

interface GlobalErrorProps {
  error: unknown;
  retry: () => void;
}

// Replaces the root layout when it fails (e.g. the category tree for the header cannot
// be loaded), so it renders its own <html> and <body>.
export default function GlobalError({ error, retry }: GlobalErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="pl">
      <body className="flex min-h-dvh items-center justify-center p-6">
        <main role="alert" className="max-w-md text-center">
          <h1 className="font-display text-4xl">Sklep jest chwilowo niedostępny</h1>
          <p className="mt-3 text-muted-foreground">Nie udało się wczytać strony. Spróbuj ponownie za chwilę.</p>
          <button
            type="button"
            onClick={retry}
            className="mt-6 inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Spróbuj ponownie
          </button>
        </main>
      </body>
    </html>
  );
}
