import { matchPath } from './router';

describe('matchPath', () => {
  it('extracts decoded params', () => {
    expect(matchPath('/products/:id', '/products/a%20b')).toEqual({ id: 'a b' });
  });

  it('does not match other paths', () => {
    expect(matchPath('/products/:id', '/products')).toBeNull();
    expect(matchPath('/products/:id', '/categories/1')).toBeNull();
  });

  it('treats a malformed escape as no match instead of throwing', () => {
    expect(matchPath('/products/:id', '/products/%ZZ')).toBeNull();
  });
});
