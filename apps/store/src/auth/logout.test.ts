// @vitest-environment node
import { createAuth } from '@/auth';
import { SessionStoreUnavailableError } from '@/auth/core/errors';
import { handleBackchannelLogout } from '@/auth/handlers';
import { createHarness, request, signIn } from '@/test/auth-harness';
import type { EnabledAuth } from '@/test/auth-harness';
import { PUBLIC_ISSUER, STORE_ORIGIN } from '@/test/fake-oidc';

// Logout ends the session in every replica: RP-initiated (the store) and back-channel
// (Keycloak calls the store) (AC-4).

const backchannel = (auth: EnabledAuth | ReturnType<typeof createAuth>, token: string, contentType = 'application/x-www-form-urlencoded') =>
  handleBackchannelLogout(
    request('/auth/backchannel-logout', { method: 'POST', headers: { 'content-type': contentType }, body: new URLSearchParams({ logout_token: token }).toString() }),
    auth,
  );

describe('RP-initiated logout', () => {
  it('removes the session in every replica and returns the end-session URL with id_token_hint', async () => {
    const harness = await createHarness();
    const other = harness.replica();
    const { sessionId } = await signIn(harness);
    expect(await other.manager.getSession(sessionId)).toEqual({ userId: 'user-1' });

    const url = await harness.auth.manager.logout(sessionId);

    expect(`${url.origin}${url.pathname}`).toBe(`${PUBLIC_ISSUER}/protocol/openid-connect/logout`);
    expect(url.searchParams.get('id_token_hint')).toMatch(/^eyJ/);
    expect(url.searchParams.get('post_logout_redirect_uri')).toBe(`${STORE_ORIGIN}/`);
    expect(await other.manager.getSession(sessionId)).toBeNull();
    expect(harness.redis.dump()).toEqual([]);
  });

  it('without a session still gives an end-session URL, identified by client_id', async () => {
    const harness = await createHarness();
    const url = await harness.auth.manager.logout(undefined);

    expect(url.searchParams.get('client_id')).toBe('store-bff');
    expect(url.searchParams.has('id_token_hint')).toBe(false);
  });
});

describe('POST /auth/backchannel-logout', () => {
  it('removes every session of the Keycloak session in every replica (200, no-store)', async () => {
    const harness = await createHarness();
    const other = harness.replica();
    const phone = await signIn(harness, harness.auth, { sid: 'kc-session-1' });
    const laptop = await signIn(harness, other, { sid: 'kc-session-1' });
    const unrelated = await signIn(harness, other, { sub: 'user-2', sid: 'kc-session-2' });

    const response = await backchannel(harness.auth, await harness.issuer.logoutToken({ sid: 'kc-session-1' }));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await other.manager.getSession(phone.sessionId)).toBeNull();
    expect(await harness.auth.manager.getSession(laptop.sessionId)).toBeNull();
    expect(await harness.auth.manager.getSession(unrelated.sessionId)).toEqual({ userId: 'user-2' });
    expect(harness.redis.dump().filter((entry) => entry.key.startsWith('store:kcsid:')).map((entry) => entry.key)).toEqual(['store:kcsid:kc-session-2']);
  });

  it('rejects a replayed logout token (jti) with 400', async () => {
    const harness = await createHarness();
    const token = await harness.issuer.logoutToken();

    expect((await backchannel(harness.auth, token)).status).toBe(200);
    expect((await backchannel(harness.auth, token)).status).toBe(400);
    expect((await backchannel(harness.replica(), token)).status).toBe(400);
  });

  it.each([
    ['another issuer', { iss: 'https://auth.example.test/realms/admin' }, []],
    ['another audience', { aud: 'admin-bff' }, []],
    ['a nonce', { nonce: 'n' }, []],
    ['no back-channel logout event', { events: { other: {} } }, []],
    ['expired', { exp: Math.floor(Date.now() / 1000) - 60 }, []],
    ['issued too long ago', { iat: Math.floor(Date.now() / 1000) - 3600 }, []],
    ['no sid', {}, ['sid']],
    ['no jti', {}, ['jti']],
    ['no exp', {}, ['exp']],
  ])('rejects a logout token with %s (400) and keeps the session', async (_, claims, omit) => {
    const harness = await createHarness();
    const { sessionId } = await signIn(harness);

    const response = await backchannel(harness.auth, await harness.issuer.logoutToken(claims, { omit }));

    expect(response.status).toBe(400);
    expect(await harness.auth.manager.getSession(sessionId)).toEqual({ userId: 'user-1' });
  });

  it('rejects a token signed by a key outside the JWKS, a malformed body and another content type', async () => {
    const harness = await createHarness();
    const { sessionId } = await signIn(harness);

    expect((await backchannel(harness.auth, await harness.issuer.foreignLogoutToken())).status).toBe(400);
    expect((await backchannel(harness.auth, 'not-a-jwt')).status).toBe(400);
    expect((await backchannel(harness.auth, await harness.issuer.logoutToken(), 'application/json')).status).toBe(400);
    expect(await harness.auth.manager.getSession(sessionId)).toEqual({ userId: 'user-1' });
  });

  it('fetches the JWKS from the internal address', async () => {
    const harness = await createHarness();
    await backchannel(harness.auth, await harness.issuer.logoutToken());

    expect(harness.issuer.requests).toContain('http://keycloak:8080/realms/store/protocol/openid-connect/certs');
    expect(harness.issuer.requests.every((url) => url.startsWith('http://keycloak:8080/'))).toBe(true);
  });

  it('lets Keycloak retry a token whose logout failed (no false replay)', async () => {
    const harness = await createHarness();
    const { sessionId } = await signIn(harness, harness.auth, { sid: 'kc-session-1' });
    const token = await harness.issuer.logoutToken({ sid: 'kc-session-1' });
    const failing = vi.spyOn(harness.redis, 'sMembers').mockRejectedValueOnce(new SessionStoreUnavailableError());

    expect((await backchannel(harness.auth, token)).status).toBe(503);
    expect(failing).toHaveBeenCalledTimes(1);
    expect(await harness.auth.manager.getSession(sessionId)).toEqual({ userId: 'user-1' });

    expect((await backchannel(harness.auth, token)).status).toBe(200);
    expect(await harness.auth.manager.getSession(sessionId)).toBeNull();
    expect((await backchannel(harness.auth, token)).status).toBe(400);
  });

  it('answers 503 while the session store is down', async () => {
    const harness = await createHarness();
    const token = await harness.issuer.logoutToken();
    harness.redis.setAvailable(false);

    expect((await backchannel(harness.auth, token)).status).toBe(503);
  });

  it('answers 404 when login is disabled', async () => {
    const auth = createAuth({ STORE_AUTH_MODE: 'disabled', STORE_ENVIRONMENT: 'development' });
    expect((await backchannel(auth, 'x')).status).toBe(404);
  });
});
