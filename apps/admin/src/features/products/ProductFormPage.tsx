import { useCallback, useState } from 'react';
import { useAdminApi } from '../../api/AdminApiContext';
import { ApiError } from '../../api/errors';
import type { CreateProductInput, Product } from '../../api/types';
import { AvailabilityBadge } from '../../components/AvailabilityBadge';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Icon } from '../../components/Icon';
import { Link } from '../../components/Link';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { StatusBadge } from '../../components/StatusBadge';
import { useToast } from '../../components/toastContext';
import { categoryOptions } from '../../lib/categoryOptions';
import { formatDateTime, formatQuantity } from '../../lib/format';
import { navigate } from '../../lib/router';
import { useAsync } from '../../lib/useAsync';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { ProductForm } from './ProductForm';
import { emptyProductForm, productToForm } from './productFormModel';

/** Create (`productId` null) or edit a product. */
export function ProductFormPage({ productId }: { productId: string | null }) {
  const api = useAdminApi();
  const toast = useToast();
  const [confirmStatus, setConfirmStatus] = useState(false);

  const load = useCallback(
    async () => {
      const [categories, product] = await Promise.all([
        api.listCategories(),
        productId === null ? Promise.resolve(null) : api.getProduct(productId),
      ]);

      return { categories: categoryOptions(categories), product };
    },
    [api, productId],
  );
  const { data, error, reload, update } = useAsync(load);
  const product = data?.product ?? null;
  const title = productId === null ? 'Nowy produkt' : (product?.name ?? 'Edycja produktu');
  useDocumentTitle(title);

  function setProduct(next: Product) {
    update((current) => ({ ...current, product: next }));
  }

  async function save(input: CreateProductInput) {
    if (productId === null) {
      const created = await api.createProduct(input);
      toast(`Utworzono produkt „${created.name}”. Jest nieaktywny do czasu aktywacji.`);
      navigate(`/products/${created.id}`);

      return;
    }
    const { slug, name, description, netPrice, vatRate, categoryId } = input;
    setProduct(await api.updateProduct(productId, { slug, name, description, netPrice, vatRate, categoryId }));
    toast('Zapisano zmiany produktu.');
  }

  async function toggleStatus(current: Product) {
    const next = current.active ? await api.deactivateProduct(current.id) : await api.activateProduct(current.id);
    setProduct(next);
    toast(next.active ? `Aktywowano produkt „${next.name}”.` : `Dezaktywowano produkt „${next.name}”.`);
  }

  const back = (
    <Link to="/products" className="back-link">
      <Icon name="chevronLeft" size={16} /> Produkty
    </Link>
  );

  let body;
  if (error !== undefined) {
    body =
      error instanceof ApiError && error.status === 404 ? (
        <div className="card">
          <EmptyState
            icon="search"
            title="Nie znaleziono produktu"
            action={
              <Link to="/products" className="btn btn--secondary btn--md">
                Wróć do listy
              </Link>
            }
          >
            Produkt mógł zostać usunięty lub adres jest nieprawidłowy.
          </EmptyState>
        </div>
      ) : (
        <div className="card">
          <ErrorState error={error} onRetry={reload} />
        </div>
      );
  } else if (data === undefined) {
    body = (
      <div className="card card--padded">
        <LoadingState label="Wczytywanie produktu…" rows={8} />
      </div>
    );
  } else {
    body = (
      <ProductForm
        mode={product === null ? 'create' : 'edit'}
        initialValues={product === null ? emptyProductForm : productToForm(product)}
        categories={data.categories}
        savedGross={product?.price.gross}
        onSubmit={save}
        onCancel={() => {
          navigate('/products');
        }}
        aside={
          product === null ? (
            <section className="card card--padded">
              <h2 className="card__title">Status</h2>
              <p className="muted">
                Nowy produkt jest tworzony jako <strong>nieaktywny</strong>. Aktywujesz go po zapisaniu, gdy dane będą
                kompletne.
              </p>
            </section>
          ) : (
            <>
              <section className="card card--padded" aria-labelledby="product-status">
                <h2 id="product-status" className="card__title">
                  Status
                </h2>
                <div className="status-row">
                  <StatusBadge active={product.active} />
                  <Button
                    size="sm"
                    variant={product.active ? 'danger' : 'primary'}
                    icon="power"
                    onClick={() => {
                      setConfirmStatus(true);
                    }}
                  >
                    {product.active ? 'Dezaktywuj' : 'Aktywuj'}
                  </Button>
                </div>
                <p className="muted small">
                  {product.active ? 'Produkt jest widoczny w sklepie.' : 'Produkt nie jest widoczny w sklepie.'}
                </p>
              </section>
              <section className="card card--padded" aria-labelledby="product-stock">
                <h2 id="product-stock" className="card__title">
                  Magazyn
                </h2>
                <dl className="facts">
                  <div>
                    <dt>Na stanie</dt>
                    <dd className="num">{formatQuantity(product.stock.onHand)}</dd>
                  </div>
                  <div>
                    <dt>Zarezerwowane</dt>
                    <dd className="num">{formatQuantity(product.stock.reserved)}</dd>
                  </div>
                  <div>
                    <dt>Dostępne</dt>
                    <dd>
                      <span className="num">{formatQuantity(product.stock.available)}</span>{' '}
                      <AvailabilityBadge available={product.stock.available} />
                    </dd>
                  </div>
                </dl>
                <Link to={`/inventory?q=${encodeURIComponent(product.sku)}`} className="text-link">
                  Zmień stan w magazynie
                </Link>
              </section>
              <section className="card card--padded" aria-labelledby="product-meta">
                <h2 id="product-meta" className="card__title">
                  Informacje
                </h2>
                <dl className="facts">
                  <div>
                    <dt>Utworzono</dt>
                    <dd>{formatDateTime(product.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>Zmieniono</dt>
                    <dd>{formatDateTime(product.updatedAt)}</dd>
                  </div>
                </dl>
              </section>
              <ConfirmDialog
                open={confirmStatus}
                title={product.active ? 'Dezaktywować produkt?' : 'Aktywować produkt?'}
                confirmLabel={product.active ? 'Dezaktywuj' : 'Aktywuj'}
                tone={product.active ? 'danger' : 'primary'}
                onConfirm={() => toggleStatus(product)}
                onClose={() => {
                  setConfirmStatus(false);
                }}
              >
                {product.active
                  ? `„${product.name}” zniknie z oferty sklepu. Możesz go później aktywować ponownie.`
                  : `„${product.name}” pojawi się w ofercie sklepu.`}
              </ConfirmDialog>
            </>
          )
        }
      />
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={back}
        title={title}
        description={
          product === null ? (
            'Uzupełnij dane produktu. Pola oznaczone * są wymagane.'
          ) : (
            <>
              SKU <code>{product.sku}</code> · <StatusBadge active={product.active} />
            </>
          )
        }
      />
      {body}
    </>
  );
}
