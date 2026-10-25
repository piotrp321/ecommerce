import { useCallback, useState } from 'react';
import { useAdminApi } from '../../api/AdminApiContext';
import type { Product, ProductSort } from '../../api/types';
import { AvailabilityBadge } from '../../components/AvailabilityBadge';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Icon } from '../../components/Icon';
import { Link } from '../../components/Link';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { Pagination } from '../../components/Pagination';
import { GrossPrice } from '../../components/Price';
import { SearchInput } from '../../components/SearchInput';
import { SortHeader } from '../../components/SortHeader';
import { StatusBadge } from '../../components/StatusBadge';
import { useToast } from '../../components/toastContext';
import { categoryOptions } from '../../lib/categoryOptions';
import { formatQuantity } from '../../lib/format';
import { formatAmount } from '../../lib/money';
import { navigate, useLocation } from '../../lib/router';
import { useAsync } from '../../lib/useAsync';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { productQueryFromParams, productQueryToSearch } from './productQuery';

const SORT_LABELS: Record<ProductSort, string> = {
  newest: 'Najnowsze',
  name: 'Nazwa A–Z',
  '-name': 'Nazwa Z–A',
  price: 'Cena netto rosnąco',
  '-price': 'Cena netto malejąco',
};

export function ProductsPage() {
  useDocumentTitle('Produkty');
  const api = useAdminApi();
  const toast = useToast();
  const { searchParams } = useLocation();
  const query = productQueryFromParams(searchParams);
  const { q, status, categoryId, sort, page, perPage } = query;
  const [pendingToggle, setPendingToggle] = useState<Product | null>(null);

  const setQuery = useCallback(
    (change: Partial<typeof query>) => {
      // Any filter change goes back to the first page.
      const next = { ...productQueryFromParams(new URLSearchParams(window.location.search)), page: 1, ...change };
      navigate(`/products${productQueryToSearch(next)}`, { replace: true });
    },
    [],
  );

  const loadProducts = useCallback(
    () => api.listProducts({ q: q === '' ? undefined : q, status, categoryId, sort, page, perPage }),
    [api, q, status, categoryId, sort, page, perPage],
  );
  const products = useAsync(loadProducts);
  const loadCategories = useCallback(async () => categoryOptions(await api.listCategories()), [api]);
  const categories = useAsync(loadCategories);

  const onSearch = useCallback(
    (value: string) => {
      setQuery({ q: value.trim() });
    },
    [setQuery],
  );

  async function toggle(product: Product) {
    const next = product.active ? await api.deactivateProduct(product.id) : await api.activateProduct(product.id);
    products.update((current) => ({ ...current, items: current.items.map((item) => (item.id === next.id ? next : item)) }));
    toast(next.active ? `Aktywowano produkt „${next.name}”.` : `Dezaktywowano produkt „${next.name}”.`);
  }

  const filtered = q !== '' || status !== 'all' || categoryId !== undefined;
  const result = products.data;

  let content;
  if (products.error !== undefined) {
    content = <ErrorState error={products.error} onRetry={products.reload} />;
  } else if (result === undefined) {
    content = <LoadingState label="Wczytywanie produktów…" rows={8} />;
  } else if (result.items.length === 0 && result.totalItems > 0) {
    content = (
      <EmptyState
        icon="search"
        title="Ta strona nie istnieje"
        action={
          <Button
            onClick={() => {
              setQuery({ page: 1 });
            }}
          >
            Przejdź do pierwszej strony
          </Button>
        }
      >
        Lista ma {result.totalPages} {result.totalPages === 1 ? 'stronę' : 'stron(y)'}.
      </EmptyState>
    );
  } else if (result.items.length === 0) {
    content = filtered ? (
      <EmptyState
        icon="search"
        title="Brak produktów spełniających kryteria"
        action={
          <Button
            onClick={() => {
              navigate('/products', { replace: true });
            }}
          >
            Wyczyść filtry
          </Button>
        }
      >
        Zmień wyszukiwaną frazę lub filtry.
      </EmptyState>
    ) : (
      <EmptyState
        title="Katalog jest pusty"
        action={
          <Link to="/products/new" className="btn btn--primary btn--md">
            <Icon name="plus" /> Dodaj produkt
          </Link>
        }
      >
        Dodaj pierwszy produkt, aby rozpocząć sprzedaż.
      </EmptyState>
    );
  } else {
    content = (
      <>
        <div className={products.loading ? 'table-wrap is-refreshing' : 'table-wrap'} aria-busy={products.loading}>
          <table className="table">
            <caption className="visually-hidden">
              Produkty, strona {result.page} z {result.totalPages}
            </caption>
            <thead>
              <tr>
                <SortHeader
                  label="Produkt"
                  className="col-primary"
                  sort={sort}
                  ascending="name"
                  descending="-name"
                  onSort={(next) => {
                    setQuery({ sort: next });
                  }}
                />
                <th scope="col" className="col-wide">
                  SKU
                </th>
                <th scope="col" className="col-optional">
                  Kategoria
                </th>
                <SortHeader
                  label="Cena netto"
                  className="num"
                  sort={sort}
                  ascending="price"
                  descending="-price"
                  onSort={(next) => {
                    setQuery({ sort: next });
                  }}
                />
                <th scope="col" className="num col-optional">
                  Brutto
                </th>
                <th scope="col" className="num">
                  Dostępne
                </th>
                <th scope="col">Status</th>
                <th scope="col" className="actions">
                  <span className="visually-hidden">Akcje</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((product) => (
                <tr key={product.id}>
                  <td>
                    <Link to={`/products/${product.id}`} className="cell-title">
                      {product.name}
                    </Link>
                    <span className="cell-sub">/{product.slug}</span>
                    <span className="cell-sub only-narrow">
                      <code className="sku">{product.sku}</code>
                    </span>
                  </td>
                  <td className="col-wide">
                    <code className="sku">{product.sku}</code>
                  </td>
                  <td className="col-optional">
                    {product.category?.name ?? <span className="muted">Bez kategorii</span>}
                  </td>
                  <td className="num">
                    {formatAmount(product.price.net.amount)}
                    <span className="cell-sub">VAT {product.price.vatRate}%</span>
                  </td>
                  <td className="num col-optional">
                    <GrossPrice gross={product.price.gross} />
                  </td>
                  <td className="num">
                    <span className="stock-cell">
                      {formatQuantity(product.stock.available)}
                      <AvailabilityBadge available={product.stock.available} />
                    </span>
                  </td>
                  <td>
                    <StatusBadge active={product.active} />
                  </td>
                  <td className="actions">
                    <div className="row-actions">
                      <Link
                        to={`/products/${product.id}`}
                        className="btn btn--ghost btn--sm btn--icon-only"
                        aria-label={`Edytuj ${product.name}`}
                        title="Edytuj"
                      >
                        <Icon name="edit" size={15} />
                      </Link>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon="power"
                        aria-label={`${product.active ? 'Dezaktywuj' : 'Aktywuj'} ${product.name}`}
                        title={product.active ? 'Dezaktywuj' : 'Aktywuj'}
                        className={product.active ? 'btn--danger-text' : 'btn--success-text'}
                        onClick={() => {
                          setPendingToggle(product);
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          page={result.page}
          perPage={result.perPage}
          totalItems={result.totalItems}
          totalPages={result.totalPages}
          onPageChange={(next) => {
            setQuery({ page: next });
          }}
          onPerPageChange={(next) => {
            setQuery({ perPage: next });
          }}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Produkty"
        description="Zarządzaj ofertą: dane produktów, ceny netto, stawki VAT i widoczność w sklepie."
        actions={
          <Link to="/products/new" className="btn btn--primary btn--md">
            <Icon name="plus" /> Dodaj produkt
          </Link>
        }
      />
      <div className="card">
        <div className="toolbar" role="search" aria-label="Filtry produktów">
          <SearchInput label="Szukaj po nazwie lub SKU" placeholder="Szukaj po nazwie lub SKU…" value={q} onChange={onSearch} />
          <div className="toolbar__filters">
            <label className="toolbar__field">
              <span className="visually-hidden">Status</span>
              <select
                className="select"
                value={status}
                onChange={(event) => {
                  setQuery({ status: event.target.value as typeof status });
                }}
              >
                <option value="all">Wszystkie statusy</option>
                <option value="active">Aktywne</option>
                <option value="inactive">Nieaktywne</option>
              </select>
            </label>
            <label className="toolbar__field">
              <span className="visually-hidden">Kategoria</span>
              <select
                className="select"
                value={categoryId ?? ''}
                disabled={categories.data === undefined}
                onChange={(event) => {
                  setQuery({ categoryId: event.target.value === '' ? undefined : event.target.value });
                }}
              >
                <option value="">Wszystkie kategorie</option>
                {categories.data?.map((category) => (
                  <option key={category.id} value={category.id}>
                    {'\u00a0\u00a0'.repeat(category.depth)}
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="toolbar__field">
              <span className="visually-hidden">Sortowanie</span>
              <select
                className="select"
                value={sort}
                onChange={(event) => {
                  setQuery({ sort: event.target.value as ProductSort });
                }}
              >
                {Object.entries(SORT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {content}
      </div>

      <ConfirmDialog
        open={pendingToggle !== null}
        title={pendingToggle?.active === true ? 'Dezaktywować produkt?' : 'Aktywować produkt?'}
        confirmLabel={pendingToggle?.active === true ? 'Dezaktywuj' : 'Aktywuj'}
        tone={pendingToggle?.active === true ? 'danger' : 'primary'}
        onConfirm={() => (pendingToggle === null ? Promise.resolve() : toggle(pendingToggle))}
        onClose={() => {
          setPendingToggle(null);
        }}
      >
        {pendingToggle?.active === true
          ? `„${pendingToggle.name}” zniknie z oferty sklepu. Możesz go później aktywować ponownie.`
          : `„${pendingToggle?.name ?? ''}” pojawi się w ofercie sklepu.`}
      </ConfirmDialog>
    </>
  );
}
