import { useMemo, useSyncExternalStore } from 'react';

/**
 * Minimal client-side router on the History API. The panel has a handful of
 * flat routes, so a routing library would add more than it saves. The
 * production image already falls back to index.html for unknown paths.
 */
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('popstate', listener);

  return () => {
    listeners.delete(listener);
    window.removeEventListener('popstate', listener);
  };
}

function currentHref(): string {
  return window.location.pathname + window.location.search;
}

export function navigate(to: string, options: { replace?: boolean } = {}): void {
  if (to === currentHref()) {
    return;
  }
  if (options.replace === true) {
    window.history.replaceState(null, '', to);
  } else {
    window.history.pushState(null, '', to);
  }
  for (const listener of listeners) {
    listener();
  }
}

export interface Location {
  pathname: string;
  searchParams: URLSearchParams;
}

export function useLocation(): Location {
  const href = useSyncExternalStore(subscribe, currentHref);

  return useMemo(() => {
    const url = new URL(href, window.location.origin);

    return { pathname: url.pathname, searchParams: url.searchParams };
  }, [href]);
}

/** Matches "/products/:id" against a pathname; returns the params or null. */
export function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const expected = pattern.split('/').filter(Boolean);
  const actual = pathname.split('/').filter(Boolean);
  if (expected.length !== actual.length) {
    return null;
  }

  const params: Record<string, string> = {};
  for (const [index, segment] of expected.entries()) {
    const value = actual[index] ?? '';
    if (segment.startsWith(':')) {
      try {
        params[segment.slice(1)] = decodeURIComponent(value);
      } catch {
        // A malformed escape (e.g. "%ZZ") does not match any route.
        return null;
      }
    } else if (segment !== value) {
      return null;
    }
  }

  return params;
}
