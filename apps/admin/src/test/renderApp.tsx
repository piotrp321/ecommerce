import { render } from '@testing-library/react';
import type { AdminApi } from '../api/AdminApi';
import { App } from '../App';
import { createDemoApi } from '../demo/createDemoApi';

/** Renders the whole panel at `path` with a fresh, instant demo adapter. */
export function renderApp(path: string, api: AdminApi = createDemoApi({ latencyMs: 0 })) {
  window.history.pushState(null, '', path);

  return { api, ...render(<App api={api} />) };
}
