import { useCallback, useState } from 'react';
import { useAdminApi } from '../../api/AdminApiContext';
import type { Product } from '../../api/types';
import { AvailabilityBadge } from '../../components/AvailabilityBadge';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Link } from '../../components/Link';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { Pagination } from '../../components/Pagination';
import { SearchInput } from '../../components/SearchInput';
import { StatusBadge } from '../../components/StatusBadge';
import { useToast } from '../../components/toastContext';
import { formatQuantity } from '../../lib/format';
import { navigate, useLocation } from '../../lib/router';
import { LOW_STOCK_THRESHOLD } from '../../lib/stock';
import { useAsync } from '../../lib/useAsync';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { productQueryFromParams, productQueryToSearch } from '../products/productQuery';
import { StockEditor } from './StockEditor';

export function InventoryPage() {
  useDocumentTitle('Magazyn');
  const api = useAdminApi();
  const toast = useToast();
  const { searchParams } = useLocation();
  const { q, status, page, perPage } = productQueryFromParams(searchParams);
  const [editing, setEditing] = useState<string | null>(null);

  function stopEditing(productId: string) {
    setEditing(null);
    // Give focus back to the row's button, which replaces the editor.
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-stock-edit="${productId}"]`)?.focus();
    });
  }

  const setQuery = useCallback((change: { q?: string; status?: typeof status; page?: number; perPage?: number }) => {
    const current = productQueryFromParams(new URLSearchParams(window.location.search));
    const next = { ...current, categoryId: undefined, sort: current.sort, page: 1, ...change };
    navigate(`/inventory${productQueryToSearch(next)}`, { replace: true });
  }, []);

  const load = useCallback(
    () => api.listProducts({ q: q === '' ? undefined : q, status, sort: 'name', page, perPage }),
    [api, q, status, page, perPage],
  );
  const { data, error, loading, reload, update } = useAsync(load);

  const onSearch = useCallback(
    (value: string) => {
      setQuery({ q: value.trim() });
    },
    [setQuery],
  );

  async function save(product: Product, onHand: number) {
    const stock = await api.setStock(product.id, onHand);
    update((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.id === product.id
          ? { ...item, stock: { onHand: stock.onHand, reserved: stock.reserved, available: stock.available } }
          : item,
      ),
    }));
    stopEditing(product.id);
    toast(`Zapisano stan „${product.name}”: ${formatQuantity(stock.onHand)} szt. na magazynie.`);
  }

  let content;
  if (error !== undefined) {
    content = <ErrorState error={error} onRetry={reload} />;
  } else if (data === undefined) {
    content = <LoadingState label="Wczytywanie stanów magazynowych…" rows={8} />;
  } else if (data.items.length === 0 && data.totalItems > 0) {
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
      />
    );
  } else if (data.items.length === 0) {
    content = (
      <EmptyState icon="search" title="Brak produktów">
        {q !== '' || status !== 'all' ? 'Zmień wyszukiwaną frazę lub filtr statusu.' : 'Dodaj produkty w katalogu.'}
      </EmptyState>
    );
  } else {
    content = (
      <>
        <div className={loading ? 'table-wrap is-refreshing' : 'table-wrap'} aria-busy={loading}>
          <table className="table">
            <caption className="visually-hidden">Stany magazynowe produktów</caption>
            <thead>
              <tr>
                <th scope="col" className="col-primary">
                  Produkt
                </th>
                <th scope="col" className="num">
                  Na stanie
                </th>
                <th scope="col" className="num">
                  Zarezerwowane
                </th>
                <th scope="col" className="num">
                  Dostępne
                </th>
                <th scope="col">Dostępność</th>
                <th scope="col" className="actions">
                  <span className="visually-hidden">Akcje</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((product) => (
                <tr key={product.id} className={editing === product.id ? 'is-editing' : undefined}>
                  <td>
                    <Link to={`/products/${product.id}`} className="cell-title">
                      {product.name}
                    </Link>
                    <span className="cell-sub">
                      <code className="sku">{product.sku}</code> {!product.active && <StatusBadge active={false} />}
                    </span>
                  </td>
                  <td className="num">
                    {editing === product.id ? (
                      <StockEditor
                        productName={product.name}
                        onHand={product.stock.onHand}
                        onSave={(onHand) => save(product, onHand)}
                        onCancel={() => {
                          stopEditing(product.id);
                        }}
                      />
                    ) : (
                      formatQuantity(product.stock.onHand)
                    )}
                  </td>
                  <td className="num">{formatQuantity(product.stock.reserved)}</td>
                  <td className="num strong">{formatQuantity(product.stock.available)}</td>
                  <td>
                    <AvailabilityBadge available={product.stock.available} />
                  </td>
                  <td className="actions">
                    {editing !== product.id && (
                      <Button
                        size="sm"
                        icon="edit"
                        aria-label={`Zmień stan: ${product.name}`}
                        data-stock-edit={product.id}
                        onClick={() => {
                          setEditing(product.id);
                        }}
                      >
                        Zmień stan
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          page={data.page}
          perPage={data.perPage}
          totalItems={data.totalItems}
          totalPages={data.totalPages}
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
        title="Magazyn"
        description={
          <>
            Stany magazynowe produktów. <strong>Dostępne</strong> = na stanie minus rezerwacje (wylicza backend). Niski stan
            oznacza najwyżej {LOW_STOCK_THRESHOLD} dostępne sztuki.
          </>
        }
      />
      <div className="card">
        <div className="toolbar" role="search" aria-label="Filtry magazynu">
          <SearchInput label="Szukaj po nazwie lub SKU" placeholder="Szukaj po nazwie lub SKU…" value={q} onChange={onSearch} />
          <div className="toolbar__filters">
            <label className="toolbar__field">
              <span className="visually-hidden">Status produktu</span>
              <select
                className="select"
                value={status}
                onChange={(event) => {
                  setQuery({ status: event.target.value as typeof status });
                }}
              >
                <option value="all">Wszystkie produkty</option>
                <option value="active">Aktywne</option>
                <option value="inactive">Nieaktywne</option>
              </select>
            </label>
          </div>
        </div>
        {content}
      </div>
    </>
  );
}
