import { connection } from 'next/server';
import { getAuth } from '@/auth';
import { handleBackchannelLogout } from '@/auth/handlers';

/** Back-channel logout URI of the store-bff client (called by Keycloak inside the network). */
export async function POST(request: Request): Promise<Response> {
  await connection();
  return handleBackchannelLogout(request, getAuth());
}
