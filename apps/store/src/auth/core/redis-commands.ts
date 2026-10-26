/**
 * The Redis commands the session store needs, as one narrow port. Two adapters implement
 * it: node-redis (`node-redis.ts`, production) and an in-memory one (`memory-redis.ts`,
 * tests) with the same semantics, scripts included. Every write sets a TTL. Failures of
 * the connection surface as `SessionStoreUnavailableError`.
 */
export interface RedisCommands {
  /** HGETALL; an empty object when the key does not exist. */
  hGetAll(key: string): Promise<Record<string, string>>;
  /** HSET of all fields and PEXPIRE, atomically (MULTI). */
  hSetWithTtl(key: string, fields: Record<string, string>, ttlMs: number): Promise<void>;
  /** HSET of one field and PEXPIRE, atomically (MULTI); a no-op for a missing key. */
  touch(key: string, field: string, value: string, ttlMs: number): Promise<void>;
  /** SET key value NX PX ttl; true when this call created the key. */
  setNx(key: string, value: string, ttlMs: number): Promise<boolean>;
  /** SET key value PX ttl. */
  setWithTtl(key: string, value: string, ttlMs: number): Promise<void>;
  /** GETDEL: the value once, never twice. */
  getDel(key: string): Promise<string | null>;
  /** SADD and PEXPIRE, atomically (MULTI). */
  sAddWithTtl(key: string, member: string, ttlMs: number): Promise<void>;
  sMembers(key: string): Promise<string[]>;
  sRem(key: string, member: string): Promise<void>;
  del(keys: string[]): Promise<void>;
  /**
   * Compare-and-set of a session after a refresh (Lua): writes `fields` and increments `rtv`
   * only if the session still has `expectedRtv` and the lock still holds `lockToken`.
   */
  casSession(sessionKey: string, lockKey: string, expectedRtv: string, lockToken: string, fields: Record<string, string>): Promise<boolean>;
  /**
   * Compare-and-delete of a session (Lua): deletes it only if it still has `expectedRtv` and
   * the lock still holds `lockToken`; true when deleted.
   */
  casDeleteSession(sessionKey: string, lockKey: string, expectedRtv: string, lockToken: string): Promise<boolean>;
  /** Compare-and-delete (Lua): deletes the lock only if it still holds `token`. */
  releaseLock(lockKey: string, token: string): Promise<void>;
}
