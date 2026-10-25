import { useState, type ReactNode } from 'react';
import { errorMessage } from '../api/errors';
import { Alert } from './Alert';
import { Button } from './Button';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  /** Runs the action; a rejection keeps the dialog open and shows the error. */
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export function ConfirmDialog({ open, title, children, confirmLabel, tone = 'primary', onConfirm, onClose }: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  function close() {
    setError(null);
    onClose();
  }

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      close();
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      title={title}
      size="sm"
      busy={pending}
      onClose={close}
      footer={
        <>
          <Button onClick={close} disabled={pending}>
            Anuluj
          </Button>
          <Button variant={tone} pending={pending} onClick={() => void confirm()}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="stack">
        <div className="modal__text">{children}</div>
        {error !== null && <Alert title="Operacja nie powiodła się">{errorMessage(error)}</Alert>}
      </div>
    </Modal>
  );
}
