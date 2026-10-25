import type { AdminApi } from './api/AdminApi';
import { AdminApiContext } from './api/AdminApiContext';
import { AppRoutes } from './app/AppRoutes';
import { Layout } from './app/Layout';
import { ToastProvider } from './components/ToastProvider';

export function App({ api }: { api: AdminApi }) {
  return (
    <AdminApiContext value={api}>
      <ToastProvider>
        <Layout>
          <AppRoutes />
        </Layout>
      </ToastProvider>
    </AdminApiContext>
  );
}
