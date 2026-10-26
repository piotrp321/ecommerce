import { LogOut } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAccount } from '@/account/backend';
import { logout } from '@/auth/actions';
import { loginHref, requireSession } from '@/auth/session';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Moje konto', robots: { index: false, follow: false } };

const ACCOUNT_PATH = '/konto';

// Protected page: without a session the user is sent to the login and comes back here.
// With the session store down, or when the backend rejects the session even after a refresh
// (SessionRejectedError), this throws (error page, HTTP 500), never a redirect: with an
// active Keycloak session a redirect would loop. Rendered per request (no cache).
export default async function AccountPage() {
  await requireSession(ACCOUNT_PATH);
  const account = await getAccount();
  if (account === null) redirect(loginHref(ACCOUNT_PATH));

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="font-display text-4xl">Moje konto</h1>
      <dl className="mt-8 grid gap-4 rounded-3xl border bg-card p-6 sm:grid-cols-[max-content_1fr]">
        <dt className="text-muted-foreground">E-mail</dt>
        <dd>{account.email ?? 'nie podano'}</dd>
        <dt className="text-muted-foreground">Weryfikacja e-maila</dt>
        <dd>{account.emailVerified ? 'potwierdzony' : 'niepotwierdzony'}</dd>
        <dt className="text-muted-foreground">Identyfikator klienta</dt>
        <dd className="font-mono text-sm break-all">{account.id}</dd>
      </dl>
      <form action={logout} className="mt-8">
        <Button type="submit" variant="outline">
          <LogOut aria-hidden="true" />
          Wyloguj się
        </Button>
      </form>
    </main>
  );
}
