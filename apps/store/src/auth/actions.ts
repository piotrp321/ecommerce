'use server';

import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { AuthUnavailableError, SessionStoreUnavailableError } from './core/errors';
import { assertSameOrigin } from './core/same-origin';
import { getAuth } from './index';

/**
 * Logout (Server Action). Beyond the CSRF check of Next.js, `Origin` must be the public
 * origin of the store. The session and its index are removed, the cookie is cleared and
 * the browser goes to the RP-initiated logout of Keycloak with `id_token_hint`. With Redis
 * down the logout still ends the browser session (fail-open): the cookie is cleared and
 * Keycloak gets `client_id` instead of the ID token.
 */
export async function logout(): Promise<never> {
  const auth = getAuth();
  if (!auth.enabled) notFound();
  assertSameOrigin(await headers(), auth.publicOrigin);

  const jar = await cookies();
  const sessionId = jar.get(auth.cookies.session.name)?.value;
  let target: string;
  try {
    target = (await auth.manager.logout(sessionId)).href;
  } catch (error) {
    if (!(error instanceof AuthUnavailableError)) throw error;
    if (error instanceof SessionStoreUnavailableError) {
      console.warn('logout: session store unavailable, ending the browser session only');
      target = await auth.manager.fallbackLogoutUrl().then(
        (url) => url.href,
        () => '/',
      );
    } else {
      // Keycloak unreachable: the session is already removed here; its SSO session ends on expiry.
      console.warn('logout: OpenID Provider unavailable, the Keycloak session is not ended');
      target = '/';
    }
  } finally {
    jar.set(auth.cookies.session.name, '', { ...auth.cookies.session.options, maxAge: 0 });
  }
  redirect(target);
}
