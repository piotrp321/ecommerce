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
    // Tests never call a real backend: the catalog is the demo one unless a test stubs
    // STORE_BACKEND_URL (the dev container sets it for `next dev`, ADR-0009).
    env: { STORE_BACKEND_URL: '' },
  },
});
