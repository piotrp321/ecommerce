import { fireEvent, screen, within } from '@testing-library/react';
import { renderApp } from '../../test/renderApp';

async function rowOf(name: string) {
  const row = (await screen.findByRole('link', { name })).closest('tr');
  if (row === null) throw new Error(`Missing row ${name}`);

  return within(row);
}

describe('InventoryPage', () => {
  it('shows on hand, reserved and available quantities with availability', async () => {
    renderApp('/inventory?q=ACC-CHG-65W');
    const row = await rowOf('Ładowarka GaN 65 W USB-C');

    expect(row.getByText('140')).toBeInTheDocument();
    expect(row.getByText('10')).toBeInTheDocument();
    expect(row.getByText('130')).toBeInTheDocument();
    expect(row.getByText('Dostępny')).toBeInTheDocument();
  });

  it('edits the quantity on hand inline', async () => {
    renderApp('/inventory?q=LAP-AIR-13');
    const row = await rowOf('Laptop Air 13 M3');
    expect(row.getByText('Brak')).toBeInTheDocument();

    fireEvent.click(row.getByRole('button', { name: 'Zmień stan: Laptop Air 13 M3' }));
    fireEvent.change(row.getByRole('textbox', { name: 'Stan na magazynie: Laptop Air 13 M3' }), { target: { value: '25' } });
    fireEvent.click(row.getByRole('button', { name: 'Zapisz' }));

    expect(await row.findByText('Dostępny')).toBeInTheDocument();
    expect(row.getAllByText('25')).toHaveLength(2);
  });

  it('shows validation errors next to the field', async () => {
    renderApp('/inventory?q=ACC-CHG-65W');
    const row = await rowOf('Ładowarka GaN 65 W USB-C');

    fireEvent.click(row.getByRole('button', { name: /Zmień stan/ }));
    const input = row.getByRole('textbox');
    fireEvent.change(input, { target: { value: '2,5' } });
    fireEvent.click(row.getByRole('button', { name: 'Zapisz' }));
    expect(input).toHaveAccessibleDescription('Podaj liczbę całkowitą od 0 do 1 000 000.');

    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.click(row.getByRole('button', { name: 'Zapisz' }));
    expect(await row.findByRole('alert')).toHaveTextContent('zarezerwowanych sztuk (10)');
  });

  it('cancels editing with Escape', async () => {
    renderApp('/inventory?q=ACC-CHG-65W');
    const row = await rowOf('Ładowarka GaN 65 W USB-C');

    fireEvent.click(row.getByRole('button', { name: /Zmień stan/ }));
    fireEvent.keyDown(row.getByRole('textbox'), { key: 'Escape' });

    expect(row.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
