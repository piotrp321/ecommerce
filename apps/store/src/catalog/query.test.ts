import { isPastLastPage, listingHref, parseListingParams, toProductQuery } from './query';

describe('listing query parameters', () => {
  it('maps the store parameters to the API query', () => {
    const params = parseListingParams({ sortowanie: 'cena-malejaco', strona: '2' });

    expect(params).toEqual({ sort: 'cena-malejaco', page: 2 });
    expect(toProductQuery(params, 'audio')).toEqual({ category: 'audio', sort: '-price', page: 2, perPage: 12 });
    expect(toProductQuery(params)).not.toHaveProperty('category');
  });

  it.each([
    [{}, { sort: 'nazwa', page: 1 }],
    [{ sortowanie: 'losowo', strona: '0' }, { sort: 'nazwa', page: 1 }],
    [{ strona: '-3' }, { sort: 'nazwa', page: 1 }],
    [{ strona: '2abc' }, { sort: 'nazwa', page: 1 }],
    [{ sortowanie: ['cena-rosnaco', 'nazwa'], strona: ['3'] }, { sort: 'cena-rosnaco', page: 3 }],
  ])('falls back to defaults for invalid values: %j', (input, expected) => {
    expect(parseListingParams(input)).toEqual(expected);
  });

  it('builds canonical links without default values', () => {
    expect(listingHref('/produkty', { sort: 'nazwa', page: 1 })).toBe('/produkty');
    expect(listingHref('/kategoria/audio', { sort: 'cena-rosnaco', page: 1 })).toBe('/kategoria/audio?sortowanie=cena-rosnaco');
    expect(listingHref('/produkty', { sort: 'nazwa', page: 3 })).toBe('/produkty?strona=3');
  });
});

describe('isPastLastPage', () => {
  it.each([
    [1, 0, false],
    [1, 1, false],
    [3, 3, false],
    [2, 1, true],
    [4, 3, true],
  ])('page %i of %i pages → %s', (page, totalPages, expected) => {
    expect(isPastLastPage(page, totalPages)).toBe(expected);
  });
});
