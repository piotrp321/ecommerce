import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Unit tests of React components (jsdom). Next.js itself does not use Vite.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
