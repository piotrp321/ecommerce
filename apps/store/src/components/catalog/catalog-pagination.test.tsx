import { render, screen } from '@testing-library/react';
import { CatalogPagination, visiblePages } from './catalog-pagination';

describe('CatalogPagination', () => {
  it('links to neighbouring pages and keeps the sort order', () => {
    render(<CatalogPagination pathname="/kategoria/audio" sort="cena-rosnaco" page={2} totalPages={3} />);

    expect(screen.getByRole('navigation', { name: 'Strony wyników' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Poprzednia' })).toHaveAttribute('href', '/kategoria/audio?sortowanie=cena-rosnaco');
    expect(screen.getByRole('link', { name: 'Następna' })).toHaveAttribute(
      'href',
      '/kategoria/audio?sortowanie=cena-rosnaco&strona=3',
    );
    expect(screen.getByRole('link', { name: 'Strona 2' })).toHaveAttribute('aria-current', 'page');
  });

  it('has no previous link on the first page and no next link on the last one', () => {
    const { rerender } = render(<CatalogPagination pathname="/produkty" sort="nazwa" page={1} totalPages={3} />);
    expect(screen.queryByRole('link', { name: 'Poprzednia' })).not.toBeInTheDocument();

    rerender(<CatalogPagination pathname="/produkty" sort="nazwa" page={3} totalPages={3} />);
    expect(screen.queryByRole('link', { name: 'Następna' })).not.toBeInTheDocument();
  });

  it('is not rendered for a single page', () => {
    const { container } = render(<CatalogPagination pathname="/produkty" sort="nazwa" page={1} totalPages={1} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('collapses distant pages into gaps', () => {
    expect(visiblePages(5, 10)).toEqual([1, null, 4, 5, 6, null, 10]);
    expect(visiblePages(1, 3)).toEqual([1, 2, 3]);
  });
});
