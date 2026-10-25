import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { UnavailableScreen } from './app/UnavailableScreen';
import './styles/index.css';

const container = document.getElementById('root');

if (container === null) {
  throw new Error('Missing #root element in index.html.');
}

const root = createRoot(container);

// The demo mode (in-memory data, no API) is on in the dev server and in builds made
// explicitly with VITE_ADMIN_DEMO=true. A regular production build shows that the
// panel is not connected yet, and does not even contain the demo chunk: the
// condition is inlined here so the bundler can drop the dynamic import.
if (import.meta.env.DEV || import.meta.env.VITE_ADMIN_DEMO === 'true') {
  void import('./demo/createDemoApi').then(({ createDemoApi }) => {
    document.documentElement.dataset.mode = 'demo';
    root.render(
      <StrictMode>
        <App api={createDemoApi()} />
      </StrictMode>,
    );
  });
} else {
  root.render(
    <StrictMode>
      <UnavailableScreen />
    </StrictMode>,
  );
}
