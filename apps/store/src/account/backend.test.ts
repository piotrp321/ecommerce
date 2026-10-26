// @vitest-environment node
import { createAccountApi } from './backend';

vi.mock('@/auth/session', () => ({ withAccessToken: vi.fn() }));

// `GET /me` of the backend with the access token as Bearer.
describe('createAccountApi().me', () => {
  const api = (fetchMock: typeof fetch) => createAccountApi({ baseUrl: 'http://backend', fetch: fetchMock });

  it('sends the token as Bearer to the backend and maps the profile', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(Response.json({ id: 'u-1', email: 'customer@example.test', emailVerified: true, extra: 'dropped' })));

    expect(await api(fetchMock).me('at-1')).toEqual({ status: 'ok', value: { id: 'u-1', email: 'customer@example.test', emailVerified: true } });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend/me',
      expect.objectContaining({ headers: { Accept: 'application/json', Authorization: 'Bearer at-1' }, cache: 'no-store', redirect: 'error' }),
    );
  });

  it('accepts email: null', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(Response.json({ id: 'u-1', email: null, emailVerified: false })));
    expect(await api(fetchMock).me('t')).toEqual({ status: 'ok', value: { id: 'u-1', email: null, emailVerified: false } });
  });

  it('reports 401 as unauthorized (the caller refreshes once)', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(Response.json({ title: 'Unauthorized' }, { status: 401, headers: { 'WWW-Authenticate': 'Bearer error="invalid_token"' } })),
    );
    expect(await api(fetchMock).me('t')).toEqual({ status: 'unauthorized' });
  });

  it.each([
    ['403', () => Promise.resolve(new Response(null, { status: 403 }))],
    ['500', () => Promise.resolve(new Response(null, { status: 500 }))],
    ['a network error', () => Promise.reject(new TypeError('fetch failed'))],
    ['a body outside the contract', () => Promise.resolve(Response.json({ id: 1 }))],
  ])('throws on %s without the address or the token in the message', async (_, respond) => {
    const error: unknown = await api(vi.fn(respond)).me('secret-token').catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toContain('Account API: GET /me');
    expect(String(error)).not.toMatch(/secret-token|backend/);
  });
});
