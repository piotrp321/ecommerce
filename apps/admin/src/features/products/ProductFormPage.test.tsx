import { fireEvent, screen } from '@testing-library/react';
import { ApiError } from '../../api/errors';
import { createDemoApi } from '../../demo/createDemoApi';
import { demoId } from '../../demo/fixtures';
import { renderApp } from '../../test/renderApp';

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label, { exact: false }), { target: { value } });
}

describe('ProductFormPage', () => {
  it('validates the form before sending and links errors to fields', async () => {
    renderApp('/products/new');
    fireEvent.click(await screen.findByRole('button', { name: 'Utwórz produkt' }));

    const name = screen.getByRole('textbox', { name: /Nazwa/ });
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription('Podaj nazwę produktu.');
    expect(name).toHaveFocus();
    expect(screen.getByRole('textbox', { name: /Cena netto/ })).toHaveAccessibleDescription(/Podaj cenę netto/);
  });

  it('suggests the slug from the name', async () => {
    renderApp('/products/new');
    await screen.findByRole('button', { name: 'Utwórz produkt' });
    fill('Nazwa', 'Żółty Rower Górski');

    expect(await screen.findByDisplayValue('zolty-rower-gorski')).toBeInTheDocument();
  });

  it('shows a business error returned by the API', async () => {
    renderApp('/products/new');
    await screen.findByRole('button', { name: 'Utwórz produkt' });
    fill('Nazwa', 'Duplikat');
    fill('SKU', 'LAP-ZEN-14');
    fill('Cena netto', '10');
    fireEvent.click(screen.getByRole('button', { name: 'Utwórz produkt' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Produkt z SKU LAP-ZEN-14 już istnieje.');
  });

  it('spells out API violations that do not match a form field', async () => {
    const demo = createDemoApi({ latencyMs: 0 });
    const api = {
      ...demo,
      createProduct: () =>
        Promise.reject(
          new ApiError({ status: 422, title: 'Validation Failed', violations: [{ propertyPath: 'price.net', title: 'Too many digits.' }] }),
        ),
    };
    renderApp('/products/new', api);
    await screen.findByRole('button', { name: 'Utwórz produkt' });
    fill('Nazwa', 'Produkt');
    fill('SKU', 'TEST-2');
    fill('Cena netto', '10');
    fireEvent.click(screen.getByRole('button', { name: 'Utwórz produkt' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Nieprawidłowe dane: Too many digits. (price.net)');
  });

  it('creates a product and opens it for editing', async () => {
    renderApp('/products/new');
    await screen.findByRole('button', { name: 'Utwórz produkt' });
    fill('Nazwa', 'Nowy produkt testowy');
    fill('SKU', 'TEST-1');
    fill('Cena netto', '12,5');
    fireEvent.click(screen.getByRole('button', { name: 'Utwórz produkt' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Nowy produkt testowy' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /SKU/ })).toHaveAttribute('readonly');
    expect(screen.getByRole('textbox', { name: /Cena netto/ })).toHaveValue('12,50');
    expect(screen.getByText(/Jest nieaktywny do czasu aktywacji/)).toBeInTheDocument();
  });

  it('edits an existing product and shows the gross price from the backend', async () => {
    renderApp(`/products/${demoId('a', 1)}`);

    expect(await screen.findByRole('heading', { level: 1, name: 'Laptop Zenbook 14 OLED' })).toBeInTheDocument();
    expect(screen.getByText('4 999,00 zł')).toBeInTheDocument();
    fill('Cena netto', '4100');
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz zmiany' }));

    expect(await screen.findByText('Zapisano zmiany produktu.')).toBeInTheDocument();
    expect(screen.getByText('wyliczy backend')).toBeInTheDocument();
  });

  it('shows not found for an unknown product', async () => {
    renderApp('/products/unknown');

    expect(await screen.findByText('Nie znaleziono produktu')).toBeInTheDocument();
  });
});
