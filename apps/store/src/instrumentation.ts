/**
 * Runs once when the server starts (not during `next build`): a server whose auth
 * configuration is incomplete or not allowed (see `createAuth`) exits before it serves a
 * request. Redis and Keycloak are not contacted here, so the store starts while they are down.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NEXT_PHASE === 'phase-production-build') return;

  const { validateAuthConfiguration } = await import('./instrumentation-node');
  validateAuthConfiguration();
}
