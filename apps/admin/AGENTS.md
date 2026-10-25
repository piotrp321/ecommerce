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

## Struktura i tryb demonstracyjny

- `src/api`: port danych `AdminApi` (ekrany zależą tylko od niego), `ApiError` (RFC 9457) i **tymczasowe** typy (`types.ts`). Są bliskie DTO z kontraktu `docs/api/openapi.yaml`, co jest zaakceptowanym wyjątkiem do czasu SDK. Po wprowadzeniu SDK z OpenAPI (etap 5) zastąp je typami SDK i mapowaniem w adapterze; nie rozbudowuj ich ręcznie.
- `src/demo`: jedyna obecna implementacja `AdminApi`, dane w pamięci karty (bez sieci i storage). Symuluje odpowiedzi błędów kontraktu tylko po to, by pokazać stany UI; nie jest źródłem reguł biznesowych. Nie liczy VAT: po zmianie ceny brutto jest nieznane (`null`), dopóki nie poda go backend.
- Tryb demo działa w `pnpm dev:admin` i w buildzie z `VITE_ADMIN_DEMO=true`. Zwykły build produkcyjny nie zawiera danych demo i pokazuje ekran „panel niepołączony z API”.
- Prawdziwy klient API powstanie razem z logowaniem administratorów (sesja w ciasteczkach HttpOnly, CSRF). Do tego czasu nie podłączaj zapisu do API i nie używaj `ADMIN_API_TOKEN` w przeglądarce.
- `src/components`: komponenty prezentacyjne i design system (tokeny w `src/styles/tokens.css`); `src/features/*`: strony i formularze; `src/lib`: router na History API, formatowanie kwot (stringi dziesiętne, bez floatów), `useAsync`.

## Wymagania do integracji z API (bez zmian w backendzie na tym etapie)

Kontrakt admina (`docs/api/openapi.yaml`) nie obejmuje jeszcze wszystkiego, czego używa UI. Do uzgodnienia z backendem przy integracji:

- `GET /admin/catalog/products`: parametr sortowania (nazwa, cena netto, data utworzenia). Dziś obsługuje go tylko adapter demo.
- Lista stanów magazynowych z filtrem dostępności (brak, niski stan, dostępny). Dziś magazyn korzysta z listy produktów.
- Statystyki dashboardu (liczba produktów bez stanu, niski stan). Dziś liczone z jednej strony produktów.
- Potwierdzenie nazw `propertyPath` w błędach walidacji (np. `onHand`, `categoryId`), które formularze mapują na pola.
- Logowanie administratorów (sesja HttpOnly, CSRF) to osobny etap. Do tego czasu panel nie łączy się z API.

## Komendy

Z katalogu głównego (Docker): `make admin-lint`, `make admin-typecheck`, `make admin-test`, `make admin-build`, `make admin-check` (część `make check`), `make admin-check-prod`.
Lokalnie (macOS): `pnpm --filter admin lint|typecheck|test|build`, serwer dev: `pnpm dev:admin`.

## Konwencje

- TypeScript `strict` (z `noUncheckedIndexedAccess`), ESLint `strictTypeChecked`, bez `any` i bez wyłączania reguł bez uzasadnienia.
- Komponenty funkcyjne, nazwane eksporty. Jeden komponent na plik; test obok (`App.test.tsx`).
- Testy przez Vitest i Testing Library: sprawdzaj zachowanie widoczne dla użytkownika (role, teksty), nie szczegóły implementacji.
- Nowe zależności dodawaj świadomie, przez pnpm, z przypiętą wersją; preferuj możliwości Reacta i przeglądarki przed bibliotekami.

## Obraz produkcyjny

`infra/docker/admin`: statyczny build serwowany przez Caddy (uid 1000, port 8080, bez capabilities, read-only). Obraz nie obsługuje TLS ani routingu `/api`; robi to edge (`infra/edge`).
