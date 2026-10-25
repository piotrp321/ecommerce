'use client';

import { RotateCcw, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { EmptyState } from '@/components/catalog/empty-state';
import { Button } from '@/components/ui/button';

interface ErrorPageProps {
  error: unknown;
  retry: () => void;
}

// Error boundary of every page below the root layout. Server error details are not
// shown (production sends only a digest); the user can retry or go back home.
export default function ErrorPage({ error, retry }: ErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <div role="alert">
        <EmptyState
          icon={TriangleAlert}
          title="Coś poszło nie tak"
          description="Nie udało się wczytać tej strony. Spróbuj ponownie za chwilę."
          action={
            <>
              <Button onClick={retry}>
                <RotateCcw aria-hidden="true" />
                Spróbuj ponownie
              </Button>
              <Button asChild variant="outline">
                <Link href="/">Strona główna</Link>
              </Button>
            </>
          }
        />
      </div>
    </main>
  );
}
