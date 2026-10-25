import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { ToastContext, type ToastTone } from './toastContext';

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

const TIMEOUT_MS = 5000;

/** Short confirmations of finished actions, announced by a polite live region. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (message: string, tone: ToastTone = 'success') => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-2), { id, message, tone }]);
      setTimeout(() => {
        dismiss(id);
      }, TIMEOUT_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.tone}`}>
            <Icon name={toast.tone === 'success' ? 'check' : toast.tone === 'danger' ? 'alert' : 'info'} />
            <span className="toast__message">{toast.message}</span>
            <button
              type="button"
              className="toast__close"
              aria-label="Zamknij powiadomienie"
              onClick={() => {
                dismiss(toast.id);
              }}
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext>
  );
}
