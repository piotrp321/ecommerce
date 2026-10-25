import type { CategoryNode, Product } from '@/catalog/types';

export const categories: CategoryNode[] = [
  {
    id: 'c1',
    slug: 'elektronika',
    name: 'Elektronika',
    children: [
      {
        id: 'c2',
        slug: 'audio',
        name: 'Audio',
        children: [{ id: 'c3', slug: 'sluchawki', name: 'Słuchawki', children: [] }],
      },
    ],
  },
  { id: 'c4', slug: 'kuchnia', name: 'Kuchnia', children: [] },
];

export function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    sku: 'DEMO-001',
    slug: 'sluchawki-testowe',
    name: 'Słuchawki testowe',
    description: 'Opis słuchawek.',
    price: { gross: { amount: '1249.00', currency: 'PLN' }, vatRate: 23 },
    category: { id: 'c3', slug: 'sluchawki', name: 'Słuchawki' },
    inStock: true,
    image: { url: 'https://images.unsplash.com/photo-1', alt: 'Zdjęcie słuchawek', sourceUrl: 'https://unsplash.com/photos/x' },
    ...overrides,
  };
}
