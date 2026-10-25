import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Self-contained server (server.js + traced dependencies) for the production image.
  output: 'standalone',
  // Trace dependencies from the pnpm workspace root (hoisted node_modules).
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  poweredByHeader: false,
  reactStrictMode: true,
  // apps/store/AGENTS.md is maintained by the project; next dev must not write to it.
  agentRules: false,
  // Demo photos are resized by their CDN (src/lib/image-loader.ts), not by this server.
  images: {
    loader: 'custom',
    loaderFile: './src/lib/image-loader.ts',
  },
  // Set STORE_DEV_POLLING=1 if file changes on a bind mount are not detected.
  ...(process.env.STORE_DEV_POLLING === '1' ? { watchOptions: { pollIntervalMs: 500 } } : {}),
  headers: () =>
    Promise.resolve([
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]),
};

export default nextConfig;
