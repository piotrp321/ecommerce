import { useRef, useState, type SubmitEvent, type ReactNode } from 'react';
import { errorMessage, violationsByField } from '../../api/errors';
import type { CreateProductInput, Money } from '../../api/types';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { FormField } from '../../components/FormField';
import { GrossPrice } from '../../components/Price';
import type { CategoryOption } from '../../lib/categoryOptions';
import { slugify } from '../../lib/slugify';
import {
  VAT_RATE_OPTIONS,
  validateProductForm,
  type ProductFormErrors,
  type ProductFormField,
  type ProductFormValues,
} from './productFormModel';

interface ProductFormProps {
  mode: 'create' | 'edit';
  initialValues: ProductFormValues;
  categories: CategoryOption[];
  /** Gross price returned by the backend for the saved product (edit mode). */
  savedGross?: Money | null;
  /** Saves the product; a rejection with an ApiError is shown in the form. */
  onSubmit: (input: CreateProductInput) => Promise<void>;
  onCancel: () => void;
  aside?: ReactNode;
}

const FIELD_ORDER: ProductFormField[] = ['name', 'slug', 'sku', 'description', 'netPrice', 'vatRate', 'categoryId'];

export function ProductForm({ mode, initialValues, categories, savedGross, onSubmit, onCancel, aside }: ProductFormProps) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<ProductFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [slugEdited, setSlugEdited] = useState(mode === 'edit');
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  function set(field: ProductFormField, value: string) {
    setValues((current) => ({
      ...current,
      [field]: value,
      ...(field === 'name' && !slugEdited ? { slug: slugify(value) } : {}),
    }));
    if (errors[field] !== undefined) {
      setErrors((current) => ({ ...current, [field]: undefined }));
    }
  }

  function focusFirstError(fieldErrors: ProductFormErrors) {
    const first = FIELD_ORDER.find((field) => fieldErrors[field] !== undefined);
    if (first !== undefined) {
      formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
    }
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const { errors: fieldErrors, input } = validateProductForm(values, mode);
    setErrors(fieldErrors);
    if (input === null) {
      focusFirstError(fieldErrors);

      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(input);
    } catch (error) {
      const fields = violationsByField(error);
      const serverErrors: ProductFormErrors = {};
      for (const field of FIELD_ORDER) {
        serverErrors[field] = fields[field];
      }
      setErrors(serverErrors);
      if (FIELD_ORDER.some((field) => serverErrors[field] !== undefined)) {
        focusFirstError(serverErrors);
      } else {
        setFormError(errorMessage(error));
        requestAnimationFrame(() => alertRef.current?.focus());
      }
    } finally {
      setSubmitting(false);
    }
  }

  const descriptionLength = values.description.trim().length;

  return (
    <form ref={formRef} className="form-layout" noValidate onSubmit={(event) => void handleSubmit(event)}>
      <div className="form-layout__main">
        {formError !== null && (
          <div ref={alertRef} tabIndex={-1} className="scroll-target">
            <Alert title="Nie zapisano produktu">{formError}</Alert>
          </div>
        )}

        <section className="card card--padded" aria-labelledby="product-basics">
          <h2 id="product-basics" className="card__title">
            Podstawowe informacje
          </h2>
          <div className="form-grid">
            <FormField label="Nazwa" required error={errors.name} className="form-grid__full">
              {(control) => (
                <input
                  {...control}
                  name="name"
                  className="input"
                  value={values.name}
                  maxLength={200}
                  autoComplete="off"
                  onChange={(event) => {
                    set('name', event.target.value);
                  }}
                />
              )}
            </FormField>
            <FormField
              label="Slug (adres URL)"
              required
              error={errors.slug}
              hint={mode === 'create' && !slugEdited ? 'Uzupełniany automatycznie na podstawie nazwy.' : 'Małe litery, cyfry i myślniki.'}
            >
              {(control) => (
                <input
                  {...control}
                  name="slug"
                  className="input input--mono"
                  value={values.slug}
                  maxLength={120}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => {
                    setSlugEdited(true);
                    set('slug', event.target.value);
                  }}
                />
              )}
            </FormField>
            <FormField
              label="SKU"
              required={mode === 'create'}
              error={errors.sku}
              hint={mode === 'edit' ? 'SKU nie może być zmienione po utworzeniu produktu.' : 'Wielkie litery, cyfry, „-” i „_”.'}
            >
              {(control) => (
                <input
                  {...control}
                  name="sku"
                  className="input input--mono"
                  value={values.sku}
                  maxLength={64}
                  autoComplete="off"
                  spellCheck={false}
                  readOnly={mode === 'edit'}
                  onChange={(event) => {
                    set('sku', event.target.value.toUpperCase());
                  }}
                />
              )}
            </FormField>
            <FormField
              label="Opis"
              error={errors.description}
              hint={`${String(descriptionLength)} / 10 000 znaków. Pusty opis zostanie zapisany jako brak opisu.`}
              className="form-grid__full"
            >
              {(control) => (
                <textarea
                  {...control}
                  name="description"
                  className="input textarea"
                  rows={5}
                  value={values.description}
                  onChange={(event) => {
                    set('description', event.target.value);
                  }}
                />
              )}
            </FormField>
          </div>
        </section>

        <section className="card card--padded" aria-labelledby="product-price">
          <h2 id="product-price" className="card__title">
            Cena
          </h2>
          <div className="form-grid">
            <FormField label="Cena netto" required error={errors.netPrice} hint="W złotych, np. 199,99.">
              {(control) => (
                <div className="input-group">
                  <input
                    {...control}
                    name="netPrice"
                    className="input input--num"
                    inputMode="decimal"
                    autoComplete="off"
                    value={values.netPrice}
                    onChange={(event) => {
                      set('netPrice', event.target.value);
                    }}
                  />
                  <span className="input-group__addon">PLN</span>
                </div>
              )}
            </FormField>
            <FormField label="Stawka VAT" required error={errors.vatRate}>
              {(control) => (
                <select
                  {...control}
                  name="vatRate"
                  className="select"
                  value={values.vatRate}
                  onChange={(event) => {
                    set('vatRate', event.target.value);
                  }}
                >
                  {VAT_RATE_OPTIONS.map((rate) => (
                    <option key={rate} value={String(rate)}>
                      {rate}%
                    </option>
                  ))}
                </select>
              )}
            </FormField>
            <div className="form-grid__full price-note">
              <span className="price-note__label">Cena brutto</span>
              {mode === 'edit' && savedGross !== undefined ? (
                <span>
                  <GrossPrice gross={savedGross} /> <span className="muted">(zapisana; po zmianie ceny przeliczy ją backend)</span>
                </span>
              ) : (
                <span className="muted">Zostanie wyliczona przez backend po zapisaniu produktu.</span>
              )}
            </div>
          </div>
        </section>

        <section className="card card--padded" aria-labelledby="product-organisation">
          <h2 id="product-organisation" className="card__title">
            Organizacja
          </h2>
          <FormField label="Kategoria" error={errors.categoryId}>
            {(control) => (
              <select
                {...control}
                name="categoryId"
                className="select"
                value={values.categoryId}
                onChange={(event) => {
                  set('categoryId', event.target.value);
                }}
              >
                <option value="">Bez kategorii</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {'\u00a0\u00a0'.repeat(category.depth)}
                    {category.name}
                  </option>
                ))}
              </select>
            )}
          </FormField>
        </section>
      </div>

      {aside !== undefined && <aside className="form-layout__aside">{aside}</aside>}

      <div className="form-actions">
        <Button onClick={onCancel} disabled={submitting}>
          Anuluj
        </Button>
        <Button type="submit" variant="primary" pending={submitting} icon="check">
          {mode === 'create' ? 'Utwórz produkt' : 'Zapisz zmiany'}
        </Button>
      </div>
    </form>
  );
}
