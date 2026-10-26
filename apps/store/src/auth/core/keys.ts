import { createHash, randomBytes } from 'node:crypto';

// Key layout of the session store. Every key starts with `store:`: the Redis ACL of the
// `store` user allows only this prefix. Every key is written with a TTL.

/** A new session id: 32 random bytes, base64url. Only the browser cookie holds it. */
export const newSessionId = (): string => randomBytes(32).toString('base64url');

/** The store never sees a session id, only its SHA-256 (a stolen dump does not give cookies). */
export const sessionHash = (sessionId: string): string => createHash('sha256').update(sessionId).digest('base64url');

export const keys = {
  session: (hash: string) => `store:sess:${hash}`,
  /** Sessions of one Keycloak session (`sid`), for back-channel logout. */
  keycloakSession: (sid: string) => `store:kcsid:${sid}`,
  /** A login transaction (PKCE verifier, nonce, returnTo) under its `state`. */
  transaction: (state: string) => `store:tx:${state}`,
  refreshLock: (hash: string) => `store:lock:refresh:${hash}`,
  /** A processed logout token (`jti`), against replays. */
  logoutToken: (jti: string) => `store:jti:${jti}`,
};
