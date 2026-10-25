import { productQueryFromParams, productQueryToSearch } from './productQuery';

function parse(search: string) {
  return productQueryFromParams(new URLSearchParams(search));
}

describe('productQueryFromParams', () => {
  it('reads a valid list state', () => {
    expect(parse('q=lap&status=active&category=c0000000-0000-4000-8000-000000000002&sort=-price&page=2&perPage=50')).toEqual({
      q: 'lap',
      status: 'active',
      categoryId: 'c0000000-0000-4000-8000-000000000002',
      sort: '-price',
      page: 2,
      perPage: 50,
    });
  });

  it('falls back to defaults for values the UI and the contract do not support', () => {
    const query = parse(`q=${'x'.repeat(150)}&status=nope&category=garbage&sort=random&page=-1&perPage=37`);

    expect(query.q).toHaveLength(100);
    expect(query).toMatchObject({ status: 'all', categoryId: undefined, sort: 'newest', page: 1, perPage: 20 });
  });

  it('writes only non-default values back to the URL', () => {
    expect(productQueryToSearch(parse('perPage=20&page=1&status=all'))).toBe('');
    expect(productQueryToSearch(parse('q=a b&page=3'))).toBe('?q=a+b&page=3');
  });
});
