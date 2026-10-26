import { createRemoteJWKSet, customFetch, errors, jwtVerify } from 'jose';
import type { JWTPayload } from 'jose';
import { AuthUnavailableError } from './errors';
import type { OidcProvider } from './oidc';

export const BACKCHANNEL_LOGOUT_EVENT = 'http://schemas.openid.net/event/backchannel-logout';

export interface LogoutToken {
  sid: string;
  jti: string;
  /** Epoch seconds. */
  exp: number;
}

export class InvalidLogoutTokenError extends Error {
  constructor(reason: string, options?: ErrorOptions) {
    super(`Invalid logout token: ${reason}`, options);
    this.name = 'InvalidLogoutTokenError';
  }
}

export type LogoutTokenVerifier = (token: string) => Promise<LogoutToken>;

/** Logout tokens older than this are rejected, whatever their `exp`. */
const MAX_TOKEN_AGE = '5m';

/**
 * Verifies a back-channel logout token (OpenID Connect Back-Channel Logout 1.0): signature
 * with the issuer JWKS (fetched from the internal address), `iss` = public issuer, `aud` =
 * this client, `iat` and `exp`, the back-channel logout event, no `nonce` and a `sid`
 * (sessions are indexed by it). Replays are rejected by the caller with the `jti`.
 */
export function createLogoutTokenVerifier(provider: OidcProvider): LogoutTokenVerifier {
  let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
  const keySet = async () =>
    (jwks ??= createRemoteJWKSet(await provider.jwksUri(), {
      [customFetch]: (url, options) => provider.fetch(url, options),
    }));

  return async (token) => {
    const getKey = await keySet();
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, getKey, {
        issuer: provider.issuer.replace(/\/+$/, ''),
        audience: provider.clientId,
        requiredClaims: ['iat', 'exp', 'jti', 'events'],
        maxTokenAge: MAX_TOKEN_AGE,
        algorithms: ['RS256', 'RS384', 'RS512', 'PS256', 'ES256', 'ES384', 'EdDSA'],
      }));
    } catch (error) {
      if (error instanceof errors.JWKSTimeout || error instanceof TypeError) throw new AuthUnavailableError('JWKS unavailable', { cause: error });
      throw new InvalidLogoutTokenError(error instanceof errors.JOSEError ? error.code : 'unverifiable', { cause: error });
    }

    const events = payload.events;
    if (typeof events !== 'object' || events === null || Array.isArray(events)) throw new InvalidLogoutTokenError('events is not an object');
    const event: unknown = (events as Record<string, unknown>)[BACKCHANNEL_LOGOUT_EVENT];
    if (typeof event !== 'object' || event === null || Array.isArray(event)) throw new InvalidLogoutTokenError('no back-channel logout event');
    if ('nonce' in payload) throw new InvalidLogoutTokenError('nonce present');
    const { sid, jti, exp } = payload;
    if (typeof sid !== 'string' || sid === '' || sid.length > 256) throw new InvalidLogoutTokenError('sid missing');
    if (typeof jti !== 'string' || jti === '' || jti.length > 256 || typeof exp !== 'number') throw new InvalidLogoutTokenError('jti missing');

    return { sid, jti, exp };
  };
}
