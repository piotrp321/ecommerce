import { useState, type SubmitEvent } from 'react';
import { errorMessage } from '../../api/errors';
import type { CategoryNode } from '../../api/types';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { FormField } from '../../components/FormField';
import { Modal } from '../../components/Modal';
import type { CategoryOption } from '../../lib/categoryOptions';

interface MoveCategoryDialogProps {
  open: boolean;
  category: CategoryNode;
  options: CategoryOption[];
  onMove: (parentId: string | null) => Promise<void>;
  onClose: () => void;
}

const ROOT = '';

/**
 * Picks a new parent. The panel does not check the tree rules itself: a move
 * that would create a cycle or exceed the depth limit is rejected by the
 * backend, and its message is shown here.
 */
export function MoveCategoryDialog({ open, category, options, onMove, onClose }: MoveCategoryDialogProps) {
  const [parentId, setParentId] = useState(category.parentId ?? ROOT);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const current = options.find((option) => option.id === category.parentId);
  const unchanged = parentId === (category.parentId ?? ROOT);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await onMove(parentId === ROOT ? null : parentId);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      title={`Przenieś „${category.name}”`}
      description="Kategoria zostanie przeniesiona razem z podkategoriami. Produkty pozostają w swoich kategoriach."
      busy={pending}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={pending}>
            Anuluj
          </Button>
          <Button type="submit" form="move-category-form" variant="primary" pending={pending} disabled={unchanged}>
            Przenieś
          </Button>
        </>
      }
    >
      <form id="move-category-form" className="stack" onSubmit={(event) => void handleSubmit(event)}>
        {error !== null && <Alert title="Nie można przenieść kategorii">{error}</Alert>}
        <p className="muted small">
          Obecne położenie: <strong>{current?.path ?? 'poziom główny'}</strong>
        </p>
        <FormField label="Nowa kategoria nadrzędna" hint="Poprawność drzewa (cykle, maksymalna głębokość) sprawdza backend.">
          {(control) => (
            <select
              {...control}
              className="select"
              value={parentId}
              onChange={(event) => {
                setParentId(event.target.value);
                setError(null);
              }}
            >
              <option value={ROOT}>Poziom główny (bez rodzica)</option>
              {options
                .filter((option) => option.id !== category.id)
                .map((option) => (
                  <option key={option.id} value={option.id}>
                    {'\u00a0\u00a0'.repeat(option.depth)}
                    {option.name}
                  </option>
                ))}
            </select>
          )}
        </FormField>
      </form>
    </Modal>
  );
}
