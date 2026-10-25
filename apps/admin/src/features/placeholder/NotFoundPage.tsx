import { EmptyState } from '../../components/EmptyState';
import { Link } from '../../components/Link';
import { PageHeader } from '../../components/PageHeader';
import { useDocumentTitle } from '../../lib/useDocumentTitle';

export function NotFoundPage() {
  useDocumentTitle('Nie znaleziono');

  return (
    <>
      <PageHeader title="Nie znaleziono strony" />
      <div className="card">
        <EmptyState
          icon="search"
          title="Ta strona nie istnieje"
          action={
            <Link to="/" className="btn btn--primary btn--md">
              Wróć do dashboardu
            </Link>
          }
        >
          Sprawdź adres lub wybierz sekcję z menu.
        </EmptyState>
      </div>
    </>
  );
}
