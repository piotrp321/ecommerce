import { getAuth } from './auth';
import { isSameOrigin } from './auth/core/same-origin';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF guard in front of every state-changing request (Server Actions, with or without
 * JavaScript): `Origin` must be the public origin of the store (`isSameOrigin`), otherwise a
 * clean 403. Next.js would parse an unparseable `Origin` itself (TypeError, HTTP 500) or
 * reject a foreign one with a 500 "Invalid Server Actions request". The back-channel logout
 * is excluded: Keycloak calls it server to server, without `Origin`, and it is
 * authenticated by its signed logout token. With login disabled Next.js keeps its own check.
 */
export function proxy(request: Request): Response | undefined {
  if (SAFE_METHODS.has(request.method)) return undefined;
  const auth = getAuth();
  if (!auth.enabled || isSameOrigin(request.headers, auth.publicOrigin)) return undefined;

  return new Response('Forbidden', { status: 403, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' } });
}

export const config = {
  // Everything except static files, the liveness check and the back-channel logout.
  matcher: ['/((?!_next/static|_next/image|healthz$|auth/backchannel-logout$).*)'],
};
