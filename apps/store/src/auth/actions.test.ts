// @vitest-environment node
import type { Auth } from '@/auth';
import { keys, sessionHash } from '@/auth/core/keys';
import { CrossOriginRequestError } from '@/auth/core/same-origin';
import { createHarness, signIn } from '@/test/auth-harness';
import type { Harness } from '@/test/auth-harness';
import { PUBLIC_ISSUER, STORE_ORIGIN } from '@/test/fake-oidc';

// The logout Server Action on mocked next/headers: CSRF/Origin (AC-5), RP-initiated
// logout (AC-4) and fail-open with Redis down.

interface CookieWrite {
  name: string;
  value: string;
  options: Record<string, unknown>;
}
const state: { auth: Auth | undefined; headers: Headers; cookies: Map<string, string>; writes: CookieWrite[] } = {
  auth: undefined,
  headers: new Headers(),
  cookies: new Map(),
  writes: [],
};

vi.mock('@/auth/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/auth/index')>()),
  getAuth: () => state.auth,
}));
vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(state.headers),
  cookies: () =>
    Promise.resolve({
      get: (name: string) => (state.cookies.has(name) ? { name, value: state.cookies.get(name) } : undefined),
      set: (name: string, value: string, options: Record<string, unknown>) => state.writes.push({ name, value, options }),
    }),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const { logout } = await import('./actions');

let harness: Harness;
let sessionId: string;
beforeEach(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  harness = await createHarness();
  state.auth = harness.auth;
  ({ sessionId } = await signIn(harness));
  state.cookies = new Map([['__Host-store_session', sessionId]]);
  state.writes = [];
});
afterEach(() => {
  vi.restoreAllMocks();
});

const redirectTarget = async (): Promise<URL> => {
  const error: unknown = await logout().catch((thrown: unknown) => thrown);
  const message = error instanceof Error ? error.message : '';
  if (!message.startsWith('NEXT_REDIRECT ')) throw error;
  return new URL(message.slice('NEXT_REDIRECT '.length), STORE_ORIGIN);
};

describe('logout (Server Action)', () => {
  it('removes the session, clears the cookie and redirects to end_session with id_token_hint', async () => {
    state.headers = new Headers({ origin: STORE_ORIGIN });

    const target = await redirectTarget();

    expect(`${target.origin}${target.pathname}`).toBe(`${PUBLIC_ISSUER}/protocol/openid-connect/logout`);
    expect(target.searchParams.get('id_token_hint')).toMatch(/^eyJ/);
    expect(target.searchParams.get('post_logout_redirect_uri')).toBe(`${STORE_ORIGIN}/`);
    expect(state.writes).toEqual([
      { name: '__Host-store_session', value: '', options: { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 } },
    ]);
    expect(await harness.replica().manager.getSession(sessionId)).toBeNull();
    expect(harness.redis.dump().filter((entry) => entry.key.startsWith('store:kcsid:'))).toEqual([]);
  });

  it('accepts a request without Origin marked Sec-Fetch-Site: same-origin', async () => {
    state.headers = new Headers({ 'sec-fetch-site': 'same-origin' });
    expect((await redirectTarget()).pathname).toBe('/realms/store/protocol/openid-connect/logout');
  });

  it.each([
    ['without Origin', {}],
    ['with a foreign Origin', { origin: 'https://evil.example' }],
    ['with the Host of the request as Origin', { origin: 'http://store:3000', host: 'store:3000' }],
  ])('is rejected %s and keeps the session and the cookie', async (_, headers: Record<string, string>) => {
    state.headers = new Headers(headers);

    await expect(logout()).rejects.toBeInstanceOf(CrossOriginRequestError);
    expect(state.writes).toEqual([]);
    expect(await harness.auth.manager.getSession(sessionId)).toEqual({ userId: 'user-1' });
  });

  it('with the session store down still clears the cookie and ends the Keycloak session by client_id (fail-open)', async () => {
    state.headers = new Headers({ origin: STORE_ORIGIN });
    harness.redis.setAvailable(false);

    const target = await redirectTarget();

    expect(target.searchParams.get('client_id')).toBe('store-bff');
    expect(target.searchParams.has('id_token_hint')).toBe(false);
    expect(state.writes.map((write) => [write.name, write.value, write.options.maxAge])).toEqual([['__Host-store_session', '', 0]]);
    // The record expires by its own TTL once Redis is back.
    harness.redis.setAvailable(true);
    expect(harness.redis.dump().find((entry) => entry.key === keys.session(sessionHash(sessionId)))?.ttlMs).toBeGreaterThan(0);
  });
});
