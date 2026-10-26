import { connection } from 'next/server';
import { getAuth } from '@/auth';
import { handleLogin } from '@/auth/handlers';

/** Starts the login (Keycloak, authorization code flow with PKCE); 404 when login is disabled. */
export async function GET(request: Request): Promise<Response> {
  await connection();
  return handleLogin(request, getAuth());
}
