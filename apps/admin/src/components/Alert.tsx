import type { ReactNode } from 'react';
import { Icon } from './Icon';

interface AlertProps {
  tone?: 'danger' | 'warning' | 'info';
  title?: string;
  children: ReactNode;
}

export function Alert({ tone = 'danger', title, children }: AlertProps) {
  return (
    <div className={`alert alert--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon name={tone === 'info' ? 'info' : 'alert'} />
      <div>
        {title !== undefined && <p className="alert__title">{title}</p>}
        <div className="alert__body">{children}</div>
      </div>
    </div>
  );
}
