import { createContext, useContext } from 'react';
import type { AdminApi } from './AdminApi';

export const AdminApiContext = createContext<AdminApi | null>(null);

export function useAdminApi(): AdminApi {
  const api = useContext(AdminApiContext);
  if (api === null) {
    throw new Error('useAdminApi() needs an <AdminApiContext> provider.');
  }

  return api;
}
