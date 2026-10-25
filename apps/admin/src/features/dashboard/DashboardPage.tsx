import { useCallback } from 'react';
import { useAdminApi } from '../../api/AdminApiContext';
import type { CategoryNode } from '../../api/types';
import { AvailabilityBadge } from '../../components/AvailabilityBadge';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Icon } from '../../components/Icon';
import { Link } from '../../components/Link';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { StatCard } from '../../components/StatCard';
import { StatusBadge } from '../../components/StatusBadge';
import { formatDate, formatQuantity } from '../../lib/format';
import { formatAmount } from '../../lib/money';
import { availabilityOf } from '../../lib/stock';
import { useAsync } from '../../lib/useAsync';
import { useDocumentTitle } from '../../lib/useDocumentTitle';

function countCategories(nodes: readonly CategoryNode[]): number {
  return nodes.reduce((sum, node) => sum + 1 + countCategories(node.children), 0);
}

export function DashboardPage() {
  useDocumentTitle('Dashboard');
  const api = useAdminApi();

  // Counts come from the API's totals. Stock figures are taken from the first
  // 100 products (one page): enough for the demo data, to be replaced by a
  // dedicated statistics endpoint when the backend offers one.
  const load = useCallback(async () => {
    const [all, active, inactive, categories] = await Promise.all([
      api.listProducts({ perPage: 100, sort: 'newest' }),
      api.listProducts({ status: 'active', perPage: 1 }),
      api.listProducts({ status: 'inactive', perPage: 1 }),
      api.listCategories(),
    ]);

    return { all, active: active.totalItems, inactive: inactive.totalItems, categories: countCategories(categories) };
  }, [api]);
  const { data, error, reload } = useAsync(load);

  let content;
  if (error !== undefined) {
    content = (
      <div className="card">
        <ErrorState error={error} onRetry={reload} />
      </div>
    );
  } else if (data === undefined) {
    content = (
      <div className="card card--padded">
        <LoadingState label="Wczytywanie statystyk…" />
      </div>
    );
  } else {
    const products = data.all.items;
    const outOfStock = products.filter((p) => p.active && availabilityOf(p.stock.available) === 'out');
    const lowStock = products
      .filter((p) => p.active && availabilityOf(p.stock.available) !== 'in')
      .sort((a, b) => a.stock.available - b.stock.available)
      .slice(0, 6);
    const recent = products.slice(0, 5);

    content = (
      <>
        <div className="stats">
          <StatCard label="Produkty" value={formatQuantity(data.all.totalItems)} icon="products" hint="W całym katalogu" />
          <StatCard
            label="Aktywne"
            value={formatQuantity(data.active)}
            icon="check"
            tone="success"
            hint={`${formatQuantity(data.inactive)} nieaktywnych`}
          />
          <StatCard label="Kategorie" value={formatQuantity(data.categories)} icon="categories" tone="neutral" hint="We wszystkich poziomach" />
          <StatCard
            label="Brak na stanie"
            value={formatQuantity(outOfStock.length)}
            icon="alert"
            tone={outOfStock.length > 0 ? 'danger' : 'success'}
            hint="Aktywne produkty bez dostępnych sztuk"
          />
        </div>

        <div className="dashboard-grid">
          <section className="card" aria-labelledby="low-stock">
            <header className="card__header">
              <h2 id="low-stock" className="card__title">
                Wymagają uzupełnienia
              </h2>
              <Link to="/inventory" className="text-link">
                Magazyn <Icon name="chevronRight" size={14} />
              </Link>
            </header>
            {lowStock.length === 0 ? (
              <EmptyState icon="check" title="Stany są w porządku" />
            ) : (
              <ul className="list">
                {lowStock.map((product) => (
                  <li key={product.id} className="list__item">
                    <div className="list__main">
                      <Link to={`/products/${product.id}`} className="cell-title">
                        {product.name}
                      </Link>
                      <code className="sku">{product.sku}</code>
                    </div>
                    <span className="num">{formatQuantity(product.stock.available)} szt.</span>
                    <AvailabilityBadge available={product.stock.available} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card" aria-labelledby="recent-products">
            <header className="card__header">
              <h2 id="recent-products" className="card__title">
                Ostatnio dodane
              </h2>
              <Link to="/products" className="text-link">
                Wszystkie <Icon name="chevronRight" size={14} />
              </Link>
            </header>
            {recent.length === 0 ? (
              <EmptyState title="Brak produktów" />
            ) : (
              <ul className="list">
                {recent.map((product) => (
                  <li key={product.id} className="list__item">
                    <div className="list__main">
                      <Link to={`/products/${product.id}`} className="cell-title">
                        {product.name}
                      </Link>
                      <span className="cell-sub">{formatDate(product.createdAt)}</span>
                    </div>
                    <span className="num">{formatAmount(product.price.net.amount)}</span>
                    <StatusBadge active={product.active} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card card--padded dashboard-grid__wide" aria-labelledby="orders-soon">
            <div className="soon">
              <span className="state__icon">
                <Icon name="orders" size={20} />
              </span>
              <div>
                <h2 id="orders-soon" className="card__title">
                  Zamówienia i sprzedaż <Badge>wkrótce</Badge>
                </h2>
                <p className="muted">
                  Statystyki sprzedaży pojawią się razem z modułem zamówień (Milestone M4). Ceny netto są pokazywane bez
                  przeliczeń; kwoty brutto wylicza backend.
                </p>
              </div>
            </div>
          </section>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Dashboard" description="Przegląd katalogu i stanów magazynowych (dane demonstracyjne)." />
      {content}
    </>
  );
}
