// Rendered on the server for every request (SSR): the catalog will read
// request-time data from the backend. No business content yet.
export const dynamic = 'force-dynamic';

export default function HomePage() {
  return (
    <main>
      <h1>Sklep</h1>
    </main>
  );
}
