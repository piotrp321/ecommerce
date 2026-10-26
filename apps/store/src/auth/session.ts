import 'server-only';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import type { SessionView, TokenResult } from './core/session-manager';
import { LOGIN_PATH } from './handlers';
import { getAuth } from './index';

// Session of the current request for Server Components and Server Actions. Pages get a
// `SessionView` (no tokens); tokens stay on the server and are used only through
// `getAccessToken`/`withAccessToken`. Session data is per request: never put it in
// `use cache`, ISR or any other shared cache.

export type { SessionView } from './core/session-manager';

const sessionId = cache(async (): Promise<string | undefined> => {
  const auth = getAuth();
  if (!auth.enabled) return undefined;
  return (await cookies()).get(auth.cookies.session.name)?.value;
});

/**
 * Whether the browser sent a session cookie, for the header link ("Zaloguj" / "Moje
 * konto"); null when login is disabled. Reads no session store, so catalog pages never
 * depend on Redis.
 */
export async function hasSessionCookie(): Promise<boolean | null> {
  if (!getAuth().enabled) return null;
  return (await sessionId()) !== undefined;
}

/** The session of this request (once per render), or null. Throws AuthUnavailableError when Redis is down. */
export const getSession = cache(async (): Promise<SessionView | null> => {
  const auth = getAuth();
  if (!auth.enabled) return null;
  return auth.manager.getSession(await sessionId());
});

export function loginHref(returnTo: string): string {
  return `${LOGIN_PATH}?${new URLSearchParams({ powrot: returnTo }).toString()}`;
}

/** The session of a protected page; without one the user is sent to the login (404 when login is disabled). */
export async function requireSession(returnTo: string): Promise<SessionView> {
  if (!getAuth().enabled) notFound();
  const session = await getSession();
  if (session === null) redirect(loginHref(returnTo));
  return session;
}

export async function getAccessToken(): Promise<string | null> {
  const auth = getAuth();
  if (!auth.enabled) return null;
  return auth.manager.getAccessToken(await sessionId());
}

/** Calls the backend with the access token (one forced refresh on 401, see SessionManager). */
export async function withAccessToken<T>(call: (accessToken: string) => Promise<TokenResult<T>>): Promise<T | null> {
  const auth = getAuth();
  if (!auth.enabled) return null;
  return auth.manager.withAccessToken(await sessionId(), call);
}
