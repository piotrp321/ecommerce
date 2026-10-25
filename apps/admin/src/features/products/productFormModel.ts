import type { CreateProductInput, Product, VatRate } from '../../api/types';
import { amountToInput, normalizeAmountInput } from '../../lib/money';

/** VAT rates offered in the form, as listed by the catalog contract (docs/api/openapi.yaml). The backend validates them. */
export const VAT_RATE_OPTIONS: readonly VatRate[] = [23, 8, 5, 0];

export interface ProductFormValues {
  sku: string;
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  netPrice: string;
  vatRate: string;
}

export type ProductFormField = keyof ProductFormValues;
export type ProductFormErrors = Partial<Record<ProductFormField, string>>;

export const emptyProductForm: ProductFormValues = {
  sku: '',
  name: '',
  slug: '',
  description: '',
  categoryId: '',
  netPrice: '',
  vatRate: '23',
};

export function productToForm(product: Product): ProductFormValues {
  return {
    sku: product.sku,
    name: product.name,
    slug: product.slug,
    description: product.description ?? '',
    categoryId: product.category?.id ?? '',
    netPrice: amountToInput(product.price.net.amount),
    vatRate: String(product.price.vatRate),
  };
}

const SKU = /^[A-Z0-9][A-Z0-9_-]{0,63}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NET_PRICE = /^(0|[1-9]\d{0,6})\.\d{2}$/;

/**
 * Format checks taken from the catalog contract, for quick feedback while typing.
 * Business rules (unique SKU/slug, price range, existing category) are checked
 * only by the backend, and its answer is shown in the form.
 */
export function validateProductForm(
  values: ProductFormValues,
  mode: 'create' | 'edit',
): { errors: ProductFormErrors; input: CreateProductInput | null } {
  const errors: ProductFormErrors = {};
  const sku = values.sku.trim();
  const name = values.name.trim();
  const slug = values.slug.trim();
  const description = values.description.trim();

  if (mode === 'create') {
    if (sku === '') errors.sku = 'Podaj SKU.';
    else if (!SKU.test(sku)) errors.sku = 'Wielkie litery, cyfry, „-” i „_”, do 64 znaków (np. LAP-ZEN-14).';
  }
  if (name === '') errors.name = 'Podaj nazwę produktu.';
  else if (name.length > 200) errors.name = 'Nazwa może mieć najwyżej 200 znaków.';
  if (slug === '') errors.slug = 'Podaj slug.';
  else if (slug.length > 120 || !SLUG.test(slug)) errors.slug = 'Małe litery, cyfry i pojedyncze myślniki (np. laptop-zen-14).';
  if (description.length > 10_000) errors.description = 'Opis może mieć najwyżej 10 000 znaków.';

  const netPrice = normalizeAmountInput(values.netPrice);
  if (values.netPrice.trim() === '') errors.netPrice = 'Podaj cenę netto.';
  else if (netPrice === null) errors.netPrice = 'Podaj kwotę, np. 199,99 (najwyżej dwa miejsca po przecinku).';
  else if (!NET_PRICE.test(netPrice)) errors.netPrice = 'Kwota może mieć najwyżej 7 cyfr przed przecinkiem.';

  const vatRate = VAT_RATE_OPTIONS.find((rate) => String(rate) === values.vatRate);
  if (vatRate === undefined) errors.vatRate = 'Wybierz stawkę VAT.';

  if (Object.keys(errors).length > 0 || netPrice === null || vatRate === undefined) {
    return { errors, input: null };
  }

  return {
    errors,
    input: {
      sku,
      name,
      slug,
      description: description === '' ? null : description,
      categoryId: values.categoryId === '' ? null : values.categoryId,
      netPrice,
      vatRate,
    },
  };
}
