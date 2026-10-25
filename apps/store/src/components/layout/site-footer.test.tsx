import { render, screen } from '@testing-library/react';
import { categories } from '@/test/fixtures';
import { SiteFooter } from './site-footer';

describe('SiteFooter', () => {
  it('says the demo catalog is sample data', () => {
    render(<SiteFooter categories={categories} isDemo />);

    expect(screen.getByText(/Katalog jest demonstracyjny: produkty, ceny i dostępność są przykładowe/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Elektronika' })).toHaveAttribute('href', '/kategoria/elektronika');
  });

  it('does not call the real catalog a demo, and still credits the photos', () => {
    render(<SiteFooter categories={categories} isDemo={false} />);

    expect(screen.queryByText(/demonstracyjn|przykładow/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'licencją Unsplash' })).toBeInTheDocument();
  });
});
