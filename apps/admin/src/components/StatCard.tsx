import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon: IconName;
  hint?: ReactNode;
  tone?: 'accent' | 'success' | 'warning' | 'danger' | 'neutral';
}

export function StatCard({ label, value, icon, hint, tone = 'accent' }: StatCardProps) {
  return (
    <section className="card stat" aria-label={label}>
      <div className="stat__head">
        <span className="stat__label">{label}</span>
        <span className={`stat__icon stat__icon--${tone}`}>
          <Icon name={icon} size={18} />
        </span>
      </div>
      <p className="stat__value">{value}</p>
      {hint !== undefined && <p className="stat__hint">{hint}</p>}
    </section>
  );
}
