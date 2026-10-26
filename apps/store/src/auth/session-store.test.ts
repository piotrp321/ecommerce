// @vitest-environment node
import { createTokenCipher, parseEncryptionKeys } from '@/auth/core/cipher';
import { keys, sessionHash } from '@/auth/core/keys';
import { createMemoryRedis } from '@/auth/core/memory-redis';
import { createSessionStore } from '@/auth/core/session-store';
import { createHarness, signIn, startLogin } from '@/test/auth-harness';
import { TEST_ENC_KEYS } from '@/test/fake-oidc';

// The session store keeps nothing forever and nothing readable (AC-8).

describe('keys in the session store', () => {
  it('every key of every kind has a TTL, none above 12 hours', async () => {
    const harness = await createHarness();
    await startLogin(harness.auth); // store:tx:*
    const { sessionId } = await signIn(harness); // store:sess:*, store:kcsid:*
    await harness.redis.setNx(keys.refreshLock(sessionHash(sessionId)), 'held', 10_000); // store:lock:refresh:*
    await harness.auth.manager.backchannelLogout(await harness.issuer.logoutToken({ sid: 'unused-sid' })); // store:jti:*

    const entries = harness.redis.dump();
    expect(new Set(entries.map((entry) => entry.key.split(':').slice(0, entry.key.startsWith('store:lock:') ? 3 : 2).join(':')))).toEqual(
      new Set(['store:tx', 'store:sess', 'store:kcsid', 'store:lock:refresh', 'store:jti']),
    );
    for (const entry of entries) {
      expect(entry.key.startsWith('store:')).toBe(true);
      expect(entry.ttlMs, entry.key).toBeGreaterThan(0);
      expect(entry.ttlMs, entry.key).toBeLessThanOrEqual(12 * 60 * 60_000);
    }
    expect(entries.find((entry) => entry.key.startsWith('store:sess:'))?.ttlMs).toBe(30 * 60_000);
    expect(entries.find((entry) => entry.key.startsWith('store:kcsid:'))?.ttlMs).toBe(12 * 60 * 60_000);
    expect(entries.find((entry) => entry.key.startsWith('store:tx:'))?.ttlMs).toBe(10 * 60_000);
    expect(entries.find((entry) => entry.key.startsWith('store:jti:'))?.ttlMs).toBe(5 * 60_000);
  });
});

describe('tokens in the session store', () => {
  it('are encrypted (AES-256-GCM, kid prefix of the active key): the raw values contain no token', async () => {
    const harness = await createHarness();
    const { sessionId } = await signIn(harness);

    const raw = harness.redis.dump().find((entry) => entry.key === keys.session(sessionHash(sessionId)))?.value as Record<string, string>;

    expect(Object.keys(raw).sort()).toEqual(['abs_exp', 'at', 'at_exp', 'created', 'idt', 'iss', 'kc_sid', 'last_seen', 'rt', 'rtv', 'sub', 'v']);
    for (const field of ['at', 'rt', 'idt']) {
      expect(raw[field]).toMatch(/^k2:[\w-]{40,}$/);
    }
    expect(JSON.stringify(harness.redis.dump())).not.toMatch(/at-1|rt-1|eyJ/);
    expect(await harness.auth.manager.getAccessToken(sessionId)).toBe('at-1');
  });

  it('cannot be moved to another field or session (AAD): such a session is removed', async () => {
    const redis = createMemoryRedis();
    const store = createSessionStore(redis, createTokenCipher(parseEncryptionKeys(TEST_ENC_KEYS)));
    const session = { iss: 'i', sub: 's', kcSid: '', created: 1, lastSeen: 1, absoluteExpiresAt: 2, accessTokenExpiresAt: 2, rtv: 0, tokens: { accessToken: 'A', refreshToken: 'R', idToken: 'I' } };
    await store.createSession('h1', session, 60_000);
    const raw = (await redis.hGetAll(keys.session('h1')));
    await redis.hSetWithTtl(keys.session('h1'), { at: raw.rt ?? '' }, 60_000);

    expect(await store.readSession('h1')).toBeNull();
    expect(await redis.hGetAll(keys.session('h1'))).toEqual({});
  });

  it('stay readable after a key rotation while the old key is still in the ring', async () => {
    const [newKey, oldKey] = parseEncryptionKeys(TEST_ENC_KEYS);
    const redis = createMemoryRedis();
    const before = createSessionStore(redis, createTokenCipher(oldKey === undefined ? [] : [oldKey]));
    const session = { iss: 'i', sub: 's', kcSid: '', created: 1, lastSeen: 1, absoluteExpiresAt: 2, accessTokenExpiresAt: 2, rtv: 0, tokens: { accessToken: 'A', refreshToken: 'R', idToken: 'I' } };
    await before.createSession('h1', session, 60_000);

    const after = createSessionStore(redis, createTokenCipher(newKey === undefined || oldKey === undefined ? [] : [newKey, oldKey]));
    expect((await after.readSession('h1'))?.tokens).toEqual({ accessToken: 'A', refreshToken: 'R', idToken: 'I' });
    const withoutOld = createSessionStore(redis, createTokenCipher(newKey === undefined ? [] : [newKey]));
    expect(await withoutOld.readSession('h1')).toBeNull();
  });
});

describe('STORE_SESSION_ENC_KEYS', () => {
  it('accepts kid:base64 entries of 32 bytes, the first one active', () => {
    expect(parseEncryptionKeys(TEST_ENC_KEYS).map((key) => key.kid)).toEqual(['k2', 'k1']);
  });

  it.each([
    ['', 'STORE_SESSION_ENC_KEYS has no keys'],
    ['nokid', 'STORE_SESSION_ENC_KEYS entry 1 is not kid:base64'],
    [`k1:${Buffer.alloc(16).toString('base64')}`, 'STORE_SESSION_ENC_KEYS key "k1" is not 32 bytes in base64'],
    [`k1:${Buffer.alloc(32).toString('base64')},k1:${Buffer.alloc(32, 1).toString('base64')}`, 'STORE_SESSION_ENC_KEYS has duplicate kids'],
  ])('rejects %j without printing the key', (value, message) => {
    expect(() => parseEncryptionKeys(value)).toThrow(message);
  });
});
