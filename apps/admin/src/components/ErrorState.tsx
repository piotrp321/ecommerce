import { errorMessage } from '../api/errors';
import { Button } from './Button';
import { Icon } from './Icon';

interface ErrorStateProps {
  title?: string;
  error: unknown;
  onRetry?: () => void;
}

export function ErrorState({ title = 'Nie udało się wczytać danych', error, onRetry }: ErrorStateProps) {
  return (
    <div className="state state--error" role="alert">
      <span className="state__icon">
        <Icon name="alert" size={22} />
      </span>
      <p className="state__title">{title}</p>
      <p className="state__text">{errorMessage(error)}</p>
      {onRetry !== undefined && (
        <Button onClick={onRetry} icon="refresh">
          Spróbuj ponownie
        </Button>
      )}
    </div>
  );
}
