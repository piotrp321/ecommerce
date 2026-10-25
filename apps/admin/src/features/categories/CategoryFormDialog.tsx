import { useState, type SubmitEvent } from 'react';
import { errorMessage, violationsByField } from '../../api/errors';
import type { CategoryInput } from '../../api/types';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { FormField } from '../../components/FormField';
import { Modal } from '../../components/Modal';
import { slugify } from '../../lib/slugify';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface CategoryFormDialogProps {
  open: boolean;
  title: string;
  description?: string;
  initialValues?: CategoryInput;
  submitLabel: string;
  onSubmit: (input: CategoryInput) => Promise<void>;
  onClose: () => void;
}

type Errors = Partial<Record<keyof CategoryInput, string>>;

/** Create or edit a category (name and slug). Mount it per opening, so it starts with fresh values. */
export function CategoryFormDialog({ open, title, description, initialValues, submitLabel, onSubmit, onClose }: CategoryFormDialogProps) {
  const [values, setValues] = useState<CategoryInput>(initialValues ?? { name: '', slug: '' });
  const [slugEdited, setSlugEdited] = useState(initialValues !== undefined);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function validate(): Errors {
    const next: Errors = {};
    const name = values.name.trim();
    if (name === '') next.name = 'Podaj nazwę kategorii.';
    else if (name.length > 100) next.name = 'Nazwa może mieć najwyżej 100 znaków.';
    if (values.slug === '') next.slug = 'Podaj slug.';
    else if (values.slug.length > 120 || !SLUG.test(values.slug)) next.slug = 'Małe litery, cyfry i pojedyncze myślniki.';

    return next;
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const fieldErrors = validate();
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) {
      return;
    }
    setPending(true);
    try {
      await onSubmit({ name: values.name.trim(), slug: values.slug });
    } catch (error) {
      const fields = violationsByField(error);
      const serverErrors: Errors = { name: fields.name, slug: fields.slug };
      setErrors(serverErrors);
      if (serverErrors.name === undefined && serverErrors.slug === undefined) {
        setFormError(errorMessage(error));
      }
    } finally {
      setPending(false);
    }
  }

  const formId = 'category-form';

  return (
    <Modal
      open={open}
      title={title}
      description={description}
      busy={pending}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={pending}>
            Anuluj
          </Button>
          <Button type="submit" form={formId} variant="primary" pending={pending}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form id={formId} className="stack" noValidate onSubmit={(event) => void handleSubmit(event)}>
        {formError !== null && <Alert title="Nie zapisano kategorii">{formError}</Alert>}
        <FormField label="Nazwa" required error={errors.name}>
          {(control) => (
            <input
              {...control}
              className="input"
              value={values.name}
              maxLength={100}
              autoComplete="off"
              autoFocus
              onChange={(event) => {
                const name = event.target.value;
                setValues((current) => ({ name, slug: slugEdited ? current.slug : slugify(name) }));
                setErrors((current) => ({ ...current, name: undefined }));
              }}
            />
          )}
        </FormField>
        <FormField label="Slug" required error={errors.slug} hint="Część adresu URL kategorii w sklepie.">
          {(control) => (
            <input
              {...control}
              className="input input--mono"
              value={values.slug}
              maxLength={120}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                const slug = event.target.value;
                setSlugEdited(true);
                setValues((current) => ({ ...current, slug }));
                setErrors((current) => ({ ...current, slug: undefined }));
              }}
            />
          )}
        </FormField>
      </form>
    </Modal>
  );
}
