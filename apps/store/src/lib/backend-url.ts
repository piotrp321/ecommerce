/** Server environment: STORE_BACKEND_URL. */
type Env = Record<string, string | undefined>;

const INVALID = 'STORE_BACKEND_URL is not an absolute http(s) URL (e.g. http://backend:80)';

/**
 * The only place that reads `STORE_BACKEND_URL` (ADR-0009), for the catalog and the
 * account API alike: the backend base URL without a trailing slash, or null when the
 * variable is unset or empty. An invalid value is an error, never a silent fallback.
 */
export function backendBaseUrl(env: Env): string | null {
  const value = env.STORE_BACKEND_URL?.trim() ?? '';
  if (value === '') return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(INVALID);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(INVALID);

  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}
