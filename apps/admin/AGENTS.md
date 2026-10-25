# AGENTS.md: admin (`apps/admin`)

Panel administracyjny: React 19 + Vite 8 + TypeScript (SPA). Uzupełnia główny [`AGENTS.md`](../../AGENTS.md); obowiązują oba pliki.

## Zakres i granice

- Admin to interfejs. Logika biznesowa (ceny, stany, zamówienia, płatności, uprawnienia) jest wyłącznie w backendzie; admin jej nie duplikuje.
- Komunikacja z backendem tylko przez REST pod ścieżką `/api` na tej samej domenie (same-origin). W dev proxy zapewnia serwer Vite (`ADMIN_API_PROXY_TARGET`), w prod centralny edge.
- Typy i klient API pochodzą docelowo z kontraktu OpenAPI (`packages/sdk`, etap 5). Do tego czasu nie twórz ręcznych duplikatów DTO backendu.
- Nie implementuj funkcji biznesowych ani logowania, dopóki etap tego nie obejmuje.

## Bezpieczeństwo (pod przyszłe logowanie)

- Autoryzacja zawsze na backendzie; ukrycie elementu w UI nie jest zabezpieczeniem.
- Sesja w ciasteczkach `HttpOnly`, `Secure`, `SameSite` ustawianych przez backend. Żadnych tokenów w `localStorage` ani `sessionStorage`.
- Żądania zmieniające stan muszą przechodzić ochronę CSRF, gdy backend ją wprowadzi.
- Zmienne `VITE_*` trafiają do publicznego bundla: nigdy nie umieszczaj w nich sekretów. Adresy API nie są potrzebne, bo `/api` jest same-origin.

## Komendy

Z katalogu głównego (Docker): `make admin-lint`, `make admin-typecheck`, `make admin-test`, `make admin-build`, `make admin-check` (część `make check`), `make admin-check-prod`.
Lokalnie (macOS): `pnpm --filter admin lint|typecheck|test|build`, serwer dev: `pnpm dev:admin`.

## Konwencje

- TypeScript `strict` (z `noUncheckedIndexedAccess`), ESLint `strictTypeChecked`, bez `any` i bez wyłączania reguł bez uzasadnienia.
- Komponenty funkcyjne, nazwane eksporty. Jeden komponent na plik; test obok (`App.test.tsx`).
- Testy przez Vitest i Testing Library: sprawdzaj zachowanie widoczne dla użytkownika (role, teksty), nie szczegóły implementacji.
- Nowe zależności dodawaj świadomie, przez pnpm, z przypiętą wersją; preferuj możliwości Reacta i przeglądarki przed bibliotekami.

## Obraz produkcyjny

`infra/docker/admin`: statyczny build serwowany przez Caddy (uid 1000, port 8080, bez capabilities, read-only). Obraz nie obsługuje TLS ani routingu `/api`; robi to edge (etap 4).
