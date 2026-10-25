import { siteMetadata } from './site-metadata';

vi.mock('next/server', () => ({ connection: () => Promise.resolve() }));

describe('siteMetadata', () => {
  it('keeps demo data out of search engines', () => {
    expect(siteMetadata(true).robots).toEqual({ index: false, follow: false });
  });

  it('lets a real catalog be indexed', () => {
    expect(siteMetadata(false)).not.toHaveProperty('robots');
  });
});

describe('requestSiteMetadata', () => {
  // A fresh module graph per case: the catalog source is created once per server process.
  const load = async (env: Record<string, string | undefined>) => {
    vi.resetModules();
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    const { requestSiteMetadata } = await import('./site-metadata');
    return requestSiteMetadata();
  };

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('marks the demo catalog noindex, nofollow when STORE_BACKEND_URL is unset or empty at runtime', async () => {
    expect((await load({ STORE_BACKEND_URL: undefined })).robots).toEqual({ index: false, follow: false });
    expect((await load({ STORE_BACKEND_URL: '' })).robots).toEqual({ index: false, follow: false });
  });

  it('lets the API catalog be indexed when STORE_BACKEND_URL is set at runtime', async () => {
    expect(await load({ STORE_BACKEND_URL: 'http://backend:80' })).not.toHaveProperty('robots');
  });
});
