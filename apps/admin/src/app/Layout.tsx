import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from '../lib/router';
import { DemoBanner } from './DemoBanner';
import { currentNavItem } from './navigation';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();

  const [menu, setMenu] = useState({ open: false, pathname });
  const previousPathname = useRef(pathname);

  const close = useCallback(() => {
    setMenu((current) => ({ ...current, open: false }));
    document.querySelector<HTMLElement>('.topbar__menu')?.focus();
  }, []);

  // Navigating closes the mobile menu.
  if (menu.pathname !== pathname) {
    setMenu({ open: false, pathname });
  }

  // Move focus to the new page heading, so keyboard and screen reader users start at the content.
  useEffect(() => {
    if (previousPathname.current === pathname) {
      return;
    }
    previousPathname.current = pathname;
    document.querySelector<HTMLElement>('[data-page-heading]')?.focus();
    window.scrollTo({ top: 0 });
  }, [pathname]);

  // The drawer (tablet and phone) takes focus when opened and gives it back to the menu button on Escape.
  useEffect(() => {
    if (!menu.open) {
      return;
    }
    document.querySelector<HTMLElement>('.sidebar__close')?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        close();
      }
    }
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menu.open, close]);


  return (
    <div className="layout">
      <a className="skip-link" href="#content">
        Przejdź do treści
      </a>
      <Sidebar pathname={pathname} open={menu.open} onClose={close} />
      {menu.open && <div className="layout__backdrop" aria-hidden="true" onClick={close} />}
      {/* While the drawer is open, the page behind it cannot be focused or clicked. */}
      <div className="layout__main" inert={menu.open}>
        <DemoBanner />
        <Topbar
          section={currentNavItem(pathname)?.label ?? 'Panel'}
          menuOpen={menu.open}
          onMenuToggle={() => {
            setMenu((current) => ({ ...current, open: !current.open }));
          }}
        />
        <main id="content" className="content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
