import * as client from 'openid-client';
import { AuthUnavailableError, LoginFailedError } from './errors';

export interface OidcSettings {
  /** Public issuer (the `iss` of tokens, the browser-facing authorization endpoint). */
  issuer: URL;
  /** Address of the same issuer inside the network (discovery, token, JWKS); optional. */
  internalUrl?: URL | undefined;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  postLogoutRedirectUri: string;
  /** Underlying fetch (tests: a fake authorization server). */
  fetch?: typeof fetch;
  /** How long a failed discovery is remembered before the next attempt. */
  discoveryRetryMs?: number;
  /** Timeout of every request to the authorization server, in seconds. */
  timeoutSeconds?: number;
  now?: () => number;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  /** Seconds. */
  expiresIn: number;
}

export interface LoginResult extends TokenSet {
  sub: string;
  /** Keycloak session id (`sid` claim); empty when absent. */
  sid: string;
}

export interface OidcProvider {
  readonly issuer: string;
  readonly clientId: string;
  authorizationUrl(params: { state: string; nonce: string; codeChallenge: string }): Promise<URL>;
  /** Validates the authorization response (state, iss, code) and the ID token (nonce, signature). */
  completeLogin(callbackUrl: URL, checks: { state: string; nonce: string; codeVerifier: string }): Promise<LoginResult>;
  refresh(refreshToken: string): Promise<TokenSet>;
  /** RP-initiated logout URL; without an ID token the `client_id` identifies the client. */
  endSessionUrl(idTokenHint: string | null): Promise<URL>;
  /** JWKS URI of the issuer, mapped to the internal address (back-channel logout tokens). */
  jwksUri(): Promise<URL>;
  /** fetch that maps the public issuer to the internal address. */
  readonly fetch: typeof fetch;
}

/** `refreshTokenGrant` answered `invalid_grant`: the refresh token is no longer valid. */
export class InvalidGrantError extends Error {
  constructor(options?: ErrorOptions) {
    super('Refresh token rejected (invalid_grant)', options);
    this.name = 'InvalidGrantError';
  }
}

const trimSlash = (value: string) => value.replace(/\/+$/, '');
const isLocalhost = (url: URL) => url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';

/** The authorization server is unreachable or answered with a server error (not a protocol error). */
export function isUnavailable(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')) return true;
  if (error instanceof client.ResponseBodyError) return error.status >= 500;
  if (error instanceof client.ClientError) {
    return error.code === 'OAUTH_RESPONSE_IS_NOT_CONFORM' || error.code === 'OAUTH_RESPONSE_IS_NOT_JSON' || isUnavailable(error.cause);
  }
  return false;
}

/**
 * OpenID Connect client (openid-client) of a confidential client with a split issuer:
 * the browser uses the public issuer, the server reaches the same issuer at
 * `internalUrl`. Requests to the public issuer are sent to the internal address, and
 * internal URLs in the discovery document are mapped back to the public issuer, so the
 * library always sees (and validates) the public URLs. Plain http is allowed only for a
 * public issuer on localhost (development).
 *
 * Discovery is lazy: the store starts while Keycloak is down; a failed discovery is
 * remembered for a short time (no request storm) and auth routes answer 503.
 */
export function createOidcProvider(settings: OidcSettings): OidcProvider {
  const baseFetch = settings.fetch ?? globalThis.fetch;
  const now = settings.now ?? Date.now;
  const publicPrefix = trimSlash(settings.issuer.href);
  const internalPrefix = settings.internalUrl === undefined ? undefined : trimSlash(settings.internalUrl.href);

  const toInternal = (url: string): string =>
    internalPrefix !== undefined && (url === publicPrefix || url.startsWith(`${publicPrefix}/`)) ? internalPrefix + url.slice(publicPrefix.length) : url;
  const toPublic = (value: unknown): unknown => {
    if (internalPrefix === undefined) return value;
    if (typeof value === 'string') {
      return value === internalPrefix || value.startsWith(`${internalPrefix}/`) ? publicPrefix + value.slice(internalPrefix.length) : value;
    }
    if (Array.isArray(value)) return value.map(toPublic);
    if (typeof value === 'object' && value !== null) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toPublic(item)]));
    return value;
  };

  const mappedFetch = async (input: string, init: RequestInit): Promise<Response> => {
    const response = await baseFetch(toInternal(input), init);
    if (internalPrefix === undefined || !input.endsWith('/.well-known/openid-configuration') || !response.ok) return response;
    const document = toPublic(await response.json());
    return Response.json(document, { status: response.status, headers: { 'content-type': 'application/json' } });
  };
  const customFetch: client.CustomFetch = (url, options) => mappedFetch(url, options as RequestInit);

  const timeout = settings.timeoutSeconds ?? 5;
  const retryMs = settings.discoveryRetryMs ?? 5000;
  let configuration: client.Configuration | undefined;
  let pending: Promise<client.Configuration> | undefined;
  let failedAt: number | undefined;

  async function config(): Promise<client.Configuration> {
    if (configuration !== undefined) return configuration;
    if (failedAt !== undefined && now() - failedAt < retryMs) throw new AuthUnavailableError('OpenID Provider discovery failed recently');
    pending ??= client
      .discovery(settings.issuer, settings.clientId, undefined, client.ClientSecretBasic(settings.clientSecret), {
        [client.customFetch]: customFetch,
        timeout,
        // Plain http only for a public issuer on localhost (development Keycloak).
        // eslint-disable-next-line @typescript-eslint/no-deprecated -- deprecated only as a warning sign, see above
        ...(settings.issuer.protocol === 'http:' && isLocalhost(settings.issuer) ? { execute: [client.allowInsecureRequests] } : {}),
      })
      .then(
        (discovered) => {
          configuration = discovered;
          failedAt = undefined;
          return discovered;
        },
        (error: unknown) => {
          failedAt = now();
          throw new AuthUnavailableError('OpenID Provider discovery failed', { cause: error });
        },
      )
      .finally(() => {
        pending = undefined;
      });
    return pending;
  }

  const tokenSet = (tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers, previous?: TokenSet): TokenSet => ({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? previous?.refreshToken ?? '',
    idToken: tokens.id_token ?? previous?.idToken ?? '',
    expiresIn: tokens.expiresIn() ?? 60,
  });

  return {
    issuer: settings.issuer.href,
    clientId: settings.clientId,
    fetch: (input, init) => mappedFetch(input instanceof Request ? input.url : input.toString(), init ?? {}),

    async authorizationUrl({ state, nonce, codeChallenge }) {
      return client.buildAuthorizationUrl(await config(), {
        redirect_uri: settings.redirectUri,
        scope: 'openid',
        response_type: 'code',
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });
    },

    async completeLogin(callbackUrl, { state, nonce, codeVerifier }) {
      // RFC 9207: the authorization response must name the issuer it comes from.
      const iss = callbackUrl.searchParams.get('iss');
      if (iss === null) throw new LoginFailedError('missing iss');
      if (iss !== settings.issuer.href && trimSlash(iss) !== publicPrefix) throw new LoginFailedError('iss mismatch');

      const configured = await config();
      let tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers;
      try {
        tokens = await client.authorizationCodeGrant(configured, callbackUrl, {
          pkceCodeVerifier: codeVerifier,
          expectedState: state,
          expectedNonce: nonce,
          idTokenExpected: true,
        });
      } catch (error) {
        if (isUnavailable(error)) throw new AuthUnavailableError('Token endpoint unavailable', { cause: error });
        throw new LoginFailedError(error instanceof client.ResponseBodyError ? error.error : 'invalid authorization response', { cause: error });
      }
      const claims = tokens.claims();
      if (claims === undefined || tokens.refresh_token === undefined || tokens.id_token === undefined) throw new LoginFailedError('incomplete token response');
      return { ...tokenSet(tokens), sub: claims.sub, sid: typeof claims.sid === 'string' ? claims.sid : '' };
    },

    async refresh(refreshToken) {
      const configured = await config();
      try {
        return tokenSet(await client.refreshTokenGrant(configured, refreshToken), { accessToken: '', refreshToken, idToken: '', expiresIn: 0 });
      } catch (error) {
        if (error instanceof client.ResponseBodyError && error.error === 'invalid_grant') throw new InvalidGrantError({ cause: error });
        throw new AuthUnavailableError('Token refresh failed', { cause: error });
      }
    },

    async endSessionUrl(idTokenHint) {
      return client.buildEndSessionUrl(await config(), {
        post_logout_redirect_uri: settings.postLogoutRedirectUri,
        ...(idTokenHint === null || idTokenHint === '' ? { client_id: settings.clientId } : { id_token_hint: idTokenHint }),
      });
    },

    async jwksUri() {
      const uri = (await config()).serverMetadata().jwks_uri;
      if (uri === undefined) throw new AuthUnavailableError('OpenID Provider has no jwks_uri');
      return new URL(uri);
    },
  };
}
