// @vitest-environment node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Auth } from '@/auth';
import { createAuth } from '@/auth';
import { SessionStoreUnavailableError } from '@/auth/core/errors';
import { createHarness, signIn } from '@/test/auth-harness';
import type { Harness } from '@/test/auth-harness';

// The session of a request in Server Components (src/auth/session.ts) on a mocked
// next/headers: one cookie jar per "request".

const state: { auth: Auth | undefined; cookies: Map<string, string> } = { auth: undefined, cookies: new Map() };

vi.mock('@/auth/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/auth/index')>()),
  getAuth: () => state.auth,
}));
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: (name: string) => (state.cookies.has(name) ? { name, value: state.cookies.get(name) } : undefined) }),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const session = await import('./session');

let harness: Harness;
beforeEach(async () => {
  harness = await createHarness();
  state.auth = harness.auth;
  state.cookies = new Map();
});

describe('hasSessionCookie (header link)', () => {
  it('follows the cookie only and never reads the session store', async () => {
    harness.redis.setAvailable(false);

    expect(await session.hasSessionCookie()).toBe(false);
    state.cookies.set('__Host-store_session', 'anything');
    expect(await session.hasSessionCookie()).toBe(true);
  });

  it('is null when login is disabled (no link at all)', async () => {
    state.auth = createAuth({ STORE_AUTH_MODE: 'disabled', STORE_ENVIRONMENT: 'test' });
    expect(await session.hasSessionCookie()).toBeNull();
  });
});

describe('requireSession', () => {
  it('returns the session view (no tokens) of the cookie', async () => {
    const { sessionId } = await signIn(harness, harness.auth, { sub: 'anna' });
    state.cookies.set('__Host-store_session', sessionId);

    const view = await session.requireSession('/konto');

    expect(view).toEqual({ userId: 'anna' });
    expect(JSON.stringify(view)).not.toMatch(/at-|rt-|eyJ/);
  });

  it('sends a visitor without a session to the login and back', async () => {
    await expect(session.requireSession('/konto')).rejects.toThrow('NEXT_REDIRECT /logowanie?powrot=%2Fkonto');
    state.cookies.set('__Host-store_session', 'expired-or-unknown');
    await expect(session.requireSession('/konto')).rejects.toThrow('NEXT_REDIRECT /logowanie?powrot=%2Fkonto');
  });

  it('with the session store down throws (error page) instead of redirecting: no redirect loop', async () => {
    const { sessionId } = await signIn(harness);
    state.cookies.set('__Host-store_session', sessionId);
    harness.redis.setAvailable(false);

    await expect(session.requireSession('/konto')).rejects.toBeInstanceOf(SessionStoreUnavailableError);
  });

  it('is 404 when login is disabled', async () => {
    state.auth = createAuth({ STORE_AUTH_MODE: 'disabled', STORE_ENVIRONMENT: 'test' });
    await expect(session.requireSession('/konto')).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

describe('two sessions in consecutive requests', () => {
  it('each request sees only the data of its own cookie', async () => {
    const anna = await signIn(harness, harness.auth, { sub: 'anna', sid: 'kc-a' });
    const jan = await signIn(harness, harness.auth, { sub: 'jan', sid: 'kc-j' });

    state.cookies = new Map([['__Host-store_session', anna.sessionId]]);
    expect(await session.getSession()).toEqual({ userId: 'anna' });
    expect(await session.getAccessToken()).toBe('at-1');

    state.cookies = new Map([['__Host-store_session', jan.sessionId]]);
    expect(await session.getSession()).toEqual({ userId: 'jan' });
    expect(await session.getAccessToken()).toBe('at-2');

    state.cookies = new Map();
    expect(await session.getSession()).toBeNull();
    expect(await session.getAccessToken()).toBeNull();
  });
});

describe('caching of session data', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : [path];
    });

  it('no source uses `use cache`, revalidate or unstable_cache (session data must never be shared)', () => {
    const offenders = files(resolve(process.cwd(), 'src'))
      .filter((path) => /\.tsx?$/.test(path) && !path.endsWith('.test.ts') && !path.endsWith('.test.tsx'))
      .filter((path) => /['"]use cache|export const revalidate|unstable_cache|cacheLife/.test(readFileSync(path, 'utf8')));

    expect(offenders).toEqual([]);
  });

  it('the account page reads the session per request (dynamic: cookies, no static export)', () => {
    const page = readFileSync(resolve(process.cwd(), 'src/app/konto/page.tsx'), 'utf8');
    expect(page).toContain("requireSession(ACCOUNT_PATH)");
    expect(page).not.toMatch(/generateStaticParams|force-static/);
  });
});
