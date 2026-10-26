import '@testing-library/jest-dom/vitest';

// `server-only` throws outside the React Server Components bundle; tests import server
// modules directly.
vi.mock('server-only', () => ({}));
