import type { CookieSpec } from './cookies';
import { AuthUnavailableError, LoginFailedError } from './core/errors';
import { InvalidLogoutTokenError } from './core/logout-token';
import { ReplayedLogoutTokenError } from './core/session-manager';
import type { Auth } from './index';

// Route Handlers of the login (Web Request/Response, so they are tested without Next.js).
// Every response is `Cache-Control: no-store`; tokens never leave the server.

export const LOGIN_PATH = '/logowanie';
export const LOGIN_ERROR_PATH = '/logowanie/blad';
export const CALLBACK_PATH = '/auth/callback';

const NO_STORE = { 'Cache-Control': 'no-store' };

function serializeCookie({ name, options }: CookieSpec, value: string, maxAge = options.maxAge): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path}`,
    `Max-Age=${String(maxAge)}`,
    'HttpOnly',
    ...(options.secure ? ['Secure'] : []),
    'SameSite=Lax',
  ].join('; ');
}
const clearCookie = (spec: CookieSpec) => serializeCookie(spec, '', 0);

export function readCookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const separator = part.indexOf('=');
    if (separator > 0 && part.slice(0, separator).trim() === name) {
      try {
        return decodeURIComponent(part.slice(separator + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ ...NO_STORE, Location: location });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 303, headers });
}

const text = (status: number, body: string) => new Response(body, { status, headers: { ...NO_STORE, 'Content-Type': 'text/plain; charset=utf-8' } });
const notFound = () => text(404, 'Not Found');
const unavailable = () => text(503, 'Logowanie jest chwilowo niedostępne. Spróbuj ponownie za chwilę.');

function logFailure(route: string, error: unknown) {
  // Only the error class and reason: never tokens, codes or the session id.
  const reason = error instanceof LoginFailedError ? error.reason : error instanceof Error ? error.name : 'unknown';
  console.warn(`${route}: ${reason}`);
}

/** GET /logowanie?powrot=: starts the authorization code flow (state, nonce, PKCE S256). */
export async function handleLogin(request: Request, auth: Auth): Promise<Response> {
  if (!auth.enabled) return notFound();
  try {
    const { state, authorizationUrl } = await auth.manager.beginLogin(new URL(request.url).searchParams.get('powrot'));
    return redirect(authorizationUrl.href, [serializeCookie(auth.cookies.login, state)]);
  } catch (error) {
    if (error instanceof AuthUnavailableError) {
      logFailure(LOGIN_PATH, error);
      return unavailable();
    }
    throw error;
  }
}

/**
 * GET /auth/callback: the authorization response. The URL that is validated is rebuilt
 * from STORE_PUBLIC_URL (the redirect_uri), never from the Host header of the request.
 */
export async function handleCallback(request: Request, auth: Auth): Promise<Response> {
  if (!auth.enabled) return notFound();
  const { cookies, manager, publicOrigin } = auth;
  const callbackUrl = new URL(`${CALLBACK_PATH}${new URL(request.url).search}`, publicOrigin);
  const loginState = readCookie(request, cookies.login.name);
  const failed = () => redirect(`${publicOrigin}${LOGIN_ERROR_PATH}`, [clearCookie(cookies.login)]);

  try {
    if (callbackUrl.searchParams.has('error')) {
      await manager.cancelLogin(callbackUrl.searchParams.get('state'), loginState);
      logFailure(CALLBACK_PATH, new LoginFailedError('error from the authorization server'));
      return failed();
    }
    const { sessionId, returnTo } = await manager.completeLogin(callbackUrl, loginState);
    const previous = readCookie(request, cookies.session.name);
    if (previous !== undefined) await manager.discardSession(previous);
    return redirect(`${publicOrigin}${returnTo}`, [clearCookie(cookies.login), serializeCookie(cookies.session, sessionId)]);
  } catch (error) {
    if (error instanceof LoginFailedError) {
      logFailure(CALLBACK_PATH, error);
      return failed();
    }
    if (error instanceof AuthUnavailableError) {
      logFailure(CALLBACK_PATH, error);
      return unavailable();
    }
    throw error;
  }
}

/**
 * POST /auth/backchannel-logout: Keycloak calls it inside the network with a logout token
 * (application/x-www-form-urlencoded, `logout_token`). 200 when the token is valid (also
 * when no session of it is left), 400 otherwise, 503 when Redis or the JWKS is down.
 */
export async function handleBackchannelLogout(request: Request, auth: Auth): Promise<Response> {
  if (!auth.enabled) return notFound();
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/x-www-form-urlencoded')) return text(400, 'Bad Request');
  let token: string | null;
  try {
    token = new URLSearchParams(await request.text()).get('logout_token');
  } catch {
    token = null;
  }
  if (token === null || token === '') return text(400, 'Bad Request');

  try {
    await auth.manager.backchannelLogout(token);
    return new Response(null, { status: 200, headers: NO_STORE });
  } catch (error) {
    logFailure('/auth/backchannel-logout', error);
    if (error instanceof InvalidLogoutTokenError || error instanceof ReplayedLogoutTokenError) return text(400, 'Bad Request');
    if (error instanceof AuthUnavailableError) return text(503, 'Service Unavailable');
    throw error;
  }
}
