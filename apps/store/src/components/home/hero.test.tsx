import { render, screen } from '@testing-library/react';
import { heroImage } from '@/content/home';
import { Hero } from './hero';

describe('Hero', () => {
  // infra/scripts/check-prod-*.sh look for exactly this heading in the server-rendered HTML.
  it('renders the store heading as a bare <h1>Sklep</h1>', () => {
    const { container } = render(<Hero image={heroImage} isDemo={false} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Sklep' })).toBeInTheDocument();
    expect(container.innerHTML).toContain('<h1>Sklep</h1>');
  });

  it('labels only the demo catalog as a demo collection', () => {
    const { unmount } = render(<Hero image={heroImage} isDemo />);
    expect(screen.getByText('Kolekcja demonstracyjna')).toBeInTheDocument();
    unmount();

    render(<Hero image={heroImage} isDemo={false} />);
    expect(screen.queryByText(/demonstracyjn/i)).not.toBeInTheDocument();
  });

  it('leads to the products and the categories', () => {
    render(<Hero image={heroImage} isDemo />);

    expect(screen.getByRole('link', { name: 'Przeglądaj produkty' })).toHaveAttribute('href', '/produkty');
    expect(screen.getByRole('link', { name: 'Zobacz kategorie' })).toHaveAttribute('href', '#kategorie');
  });
});
