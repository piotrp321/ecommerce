import { render, screen } from '@testing-library/react';
import { SortOptions } from './sort-options';

describe('SortOptions', () => {
  it('offers sorting by name and price, starting again from the first page', () => {
    render(<SortOptions pathname="/kategoria/audio" current="nazwa" />);

    expect(screen.getByRole('link', { name: 'Sortuj: Nazwa A–Z' })).toHaveAttribute('href', '/kategoria/audio');
    expect(screen.getByRole('link', { name: 'Sortuj: Cena rosnąco' })).toHaveAttribute(
      'href',
      '/kategoria/audio?sortowanie=cena-rosnaco',
    );
    expect(screen.getByRole('link', { name: 'Sortuj: Cena malejąco' })).toHaveAttribute(
      'href',
      '/kategoria/audio?sortowanie=cena-malejaco',
    );
  });

  it('marks the current order', () => {
    render(<SortOptions pathname="/produkty" current="cena-malejaco" />);

    expect(screen.getByRole('link', { name: 'Sortuj: Cena malejąco' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('link', { name: 'Sortuj: Nazwa A–Z' })).not.toHaveAttribute('aria-current');
  });
});
