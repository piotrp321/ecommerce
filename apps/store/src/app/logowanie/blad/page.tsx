import { TriangleAlert } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAuth } from '@/auth';
import { EmptyState } from '@/components/catalog/empty-state';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Logowanie nieudane', robots: { index: false, follow: false } };

// The callback sends here every failed login (cancelled at Keycloak, an expired or replayed
// attempt, a failed check). The reason stays in the server log.
export default function LoginErrorPage() {
  if (!getAuth().enabled) notFound();

  return (
    <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <EmptyState
        icon={TriangleAlert}
        title="Nie udało się zalogować"
        description="Logowanie zostało przerwane albo wygasło. Spróbuj zalogować się jeszcze raz."
        action={
          <>
            <Button asChild>
              {/* A Route Handler that redirects to Keycloak: a plain link, never prefetched. */}
              <a href="/logowanie">Zaloguj się ponownie</a>
            </Button>
            <Button asChild variant="outline">
              <Link href="/">Strona główna</Link>
            </Button>
          </>
        }
      />
    </main>
  );
}
