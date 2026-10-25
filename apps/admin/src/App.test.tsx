import { fireEvent, render, screen, within } from '@testing-library/react';
import { UnavailableScreen } from './app/UnavailableScreen';
import { createDemoApi } from './demo/createDemoApi';
import { renderApp } from './test/renderApp';

describe('App', () => {
  it('opens on the dashboard with statistics and a visible demo notice', async () => {
    renderApp('/');

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('note', { name: 'Tryb demonstracyjny' })).toHaveTextContent('Dane są fikcyjne');
    const products = await screen.findByRole('region', { name: 'Produkty' });
    expect(within(products).getByText('36')).toBeInTheDocument();
  });

  it('navigates with the sidebar and marks the current page', async () => {
    renderApp('/');
    const nav = screen.getByRole('navigation', { name: 'Nawigacja' });

    fireEvent.click(within(nav).getByRole('link', { name: 'Kategorie' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Kategorie' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Kategorie' })).toHaveAttribute('aria-current', 'page');
    expect(window.location.pathname).toBe('/categories');
  });

  it('shows placeholders for modules that are not built yet', () => {
    renderApp('/orders');

    expect(screen.getByRole('heading', { level: 1, name: 'Zamówienia' })).toBeInTheDocument();
    expect(screen.getByText('Moduł w przygotowaniu')).toBeInTheDocument();
  });

  it('shows a not-found page for unknown addresses', () => {
    renderApp('/nope');

    expect(screen.getByRole('heading', { level: 1, name: 'Nie znaleziono strony' })).toBeInTheDocument();
  });

  it('shows an error state with retry when the API fails', async () => {
    const demo = createDemoApi({ latencyMs: 0 });
    let fail = true;
    const api = {
      ...demo,
      listCategories: () => (fail ? Promise.reject(new Error('offline')) : demo.listCategories()),
    };
    renderApp('/categories', api);

    expect(await screen.findByRole('alert')).toHaveTextContent('Nie udało się wczytać danych');
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }));

    expect(await screen.findByText('Elektronika')).toBeInTheDocument();
  });
});

describe('UnavailableScreen', () => {
  it('tells that the panel is not connected instead of showing data', () => {
    render(<UnavailableScreen />);

    expect(screen.getByRole('heading', { level: 1, name: 'Panel administracyjny' })).toBeInTheDocument();
    expect(screen.getByText(/nie jest jeszcze połączony z API/)).toBeInTheDocument();
  });
});
