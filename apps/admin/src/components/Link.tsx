import type { AnchorHTMLAttributes } from 'react';
import { navigate } from '../lib/router';

interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string;
}

/** An <a> that navigates without a page reload; modified clicks keep the browser behaviour. */
export function Link({ to, onClick, ...rest }: LinkProps) {
  return (
    <a
      {...rest}
      href={to}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          (rest.target !== undefined && rest.target !== '_self')
        ) {
          return;
        }
        event.preventDefault();
        navigate(to);
      }}
    />
  );
}
