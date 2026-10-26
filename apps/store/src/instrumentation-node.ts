import { getAuth } from './auth';

/** Node.js runtime only (imported by instrumentation.ts): exits on an invalid auth configuration. */
export function validateAuthConfiguration(): void {
  try {
    getAuth();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Store auth configuration is invalid');
    process.exit(1);
  }
}
