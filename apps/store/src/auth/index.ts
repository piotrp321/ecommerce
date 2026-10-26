import { authCookies } from './cookies';
import type { AuthCookies } from './cookies';
import { createTokenCipher, parseEncryptionKeys } from './core/cipher';
import { createLogoutTokenVerifier } from './core/logout-token';
import { createNodeRedisCommands } from './core/node-redis';
import { createOidcProvider } from './core/oidc';
import type { RedisCommands } from './core/redis-commands';
import { createSessionManager } from './core/session-manager';
import type { SessionManager } from './core/session-manager';
import { createSessionStore } from './core/session-store';

/** Server environment: STORE_AUTH_MODE, STORE_ENVIRONMENT, STORE_PUBLIC_URL, STORE_OIDC_*, STORE_REDIS_URL, STORE_SESSION_ENC_KEYS. */
type Env = Record<string, string | undefined>;

export type Auth =
  | { enabled: false }
  | {
      enabled: true;
      /** Public origin of the store (STORE_PUBLIC_URL), e.g. https://sklep.example.com. */
      publicOrigin: string;
      cookies: AuthCookies;
      manager: SessionManager;
    };

/** Dependencies replaced in tests (an in-memory Redis, a fake authorization server). */
export interface AuthDependencies {
  redis?: RedisCommands;
  fetch?: typeof fetch;
  now?: () => number;
}

export class AuthConfigError extends Error {
  constructor(message: string) {
    super(`Store auth configuration: ${message}`);
    this.name = 'AuthConfigError';
  }
}

const REQUIRED = ['STORE_PUBLIC_URL', 'STORE_OIDC_ISSUER', 'STORE_OIDC_CLIENT_ID', 'STORE_OIDC_CLIENT_SECRET', 'STORE_REDIS_URL', 'STORE_SESSION_ENC_KEYS'] as const;
/** STORE_AUTH_MODE=disabled is accepted only in these environments (STORE_ENVIRONMENT). */
const DISABLED_ALLOWED_IN = ['development', 'test'];

const isLocalhost = (url: URL) => url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';

/** An absolute https URL, or http only on localhost (development). Errors name the variable, never the value. */
function secureUrl(name: string, value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AuthConfigError(`${name} is not an absolute URL`);
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalhost(url))) {
    throw new AuthConfigError(`${name} must use https (http only for localhost)`);
  }
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
    throw new AuthConfigError(`${name} must not contain credentials, a query or a fragment`);
  }
  return url;
}

/**
 * The single place that reads the auth environment and decides the mode (like
 * `createCatalogSource`). Called by `instrumentation.ts` at startup, so a production
 * server without a complete configuration does not start:
 *
 * - `STORE_AUTH_MODE=oidc` (default): every variable of `REQUIRED` must be set;
 *   `STORE_OIDC_INTERNAL_URL` is optional.
 * - `STORE_AUTH_MODE=disabled`: no login at all (auth routes 404), only with
 *   `STORE_ENVIRONMENT=development` or `test`.
 *
 * Nothing connects here: Redis and Keycloak are reached on first use.
 */
export function createAuth(env: Env, dependencies: AuthDependencies = {}): Auth {
  const mode = env.STORE_AUTH_MODE?.trim() || 'oidc';
  if (mode === 'disabled') {
    const environment = env.STORE_ENVIRONMENT?.trim() ?? '';
    if (!DISABLED_ALLOWED_IN.includes(environment)) {
      throw new AuthConfigError('STORE_AUTH_MODE=disabled requires STORE_ENVIRONMENT=development or test');
    }
    return { enabled: false };
  }
  if (mode !== 'oidc') throw new AuthConfigError('STORE_AUTH_MODE must be oidc or disabled');

  const missing = REQUIRED.filter((name) => (env[name]?.trim() ?? '') === '');
  if (missing.length > 0) throw new AuthConfigError(`missing ${missing.join(', ')}`);
  const value = (name: (typeof REQUIRED)[number]) => env[name]?.trim() ?? '';

  const publicUrl = secureUrl('STORE_PUBLIC_URL', value('STORE_PUBLIC_URL'));
  if (publicUrl.pathname !== '/') throw new AuthConfigError('STORE_PUBLIC_URL must be an origin without a path');
  const issuer = secureUrl('STORE_OIDC_ISSUER', value('STORE_OIDC_ISSUER'));
  const internal = env.STORE_OIDC_INTERNAL_URL?.trim() ?? '';
  let internalUrl: URL | undefined;
  if (internal !== '') {
    try {
      internalUrl = new URL(internal);
    } catch {
      throw new AuthConfigError('STORE_OIDC_INTERNAL_URL is not an absolute URL');
    }
    if (internalUrl.protocol !== 'http:' && internalUrl.protocol !== 'https:') throw new AuthConfigError('STORE_OIDC_INTERNAL_URL must be an http(s) URL');
  }
  const redisUrl = value('STORE_REDIS_URL');
  if (!/^rediss?:\/\/[^\s]+$/.test(redisUrl)) throw new AuthConfigError('STORE_REDIS_URL must be a redis:// or rediss:// URL');
  let keys;
  try {
    keys = parseEncryptionKeys(value('STORE_SESSION_ENC_KEYS'));
  } catch (error) {
    throw new AuthConfigError(error instanceof Error ? error.message : 'STORE_SESSION_ENC_KEYS is invalid');
  }

  const publicOrigin = publicUrl.origin;
  const oidc = createOidcProvider({
    issuer,
    internalUrl,
    clientId: value('STORE_OIDC_CLIENT_ID'),
    clientSecret: value('STORE_OIDC_CLIENT_SECRET'),
    redirectUri: `${publicOrigin}/auth/callback`,
    postLogoutRedirectUri: `${publicOrigin}/`,
    ...(dependencies.fetch === undefined ? {} : { fetch: dependencies.fetch }),
    ...(dependencies.now === undefined ? {} : { now: dependencies.now }),
  });
  const store = createSessionStore(dependencies.redis ?? createNodeRedisCommands(redisUrl), createTokenCipher(keys));

  return {
    enabled: true,
    publicOrigin,
    cookies: authCookies(publicUrl.protocol === 'https:'),
    manager: createSessionManager({
      store,
      oidc,
      verifyLogoutToken: createLogoutTokenVerifier(oidc),
      publicOrigin,
      ...(dependencies.now === undefined ? {} : { now: dependencies.now }),
    }),
  };
}

// Created on first use from the environment of the running server (validated at startup
// by instrumentation.ts), one per process: its Redis connection and discovery are shared.
let auth: Auth | undefined;

export function getAuth(): Auth {
  return (auth ??= createAuth(process.env));
}
