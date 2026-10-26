// @vitest-environment node
import { testAuthEnv } from '@/test/fake-oidc';

// The server validates its auth configuration before it serves a request (AC-7).
describe('instrumentation register()', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  async function register(env: Record<string, string>) {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { register: run } = await import('./instrumentation');
    await run();
    return { exit, error };
  }

  it('stops a production server without auth configuration (exit 1, names the missing variables)', async () => {
    const { exit, error } = await register({ STORE_ENVIRONMENT: 'production' });

    expect(exit).toHaveBeenCalledWith(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('missing STORE_PUBLIC_URL, STORE_OIDC_ISSUER'));
  });

  it('stops a server with STORE_AUTH_MODE=disabled outside development and test', async () => {
    const { exit } = await register({ STORE_AUTH_MODE: 'disabled', STORE_ENVIRONMENT: 'production' });
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('starts with STORE_AUTH_MODE=disabled in test', async () => {
    const { exit } = await register({ STORE_AUTH_MODE: 'disabled', STORE_ENVIRONMENT: 'test' });
    expect(exit).not.toHaveBeenCalled();
  });

  it('starts with a complete oidc configuration, without contacting Redis or Keycloak', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { exit } = await register(testAuthEnv());
      expect(exit).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('does nothing during next build', async () => {
    const { exit } = await register({ NEXT_PHASE: 'phase-production-build' });
    expect(exit).not.toHaveBeenCalled();
  });
});
