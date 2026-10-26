import 'server-only';
import type { TokenResult } from '@/auth/core/session-manager';
import { withAccessToken } from '@/auth/session';
import { backendBaseUrl } from '@/lib/backend-url';

/** `GET /me` of the backend: the signed-in customer as the backend sees them. */
export interface Account {
  id: string;
  email: string | null;
  emailVerified: boolean;
}

interface AccountApiOptions {
  /** Backend base URL (`backendBaseUrl`), e.g. http://backend. */
  baseUrl: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export class AccountApiError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(`Account API: ${message}`, options);
    this.name = 'AccountApiError';
  }
}

/**
 * Client of `GET /me` with the access token as Bearer, server to server like the catalog
 * (no edge, no /api prefix). 401 is `unauthorized` (the caller refreshes once); any other
 * failure throws with the method and path only, never the address or the token.
 */
export function createAccountApi({ baseUrl, timeoutMs = 5000, fetch: fetchImpl = globalThis.fetch }: AccountApiOptions) {
  return {
    async me(accessToken: string): Promise<TokenResult<Account>> {
      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}/me`, {
          headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
          redirect: 'error',
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        throw new AccountApiError('GET /me failed', { cause: error });
      }
      if (response.status === 401) return { status: 'unauthorized' };
      if (!response.ok) throw new AccountApiError(`GET /me answered ${String(response.status)}`);

      const body: unknown = await response.json().catch(() => null);
      if (typeof body !== 'object' || body === null) throw new AccountApiError('GET /me: body is not an object');
      const { id, email, emailVerified } = body as Record<string, unknown>;
      if (typeof id !== 'string' || (email !== null && typeof email !== 'string') || typeof emailVerified !== 'boolean') {
        throw new AccountApiError('GET /me: body does not match the contract');
      }
      return { status: 'ok', value: { id, email, emailVerified } };
    },
  };
}

/**
 * The account of the current session; null without a session. Throws SessionRejectedError
 * when the backend still rejects the session after a refresh (the session is removed).
 */
export async function getAccount(): Promise<Account | null> {
  const baseUrl = backendBaseUrl(process.env);
  if (baseUrl === null) throw new AccountApiError('STORE_BACKEND_URL is not set');
  const api = createAccountApi({ baseUrl });
  return withAccessToken((token) => api.me(token));
}
