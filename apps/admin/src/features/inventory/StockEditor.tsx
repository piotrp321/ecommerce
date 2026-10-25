import { useId, useState, type SubmitEvent } from 'react';
import { errorMessage, violationsByField } from '../../api/errors';
import { Button } from '../../components/Button';

const MAX_ON_HAND = 1_000_000;

interface StockEditorProps {
  productName: string;
  onHand: number;
  onSave: (onHand: number) => Promise<void>;
  onCancel: () => void;
}

/** Inline editor of the quantity on hand. Enter saves, Escape cancels. */
export function StockEditor({ productName, onHand, onSave, onCancel }: StockEditorProps) {
  const [value, setValue] = useState(String(onHand));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const errorId = useId();

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed) || Number(trimmed) > MAX_ON_HAND) {
      setError('Podaj liczbę całkowitą od 0 do 1 000 000.');

      return;
    }
    setPending(true);
    setError(null);
    try {
      await onSave(Number(trimmed));
    } catch (caught) {
      setError(violationsByField(caught).onHand ?? errorMessage(caught, ['onHand']));
      setPending(false);
    }
  }

  return (
    <form className="stock-editor" noValidate onSubmit={(event) => void handleSubmit(event)}>
      <div className="stock-editor__row">
        <input
          className="input input--sm input--num stock-editor__input"
          inputMode="numeric"
          aria-label={`Stan na magazynie: ${productName}`}
          aria-invalid={error !== null || undefined}
          aria-describedby={error === null ? undefined : errorId}
          value={value}
          autoFocus
          onFocus={(event) => {
            event.target.select();
          }}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              onCancel();
            }
          }}
        />
        <Button type="submit" size="sm" variant="primary" pending={pending}>
          Zapisz
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
          Anuluj
        </Button>
      </div>
      {error !== null && (
        <p id={errorId} className="field__error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
