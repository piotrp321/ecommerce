import { render, screen } from '@testing-library/react';
import { product } from '@/test/fixtures';
import { ProductCard } from './product-card';

describe('ProductCard', () => {
  it('shows the name as a link to the product, its category, gross price and availability', () => {
    render(<ProductCard product={product()} />);

    expect(screen.getByRole('link', { name: 'Słuchawki testowe' })).toHaveAttribute('href', '/produkt/sluchawki-testowe');
    expect(screen.getByRole('heading', { level: 3, name: 'Słuchawki testowe' })).toBeInTheDocument();
    expect(screen.getByText('Słuchawki')).toBeInTheDocument();
    expect(screen.getByText(/1249,00\s*zł/)).toBeInTheDocument();
    expect(screen.getByText('Dostępny')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Zdjęcie słuchawek' })).toBeInTheDocument();
  });

  it('shows an unavailable product as such', () => {
    render(<ProductCard product={product({ inStock: false })} />);

    expect(screen.getByText('Niedostępny', { selector: 'p' })).toBeInTheDocument();
    expect(screen.queryByText('Dostępny')).not.toBeInTheDocument();
  });

  it('shows a placeholder without a photo or a category', () => {
    render(<ProductCard product={product({ image: null, category: null })} />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Brak zdjęcia')).toBeInTheDocument();
  });
});
