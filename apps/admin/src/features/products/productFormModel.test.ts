import { emptyProductForm, validateProductForm } from './productFormModel';

const valid = {
  ...emptyProductForm,
  sku: 'AUD-01',
  name: '  Słuchawki  ',
  slug: 'sluchawki',
  netPrice: '199,9',
  vatRate: '8',
};

describe('validateProductForm', () => {
  it('builds the API input with a normalised decimal price', () => {
    const { errors, input } = validateProductForm(valid, 'create');

    expect(errors).toEqual({});
    expect(input).toEqual({
      sku: 'AUD-01',
      name: 'Słuchawki',
      slug: 'sluchawki',
      description: null,
      categoryId: null,
      netPrice: '199.90',
      vatRate: 8,
    });
  });

  it('reports every invalid field', () => {
    const { errors, input } = validateProductForm(
      { ...emptyProductForm, sku: 'bad sku', slug: 'Bad Slug', netPrice: '1,999', vatRate: '7' },
      'create',
    );

    expect(input).toBeNull();
    expect(Object.keys(errors).sort()).toEqual(['name', 'netPrice', 'sku', 'slug', 'vatRate']);
  });

  it('does not require the SKU when editing (it is immutable)', () => {
    expect(validateProductForm({ ...valid, sku: '' }, 'edit').errors).toEqual({});
  });

  it('rejects prices longer than the contract allows', () => {
    expect(validateProductForm({ ...valid, netPrice: '12345678' }, 'create').errors.netPrice).toBeDefined();
  });
});
