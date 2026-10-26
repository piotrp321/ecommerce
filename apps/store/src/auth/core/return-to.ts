export const DEFAULT_RETURN_TO = '/';

const MAX_LENGTH = 2048;
/** Auth routes are never a target: a loop or a second login from the callback. */
const AUTH_PATHS = /^\/(?:logowanie|auth)(?:[/?#]|$)/i;

/**
 * The page to return to after login, from the `powrot` parameter. Only a local path of
 * this store is accepted: no scheme, no host (`//`, `/\`), no backslashes or control
 * characters, no auth routes. Anything else gives the home page, never an error, so the
 * parameter cannot be used as an open redirect.
 */
export function safeReturnTo(value: string | null | undefined, publicOrigin: string): string {
  if (value === null || value === undefined || value.length > MAX_LENGTH) return DEFAULT_RETURN_TO;
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is rejected
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /[\u0000-\u001f\u007f]/.test(value)) {
    return DEFAULT_RETURN_TO;
  }

  let url: URL;
  try {
    url = new URL(value, publicOrigin);
  } catch {
    return DEFAULT_RETURN_TO;
  }
  if (url.origin !== publicOrigin) return DEFAULT_RETURN_TO;
  const path = `${url.pathname}${url.search}${url.hash}`;
  if (AUTH_PATHS.test(url.pathname) || AUTH_PATHS.test(decodeSafely(url.pathname))) return DEFAULT_RETURN_TO;

  return path;
}

function decodeSafely(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}
