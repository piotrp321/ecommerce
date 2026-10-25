import { render, screen } from '@testing-library/react';
import type { ProductPage } from '@/catalog/types';
import { product } from '@/test/fixtures';
import { categories } from '@/test/fixtures';
import { ListingLayout, ListingResults, productCountLabel } from './product-listing';

vi.mock('next/navigation', () => ({ usePathname: () => '/kategoria/audio' }));

const page = (overrides: Partial<ProductPage>): ProductPage => ({
  items: [],
  page: 1,
  perPage: 12,
  totalItems: 0,
  totalPages: 0,
  ...overrides,
});

describe('ListingResults', () => {
  it('lists the products of the page with their count and pagination', () => {
    const items = [product(), product({ id: 'p2', slug: 'drugi', name: 'Drugi produkt' })];
    render(
      <ListingResults
        pathname="/produkty"
        params={{ sort: 'nazwa', page: 1 }}
        result={page({ items, totalItems: 14, totalPages: 2 })}
      />,
    );

    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(screen.getByText('14 produktów · strona 1 z 2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Następna' })).toHaveAttribute('href', '/produkty?strona=2');
  });

  it('shows an empty state for a category without products', () => {
    render(<ListingResults pathname="/kategoria/pusta" params={{ sort: 'nazwa', page: 1 }} result={page({})} />);

    expect(screen.getByRole('heading', { name: 'Brak produktów' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Wszystkie produkty' })).toHaveAttribute('href', '/produkty');
  });

  it('offers the first page when the page number is out of range', () => {
    render(
      <ListingResults
        pathname="/kategoria/audio"
        params={{ sort: 'cena-rosnaco', page: 9 }}
        result={page({ page: 9, totalItems: 6, totalPages: 1 })}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Nie ma takiej strony' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Wróć do pierwszej strony' })).toHaveAttribute('href', '/kategoria/audio');
  });
});

describe('ListingLayout', () => {
  it('keeps the heading hierarchy: page h1, products h2, product cards h3', () => {
    render(
      <ListingLayout
        title="Audio"
        pathname="/kategoria/audio"
        trail={[]}
        categories={categories}
        activeSlug="audio"
        subcategories={[]}
        sort="nazwa"
      >
        <ListingResults
          pathname="/kategoria/audio"
          params={{ sort: 'nazwa', page: 1 }}
          result={page({ items: [product()], totalItems: 1, totalPages: 1 })}
        />
      </ListingLayout>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Audio' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Produkty' })).toContainElement(
      screen.getByRole('heading', { level: 3, name: 'Słuchawki testowe' }),
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Produkty' })).toBeInTheDocument();
  });
});

describe('productCountLabel', () => {
  it.each([
    [1, '1 produkt'],
    [3, '3 produkty'],
    [5, '5 produktów'],
    [12, '12 produktów'],
    [22, '22 produkty'],
    [0, '0 produktów'],
  ])('%i → %s', (count, label) => {
    expect(productCountLabel(count)).toBe(label);
  });
});
