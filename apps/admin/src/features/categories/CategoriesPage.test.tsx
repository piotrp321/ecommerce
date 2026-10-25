import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderApp } from '../../test/renderApp';

describe('CategoriesPage', () => {
  it('collapses and expands branches', async () => {
    renderApp('/categories');
    const toggle = await screen.findByRole('button', { name: 'Zwiń Elektronika' });
    expect(screen.getByText('Laptopy')).toBeInTheDocument();

    fireEvent.click(toggle);

    expect(screen.queryByText('Laptopy')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rozwiń Elektronika' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('adds a subcategory', async () => {
    renderApp('/categories');
    fireEvent.click(await screen.findByRole('button', { name: 'Dodaj podkategorię do Sport' }));
    const dialog = screen.getByRole('dialog', { name: 'Nowa podkategoria' });

    fireEvent.change(within(dialog).getByRole('textbox', { name: /Nazwa/ }), { target: { value: 'Turystyka' } });
    expect(within(dialog).getByRole('textbox', { name: /Slug/ })).toHaveValue('turystyka');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Dodaj kategorię' }));

    expect(await screen.findByText('Turystyka')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the backend error for a move that would create a cycle', async () => {
    renderApp('/categories');
    fireEvent.click(await screen.findByRole('button', { name: 'Przenieś Elektronika' }));
    const dialog = screen.getByRole('dialog', { name: 'Przenieś „Elektronika”' });

    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'c0000000-0000-4000-8000-000000000002' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Przenieś' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('powstałby cykl');
  });

  it('confirms deletion and shows why a category with products cannot be deleted', async () => {
    renderApp('/categories');
    fireEvent.click(await screen.findByRole('button', { name: 'Usuń Laptopy' }));
    const dialog = screen.getByRole('dialog', { name: 'Usunąć kategorię?' });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Usuń kategorię' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Kategoria zawiera produkty');
  });

  it('deletes an empty category', async () => {
    renderApp('/categories');
    fireEvent.click(await screen.findByRole('button', { name: 'Usuń Wyprzedaż' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Usuń kategorię' }));

    expect(await screen.findByText('Usunięto kategorię „Wyprzedaż”.')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('Wyprzedaż')).not.toBeInTheDocument();
    });
  });
});
