import { ApiError, errorMessage, unmappedViolations, violationsByField } from './errors';

const validation = new ApiError({
  status: 422,
  title: 'Validation Failed',
  violations: [
    { propertyPath: 'slug', title: 'Invalid slug.' },
    { propertyPath: 'price.net', title: 'Too many digits.' },
  ],
});

describe('API errors', () => {
  it('maps violations to fields', () => {
    expect(violationsByField(validation)).toEqual({ slug: 'Invalid slug.', 'price.net': 'Too many digits.' });
  });

  it('spells out violations the form cannot mark', () => {
    expect(unmappedViolations(validation, ['slug'])).toEqual([{ propertyPath: 'price.net', title: 'Too many digits.' }]);
    expect(errorMessage(validation, ['slug'])).toBe('Nieprawidłowe dane: Too many digits. (price.net)');
  });

  it('points to the marked fields when every violation is mapped', () => {
    expect(errorMessage(validation, ['slug', 'price.net'])).toBe('Popraw zaznaczone pola formularza.');
  });

  it('lists all violations where nothing is marked (e.g. a list query)', () => {
    expect(errorMessage(validation)).toBe('Nieprawidłowe dane: Invalid slug. (slug) Too many digits. (price.net)');
  });

  it('shows the business rule detail, and hides details of unknown errors', () => {
    expect(errorMessage(new ApiError({ status: 409, title: 'Conflict', detail: 'Duplicate SKU.' }))).toBe('Duplicate SKU.');
    expect(errorMessage(new Error('boom'))).toBe('Wystąpił nieoczekiwany błąd. Spróbuj ponownie.');
  });
});
