import { LOGIN_TRANSACTION_MS, SESSION_ABSOLUTE_MS } from './core/session-manager';

export interface CookieSpec {
  name: string;
  options: { httpOnly: true; secure: boolean; sameSite: 'lax'; path: '/'; maxAge: number };
}

export interface AuthCookies {
  /** The only session cookie: an opaque id, never a token. */
  session: CookieSpec;
  /** `state` of the login in progress, until the callback. */
  login: CookieSpec;
}

/**
 * Over https (production) the cookies use the `__Host-` prefix: Secure, Path=/ and no
 * Domain, so a subdomain cannot set or read them. On http://localhost (development) the
 * browser would refuse `__Host-` and Secure cookies, so they have plain names there.
 */
export function authCookies(secure: boolean): AuthCookies {
  const prefix = secure ? '__Host-' : '';
  const options = (maxAgeMs: number) => ({ httpOnly: true as const, secure, sameSite: 'lax' as const, path: '/' as const, maxAge: Math.floor(maxAgeMs / 1000) });
  return {
    session: { name: `${prefix}store_session`, options: options(SESSION_ABSOLUTE_MS) },
    login: { name: `${prefix}store_login`, options: options(LOGIN_TRANSACTION_MS) },
  };
}
