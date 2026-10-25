import { fireEvent, render, screen, within } from '@testing-library/react';
import { categories } from '@/test/fixtures';
import { activeSlugFromPath, CategorySheet } from './category-sheet';

const pathname = vi.hoisted(() => ({ current: '/kategoria/audio' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));

function renderSheet() {
  render(<CategorySheet categories={categories} trigger={<button type="button">Kategorie</button>} />);
}

describe('CategorySheet', () => {
  it('opens the category tree in a dialog with the current category marked', () => {
    renderSheet();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Kategorie' }));

    const dialog = screen.getByRole('dialog', { name: 'Kategorie' });
    expect(within(dialog).getByRole('link', { name: 'Audio' })).toHaveAttribute('aria-current', 'page');
  });

  it('closes after choosing a category', () => {
    // jsdom cannot navigate; the sheet only needs to see the click on the link.
    const preventNavigation = (event: Event) => {
      event.preventDefault();
    };
    document.addEventListener('click', preventNavigation);
    onTestFinished(() => {
      document.removeEventListener('click', preventNavigation);
    });
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Kategorie' }));

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('link', { name: 'Kuchnia' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('can be closed with the close button', () => {
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Kategorie' }));

    fireEvent.click(screen.getByRole('button', { name: 'Zamknij' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('activeSlugFromPath', () => {
  it.each([
    ['/kategoria/audio', 'audio'],
    ['/produkty', null],
    ['/produkt/lampa', undefined],
    ['/', undefined],
  ])('%s → %s', (path, slug) => {
    expect(activeSlugFromPath(path)).toBe(slug);
  });
});
