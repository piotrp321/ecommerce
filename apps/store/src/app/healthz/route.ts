import { connection } from 'next/server';

/**
 * Liveness of the Next.js process, used by the container HEALTHCHECK (ADR-0009). A Route
 * Handler renders no layout, so it never reads the catalog: an unavailable backend or
 * database does not make the store container unhealthy. Page errors are caught by the
 * tests and infra/scripts/check-prod-*.sh, not here.
 */
export async function GET(): Promise<Response> {
  await connection();
  return new Response('ok', {
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
