import { render, screen } from '@testing-library/react';
import { catalog } from '@/catalog';
import { DemoNotice } from './demo-notice';

describe('demo labelling', () => {
  it('the active catalog source is the demo one', () => {
    expect(catalog.isDemo).toBe(true);
  });

  it('tells visitors that products, prices and availability are samples', () => {
    render(<DemoNotice />);

    const notice = screen.getByRole('complementary', { name: 'Informacja o wersji demonstracyjnej' });
    expect(notice).toHaveTextContent('Wersja demonstracyjna.');
    expect(notice).toHaveTextContent('zamówienia nie są realizowane');
  });
});
