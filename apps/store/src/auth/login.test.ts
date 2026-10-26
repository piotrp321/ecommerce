// @vitest-environment node
import { createHash } from 'node:crypto';
import { createAuth } from '@/auth';
import { keys, sessionHash } from '@/auth/core/keys';
import { handleCallback, handleLogin } from '@/auth/handlers';
import { cookieValue, createHarness, request, setCookies, signIn, startLogin } from '@/test/auth-harness';
import { INTERNAL_ISSUER, PUBLIC_ISSUER, STORE_ORIGIN } from '@/test/fake-oidc';

// Login of the BFF (authorization code flow, confidential client, PKCE S256) against the
// real openid-client and a fake Keycloak (AC-1, AC-2).

const callbackRequest = (url: URL, cookies: Record<string, string>) => request(`${url.pathname}${url.search}`, { cookies });

describe('GET /logowanie', () => {
  it('redirects (303) to the public authorization endpoint with state, nonce and PKCE S256', async () => {
    const { auth, redis } = await createHarness();

    const { response, authorizationUrl, loginState } = await startLogin(auth, '/produkty?strona=2');

    expect(response.status).toBe(303);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(`${authorizationUrl.origin}${authorizationUrl.pathname}`).toBe(`${PUBLIC_ISSUER}/protocol/openid-connect/auth`);
    const params = authorizationUrl.searchParams;
    expect(params.get('client_id')).toBe('store-bff');
    expect(params.get('response_type')).toBe('code');
    expect(params.get('scope')).toBe('openid');
    expect(params.get('redirect_uri')).toBe(`${STORE_ORIGIN}/auth/callback`);
    expect(params.get('code_challenge_method')).toBe('S256');
    expect(params.get('state')).toMatch(/^[\w-]{43}$/);
    expect(params.get('nonce')).toMatch(/^[\w-]{43}$/);
    expect(loginState).toBe(params.get('state'));

    // The transaction is in Redis under the state, for 10 minutes; the verifier matches the challenge.
    const [transaction] = redis.dump().filter((entry) => entry.key === keys.transaction(loginState ?? ''));
    expect(transaction?.ttlMs).toBe(600_000);
    const stored = JSON.parse(transaction?.value as string) as { codeVerifier: string; returnTo: string };
    expect(createHash('sha256').update(stored.codeVerifier).digest('base64url')).toBe(params.get('code_challenge'));
    expect(stored.returnTo).toBe('/produkty?strona=2');
  });

  it('sets the login cookie as __Host-store_login: HttpOnly, Secure, SameSite=Lax, Path=/, 10 minutes', async () => {
    const { auth } = await createHarness();
    const { response } = await startLogin(auth);

    const cookie = setCookies(response).get('__Host-store_login') ?? '';
    expect(cookie.split('; ').slice(1)).toEqual(['Path=/', 'Max-Age=600', 'HttpOnly', 'Secure', 'SameSite=Lax']);
    expect([...setCookies(response).keys()]).toEqual(['__Host-store_login']);
  });

  it('uses the internal address for discovery and never the public one from the server', async () => {
    const { auth, issuer } = await createHarness();
    await startLogin(auth);

    expect(issuer.requests).toEqual([`${INTERNAL_ISSUER}/.well-known/openid-configuration`]);
  });
});

describe('GET /auth/callback', () => {
  it('creates a new session, sets only the session cookie and returns to the page of the login', async () => {
    const harness = await createHarness();
    const { auth } = harness;
    const { authorizationUrl, loginState = '' } = await startLogin(auth, '/produkty');
    const callbackUrl = harness.issuer.authorize(authorizationUrl, { sub: 'customer-7', sid: 'kc-7' });

    const response = await handleCallback(callbackRequest(callbackUrl, { '__Host-store_login': loginState }), auth);

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`${STORE_ORIGIN}/produkty`);
    const sessionCookie = setCookies(response).get('__Host-store_session') ?? '';
    expect(sessionCookie.split('; ').slice(1)).toEqual(['Path=/', 'Max-Age=43200', 'HttpOnly', 'Secure', 'SameSite=Lax']);
    expect(setCookies(response).get('__Host-store_login')).toContain('Max-Age=0');
    const sessionId = cookieValue(response, '__Host-store_session') ?? '';
    expect(sessionId).toMatch(/^[\w-]{43}$/);
    expect(await auth.manager.getSession(sessionId)).toEqual({ userId: 'customer-7' });
    // Exchange at the internal token endpoint with the PKCE verifier.
    expect(harness.issuer.tokenRequests).toHaveLength(1);
    expect(harness.issuer.tokenRequests[0]?.get('code_verifier')).toMatch(/^[\w-]{43}$/);
  });

  it('never sends a token to the browser: not in cookies, headers or the body', async () => {
    const harness = await createHarness();
    const { response } = await signIn(harness);

    const exposed = [...response.headers.values()].join('\n') + (await response.text());
    expect(exposed).not.toMatch(/at-\d|rt-\d|eyJ/);
  });

  it('gives a new session id on every login, also when the browser had a session before', async () => {
    const harness = await createHarness();
    const { auth } = harness;
    const first = await signIn(harness);
    const { authorizationUrl, loginState = '' } = await startLogin(auth);
    const callbackUrl = harness.issuer.authorize(authorizationUrl);

    const response = await handleCallback(callbackRequest(callbackUrl, { '__Host-store_login': loginState, '__Host-store_session': first.sessionId }), auth);

    const second = cookieValue(response, '__Host-store_session');
    expect(second).toBeDefined();
    expect(second).not.toBe(first.sessionId);
    expect(await auth.manager.getSession(first.sessionId)).toBeNull();
  });

  describe('rejects the response and creates no session', () => {
    function expectRejected(harness: Awaited<ReturnType<typeof createHarness>>, response: Response, tokenRequests = 0) {
      expect(response.status).toBe(303);
      expect(response.headers.get('location')).toBe(`${STORE_ORIGIN}/logowanie/blad`);
      expect(setCookies(response).has('__Host-store_session')).toBe(false);
      expect(harness.redis.dump().filter((entry) => entry.key.startsWith('store:sess:'))).toEqual([]);
      expect(harness.issuer.tokenRequests).toHaveLength(tokenRequests);
    }

    it('without the login cookie', async () => {
      const harness = await createHarness();
      const { authorizationUrl } = await startLogin(harness.auth);
      const response = await handleCallback(callbackRequest(harness.issuer.authorize(authorizationUrl), {}), harness.auth);
      expectRejected(harness, response);
    });

    it('when state differs from the login cookie (a login started in another browser)', async () => {
      const harness = await createHarness();
      const victim = await startLogin(harness.auth);
      const attacker = await startLogin(harness.auth);
      const response = await handleCallback(
        callbackRequest(harness.issuer.authorize(attacker.authorizationUrl), { '__Host-store_login': victim.loginState ?? '' }),
        harness.auth,
      );
      expectRejected(harness, response);
    });

    it('when the transaction was already used (replayed callback)', async () => {
      const harness = await createHarness();
      const { authorizationUrl, loginState = '' } = await startLogin(harness.auth);
      const callbackUrl = harness.issuer.authorize(authorizationUrl);
      await handleCallback(callbackRequest(callbackUrl, { '__Host-store_login': loginState }), harness.auth);
      await harness.redis.del(harness.redis.dump().map((entry) => entry.key));

      const replay = await handleCallback(callbackRequest(callbackUrl, { '__Host-store_login': loginState }), harness.auth);
      expectRejected(harness, replay, 1);
    });

    it('without the iss parameter (RFC 9207)', async () => {
      const harness = await createHarness();
      const { authorizationUrl, loginState = '' } = await startLogin(harness.auth);
      const callbackUrl = harness.issuer.authorize(authorizationUrl);
      callbackUrl.searchParams.delete('iss');
      expectRejected(harness, await handleCallback(callbackRequest(callbackUrl, { '__Host-store_login': loginState }), harness.auth));
    });

    it('with an iss of another issuer (mix-up)', async () => {
      const harness = await createHarness();
      const { authorizationUrl, loginState = '' } = await startLogin(harness.auth);
      const callbackUrl = harness.issuer.authorize(authorizationUrl);
      callbackUrl.searchParams.set('iss', 'https://auth.example.test/realms/admin');
      expectRejected(harness, await handleCallback(callbackRequest(callbackUrl, { '__Host-store_login': loginState }), harness.auth));
    });

    it('when the ID token nonce differs', async () => {
      const harness = await createHarness();
      const { authorizationUrl, loginState = '' } = await startLogin(harness.auth);
      const callbackUrl = harness.issuer.authorize(authorizationUrl);
      harness.issuer.idTokenOverrides = { nonce: 'another-nonce' };
      expectRejected(harness, await handleCallback(callbackRequest(callbackUrl, { '__Host-store_login': loginState }), harness.auth), 1);
    });

    it('when the PKCE verifier does not match the challenge', async () => {
      const harness = await createHarness();
      const { authorizationUrl, loginState = '' } = await startLogin(harness.auth);
      const transactionKey = keys.transaction(loginState);
      const stored = JSON.parse(harness.redis.dump().find((entry) => entry.key === transactionKey)?.value as string) as Record<string, string>;
      await harness.redis.setWithTtl(transactionKey, JSON.stringify({ ...stored, codeVerifier: 'x'.repeat(43) }), 600_000);
      const callbackUrl = harness.issuer.authorize(authorizationUrl);
      expectRejected(harness, await handleCallback(callbackRequest(callbackUrl, { '__Host-store_login': loginState }), harness.auth), 1);
    });

    it('when Keycloak answers with an error (e.g. the user cancelled) and drops the transaction', async () => {
      const harness = await createHarness();
      const { loginState = '' } = await startLogin(harness.auth);
      const response = await handleCallback(
        request(`/auth/callback?error=access_denied&state=${loginState}&iss=${encodeURIComponent(PUBLIC_ISSUER)}`, { cookies: { '__Host-store_login': loginState } }),
        harness.auth,
      );
      expectRejected(harness, response);
      expect(harness.redis.dump().filter((entry) => entry.key === keys.transaction(loginState))).toEqual([]);
    });
  });

  it('validates the redirect URI built from STORE_PUBLIC_URL, not from the Host of the request', async () => {
    const harness = await createHarness();
    const { authorizationUrl, loginState = '' } = await startLogin(harness.auth);
    const callbackUrl = harness.issuer.authorize(authorizationUrl);
    const viaOtherHost = new Request(new URL(`${callbackUrl.pathname}${callbackUrl.search}`, 'http://evil.example'), {
      headers: { cookie: `__Host-store_login=${loginState}` },
    });

    const response = await handleCallback(viaOtherHost, harness.auth);

    expect(response.headers.get('location')).toBe(`${STORE_ORIGIN}/`);
    expect(harness.issuer.tokenRequests[0]?.get('redirect_uri')).toBe(`${STORE_ORIGIN}/auth/callback`);
  });
});

describe('cookies in development (http://localhost)', () => {
  it('are named store_session and store_login, without Secure (browsers refuse __Host- on http)', async () => {
    const harness = await createHarness({ STORE_PUBLIC_URL: 'http://localhost:3000' });
    const { response } = await signIn(harness);

    const cookie = setCookies(response).get('store_session') ?? '';
    expect(cookie.split('; ').slice(1)).toEqual(['Path=/', 'Max-Age=43200', 'HttpOnly', 'SameSite=Lax']);
    expect(response.headers.get('location')).toBe('http://localhost:3000/');
  });
});

describe('login with the authorization server down', () => {
  it('answers 503 and keeps the store running; the failure is remembered for a short time', async () => {
    const harness = await createHarness();
    harness.issuer.discoveryAvailable = false;

    expect((await handleLogin(request('/logowanie'), harness.auth)).status).toBe(503);
    expect((await handleLogin(request('/logowanie'), harness.auth)).status).toBe(503);
    expect(harness.issuer.requests).toHaveLength(1);
  });
});

describe('login with the session store (Redis) down', () => {
  it('answers 503 on /logowanie and on the callback, and sets no session cookie', async () => {
    const harness = await createHarness();
    const { authorizationUrl, loginState = '' } = await startLogin(harness.auth);
    const callbackUrl = harness.issuer.authorize(authorizationUrl);
    harness.redis.setAvailable(false);

    const login = await handleLogin(request('/logowanie'), harness.auth);
    const callback = await handleCallback(callbackRequest(callbackUrl, { '__Host-store_login': loginState }), harness.auth);

    expect([login.status, callback.status]).toEqual([503, 503]);
    expect(await login.text()).toBe('Logowanie jest chwilowo niedostępne. Spróbuj ponownie za chwilę.');
    expect(login.headers.get('cache-control')).toBe('no-store');
    expect(setCookies(login).size + setCookies(callback).size).toBe(0);
  });
});

describe('the session record', () => {
  it('is stored under the hash of the session id, never under the id', async () => {
    const harness = await createHarness();
    const { sessionId } = await signIn(harness);

    const stored = harness.redis.dump().map((entry) => entry.key);
    expect(stored).toContain(keys.session(sessionHash(sessionId)));
    expect(stored.join(' ')).not.toContain(sessionId);
  });
});

describe('auth disabled', () => {
  it('answers 404 on the login and the callback', async () => {
    const auth = createAuth({ STORE_AUTH_MODE: 'disabled', STORE_ENVIRONMENT: 'test' });

    expect((await handleLogin(request('/logowanie'), auth)).status).toBe(404);
    expect((await handleCallback(request('/auth/callback?code=x&state=y'), auth)).status).toBe(404);
  });
});
