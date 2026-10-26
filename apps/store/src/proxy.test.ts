// @vitest-environment node
import type { Auth } from '@/auth';
import { createAuth } from '@/auth';
import { createHarness } from '@/test/auth-harness';
import { STORE_ORIGIN } from '@/test/fake-oidc';

// The CSRF guard in front of Server Actions (logout): a clean 403, never an exception.

const state: { auth: Auth | undefined } = { auth: undefined };
vi.mock('@/auth/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/auth/index')>()),
  getAuth: () => state.auth,
}));

const { proxy, config } = await import('./proxy');

const post = (headers: Record<string, string>) =>
  new Request(`${STORE_ORIGIN}/konto`, { method: 'POST', headers: { 'next-action': 'abc', 'content-type': 'text/plain;charset=UTF-8', ...headers }, body: '[]' });

beforeEach(async () => {
  state.auth = (await createHarness()).auth;
});

describe('proxy (Server Action Origin check)', () => {
  it.each([
    ['Origin: null (sandboxed frame)', { origin: 'null' }],
    ['an unparseable Origin', { origin: 'not a url' }],
    ['a foreign Origin', { origin: 'https://evil.example' }],
    ['no Origin and no Sec-Fetch-Site', {}],
    ['a no-JS form post from another site', { origin: 'https://evil.example', 'content-type': 'multipart/form-data; boundary=x' }],
  ])('rejects %s with 403 and does not throw', async (_, headers: Record<string, string>) => {
    const response = proxy(post(headers));

    expect(response?.status).toBe(403);
    expect(response?.headers.get('cache-control')).toBe('no-store');
    expect(await response?.text()).toBe('Forbidden');
  });

  it('lets same-origin requests through to Next.js', () => {
    expect(proxy(post({ origin: STORE_ORIGIN }))).toBeUndefined();
    expect(proxy(post({ 'sec-fetch-site': 'same-origin' }))).toBeUndefined();
  });

  it('does not touch safe methods (catalog pages, links from other sites)', () => {
    expect(proxy(new Request(`${STORE_ORIGIN}/produkty`, { headers: { origin: 'https://evil.example' } }))).toBeUndefined();
  });

  it('leaves the check to Next.js when login is disabled', () => {
    state.auth = createAuth({ STORE_AUTH_MODE: 'disabled', STORE_ENVIRONMENT: 'test' });
    expect(proxy(post({ origin: 'null' }))).toBeUndefined();
  });

  it('does not run for the back-channel logout, /healthz and static files', () => {
    const [matcher = ''] = config.matcher;
    const pattern = new RegExp(`^${matcher}$`);
    expect(pattern.test('/konto')).toBe(true);
    expect(pattern.test('/')).toBe(true);
    expect(pattern.test('/auth/callback')).toBe(true);
    expect(pattern.test('/auth/backchannel-logout')).toBe(false);
    expect(pattern.test('/healthz')).toBe(false);
    expect(pattern.test('/_next/static/chunk.js')).toBe(false);
  });
});
