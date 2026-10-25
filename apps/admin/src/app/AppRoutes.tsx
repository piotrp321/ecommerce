import { DashboardPage } from '../features/dashboard/DashboardPage';
import { CategoriesPage } from '../features/categories/CategoriesPage';
import { InventoryPage } from '../features/inventory/InventoryPage';
import { NotFoundPage } from '../features/placeholder/NotFoundPage';
import { PlaceholderPage } from '../features/placeholder/PlaceholderPage';
import { ProductFormPage } from '../features/products/ProductFormPage';
import { ProductsPage } from '../features/products/ProductsPage';
import { matchPath, useLocation } from '../lib/router';

export function AppRoutes() {
  const { pathname } = useLocation();
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

  if (path === '/') {
    return <DashboardPage />;
  }
  if (path === '/products') {
    return <ProductsPage />;
  }
  if (path === '/products/new') {
    return <ProductFormPage key="new" productId={null} />;
  }
  const product = matchPath('/products/:id', path);
  if (product?.id !== undefined) {
    return <ProductFormPage key={product.id} productId={product.id} />;
  }
  if (path === '/categories') {
    return <CategoriesPage />;
  }
  if (path === '/inventory') {
    return <InventoryPage />;
  }
  if (path === '/orders') {
    return (
      <PlaceholderPage
        title="Zamówienia"
        description="Przegląd i obsługa zamówień klientów."
        planned={['Lista zamówień z filtrami statusu', 'Szczegóły zamówienia ze snapshotem cen', 'Anulowania i zwroty']}
      />
    );
  }
  if (path === '/settings') {
    return (
      <PlaceholderPage
        title="Ustawienia"
        description="Konfiguracja sklepu i konta administratora."
        planned={['Dane sklepu', 'Konta administratorów i role (po wdrożeniu logowania)', 'Powiadomienia']}
      />
    );
  }

  return <NotFoundPage />;
}
