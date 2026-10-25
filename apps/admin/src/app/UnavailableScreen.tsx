/**
 * Shown by a production build without the demo mode: there is no admin login
 * and no API client yet, so the panel must not pretend to manage a real shop.
 */
export function UnavailableScreen() {
  return (
    <main className="unavailable">
      <div className="unavailable__card">
        <span className="sidebar__logo" aria-hidden="true">
          E
        </span>
        <h1>Panel administracyjny</h1>
        <p>
          Panel nie jest jeszcze połączony z API sklepu. Zostanie udostępniony po wdrożeniu logowania administratorów
          (sesja w ciasteczkach HttpOnly i ochrona CSRF po stronie backendu).
        </p>
      </div>
    </main>
  );
}
