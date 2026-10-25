import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { useDocumentTitle } from '../../lib/useDocumentTitle';

interface PlaceholderPageProps {
  title: string;
  description: string;
  planned: string[];
}

export function PlaceholderPage({ title, description, planned }: PlaceholderPageProps) {
  useDocumentTitle(title);

  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="card">
        <EmptyState icon="info" title="Moduł w przygotowaniu">
          Ta sekcja pojawi się w kolejnych etapach projektu.
        </EmptyState>
        <div className="placeholder-list">
          <p className="placeholder-list__title">Planowany zakres</p>
          <ul>
            {planned.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
