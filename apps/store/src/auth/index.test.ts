// @vitest-environment node
import { createAuth } from './index';
import { testAuthEnv } from '@/test/fake-oidc';

// STORE_AUTH_MODE and its configuration, decided at startup (AC-7).
describe('createAuth', () => {
  describe('oidc (default)', () => {
    it('is the mode without STORE_AUTH_MODE and with STORE_AUTH_MODE=oidc', () => {
      expect(createAuth(testAuthEnv()).enabled).toBe(true);
      expect(createAuth(testAuthEnv({ STORE_AUTH_MODE: 'oidc' })).enabled).toBe(true);
      expect(createAuth(testAuthEnv({ STORE_OIDC_INTERNAL_URL: '' })).enabled).toBe(true);
    });

    it('fails without any configuration (a production server without auth does not start)', () => {
      expect(() => createAuth({})).toThrow(
        'Store auth configuration: missing STORE_PUBLIC_URL, STORE_OIDC_ISSUER, STORE_OIDC_CLIENT_ID, STORE_OIDC_CLIENT_SECRET, STORE_REDIS_URL, STORE_SESSION_ENC_KEYS',
      );
      expect(() => createAuth({ STORE_ENVIRONMENT: 'production' })).toThrow('missing STORE_PUBLIC_URL');
    });

    it.each(['STORE_PUBLIC_URL', 'STORE_OIDC_ISSUER', 'STORE_OIDC_CLIENT_ID', 'STORE_OIDC_CLIENT_SECRET', 'STORE_REDIS_URL', 'STORE_SESSION_ENC_KEYS'])(
      'fails without %s (also when empty)',
      (name) => {
        expect(() => createAuth(testAuthEnv({ [name]: '' }))).toThrow(`Store auth configuration: missing ${name}`);
        expect(() => createAuth(testAuthEnv({ [name]: '  ' }))).toThrow(`missing ${name}`);
      },
    );

    it.each([
      ['STORE_PUBLIC_URL', 'http://sklep.example.test', 'STORE_PUBLIC_URL must use https (http only for localhost)'],
      ['STORE_PUBLIC_URL', 'sklep.example.test', 'STORE_PUBLIC_URL is not an absolute URL'],
      ['STORE_PUBLIC_URL', 'https://sklep.example.test/sklep', 'STORE_PUBLIC_URL must be an origin without a path'],
      ['STORE_OIDC_ISSUER', 'http://auth.example.test/realms/store', 'STORE_OIDC_ISSUER must use https (http only for localhost)'],
      ['STORE_OIDC_INTERNAL_URL', 'keycloak:8080', 'STORE_OIDC_INTERNAL_URL must be an http(s) URL'],
      ['STORE_REDIS_URL', 'http://redis:6379', 'STORE_REDIS_URL must be a redis:// or rediss:// URL'],
      ['STORE_SESSION_ENC_KEYS', 'k1:c2hvcnQ=', 'STORE_SESSION_ENC_KEYS key "k1" is not 32 bytes in base64'],
    ])('rejects %s=%j', (name, value, message) => {
      expect(() => createAuth(testAuthEnv({ [name]: value }))).toThrow(message);
    });

    it('accepts http only for localhost (development)', () => {
      expect(createAuth(testAuthEnv({ STORE_PUBLIC_URL: 'http://localhost:3000', STORE_OIDC_ISSUER: 'http://localhost:8180/realms/store' })).enabled).toBe(true);
      expect(createAuth(testAuthEnv({ STORE_PUBLIC_URL: 'http://127.0.0.1:3000' })).enabled).toBe(true);
    });

    it('never puts a secret into an error message', () => {
      const secret = 'super-secret-value';
      for (const env of [
        testAuthEnv({ STORE_SESSION_ENC_KEYS: `k1:${secret}` }),
        testAuthEnv({ STORE_REDIS_URL: `http://store:${secret}@redis` }),
        testAuthEnv({ STORE_PUBLIC_URL: `http://${secret}.example` }),
      ]) {
        expect(() => createAuth(env)).toThrow();
        try {
          createAuth(env);
        } catch (error) {
          expect(String(error)).not.toContain(secret);
        }
      }
    });

    it('uses __Host- cookies over https and plain names on http://localhost', () => {
      const https = createAuth(testAuthEnv());
      const http = createAuth(testAuthEnv({ STORE_PUBLIC_URL: 'http://localhost:3000' }));
      expect(https.enabled && [https.cookies.session.name, https.cookies.session.options.secure]).toEqual(['__Host-store_session', true]);
      expect(http.enabled && [http.cookies.session.name, http.cookies.session.options.secure]).toEqual(['store_session', false]);
    });
  });

  describe('disabled', () => {
    it.each(['development', 'test'])('is accepted only with STORE_ENVIRONMENT=%s', (environment) => {
      expect(createAuth({ STORE_AUTH_MODE: 'disabled', STORE_ENVIRONMENT: environment })).toEqual({ enabled: false });
    });

    it.each([undefined, '', 'production', 'staging', 'Development'])('fails with STORE_ENVIRONMENT=%j', (environment) => {
      expect(() => createAuth({ STORE_AUTH_MODE: 'disabled', ...(environment === undefined ? {} : { STORE_ENVIRONMENT: environment }) })).toThrow(
        'STORE_AUTH_MODE=disabled requires STORE_ENVIRONMENT=development or test',
      );
    });

    it('also fails in production with a complete oidc configuration', () => {
      expect(() => createAuth(testAuthEnv({ STORE_AUTH_MODE: 'disabled', STORE_ENVIRONMENT: 'production' }))).toThrow('requires STORE_ENVIRONMENT');
    });
  });

  it('rejects an unknown STORE_AUTH_MODE', () => {
    expect(() => createAuth(testAuthEnv({ STORE_AUTH_MODE: 'off' }))).toThrow('STORE_AUTH_MODE must be oidc or disabled');
  });
});
