// @vitest-environment node
import { keys, sessionHash } from '@/auth/core/keys';
import { AuthUnavailableError, SessionRejectedError } from '@/auth/core/errors';
import { createHarness, signIn } from '@/test/auth-harness';
import type { Harness } from '@/test/auth-harness';

// Sessions of the BFF on the shared session store: refresh single flight within and
// between replicas (AC-3), lifetime, back-end calls with a rejected token.

const refreshRequests = (harness: Harness) => harness.issuer.tokenRequests.filter((body) => body.get('grant_type') === 'refresh_token');

/** Moves the clock so the access token (300 s) is 10 s from expiry. */
const nearExpiry = (harness: Harness) => {
  harness.clock.now += 290_000;
};

describe('getAccessToken', () => {
  it('returns the stored access token while it is valid for more than 30 s, without a token request', async () => {
    const harness = await createHarness();
    const { sessionId } = await signIn(harness);
    harness.clock.now += 260_000;

    expect(await harness.auth.manager.getAccessToken(sessionId)).toBe('at-1');
    expect(refreshRequests(harness)).toHaveLength(0);
  });

  it('refreshes a token that expires within 30 s and stores the rotated refresh token', async () => {
    const harness = await createHarness();
    const { sessionId } = await signIn(harness);
    nearExpiry(harness);

    expect(await harness.auth.manager.getAccessToken(sessionId)).toBe('at-2');
    expect(refreshRequests(harness).map((body) => body.get('refresh_token'))).toEqual(['rt-1']);
    expect(harness.redis.dump().find((entry) => entry.key === keys.session(sessionHash(sessionId)))?.value).toMatchObject({ rtv: '1' });

    nearExpiry(harness);
    expect(await harness.auth.manager.getAccessToken(sessionId)).toBe('at-3');
    expect(refreshRequests(harness).map((body) => body.get('refresh_token'))).toEqual(['rt-1', 'rt-2']);
  });

  it('calls the token endpoint exactly once for 10 parallel calls in one replica', async () => {
    const harness = await createHarness();
    const { sessionId } = await signIn(harness);
    nearExpiry(harness);
    harness.issuer.tokenDelayMs = 50;

    const tokens = await Promise.all(Array.from({ length: 10 }, () => harness.auth.manager.getAccessToken(sessionId)));

    expect(tokens).toEqual(Array.from({ length: 10 }, () => 'at-2'));
    expect(refreshRequests(harness)).toHaveLength(1);
  });

  it('calls the token endpoint exactly once for 10 parallel calls split over two replicas on one store', async () => {
    const harness = await createHarness();
    const { sessionId } = await signIn(harness);
    const other = harness.replica();
    nearExpiry(harness);
    harness.issuer.tokenDelayMs = 150;

    const tokens = await Promise.all(Array.from({ length: 10 }, (_, index) => (index % 2 === 0 ? harness.auth : other).manager.getAccessToken(sessionId)));

    expect(tokens).toEqual(Array.from({ length: 10 }, () => 'at-2'));
    expect(refreshRequests(harness)).toHaveLength(1);
    // The lock is released (compare-and-delete) after the refresh.
    expect(harness.redis.dump().filter((entry) => entry.key.startsWith('store:lock:'))).toEqual([]);
  });

  it('on invalid_grant removes the session: the user is anonymous', async () => {
    const harness = await createHarness();
    const { sessionId } = await signIn(harness, harness.auth, { sid: 'kc-9' });
    nearExpiry(harness);
    harness.issuer.refreshMode = 'invalid_grant';

    expect(await harness.auth.manager.getAccessToken(sessionId)).toBeNull();
    expect(await harness.auth.manager.getSession(sessionId)).toBeNull();
    expect(harness.redis.dump().map((entry) => entry.key)).toEqual([]);
  });

  it('on invalid_grant keeps the session when another refresh won meanwhile (lock lost, rtv changed)', async () => {
    const harness = await createHarness();
    const { sessionId } = await signIn(harness);
    const hash = sessionHash(sessionId);
    nearExpiry(harness);
    harness.issuer.refreshMode = 'invalid_grant';
    harness.issuer.tokenDelayMs = 50;

    const pending = harness.auth.manager.getAccessToken(sessionId);
    await new Promise((resolve) => setTimeout(resolve, 20));
    // Our lock expired; another replica took it and stored rotated tokens (rtv 0 -> 1).
    await harness.redis.del([keys.refreshLock(hash)]);
    await harness.redis.setNx(keys.refreshLock(hash), 'other-replica', 10_000);
    await harness.redis.casSession(keys.session(hash), keys.refreshLock(hash), '0', 'other-replica', {});

    expect(await pending).toBe('at-1');
    expect(await harness.auth.manager.getSession(sessionId)).toEqual({ userId: 'user-1' });
  });

  it.each(['network', 'server_error'] as const)('on a %s error keeps the session and fails as unavailable (503)', async (mode) => {
    const harness = await createHarness();
    const { sessionId } = await signIn(harness);
    nearExpiry(harness);
    harness.issuer.refreshMode = mode;

    await expect(harness.auth.manager.getAccessToken(sessionId)).rejects.toBeInstanceOf(AuthUnavailableError);
    expect(await harness.auth.manager.getSession(sessionId)).toEqual({ userId: 'user-1' });

    harness.issuer.refreshMode = 'ok';
    expect(await harness.auth.manager.getAccessToken(sessionId)).toBe('at-2');
  });

  it('keeps the session when another replica holds the refresh lock for longer than 3 s', async () => {
    const harness = await createHarness();
    const { sessionId } = await signIn(harness);
    nearExpiry(harness);
    await harness.redis.setNx(keys.refreshLock(sessionHash(sessionId)), 'other-replica', 10_000);

    await expect(harness.auth.manager.getAccessToken(sessionId)).rejects.toBeInstanceOf(AuthUnavailableError);
    expect(refreshRequests(harness)).toHaveLength(0);
    expect(await harness.auth.manager.getSession(sessionId)).toEqual({ userId: 'user-1' });
  }, 10_000);

  it('does not overwrite tokens when the session changed meanwhile (compare-and-set on rtv)', async () => {
    const harness = await createHarness();
    const { sessionId } = await signIn(harness);
    const hash = sessionHash(sessionId);
    expect(await harness.redis.casSession(keys.session(hash), keys.refreshLock(hash), '0', 'not-the-lock', { at_exp: '0' })).toBe(false);
    await harness.redis.setNx(keys.refreshLock(hash), 'mine', 10_000);
    expect(await harness.redis.casSession(keys.session(hash), keys.refreshLock(hash), '5', 'mine', { at_exp: '0' })).toBe(false);
    expect(await harness.redis.casSession(keys.session(hash), keys.refreshLock(hash), '0', 'mine', { at_exp: '1' })).toBe(true);
    expect(harness.redis.dump().find((entry) => entry.key === keys.session(hash))?.value).toMatchObject({ rtv: '1', at_exp: '1' });
  });
});

describe('session lifetime', () => {
  it('ends after 30 minutes without activity', async () => {
    const harness = await createHarness();
    const { sessionId } = await signIn(harness);
    harness.clock.now += 30 * 60_000;

    expect(await harness.auth.manager.getSession(sessionId)).toBeNull();
  });

  it('slides with activity (written at most once a minute) but ends after 12 hours', async () => {
    const harness = await createHarness();
    const { sessionId } = await signIn(harness);
    const key = keys.session(sessionHash(sessionId));
    const lastSeen = () => harness.redis.dump().find((entry) => entry.key === key)?.value as Record<string, string> | undefined;

    const start = harness.clock.now;
    harness.clock.now += 30_000;
    await harness.auth.manager.getSession(sessionId);
    expect(lastSeen()?.last_seen).toBe(String(start));

    for (let minutes = 20; minutes < 12 * 60; minutes += 20) {
      harness.clock.now = start + minutes * 60_000;
      expect(await harness.auth.manager.getSession(sessionId)).toEqual({ userId: 'user-1' });
    }
    expect(lastSeen()?.last_seen).toBe(String(start + (12 * 60 - 20) * 60_000));

    harness.clock.now = start + 12 * 60 * 60_000;
    expect(await harness.auth.manager.getSession(sessionId)).toBeNull();
  });

  it('ignores unknown and malformed session ids', async () => {
    const harness = await createHarness();
    expect(await harness.auth.manager.getSession(undefined)).toBeNull();
    expect(await harness.auth.manager.getSession('')).toBeNull();
    expect(await harness.auth.manager.getSession('x'.repeat(500))).toBeNull();
    expect(await harness.auth.manager.getSession('unknown')).toBeNull();
  });
});

describe('withAccessToken (backend call with a 401)', () => {
  it('refreshes once and retries when the backend rejects a token that looked valid', async () => {
    const harness = await createHarness();
    const { sessionId } = await signIn(harness);
    const seen: string[] = [];

    const result = await harness.auth.manager.withAccessToken(sessionId, (token) => {
      seen.push(token);
      return Promise.resolve(token === 'at-1' ? { status: 'unauthorized' as const } : { status: 'ok' as const, value: 'profile' });
    });

    expect(result).toBe('profile');
    expect(seen).toEqual(['at-1', 'at-2']);
    expect(refreshRequests(harness)).toHaveLength(1);
  });

  it('ends the session after a second 401 and fails instead of returning "no session" (no login redirect loop)', async () => {
    const harness = await createHarness();
    const { sessionId } = await signIn(harness);

    await expect(harness.auth.manager.withAccessToken(sessionId, () => Promise.resolve({ status: 'unauthorized' as const }))).rejects.toBeInstanceOf(
      SessionRejectedError,
    );
    expect(refreshRequests(harness)).toHaveLength(1);
    expect(await harness.auth.manager.getSession(sessionId)).toBeNull();
  });
});

describe('two sessions', () => {
  it('never see each other: each id gives its own user and tokens', async () => {
    const harness = await createHarness();
    const anna = await signIn(harness, harness.auth, { sub: 'anna', sid: 'kc-anna' });
    const jan = await signIn(harness, harness.auth, { sub: 'jan', sid: 'kc-jan' });

    expect(await harness.auth.manager.getSession(anna.sessionId)).toEqual({ userId: 'anna' });
    expect(await harness.auth.manager.getSession(jan.sessionId)).toEqual({ userId: 'jan' });
    expect(await harness.auth.manager.getAccessToken(anna.sessionId)).toBe('at-1');
    expect(await harness.auth.manager.getAccessToken(jan.sessionId)).toBe('at-2');
  });
});
