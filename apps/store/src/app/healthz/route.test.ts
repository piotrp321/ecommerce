import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GET } from './route';

vi.mock('next/server', () => ({ connection: () => Promise.resolve() }));

// Liveness of the Next.js process for the container HEALTHCHECK (ADR-0009): it must not
// depend on the catalog, the backend or the database.
describe('GET /healthz', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('answers 200, not cached, while the backend is unreachable', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new TypeError('fetch failed')));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('STORE_BACKEND_URL', 'http://backend:81');

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.text()).toBe('ok');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not import the catalog (CatalogSource) or anything that reaches the backend', () => {
    // Vitest runs in apps/store.
    const source = readFileSync(resolve(process.cwd(), 'src/app/healthz/route.ts'), 'utf8');
    const imports = [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1]);

    expect(imports).toEqual(['next/server']);
  });
});
