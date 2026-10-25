import { useEffect, useId, useRef, type ReactNode } from 'react';

function restoreFocus(element: HTMLElement | null) {
  // The opener may be gone (e.g. a deleted row): fall back to the page heading.
  const target = element?.isConnected === true ? element : document.querySelector<HTMLElement>('[data-page-heading]');
  target?.focus();
}
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
 * Modal on the native <dialog>: the browser provides the focus trap, Esc and
 * the inert background. Focus starts on the element marked `data-autofocus`
 * (or the first focusable one) and returns to the opener on close, also when
 * the modal is unmounted while open.
 */
export function Modal({ open, title, description, onClose, children, footer, size = 'md', busy = false }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const pointerDownOnBackdrop = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null || !open) {
      return;
    }
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();

    return () => {
      dialog.close();
      restoreFocus(opener);
    };
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
      // Close on a backdrop click only when the press also started there, so
      // selecting text and releasing outside the panel keeps the dialog open.
      onPointerDown={(event) => {
        pointerDownOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && pointerDownOnBackdrop.current && !busy) {
          onClose();
        }
        pointerDownOnBackdrop.current = false;
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
