import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  icon?: IconName;
  /** Shows a spinner, disables the button and marks it busy. */
  pending?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  pending = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = ['btn', `btn--${variant}`, `btn--${size}`, children === undefined ? 'btn--icon-only' : '', className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <button {...rest} type={type} className={classes} disabled={disabled === true || pending} aria-busy={pending || undefined}>
      {pending ? <Spinner size={size === 'sm' ? 14 : 16} /> : icon !== undefined && <Icon name={icon} size={size === 'sm' ? 15 : 17} />}
      {children}
    </button>
  );
}
