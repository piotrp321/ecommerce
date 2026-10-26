import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { backendBaseUrl } from './backend-url';

describe('backendBaseUrl', () => {
  it('is null when STORE_BACKEND_URL is unset, empty or blank', () => {
    expect(backendBaseUrl({})).toBeNull();
    expect(backendBaseUrl({ STORE_BACKEND_URL: '' })).toBeNull();
    expect(backendBaseUrl({ STORE_BACKEND_URL: '  ' })).toBeNull();
  });

  it('gives the base URL without a trailing slash', () => {
    expect(backendBaseUrl({ STORE_BACKEND_URL: 'http://backend:80' })).toBe('http://backend');
    expect(backendBaseUrl({ STORE_BACKEND_URL: 'https://api.example.test/v1/' })).toBe('https://api.example.test/v1');
  });

  it.each(['backend:80', 'ftp://backend', 'not a url'])('rejects %j', (value) => {
    expect(() => backendBaseUrl({ STORE_BACKEND_URL: value })).toThrow('STORE_BACKEND_URL is not an absolute http(s) URL (e.g. http://backend:80)');
  });

  it('is the only reader of STORE_BACKEND_URL in the sources', () => {
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? files(path) : [path];
      });
    const root = resolve(process.cwd());
    const readers = files(join(root, 'src'))
      .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path))
      .filter((path) => readFileSync(path, 'utf8').includes('.STORE_BACKEND_URL'))
      .map((path) => path.slice(root.length + 1));

    expect(readers).toEqual(['src/lib/backend-url.ts']);
  });
});
