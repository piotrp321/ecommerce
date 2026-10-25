import { Badge } from '../components/Badge';
import { Icon } from '../components/Icon';

interface TopbarProps {
  section: string;
  menuOpen: boolean;
  onMenuToggle: () => void;
}

export function Topbar({ section, menuOpen, onMenuToggle }: TopbarProps) {
  return (
    <header className="topbar">
      <button
        type="button"
        className="topbar__menu"
        aria-label="Otwórz menu"
        aria-controls="sidebar"
        aria-expanded={menuOpen}
        onClick={onMenuToggle}
      >
        <Icon name="menu" />
      </button>
      <p className="topbar__section">{section}</p>
      <div className="topbar__end">
        <Badge tone="warning">
          <Icon name="flask" size={13} /> Demo
        </Badge>
        <span className="topbar__note">Bez logowania: dostęp do panelu zapewni backend</span>
      </div>
    </header>
  );
}
