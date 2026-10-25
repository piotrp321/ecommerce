import { render, screen } from '@testing-library/react';
import { product } from '@/test/fixtures';
import { ProductDetails } from './product-details';

describe('ProductDetails', () => {
  it('presents the name, description, gross price with VAT note, category and availability', () => {
    render(<ProductDetails product={product()} isDemo />);

    expect(screen.getByRole('heading', { level: 1, name: 'Słuchawki testowe' })).toBeInTheDocument();
    expect(screen.getByText('Opis słuchawek.')).toBeInTheDocument();
    expect(screen.getByText(/1249,00\s*zł/)).toBeInTheDocument();
    expect(screen.getByText('Cena brutto, zawiera 23% VAT')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Słuchawki' })).toHaveAttribute('href', '/kategoria/sluchawki');
    expect(screen.getAllByText('Dostępny')).not.toHaveLength(0);
    expect(screen.getByText('DEMO-001')).toBeInTheDocument();
  });

  it('says the demo store takes no orders', () => {
    render(<ProductDetails product={product()} isDemo />);

    expect(screen.getByText(/Zamawianie nie jest jeszcze dostępne: to demonstracyjna wersja sklepu/)).toBeInTheDocument();
  });

  it('with the real catalog says ordering is not available yet, without calling the store a demo', () => {
    const fromApi = product({
      sku: 'HP-ARIA-01',
      price: { gross: { amount: '1249.99', currency: 'PLN' }, vatRate: 8 },
      inStock: false,
      image: null,
    });
    render(<ProductDetails product={fromApi} isDemo={false} />);

    expect(screen.getByText(/Zamawianie nie jest jeszcze dostępne: koszyk powstanie w kolejnym etapie/)).toBeInTheDocument();
    expect(screen.getByText(/1249,99\s*zł/)).toBeInTheDocument();
    expect(screen.getByText('Cena brutto, zawiera 8% VAT')).toBeInTheDocument();
    expect(screen.getAllByText('Chwilowo niedostępny')).not.toHaveLength(0);
    expect(screen.queryByText(/demonstracyjn/i)).not.toBeInTheDocument();
    expect(screen.getByText('Brak zdjęcia')).toBeInTheDocument();
    expect(screen.queryByText(/Zdjęcie poglądowe/)).not.toBeInTheDocument();
  });

  it('handles a product without description, category or stock', () => {
    render(<ProductDetails product={product({ description: null, category: null, inStock: false })} isDemo />);

    expect(screen.queryByRole('heading', { name: 'Opis' })).not.toBeInTheDocument();
    expect(screen.getByText('Bez kategorii')).toBeInTheDocument();
    expect(screen.getAllByText('Chwilowo niedostępny')).not.toHaveLength(0);
  });
});
