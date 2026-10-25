import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

interface ModalProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md';
  /** Blocks closing with Esc/backdrop while a request is pending. */
  busy?: boolean;
}

/**
 * Modal on the native <dialog>: the browser provides the focus trap, Esc,
 * inert background and focus return to the opener.
 */
export function Modal({ open, title, description, onClose, children, footer, size = 'md', busy = false }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`modal modal--${size}`}
      aria-labelledby={titleId}
      aria-describedby={description === undefined ? undefined : descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) {
          onClose();
        }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onClose();
        }
      }}
    >
      {open && (
        <div className="modal__panel">
          <header className="modal__header">
            <div>
              <h2 id={titleId} className="modal__title">
                {title}
              </h2>
              {description !== undefined && (
                <p id={descriptionId} className="modal__description">
                  {description}
                </p>
              )}
            </div>
            <button type="button" className="modal__close" onClick={onClose} disabled={busy} aria-label="Zamknij okno">
              <Icon name="close" />
            </button>
          </header>
          <div className="modal__body">{children}</div>
          {footer !== undefined && <footer className="modal__footer">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
