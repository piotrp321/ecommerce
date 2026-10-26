import { connection } from 'next/server';
import { getAuth } from '@/auth';
import { handleCallback } from '@/auth/handlers';

/** Redirect URI of the store-bff client: completes the login and creates the session. */
export async function GET(request: Request): Promise<Response> {
  await connection();
  return handleCallback(request, getAuth());
}
