// @vitest-environment node
import { safeReturnTo } from './return-to';

const ORIGIN = 'https://sklep.example.test';

// `powrot` of /logowanie: only a local page of the store, never an open redirect (AC-5).
describe('safeReturnTo', () => {
  it.each([
    ['/', '/'],
    ['/konto', '/konto'],
    ['/produkty?strona=2&sortowanie=cena', '/produkty?strona=2&sortowanie=cena'],
    ['/kategoria/audio#lista', '/kategoria/audio#lista'],
    ['/produkt/s%C5%82uchawki', '/produkt/s%C5%82uchawki'],
    ['/logowanie-pomoc', '/logowanie-pomoc'],
  ])('keeps the local path %j', (value, expected) => {
    expect(safeReturnTo(value, ORIGIN)).toBe(expected);
  });

  it.each([
    ['missing', null],
    ['empty', ''],
    ['protocol-relative', '//evil.example/konto'],
    ['protocol-relative with a backslash', '/\\evil.example'],
    ['backslashes', '\\\\evil.example'],
    ['a backslash later in the path', '/konto\\..\\\\evil.example'],
    ['an absolute URL of another origin', 'https://evil.example/konto'],
    ['an absolute URL of the store itself', `${ORIGIN}/konto`],
    ['javascript:', 'javascript:alert(1)'],
    ['data:', 'data:text/html,<script>alert(1)</script>'],
    ['a relative path', 'konto'],
    ['a tab (browsers drop it: /\t/evil.example)', '/\t/evil.example'],
    ['a newline', '/konto\nLocation: https://evil.example'],
    ['the login route', '/logowanie?powrot=/konto'],
    ['the login error page', '/logowanie/blad'],
    ['the callback', '/auth/callback?code=x'],
    ['the back-channel logout', '/auth/backchannel-logout'],
    ['an encoded auth route', '/%61uth/callback'],
    ['an auth route in another case', '/LOGOWANIE'],
    ['a path resolving to an auth route', '/konto/../logowanie'],
    ['a path longer than 2048 characters', `/${'a'.repeat(2048)}`],
  ])('falls back to the home page for %s', (_, value) => {
    expect(safeReturnTo(value, ORIGIN)).toBe('/');
  });
});
