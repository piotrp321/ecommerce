import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderApp } from '../../test/renderApp';

async function table() {
  return within(await screen.findByRole('table'));
}

describe('ProductsPage', () => {
  it('lists products with decimal prices formatted as text', async () => {
    renderApp('/products');
    const rows = (await table()).getAllByRole('row');

    expect(rows).toHaveLength(21);
    expect(screen.getByText('1–20 z 36')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Klawiatura mechaniczna 75%' })).toBeInTheDocument();
    // Testing Library normalises the non-breaking spaces of formatted amounts.
    expect(screen.getAllByText(/^406,50 zł/)[0]).toBeInTheDocument();
  });

  it('searches by name or SKU and keeps the filter in the URL', async () => {
    renderApp('/products');
    await table();
    const search = screen.getByRole('searchbox', { name: 'Szukaj po nazwie lub SKU' });

    fireEvent.change(search, { target: { value: 'BOK-' } });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(await screen.findByText('1–4 z 4')).toBeInTheDocument();
    expect(window.location.search).toBe('?q=BOK-');
  });

  it('shows an empty state when nothing matches', async () => {
    renderApp('/products?q=nic-takiego');

    expect(await screen.findByText('Brak produktów spełniających kryteria')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Wyczyść filtry' }));
    expect(await screen.findByText('1–20 z 36')).toBeInTheDocument();
  });

  it('keeps a trailing space while typing a multi-word search', async () => {
    renderApp('/products');
    await table();
    const search = screen.getByRole('searchbox', { name: 'Szukaj po nazwie lub SKU' });

    fireEvent.change(search, { target: { value: 'Laptop ' } });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(await screen.findByText('1–4 z 4')).toBeInTheDocument();
    expect(search).toHaveValue('Laptop ');
  });

  it('offers the first page when the page is out of range', async () => {
    renderApp('/products?page=99');

    expect(await screen.findByText('Ta strona nie istnieje')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Przejdź do pierwszej strony' }));
    expect(await screen.findByText('1–20 z 36')).toBeInTheDocument();
  });

  it('applies a typed search after the debounce and keeps the trailing space', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderApp('/products');
      await table();
      const search = screen.getByRole('searchbox', { name: 'Szukaj po nazwie lub SKU' });

      fireEvent.change(search, { target: { value: 'Laptop ' } });
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(window.location.search).toBe('?q=Laptop');
      expect(search).toHaveValue('Laptop ');

      fireEvent.change(search, { target: { value: 'Laptop Air' } });
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(window.location.search).toBe('?q=Laptop+Air');
      expect(await screen.findByText('1–1 z 1')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows a supported page size when the URL has another one', async () => {
    renderApp('/products?perPage=37');

    expect(await screen.findByText('1–20 z 36')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Na stronie' })).toHaveValue('20');
  });

  it('ignores a malformed category id', async () => {
    renderApp('/products?category=garbage');

    expect(await screen.findByText('1–20 z 36')).toBeInTheDocument();
  });

  it('drops a category that does not exist from the URL', async () => {
    renderApp('/products?category=c0000000-0000-4000-8000-000000000999');

    await waitFor(() => {
      expect(window.location.search).toBe('');
    });
    expect(await screen.findByText('1–20 z 36')).toBeInTheDocument();
  });

  it('caps a search phrase from the URL at 100 characters', async () => {
    renderApp(`/products?q=${'x'.repeat(150)}`);

    expect(await screen.findByText('Brak produktów spełniających kryteria')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Szukaj po nazwie lub SKU' })).toHaveValue('x'.repeat(100));
  });

  it('sorts by a column header', async () => {
    renderApp('/products');
    await table();

    fireEvent.click(screen.getByRole('button', { name: 'Produkt' }));

    expect(await screen.findByRole('columnheader', { name: 'Produkt' })).toHaveAttribute('aria-sort', 'ascending');
    expect((await table()).getAllByRole('row')[1]).toHaveTextContent('Czajnik elektryczny');
  });

  it('paginates', async () => {
    renderApp('/products');
    await table();

    fireEvent.click(screen.getByRole('button', { name: 'Następna strona' }));

    expect(await screen.findByText('21–36 z 36')).toBeInTheDocument();
  });

  it('deactivates a product only after confirmation', async () => {
    renderApp('/products?q=LAP-ZEN-14');
    const row = (await screen.findByRole('link', { name: 'Laptop Zenbook 14 OLED' })).closest('tr');
    if (row === null) throw new Error('Missing row');

    fireEvent.click(within(row).getByRole('button', { name: 'Dezaktywuj Laptop Zenbook 14 OLED' }));
    const dialog = screen.getByRole('dialog', { name: 'Dezaktywować produkt?' });
    expect(within(row).getByText('Aktywny')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Dezaktywuj' }));

    expect(await within(row).findByText('Nieaktywny')).toBeInTheDocument();
    expect(screen.getByText('Dezaktywowano produkt „Laptop Zenbook 14 OLED”.')).toBeInTheDocument();
  });
});
