import { UnknownEncryptionKeyError } from './cipher';
import type { TokenCipher } from './cipher';
import { SessionKeyUnavailableError } from './errors';
import { keys } from './keys';
import type { RedisCommands } from './redis-commands';

/** Data of a login in progress, kept under its `state` until the callback (once). */
export interface LoginTransaction {
  codeVerifier: string;
  nonce: string;
  returnTo: string;
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  idToken: string;
}

export interface StoredSession {
  iss: string;
  sub: string;
  /** Keycloak session id (`sid` of the ID token); empty when the token had none. */
  kcSid: string;
  /** Epoch ms. */
  created: number;
  lastSeen: number;
  absoluteExpiresAt: number;
  accessTokenExpiresAt: number;
  /** Refresh token version: incremented by every refresh (compare-and-set between replicas). */
  rtv: number;
  tokens: SessionTokens;
}

/**
 * The session store port. Sessions are addressed by the hash of their id. Tokens are
 * encrypted before they leave the process; every key gets a TTL.
 */
export interface SessionStore {
  saveTransaction(state: string, transaction: LoginTransaction, ttlMs: number): Promise<void>;
  /** The transaction once (GETDEL): a replayed callback finds nothing. */
  takeTransaction(state: string): Promise<LoginTransaction | null>;
  createSession(hash: string, session: StoredSession, ttlMs: number): Promise<void>;
  /**
   * null for a missing session or a modified one (removed). A token encrypted with a key this
   * replica does not have throws `SessionKeyUnavailableError` and the session is kept.
   */
  readSession(hash: string): Promise<StoredSession | null>;
  touchSession(hash: string, lastSeen: number, ttlMs: number): Promise<void>;
  /** Removes the session and its back-channel index entry. */
  deleteSession(hash: string): Promise<void>;
  /** Removes every session of a Keycloak session (back-channel logout); returns their number. */
  deleteKeycloakSession(sid: string): Promise<number>;
  acquireRefreshLock(hash: string, token: string, ttlMs: number): Promise<boolean>;
  releaseRefreshLock(hash: string, token: string): Promise<void>;
  /** Removes a session whose refresh token was rejected, unless another refresh won meanwhile (rtv, lock). */
  deleteRejectedSession(hash: string, kcSid: string, expectedRtv: number, lockToken: string): Promise<boolean>;
  /** Compare-and-set: false when another refresh won (rtv changed) or the lock was lost. */
  saveRefreshedTokens(hash: string, expectedRtv: number, lockToken: string, tokens: SessionTokens, accessTokenExpiresAt: number): Promise<boolean>;
  /** true the first time a logout token `jti` is seen within `ttlMs`. */
  markLogoutToken(jti: string, ttlMs: number): Promise<boolean>;
  /** Forgets a `jti` whose logout failed, so the provider can retry it. */
  unmarkLogoutToken(jti: string): Promise<void>;
}

const TOKEN_FIELDS = { accessToken: 'at', refreshToken: 'rt', idToken: 'idt' } as const;
const SCHEMA_VERSION = '1';

export function createSessionStore(redis: RedisCommands, cipher: TokenCipher): SessionStore {
  const encryptTokens = (key: string, tokens: SessionTokens): Record<string, string> =>
    Object.fromEntries(
      Object.entries(TOKEN_FIELDS).map(([name, field]) => [field, cipher.encrypt(tokens[name as keyof SessionTokens], `${key}|${field}`)]),
    );

  async function deleteSession(hash: string): Promise<void> {
    const key = keys.session(hash);
    const { kc_sid: kcSid } = await redis.hGetAll(key);
    await redis.del([key]);
    if (kcSid !== undefined && kcSid !== '') await redis.sRem(keys.keycloakSession(kcSid), hash);
  }

  return {
    saveTransaction: (state, transaction, ttlMs) => redis.setWithTtl(keys.transaction(state), JSON.stringify(transaction), ttlMs),

    async takeTransaction(state) {
      const raw = await redis.getDel(keys.transaction(state));
      if (raw === null) return null;
      const value = JSON.parse(raw) as Partial<LoginTransaction>;
      const { codeVerifier, nonce, returnTo } = value;
      return typeof codeVerifier === 'string' && typeof nonce === 'string' && typeof returnTo === 'string' ? { codeVerifier, nonce, returnTo } : null;
    },

    async createSession(hash, session, ttlMs) {
      const key = keys.session(hash);
      await redis.hSetWithTtl(
        key,
        {
          v: SCHEMA_VERSION,
          iss: session.iss,
          sub: session.sub,
          kc_sid: session.kcSid,
          created: String(session.created),
          last_seen: String(session.lastSeen),
          abs_exp: String(session.absoluteExpiresAt),
          at_exp: String(session.accessTokenExpiresAt),
          rtv: String(session.rtv),
          ...encryptTokens(key, session.tokens),
        },
        ttlMs,
      );
      // The index lives as long as the longest session in it can (absolute lifetime).
      if (session.kcSid !== '') await redis.sAddWithTtl(keys.keycloakSession(session.kcSid), hash, Math.max(1, session.absoluteExpiresAt - session.created));
    },

    async readSession(hash) {
      const key = keys.session(hash);
      const raw = await redis.hGetAll(key);
      if (raw.v !== SCHEMA_VERSION) {
        if (raw.v !== undefined) await deleteSession(hash);
        return null;
      }
      try {
        const decrypt = (field: string) => cipher.decrypt(raw[field] ?? '', `${key}|${field}`);
        return {
          iss: raw.iss ?? '',
          sub: raw.sub ?? '',
          kcSid: raw.kc_sid ?? '',
          created: Number(raw.created),
          lastSeen: Number(raw.last_seen),
          absoluteExpiresAt: Number(raw.abs_exp),
          accessTokenExpiresAt: Number(raw.at_exp),
          rtv: Number(raw.rtv),
          tokens: { accessToken: decrypt(TOKEN_FIELDS.accessToken), refreshToken: decrypt(TOKEN_FIELDS.refreshToken), idToken: decrypt(TOKEN_FIELDS.idToken) },
        };
      } catch (error) {
        // Another replica may already encrypt with a key this one does not have (rotation):
        // the session stays for the replicas that can read it.
        if (error instanceof UnknownEncryptionKeyError) throw new SessionKeyUnavailableError({ cause: error });
        // A modified value or a value moved to another field: the session cannot be used.
        await deleteSession(hash);
        return null;
      }
    },

    touchSession: (hash, lastSeen, ttlMs) => redis.touch(keys.session(hash), 'last_seen', String(lastSeen), ttlMs),

    deleteSession,

    async deleteKeycloakSession(sid) {
      const index = keys.keycloakSession(sid);
      const hashes = await redis.sMembers(index);
      await redis.del([...hashes.map((hash) => keys.session(hash)), index]);
      return hashes.length;
    },

    acquireRefreshLock: (hash, token, ttlMs) => redis.setNx(keys.refreshLock(hash), token, ttlMs),
    releaseRefreshLock: (hash, token) => redis.releaseLock(keys.refreshLock(hash), token),

    saveRefreshedTokens(hash, expectedRtv, lockToken, tokens, accessTokenExpiresAt) {
      const key = keys.session(hash);
      return redis.casSession(key, keys.refreshLock(hash), String(expectedRtv), lockToken, {
        ...encryptTokens(key, tokens),
        at_exp: String(accessTokenExpiresAt),
      });
    },

    async deleteRejectedSession(hash, kcSid, expectedRtv, lockToken) {
      const deleted = await redis.casDeleteSession(keys.session(hash), keys.refreshLock(hash), String(expectedRtv), lockToken);
      if (deleted && kcSid !== '') await redis.sRem(keys.keycloakSession(kcSid), hash);
      return deleted;
    },

    markLogoutToken: (jti, ttlMs) => redis.setNx(keys.logoutToken(jti), '1', ttlMs),
    unmarkLogoutToken: (jti) => redis.del([keys.logoutToken(jti)]),
  };
}
