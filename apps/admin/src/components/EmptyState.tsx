import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

interface EmptyStateProps {
  icon?: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ icon = 'box', title, children, action }: EmptyStateProps) {
  return (
    <div className="state">
      <span className="state__icon">
        <Icon name={icon} size={22} />
      </span>
      <p className="state__title">{title}</p>
      {children !== undefined && <p className="state__text">{children}</p>}
      {action}
    </div>
  );
}
