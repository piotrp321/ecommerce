import { createClient } from '@redis/client';
import { SessionStoreUnavailableError } from './errors';
import type { RedisCommands } from './redis-commands';

const CONNECT_TIMEOUT_MS = 1000;
const COMMAND_TIMEOUT_MS = 1000;

// KEYS[1] session, KEYS[2] lock; ARGV[1] expected rtv, ARGV[2] lock token, then field/value pairs.
const CAS_SESSION = `
if redis.call('HGET', KEYS[1], 'rtv') ~= ARGV[1] then return 0 end
if redis.call('GET', KEYS[2]) ~= ARGV[2] then return 0 end
for i = 3, #ARGV, 2 do redis.call('HSET', KEYS[1], ARGV[i], ARGV[i + 1]) end
redis.call('HINCRBY', KEYS[1], 'rtv', 1)
return 1`;

// KEYS[1] session, KEYS[2] lock; ARGV[1] expected rtv, ARGV[2] lock token.
const CAS_DELETE_SESSION = `
if redis.call('HGET', KEYS[1], 'rtv') ~= ARGV[1] then return 0 end
if redis.call('GET', KEYS[2]) ~= ARGV[2] then return 0 end
return redis.call('DEL', KEYS[1])`;

const RELEASE_LOCK = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0`;

// HSET + PEXPIRE of an existing hash only: a MULTI would re-create a deleted session.
const TOUCH = `
if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
redis.call('PEXPIRE', KEYS[1], ARGV[3])
return 1`;

/**
 * `RedisCommands` over node-redis. The connection is opened lazily on the first command,
 * so the store starts (and serves the catalog) while Redis is down. Commands fail fast
 * instead of queueing (`disableOfflineQueue`, connect and command timeouts) and every
 * failure becomes `SessionStoreUnavailableError`. The URL (with the ACL password) is never
 * logged.
 */
export function createNodeRedisCommands(url: string): RedisCommands {
  const client = createClient({
    url,
    disableOfflineQueue: true,
    commandOptions: { timeout: COMMAND_TIMEOUT_MS },
    socket: {
      connectTimeout: CONNECT_TIMEOUT_MS,
      reconnectStrategy: (retries: number) => Math.min(100 * 2 ** Math.min(retries, 6), 5000),
    },
  });
  let lastLoggedError = '';
  client.on('error', (error: unknown) => {
    const code = (error as { code?: unknown }).code;
    const message = `Session store (Redis) error: ${typeof code === 'string' ? code : error instanceof Error ? error.name : 'unknown'}`;
    if (message !== lastLoggedError) console.error(message);
    lastLoggedError = message;
  });
  client.on('ready', () => {
    lastLoggedError = '';
  });

  // Read through a function: TypeScript would otherwise keep the narrowing across awaits.
  const isReady = () => client.isReady;
  let connecting: Promise<void> | undefined;
  async function ready() {
    if (isReady()) return client;
    // Once open, node-redis reconnects by itself (reconnectStrategy); a failed first
    // connect is retried by the next command.
    if (!client.isOpen && connecting === undefined) {
      connecting = client
        .connect()
        .then(
          () => undefined,
          () => undefined,
        )
        .finally(() => {
          connecting = undefined;
        });
    }
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([connecting, new Promise((resolve) => (timer = setTimeout(resolve, CONNECT_TIMEOUT_MS)))]);
    clearTimeout(timer);
    if (!isReady()) throw new SessionStoreUnavailableError();
    return client;
  }
  async function run<T>(command: (redis: Awaited<ReturnType<typeof ready>>) => Promise<T>): Promise<T> {
    const redis = await ready();
    try {
      return await command(redis);
    } catch (error) {
      throw new SessionStoreUnavailableError({ cause: error });
    }
  }

  return {
    hGetAll: (key) => run(async (redis) => ({ ...(await redis.hGetAll(key)) })),
    hSetWithTtl: (key, fields, ttlMs) =>
      run(async (redis) => {
        await redis.multi().hSet(key, fields).pExpire(key, ttlMs).exec();
      }),
    touch: (key, field, value, ttlMs) =>
      run(async (redis) => {
        await redis.eval(TOUCH, { keys: [key], arguments: [field, value, String(ttlMs)] });
      }),
    setNx: (key, value, ttlMs) =>
      run(async (redis) => (await redis.set(key, value, { condition: 'NX', expiration: { type: 'PX', value: ttlMs } })) === 'OK'),
    setWithTtl: (key, value, ttlMs) =>
      run(async (redis) => {
        await redis.set(key, value, { expiration: { type: 'PX', value: ttlMs } });
      }),
    getDel: (key) => run(async (redis) => await redis.getDel(key)),
    sAddWithTtl: (key, member, ttlMs) =>
      run(async (redis) => {
        await redis.multi().sAdd(key, member).pExpire(key, ttlMs).exec();
      }),
    sMembers: (key) => run(async (redis) => [...(await redis.sMembers(key))]),
    sRem: (key, member) =>
      run(async (redis) => {
        await redis.sRem(key, member);
      }),
    del: (keys) =>
      run(async (redis) => {
        if (keys.length > 0) await redis.del(keys);
      }),
    casSession: (sessionKey, lockKey, expectedRtv, lockToken, fields) =>
      run(
        async (redis) =>
          (await redis.eval(CAS_SESSION, {
            keys: [sessionKey, lockKey],
            arguments: [expectedRtv, lockToken, ...Object.entries(fields).flat()],
          })) === 1,
      ),
    casDeleteSession: (sessionKey, lockKey, expectedRtv, lockToken) =>
      run(async (redis) => (await redis.eval(CAS_DELETE_SESSION, { keys: [sessionKey, lockKey], arguments: [expectedRtv, lockToken] })) === 1),
    releaseLock: (lockKey, token) =>
      run(async (redis) => {
        await redis.eval(RELEASE_LOCK, { keys: [lockKey], arguments: [token] });
      }),
  };
}
