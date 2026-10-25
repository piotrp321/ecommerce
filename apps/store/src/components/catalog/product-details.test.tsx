import { render, screen } from '@testing-library/react';
import { product } from '@/test/fixtures';
import { ProductDetails } from './product-details';

describe('ProductDetails', () => {
  it('presents the name, description, gross price with VAT note, category and availability', () => {
    render(<ProductDetails product={product()} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Słuchawki testowe' })).toBeInTheDocument();
    expect(screen.getByText('Opis słuchawek.')).toBeInTheDocument();
    expect(screen.getByText(/1249,00\s*zł/)).toBeInTheDocument();
    expect(screen.getByText('Cena brutto, zawiera 23% VAT')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Słuchawki' })).toHaveAttribute('href', '/kategoria/sluchawki');
    expect(screen.getAllByText('Dostępny')).not.toHaveLength(0);
    expect(screen.getByText('DEMO-001')).toBeInTheDocument();
  });

  it('handles a product without description, category or stock', () => {
    render(<ProductDetails product={product({ description: null, category: null, inStock: false })} />);

    expect(screen.queryByRole('heading', { name: 'Opis' })).not.toBeInTheDocument();
    expect(screen.getByText('Bez kategorii')).toBeInTheDocument();
    expect(screen.getAllByText('Chwilowo niedostępny')).not.toHaveLength(0);
  });
});
