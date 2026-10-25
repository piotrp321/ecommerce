import { Badge } from '../components/Badge';
import { Icon } from '../components/Icon';
import { Link } from '../components/Link';
import { isActive, navigation } from './navigation';

interface SidebarProps {
  pathname: string;
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ pathname, open, onClose }: SidebarProps) {
  return (
    <aside id="sidebar" className={open ? 'sidebar sidebar--open' : 'sidebar'} aria-label="Menu główne">
      <div className="sidebar__brand">
        <span className="sidebar__logo" aria-hidden="true">
          E
        </span>
        <span className="sidebar__brand-text">
          <span className="sidebar__brand-name">E-commerce</span>
          <span className="sidebar__brand-sub">Panel administracyjny</span>
        </span>
        <button type="button" className="sidebar__close" aria-label="Zamknij menu" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <nav className="sidebar__nav" aria-label="Nawigacja">
        {navigation.map((section) => (
          <div key={section.label} className="sidebar__section">
            <p className="sidebar__section-label">{section.label}</p>
            <ul className="sidebar__list">
              {section.items.map((item) => {
                const active = isActive(item, pathname);

                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      className={active ? 'sidebar__link sidebar__link--active' : 'sidebar__link'}
                      aria-current={active ? 'page' : undefined}
                    >
                      <Icon name={item.icon} />
                      <span className="sidebar__link-label">{item.label}</span>
                      {item.placeholder === true && <Badge tone="neutral">wkrótce</Badge>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="sidebar__footer">
        <Icon name="flask" />
        <p>
          <strong>Tryb demonstracyjny</strong>
          <br />
          Dane fikcyjne, bez połączenia z API.
        </p>
      </div>
    </aside>
  );
}
