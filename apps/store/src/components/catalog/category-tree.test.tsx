import { render, screen, within } from '@testing-library/react';
import { categories } from '@/test/fixtures';
import { CategoryTree } from './category-tree';

describe('CategoryTree', () => {
  it('renders the whole hierarchy as nested lists of links', () => {
    render(<CategoryTree categories={categories} />);

    const nav = screen.getByRole('navigation', { name: 'Kategorie' });
    expect(within(nav).getByRole('link', { name: 'Elektronika' })).toHaveAttribute('href', '/kategoria/elektronika');
    expect(within(nav).getByRole('link', { name: 'Słuchawki' })).toHaveAttribute('href', '/kategoria/sluchawki');
    expect(within(nav).getByRole('link', { name: 'Wszystkie produkty' })).toHaveAttribute('href', '/produkty');

    // Słuchawki is nested two levels below Elektronika.
    const audioItem = screen.getByRole('link', { name: 'Audio' }).closest('li');
    expect(audioItem).not.toBeNull();
    expect(within(audioItem as HTMLElement).getByRole('link', { name: 'Słuchawki' })).toBeInTheDocument();
  });

  it('marks the current category', () => {
    render(<CategoryTree categories={categories} activeSlug="audio" />);

    expect(screen.getByRole('link', { name: 'Audio' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Elektronika' })).not.toHaveAttribute('aria-current');
  });

  it('marks "all products" on the full listing', () => {
    render(<CategoryTree categories={categories} activeSlug={null} />);

    expect(screen.getByRole('link', { name: 'Wszystkie produkty' })).toHaveAttribute('aria-current', 'page');
  });
});
