import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Same-origin API: the admin calls the backend through /api. In development the
// Vite server proxies it; in production the central edge proxy does (stage 4).
const apiTarget = process.env.ADMIN_API_PROXY_TARGET ?? 'https://localhost';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // Set ADMIN_DEV_POLLING=1 if file changes on a bind mount are not detected.
    watch: process.env.ADMIN_DEV_POLLING === '1' ? { usePolling: true, interval: 300 } : {},
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
