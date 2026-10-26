import { createHash, randomUUID } from 'node:crypto';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import type { JWTPayload } from 'jose';

// A fake OpenID Provider (Keycloak-like) behind a fetch function, for the real
// openid-client: discovery, token endpoint (authorization code with PKCE S256, refresh
// with rotation) and JWKS. ID and logout tokens are signed with jose.

export const PUBLIC_ISSUER = 'https://auth.example.test/realms/store';
export const INTERNAL_ISSUER = 'http://keycloak:8080/realms/store';
export const CLIENT_ID = 'store-bff';
export const CLIENT_SECRET = 'test-client-secret';
export const STORE_ORIGIN = 'https://sklep.example.test';

type RefreshMode = 'ok' | 'invalid_grant' | 'network' | 'server_error';

interface PendingCode {
  challenge: string;
  method: string;
  nonce: string;
  redirectUri: string;
  sub: string;
  sid: string;
}

export interface FakeIssuer {
  /** fetch of the server side: answers only on the internal address (like Compose). */
  fetch: typeof fetch;
  /** Every request the server received (URL as sent). */
  requests: string[];
  tokenRequests: URLSearchParams[];
  refreshMode: RefreshMode;
  /** Delay of the token endpoint, so concurrent refreshes overlap. */
  tokenDelayMs: number;
  accessTokenTtl: number;
  /** Claims merged into the next ID token (e.g. a wrong nonce). */
  idTokenOverrides: JWTPayload;
  /**
   * The user signs in at the authorization endpoint: returns the callback URL Keycloak
   * redirects to (code, state, iss, session_state).
   */
  authorize(authorizationUrl: URL, user?: { sub?: string; sid?: string }): URL;
  logoutToken(claims?: JWTPayload, options?: { omit?: string[] }): Promise<string>;
  /** A token signed by a key outside the JWKS. */
  foreignLogoutToken(claims?: JWTPayload): Promise<string>;
  discoveryAvailable: boolean;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('base64url');

export async function createFakeIssuer({ internal = true }: { internal?: boolean } = {}): Promise<FakeIssuer> {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const foreign = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  const serverBase = internal ? INTERNAL_ISSUER : PUBLIC_ISSUER;
  const codes = new Map<string, PendingCode>();
  const refreshTokens = new Map<string, { sub: string; sid: string; active: boolean }>();
  let counter = 0;

  /** Signs claims over the defaults (iss, aud, iat, exp); `omit` removes claims after that. */
  const sign = (claims: JWTPayload, key = privateKey, omit: string[] = []) => {
    const now = Math.floor(Date.now() / 1000);
    const payload: JWTPayload = { iss: PUBLIC_ISSUER, aud: CLIENT_ID, iat: now, exp: now + 300, ...claims };
    for (const claim of omit) Reflect.deleteProperty(payload, claim);
    return new SignJWT(payload).setProtectedHeader({ alg: 'RS256', kid: 'k1', typ: 'JWT' }).sign(key);
  };

  const issueTokens = async (sub: string, sid: string, nonce?: string) => {
    counter += 1;
    const refreshToken = `rt-${String(counter)}`;
    refreshTokens.set(refreshToken, { sub, sid, active: true });
    const idToken = nonce === undefined ? undefined : await sign({ sub, sid, nonce, azp: CLIENT_ID, typ: 'ID', ...fake.idTokenOverrides });
    fake.idTokenOverrides = {};
    return {
      access_token: `at-${String(counter)}`,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: fake.accessTokenTtl,
      ...(idToken === undefined ? {} : { id_token: idToken }),
    };
  };

  const oauthError = (error: string, status = 400) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });

  async function token(body: URLSearchParams, headers: Headers): Promise<Response> {
    fake.tokenRequests.push(body);
    if (fake.tokenDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, fake.tokenDelayMs));
    // client_secret_basic: form-encoded id and secret (RFC 6749, section 2.3.1).
    const [id = '', secret = ''] = Buffer.from((headers.get('authorization') ?? '').replace(/^Basic /, ''), 'base64')
      .toString('utf8')
      .split(':')
      .map((part) => decodeURIComponent(part.replace(/\+/g, ' ')));
    if (id !== CLIENT_ID || secret !== CLIENT_SECRET) return oauthError('invalid_client', 401);

    if (body.get('grant_type') === 'authorization_code') {
      const pending = codes.get(body.get('code') ?? '');
      codes.delete(body.get('code') ?? '');
      if (pending === undefined) return oauthError('invalid_grant');
      if (pending.method !== 'S256' || sha256(body.get('code_verifier') ?? '') !== pending.challenge) return oauthError('invalid_grant');
      if (body.get('redirect_uri') !== pending.redirectUri) return oauthError('invalid_grant');
      return Response.json(await issueTokens(pending.sub, pending.sid, pending.nonce));
    }
    if (body.get('grant_type') === 'refresh_token') {
      if (fake.refreshMode === 'network') throw new TypeError('fetch failed');
      if (fake.refreshMode === 'server_error') return oauthError('server_error', 503);
      const current = refreshTokens.get(body.get('refresh_token') ?? '');
      if (fake.refreshMode === 'invalid_grant' || current?.active !== true) return oauthError('invalid_grant');
      current.active = false;
      return Response.json(await issueTokens(current.sub, current.sid));
    }
    return oauthError('unsupported_grant_type');
  }

  const fake: FakeIssuer = {
    requests: [],
    tokenRequests: [],
    refreshMode: 'ok',
    tokenDelayMs: 0,
    accessTokenTtl: 300,
    idTokenOverrides: {},
    discoveryAvailable: true,

    fetch: async (input, init) => {
      const url = input instanceof Request ? input.url : input.toString();
      fake.requests.push(url);
      if (!url.startsWith(`${serverBase}/`)) throw new TypeError(`fetch failed (unreachable: ${new URL(url).origin})`);
      const path = url.slice(serverBase.length);
      if (path === '/.well-known/openid-configuration') {
        if (!fake.discoveryAvailable) throw new TypeError('fetch failed');
        return Response.json({
          issuer: PUBLIC_ISSUER,
          // Browser-facing endpoints on the public issuer, back-channel ones on the address
          // of the request (KC_HOSTNAME_BACKCHANNEL_DYNAMIC=true).
          authorization_endpoint: `${PUBLIC_ISSUER}/protocol/openid-connect/auth`,
          end_session_endpoint: `${PUBLIC_ISSUER}/protocol/openid-connect/logout`,
          token_endpoint: `${serverBase}/protocol/openid-connect/token`,
          jwks_uri: `${serverBase}/protocol/openid-connect/certs`,
          response_types_supported: ['code'],
          subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['RS256'],
          code_challenge_methods_supported: ['S256'],
          token_endpoint_auth_methods_supported: ['client_secret_basic'],
          authorization_response_iss_parameter_supported: true,
          backchannel_logout_supported: true,
          backchannel_logout_session_supported: true,
        });
      }
      if (path === '/protocol/openid-connect/certs') return Response.json({ keys: [jwk] });
      if (path === '/protocol/openid-connect/token' && init?.method === 'POST') {
        return token(new URLSearchParams(init.body as string | URLSearchParams), new Headers(init.headers));
      }
      return new Response('Not Found', { status: 404 });
    },

    authorize(authorizationUrl, user = {}) {
      const params = authorizationUrl.searchParams;
      const code = randomUUID();
      const redirectUri = params.get('redirect_uri') ?? '';
      codes.set(code, {
        challenge: params.get('code_challenge') ?? '',
        method: params.get('code_challenge_method') ?? '',
        nonce: params.get('nonce') ?? '',
        redirectUri,
        sub: user.sub ?? 'user-1',
        sid: user.sid ?? 'kc-session-1',
      });
      const callback = new URL(redirectUri);
      callback.search = new URLSearchParams({ state: params.get('state') ?? '', session_state: 'ss', iss: PUBLIC_ISSUER, code }).toString();
      return callback;
    },

    logoutToken: (claims = {}, { omit = [] } = {}) =>
      sign(
        {
          sid: 'kc-session-1',
          jti: randomUUID(),
          events: { 'http://schemas.openid.net/event/backchannel-logout': {} },
          typ: 'Logout',
          ...claims,
        },
        privateKey,
        omit,
      ),

    foreignLogoutToken: (claims = {}) =>
      sign(
        {
          sid: 'kc-session-1',
          jti: randomUUID(),
          events: { 'http://schemas.openid.net/event/backchannel-logout': {} },
          ...claims,
        },
        foreign.privateKey,
      ),
  };
  return fake;
}

/** Valid session encryption keys (STORE_SESSION_ENC_KEYS) for tests. */
export const TEST_ENC_KEYS = `k2:${Buffer.alloc(32, 2).toString('base64')},k1:${Buffer.alloc(32, 1).toString('base64')}`;

/** A complete oidc configuration (createAuth(env)) against the fake issuer. */
export const testAuthEnv = (overrides: Record<string, string> = {}): Record<string, string> => ({
  STORE_PUBLIC_URL: STORE_ORIGIN,
  STORE_OIDC_ISSUER: PUBLIC_ISSUER,
  STORE_OIDC_INTERNAL_URL: INTERNAL_ISSUER,
  STORE_OIDC_CLIENT_ID: CLIENT_ID,
  STORE_OIDC_CLIENT_SECRET: CLIENT_SECRET,
  STORE_REDIS_URL: 'redis://store:secret@redis-session:6379',
  STORE_SESSION_ENC_KEYS: TEST_ENC_KEYS,
  ...overrides,
});
