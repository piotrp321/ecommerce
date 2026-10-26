import { calculatePKCECodeChallenge, randomNonce, randomPKCECodeVerifier, randomState } from 'openid-client';
import { randomUUID } from 'node:crypto';
import { AuthUnavailableError, LoginFailedError, SessionKeyUnavailableError, SessionRejectedError } from './errors';
import { newSessionId, sessionHash } from './keys';
import type { LogoutTokenVerifier } from './logout-token';
import { InvalidGrantError } from './oidc';
import type { OidcProvider, TokenSet } from './oidc';
import { safeReturnTo } from './return-to';
import type { SessionStore, StoredSession } from './session-store';

export const SESSION_IDLE_MS = 30 * 60 * 1000;
export const SESSION_ABSOLUTE_MS = 12 * 60 * 60 * 1000;
export const LOGIN_TRANSACTION_MS = 10 * 60 * 1000;
/** `last_seen` and the TTL are written at most this often (sliding idle timeout). */
const TOUCH_INTERVAL_MS = 60 * 1000;
/** An access token closer than this to its expiry is refreshed first. */
const REFRESH_MARGIN_MS = 30 * 1000;
const REFRESH_LOCK_MS = 10 * 1000;
const REFRESH_WAIT_MS = 3000;
const REFRESH_POLL_MS = 100;
const LOGOUT_TOKEN_REPLAY_MS = 5 * 60 * 1000;

/** What pages may know about a session: never a token. */
export interface SessionView {
  userId: string;
}

export interface SessionManagerOptions {
  store: SessionStore;
  oidc: OidcProvider;
  verifyLogoutToken: LogoutTokenVerifier;
  /** Public origin of the store, e.g. https://sklep.example.com (STORE_PUBLIC_URL). */
  publicOrigin: string;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export type TokenResult<T> = { status: 'ok'; value: T } | { status: 'unauthorized' };

export interface SessionManager {
  /** Starts a login: a transaction under a new `state`, the authorization URL to redirect to. */
  beginLogin(returnTo: string | null): Promise<{ state: string; authorizationUrl: URL }>;
  /**
   * Completes a login from the callback. `cookieState` is the `state` of the login cookie of
   * this browser. Returns a new session id (never a previous one) and the page to return to.
   */
  completeLogin(callbackUrl: URL, cookieState: string | undefined): Promise<{ sessionId: string; returnTo: string }>;
  /** Drops the transaction of a login the provider ended with an error (only this browser's own). */
  cancelLogin(state: string | null, cookieState: string | undefined): Promise<void>;
  getSession(sessionId: string | undefined): Promise<SessionView | null>;
  /** Removes a session here only (a session replaced by a new login). */
  discardSession(sessionId: string): Promise<void>;
  /** A valid access token (refreshed when about to expire), or null without a session. */
  getAccessToken(sessionId: string | undefined): Promise<string | null>;
  /**
   * Calls the backend with the access token; null without a session. A 401 although the token
   * looked valid gives one forced refresh and one retry; a second 401 ends the session and
   * throws `SessionRejectedError` (an error page, not a redirect to the login).
   */
  withAccessToken<T>(sessionId: string | undefined, call: (accessToken: string) => Promise<TokenResult<T>>): Promise<T | null>;
  /** Ends the session here and returns the RP-initiated logout URL of the provider. */
  logout(sessionId: string | undefined): Promise<URL>;
  /** Logout URL when the session store is down: `client_id` instead of the ID token. */
  fallbackLogoutUrl(): Promise<URL>;
  /** Back-channel logout: removes every session of the Keycloak session of the token. */
  backchannelLogout(logoutToken: string): Promise<{ sessions: number }>;
}

export class ReplayedLogoutTokenError extends Error {
  constructor() {
    super('Logout token replayed');
    this.name = 'ReplayedLogoutTokenError';
  }
}

export function createSessionManager({
  store,
  oidc,
  verifyLogoutToken,
  publicOrigin,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}: SessionManagerOptions): SessionManager {
  /** In-process single flight: one refresh per session at a time in this replica. */
  const refreshing = new Map<string, Promise<string | null>>();

  const ttlOf = (session: Pick<StoredSession, 'absoluteExpiresAt'>, at: number) => Math.max(1, Math.min(SESSION_IDLE_MS, session.absoluteExpiresAt - at));
  const isExpired = (session: StoredSession, at: number) => at >= session.absoluteExpiresAt || at - session.lastSeen >= SESSION_IDLE_MS;

  /** The live session of an id: expired sessions are removed, activity extends the idle timeout. */
  async function load(sessionId: string | undefined): Promise<{ hash: string; session: StoredSession } | null> {
    if (sessionId === undefined || sessionId === '' || sessionId.length > 128) return null;
    const hash = sessionHash(sessionId);
    const session = await store.readSession(hash);
    if (session === null) return null;
    const at = now();
    if (isExpired(session, at)) {
      await store.deleteSession(hash);
      return null;
    }
    if (at - session.lastSeen >= TOUCH_INTERVAL_MS) {
      await store.touchSession(hash, at, ttlOf(session, at));
      session.lastSeen = at;
    }
    return { hash, session };
  }

  /** Waits for the refresh of another replica: done when `rtv` changes. */
  async function awaitOtherRefresh(hash: string, seenRtv: number): Promise<string | null> {
    for (let waited = 0; waited < REFRESH_WAIT_MS; waited += REFRESH_POLL_MS) {
      await sleep(REFRESH_POLL_MS);
      const session = await store.readSession(hash);
      if (session === null) return null;
      if (session.rtv !== seenRtv) return session.tokens.accessToken;
    }
    throw new AuthUnavailableError('Token refresh in another replica did not finish in time');
  }

  async function refresh(hash: string, seenRtv: number): Promise<string | null> {
    const lockToken = randomUUID();
    if (!(await store.acquireRefreshLock(hash, lockToken, REFRESH_LOCK_MS))) return awaitOtherRefresh(hash, seenRtv);
    try {
      const session = await store.readSession(hash);
      if (session === null) return null;
      // Another replica refreshed between our read and the lock: its tokens are current.
      if (session.rtv !== seenRtv) return session.tokens.accessToken;

      let refreshed: TokenSet;
      try {
        refreshed = await oidc.refresh(session.tokens.refreshToken);
      } catch (error) {
        if (error instanceof InvalidGrantError) {
          // Only if no other refresh won meanwhile (its new refresh token is valid).
          if (await store.deleteRejectedSession(hash, session.kcSid, seenRtv, lockToken)) return null;
          const current = await store.readSession(hash);
          return current === null ? null : current.tokens.accessToken;
        }
        throw error;
      }
      const tokens = {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken || session.tokens.refreshToken,
        idToken: refreshed.idToken || session.tokens.idToken,
      };
      const saved = await store.saveRefreshedTokens(hash, seenRtv, lockToken, tokens, now() + refreshed.expiresIn * 1000);
      if (!saved) {
        // The lock expired and another replica refreshed: use what is stored now.
        const current = await store.readSession(hash);
        return current === null ? null : current.tokens.accessToken;
      }
      return tokens.accessToken;
    } finally {
      await store.releaseRefreshLock(hash, lockToken).catch(() => undefined);
    }
  }

  function singleFlightRefresh(hash: string, seenRtv: number): Promise<string | null> {
    const key = `${hash}:${String(seenRtv)}`;
    let flight = refreshing.get(key);
    if (flight === undefined) {
      flight = refresh(hash, seenRtv).finally(() => refreshing.delete(key));
      refreshing.set(key, flight);
    }
    return flight;
  }

  async function accessToken(sessionId: string | undefined, force: { rtv: number } | null): Promise<{ token: string; rtv: number } | null> {
    const loaded = await load(sessionId);
    if (loaded === null) return null;
    const { hash, session } = loaded;
    if (force === null && session.accessTokenExpiresAt - now() > REFRESH_MARGIN_MS) return { token: session.tokens.accessToken, rtv: session.rtv };
    if (force !== null && session.rtv !== force.rtv) return { token: session.tokens.accessToken, rtv: session.rtv };
    const token = await singleFlightRefresh(hash, session.rtv);
    return token === null ? null : { token, rtv: session.rtv + 1 };
  }

  return {
    async beginLogin(returnTo) {
      const state = randomState();
      const nonce = randomNonce();
      const codeVerifier = randomPKCECodeVerifier();
      const authorizationUrl = await oidc.authorizationUrl({ state, nonce, codeChallenge: await calculatePKCECodeChallenge(codeVerifier) });
      await store.saveTransaction(state, { codeVerifier, nonce, returnTo: safeReturnTo(returnTo, publicOrigin) }, LOGIN_TRANSACTION_MS);
      return { state, authorizationUrl };
    },

    async completeLogin(callbackUrl, cookieState) {
      const state = callbackUrl.searchParams.get('state');
      if (state === null || state === '' || cookieState === undefined || cookieState === '' || state !== cookieState) {
        throw new LoginFailedError('state does not match the login cookie');
      }
      const transaction = await store.takeTransaction(state);
      if (transaction === null) throw new LoginFailedError('unknown or used login transaction');

      const result = await oidc.completeLogin(callbackUrl, { state, nonce: transaction.nonce, codeVerifier: transaction.codeVerifier });
      const sessionId = newSessionId();
      const at = now();
      const session: StoredSession = {
        iss: oidc.issuer,
        sub: result.sub,
        kcSid: result.sid,
        created: at,
        lastSeen: at,
        absoluteExpiresAt: at + SESSION_ABSOLUTE_MS,
        accessTokenExpiresAt: at + result.expiresIn * 1000,
        rtv: 0,
        tokens: { accessToken: result.accessToken, refreshToken: result.refreshToken, idToken: result.idToken },
      };
      await store.createSession(sessionHash(sessionId), session, ttlOf(session, at));
      return { sessionId, returnTo: transaction.returnTo };
    },

    async cancelLogin(state, cookieState) {
      if (state !== null && state !== '' && state === cookieState) await store.takeTransaction(state);
    },

    async getSession(sessionId) {
      const loaded = await load(sessionId);
      return loaded === null ? null : { userId: loaded.session.sub };
    },

    async discardSession(sessionId) {
      if (sessionId !== '' && sessionId.length <= 128) await store.deleteSession(sessionHash(sessionId));
    },

    async getAccessToken(sessionId) {
      return (await accessToken(sessionId, null))?.token ?? null;
    },

    async withAccessToken(sessionId, call) {
      const first = await accessToken(sessionId, null);
      if (first === null) return null;
      const result = await call(first.token);
      if (result.status === 'ok') return result.value;

      const second = await accessToken(sessionId, { rtv: first.rtv });
      if (second === null) return null;
      const retried = await call(second.token);
      if (retried.status === 'ok') return retried.value;
      if (sessionId !== undefined) await store.deleteSession(sessionHash(sessionId));
      throw new SessionRejectedError();
    },

    async logout(sessionId) {
      let idToken: string | null = null;
      if (sessionId !== undefined && sessionId !== '' && sessionId.length <= 128) {
        const hash = sessionHash(sessionId);
        // Without the key of its tokens (rotation) the session is still removed, by client_id.
        const session = await store.readSession(hash).catch((error: unknown) => {
          if (error instanceof SessionKeyUnavailableError) return null;
          throw error;
        });
        idToken = session?.tokens.idToken ?? null;
        await store.deleteSession(hash);
      }
      return oidc.endSessionUrl(idToken);
    },

    fallbackLogoutUrl: () => oidc.endSessionUrl(null),

    async backchannelLogout(logoutToken) {
      const token = await verifyLogoutToken(logoutToken);
      if (!(await store.markLogoutToken(token.jti, LOGOUT_TOKEN_REPLAY_MS))) throw new ReplayedLogoutTokenError();
      try {
        return { sessions: await store.deleteKeycloakSession(token.sid) };
      } catch (error) {
        // The provider retries a failed delivery: the same token must not count as a replay.
        await store.unmarkLogoutToken(token.jti).catch(() => undefined);
        throw error;
      }
    },
  };
}
