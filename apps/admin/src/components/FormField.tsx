import { useId, type ReactNode } from 'react';

export interface FieldControlProps {
  id: string;
  'aria-invalid': true | undefined;
  'aria-describedby': string | undefined;
  'aria-required': true | undefined;
}

interface FormFieldProps {
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  /** Renders the control with the ids and ARIA attributes that link it to the label, hint and error. */
  children: (control: FieldControlProps) => ReactNode;
  className?: string;
}

export function FormField({ label, hint, error, required = false, children, className }: FormFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint !== undefined ? hintId : '', error !== undefined ? errorId : ''].filter(Boolean).join(' ');

  return (
    <div className={['field', error !== undefined ? 'field--invalid' : '', className ?? ''].filter(Boolean).join(' ')}>
      <label className="field__label" htmlFor={id}>
        {label}
        {required && (
          <span className="field__required" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children({
        id,
        'aria-invalid': error !== undefined || undefined,
        'aria-describedby': describedBy === '' ? undefined : describedBy,
        'aria-required': required || undefined,
      })}
      {error !== undefined && (
        <p id={errorId} className="field__error">
          {error}
        </p>
      )}
      {hint !== undefined && (
        <p id={hintId} className="field__hint">
          {hint}
        </p>
      )}
    </div>
  );
}
