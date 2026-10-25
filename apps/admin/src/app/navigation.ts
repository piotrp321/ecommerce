import type { IconName } from '../components/Icon';

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  /** Not available yet; shown with a "wkrótce" badge. */
  placeholder?: boolean;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const navigation: NavSection[] = [
  { label: 'Przegląd', items: [{ to: '/', label: 'Dashboard', icon: 'dashboard' }] },
  {
    label: 'Katalog',
    items: [
      { to: '/products', label: 'Produkty', icon: 'products' },
      { to: '/categories', label: 'Kategorie', icon: 'categories' },
      { to: '/inventory', label: 'Magazyn', icon: 'inventory' },
    ],
  },
  { label: 'Sprzedaż', items: [{ to: '/orders', label: 'Zamówienia', icon: 'orders', placeholder: true }] },
  { label: 'System', items: [{ to: '/settings', label: 'Ustawienia', icon: 'settings', placeholder: true }] },
];

export function isActive(item: NavItem, pathname: string): boolean {
  return item.to === '/' ? pathname === '/' : pathname === item.to || pathname.startsWith(`${item.to}/`);
}

export function currentNavItem(pathname: string): NavItem | undefined {
  return navigation.flatMap((section) => section.items).find((item) => isActive(item, pathname));
}
