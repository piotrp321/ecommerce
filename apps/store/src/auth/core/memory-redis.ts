import { SessionStoreUnavailableError } from './errors';
import type { RedisCommands } from './redis-commands';

type Value = { type: 'string'; value: string } | { type: 'hash'; value: Map<string, string> } | { type: 'set'; value: Set<string> };

interface Entry {
  data: Value;
  /** Epoch ms; undefined = no TTL (never written by the store, reported by `ttl()`). */
  expiresAt: number | undefined;
}

export interface MemoryRedis extends RedisCommands {
  /** Raw view for tests: every live key with its TTL in ms (`-1` = no TTL) and value. */
  dump(): { key: string; ttlMs: number; value: string | Record<string, string> | string[] }[];
  /** Makes every command fail as when Redis is down. */
  setAvailable(available: boolean): void;
}

/**
 * In-memory implementation of `RedisCommands` with the semantics of Redis, scripts
 * included: NX, PX, GETDEL, lazy expiry. Each command yields to the event loop first, so
 * concurrent callers interleave like over a network. For tests (one or more "replicas"
 * sharing one instance) and never for production.
 */
export function createMemoryRedis(now: () => number = Date.now): MemoryRedis {
  const entries = new Map<string, Entry>();
  let available = true;

  const live = (key: string): Entry | undefined => {
    const entry = entries.get(key);
    if (entry?.expiresAt !== undefined && entry.expiresAt <= now()) {
      entries.delete(key);
      return undefined;
    }
    return entry;
  };
  const command = async <T>(run: () => T): Promise<T> => {
    await Promise.resolve();
    if (!available) throw new SessionStoreUnavailableError();
    return run();
  };
  const hash = (key: string): Map<string, string> | undefined => {
    const entry = live(key);
    return entry?.data.type === 'hash' ? entry.data.value : undefined;
  };
  const string = (key: string): string | undefined => {
    const entry = live(key);
    return entry?.data.type === 'string' ? entry.data.value : undefined;
  };
  const expire = (key: string, ttlMs: number) => {
    const entry = live(key);
    if (entry !== undefined) entry.expiresAt = now() + ttlMs;
  };

  return {
    hGetAll: (key) => command(() => Object.fromEntries(hash(key) ?? [])),
    hSetWithTtl: (key, fields, ttlMs) =>
      command(() => {
        const existing = hash(key);
        const value = existing ?? new Map<string, string>();
        for (const [field, fieldValue] of Object.entries(fields)) value.set(field, fieldValue);
        if (existing === undefined) entries.set(key, { data: { type: 'hash', value }, expiresAt: undefined });
        expire(key, ttlMs);
      }),
    touch: (key, field, value, ttlMs) =>
      command(() => {
        const existing = hash(key);
        if (existing === undefined) return;
        existing.set(field, value);
        expire(key, ttlMs);
      }),
    setNx: (key, value, ttlMs) =>
      command(() => {
        if (live(key) !== undefined) return false;
        entries.set(key, { data: { type: 'string', value }, expiresAt: now() + ttlMs });
        return true;
      }),
    setWithTtl: (key, value, ttlMs) =>
      command(() => {
        entries.set(key, { data: { type: 'string', value }, expiresAt: now() + ttlMs });
      }),
    getDel: (key) =>
      command(() => {
        const value = string(key);
        entries.delete(key);
        return value ?? null;
      }),
    sAddWithTtl: (key, member, ttlMs) =>
      command(() => {
        const entry = live(key);
        if (entry?.data.type === 'set') entry.data.value.add(member);
        else entries.set(key, { data: { type: 'set', value: new Set([member]) }, expiresAt: undefined });
        expire(key, ttlMs);
      }),
    sMembers: (key) =>
      command(() => {
        const entry = live(key);
        return entry?.data.type === 'set' ? [...entry.data.value] : [];
      }),
    sRem: (key, member) =>
      command(() => {
        const entry = live(key);
        if (entry?.data.type !== 'set') return;
        entry.data.value.delete(member);
        if (entry.data.value.size === 0) entries.delete(key);
      }),
    del: (keys) =>
      command(() => {
        for (const key of keys) entries.delete(key);
      }),
    casSession: (sessionKey, lockKey, expectedRtv, lockToken, fields) =>
      command(() => {
        const session = hash(sessionKey);
        if (session?.get('rtv') !== expectedRtv || string(lockKey) !== lockToken) return false;
        for (const [field, value] of Object.entries(fields)) session.set(field, value);
        session.set('rtv', String(Number(expectedRtv) + 1));
        return true;
      }),
    releaseLock: (lockKey, token) =>
      command(() => {
        if (string(lockKey) === token) entries.delete(lockKey);
      }),
    dump: () =>
      [...entries.keys()].flatMap((key) => {
        const entry = live(key);
        if (entry === undefined) return [];
        const ttlMs = entry.expiresAt === undefined ? -1 : entry.expiresAt - now();
        const { data } = entry;
        const value = data.type === 'string' ? data.value : data.type === 'hash' ? Object.fromEntries(data.value) : [...data.value];
        return [{ key, ttlMs, value }];
      }),
    setAvailable: (value) => {
      available = value;
    },
  };
}
