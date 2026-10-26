import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { categories } from '@/test/fixtures';
import { SiteHeader } from './site-header';

describe('SiteHeader account link', () => {
  it('offers the login to a visitor without a session cookie', () => {
    render(<SiteHeader categories={categories} signedIn={false} />);

    expect(screen.getByRole('link', { name: 'Zaloguj' })).toHaveAttribute('href', '/logowanie?powrot=%2Fkonto');
    expect(screen.queryByRole('link', { name: 'Moje konto' })).not.toBeInTheDocument();
  });

  it('links to the account when the browser has a session cookie', () => {
    render(<SiteHeader categories={categories} signedIn />);

    expect(screen.getByRole('link', { name: 'Moje konto' })).toHaveAttribute('href', '/konto');
    expect(screen.queryByRole('link', { name: 'Zaloguj' })).not.toBeInTheDocument();
  });

  it('shows no account link when login is disabled', () => {
    render(<SiteHeader categories={categories} signedIn={null} />);

    expect(screen.queryByRole('link', { name: /Zaloguj|Moje konto/ })).not.toBeInTheDocument();
  });
});

// Catalog pages render the header from the cookie only: they never read the session store
// and never set a cookie, so they work (and stay cacheable by the browser) without Redis.
describe('root layout', () => {
  it('uses only hasSessionCookie of the auth module', () => {
    const layout = readFileSync(resolve(process.cwd(), 'src/app/layout.tsx'), 'utf8');
    const authImports = [...layout.matchAll(/import \{([^}]+)\} from '@\/auth[^']*'/g)].map((match) => match[1]?.trim());

    expect(authImports).toEqual(['hasSessionCookie']);
  });
});
