// @vitest-environment node
import { CrossOriginRequestError, assertSameOrigin, isSameOrigin } from './same-origin';

const ORIGIN = 'https://sklep.example.test';

// CSRF check of state-changing Server Actions (AC-5).
describe('isSameOrigin', () => {
  it('accepts the public origin of the store', () => {
    expect(isSameOrigin(new Headers({ origin: ORIGIN }), ORIGIN)).toBe(true);
  });

  it.each([
    ['another origin', { origin: 'https://evil.example' }],
    ['another scheme', { origin: 'http://sklep.example.test' }],
    ['another port', { origin: 'https://sklep.example.test:8443' }],
    ['a subdomain', { origin: 'https://evil.sklep.example.test' }],
    ['"null" (sandboxed frame, redirect)', { origin: 'null' }],
    ['no Origin and no Sec-Fetch-Site', {}],
    ['no Origin, cross-site fetch', { 'sec-fetch-site': 'cross-site' }],
    ['no Origin, same-site but another subdomain', { 'sec-fetch-site': 'same-site' }],
    ['a foreign Origin even with Sec-Fetch-Site: same-origin', { origin: 'https://evil.example', 'sec-fetch-site': 'same-origin' }],
  ])('rejects %s', (_, headers: Record<string, string>) => {
    expect(isSameOrigin(new Headers(headers), ORIGIN)).toBe(false);
    expect(() => {
      assertSameOrigin(new Headers(headers), ORIGIN);
    }).toThrow(CrossOriginRequestError);
  });

  it('compares with the public origin, not with Host or X-Forwarded-Host', () => {
    const headers = new Headers({ origin: 'https://evil.example', host: 'evil.example', 'x-forwarded-host': 'evil.example' });
    expect(isSameOrigin(headers, ORIGIN)).toBe(false);
  });

  it('accepts a request without Origin that the browser marks Sec-Fetch-Site: same-origin', () => {
    expect(isSameOrigin(new Headers({ 'sec-fetch-site': 'same-origin' }), ORIGIN)).toBe(true);
  });
});
