import { createAuth } from '@/auth';
import type { Auth } from '@/auth';
import { createMemoryRedis } from '@/auth/core/memory-redis';
import type { MemoryRedis } from '@/auth/core/memory-redis';
import { handleCallback, handleLogin } from '@/auth/handlers';
import { STORE_ORIGIN, createFakeIssuer, testAuthEnv } from './fake-oidc';
import type { FakeIssuer } from './fake-oidc';

export type EnabledAuth = Extract<Auth, { enabled: true }>;

export interface Harness {
  issuer: FakeIssuer;
  redis: MemoryRedis;
  clock: { now: number };
  /** A "replica": its own Auth (own discovery, own in-process state) on the shared Redis. */
  replica(): EnabledAuth;
  auth: EnabledAuth;
}

export async function createHarness(env: Record<string, string> = {}): Promise<Harness> {
  const issuer = await createFakeIssuer({ internal: (env.STORE_OIDC_INTERNAL_URL ?? 'set') !== '' });
  const clock = { now: Date.now() };
  const redis = createMemoryRedis(() => clock.now);
  const replica = () => {
    const auth = createAuth(testAuthEnv(env), { redis, fetch: issuer.fetch, now: () => clock.now });
    if (!auth.enabled) throw new Error('auth disabled');
    return auth;
  };
  return { issuer, redis, clock, replica, auth: replica() };
}

/** Set-Cookie headers of a response as name → raw header. */
export function setCookies(response: Response): Map<string, string> {
  return new Map(response.headers.getSetCookie().map((cookie) => [cookie.slice(0, cookie.indexOf('=')), cookie]));
}

export function cookieValue(response: Response, name: string): string | undefined {
  const raw = setCookies(response).get(name);
  if (raw === undefined) return undefined;
  return decodeURIComponent(raw.slice(name.length + 1, raw.indexOf(';')));
}

export const request = (path: string, init: RequestInit & { cookies?: Record<string, string> } = {}) => {
  const headers = new Headers(init.headers);
  if (init.cookies !== undefined) {
    headers.set(
      'cookie',
      Object.entries(init.cookies)
        .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
        .join('; '),
    );
  }
  // Like behind the edge: the Host of the request is not the public origin.
  return new Request(new URL(path, 'http://store:3000'), { ...init, headers });
};

/** Starts a login and returns the authorization URL and the login cookie. */
export async function startLogin(auth: EnabledAuth, returnTo?: string) {
  const response = await handleLogin(request(`/logowanie${returnTo === undefined ? '' : `?powrot=${encodeURIComponent(returnTo)}`}`), auth);
  const loginState = cookieValue(response, auth.cookies.login.name);
  return { response, authorizationUrl: new URL(response.headers.get('location') ?? ''), loginState };
}

/** The whole login: /logowanie → Keycloak → /auth/callback. Returns the session id. */
export async function signIn(harness: Harness, auth: EnabledAuth = harness.auth, user?: { sub?: string; sid?: string }) {
  const { authorizationUrl, loginState } = await startLogin(auth);
  const callbackUrl = harness.issuer.authorize(authorizationUrl, user);
  const response = await handleCallback(request(`${callbackUrl.pathname}${callbackUrl.search}`, { cookies: { [auth.cookies.login.name]: loginState ?? '' } }), auth);
  const sessionId = cookieValue(response, auth.cookies.session.name);
  if (sessionId === undefined) throw new Error(`login failed: ${String(response.status)} ${response.headers.get('location') ?? ''}`);
  return { sessionId, response };
}

export { STORE_ORIGIN };
