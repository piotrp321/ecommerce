import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Unit tests of React components (jsdom). Next.js itself does not use Vite.
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Same alias as `paths` in tsconfig.json.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Tests never call a real backend, Keycloak or Redis: the catalog is the demo one unless
    // a test stubs STORE_BACKEND_URL (the dev container sets it for `next dev`, ADR-0009).
    env: {
      STORE_BACKEND_URL: '',
      // Auth tests build their configuration explicitly (createAuth(env)); nothing from the
      // shell or the container may leak in.
      STORE_AUTH_MODE: '',
      STORE_ENVIRONMENT: '',
      STORE_PUBLIC_URL: '',
      STORE_OIDC_ISSUER: '',
      STORE_OIDC_INTERNAL_URL: '',
      STORE_OIDC_CLIENT_ID: '',
      STORE_OIDC_CLIENT_SECRET: '',
      STORE_REDIS_URL: '',
      STORE_SESSION_ENC_KEYS: '',
    },
  },
});
