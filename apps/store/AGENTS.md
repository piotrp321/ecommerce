# AGENTS.md: store (`apps/store`)

Sklep: Next.js 16 (App Router, Turbopack) + React 19 + TypeScript. Uzupełnia główny [`AGENTS.md`](../../AGENTS.md); obowiązują oba pliki.

Ten plik prowadzi projekt. W `next.config.ts` jest `agentRules: false`, więc `next dev` go nie nadpisuje.

## Next.js 16

Next.js 16 różni się od wcześniejszych wersji (API, konwencje, struktura plików). Przed pisaniem kodu sprawdź aktualną dokumentację zgodną z zainstalowaną wersją: `apps/store/node_modules/next/dist/docs/` albo https://nextjs.org/docs. Respektuj ostrzeżenia o deprecjacjach.

## Zakres i granice

- Sklep to interfejs. Logika biznesowa (ceny, dostępność, koszyk, zamówienia, płatności) jest wyłącznie w backendzie; sklep jej nie duplikuje.
- Nie implementuj katalogu, koszyka ani logowania, dopóki etap tego nie obejmuje.
- Typy i klient API pochodzą docelowo z kontraktu OpenAPI (`packages/sdk`, etap 5). Nie twórz ręcznych duplikatów DTO backendu.

## Renderowanie i pobieranie danych

- Domyślnie Server Components i renderowanie na serwerze (SEO, SSR). Komponenty klienckie (`'use client'`) tylko tam, gdzie potrzebna jest interakcja.
- Dane pobieraj na serwerze, gdy to ma sens (SEO, sekrety, agregacja). Wywołania API z przeglądarki są dopuszczalne, gdy wynikają z charakteru funkcji (np. interakcje koszyka); wybór uzasadnij.
- Adres backendu na serwerze będzie zmienną środowiskową czytaną w runtime (nie `NEXT_PUBLIC_*`), dodaną razem z pierwszym endpointem.
- Zmienne `NEXT_PUBLIC_*` są publiczne i wbudowywane przy buildzie: nigdy nie umieszczaj w nich sekretów.
- Strona główna ma `dynamic = 'force-dynamic'` (renderowanie na żądanie). Dla treści statycznych świadomie wybieraj renderowanie statyczne lub cache.

## Bezpieczeństwo (pod przyszłe logowanie)

- Autoryzacja zawsze na backendzie.
- Sesja w ciasteczkach `HttpOnly`, `Secure`, `SameSite`; żadnych tokenów w `localStorage`.
- Server Actions i formularze zmieniające stan wymagają ochrony CSRF/Origin zgodnej z dokumentacją Next.js i backendu.

## Komendy

Z katalogu głównego (Docker): `make store-lint`, `make store-typecheck`, `make store-test`, `make store-build`, `make store-check` (część `make check`), `make store-check-prod`.
Lokalnie (macOS): `pnpm --filter store lint|typecheck|test|build`, serwer dev: `pnpm dev:store` (port 3000).

## Konwencje

- TypeScript `strict` (z `noUncheckedIndexedAccess`), ESLint `strictTypeChecked` + reguły Next.js (Core Web Vitals), bez wyłączania reguł bez uzasadnienia.
- Testy przez Vitest i Testing Library: sprawdzaj zachowanie widoczne dla użytkownika. Komponenty asynchroniczne (async Server Components) testuj na poziomie funkcji/danych lub testami E2E, gdy powstaną.
- `eslint-config-next` nie jest używany: jego wtyczki React/import/jsx-a11y nie wspierają jeszcze ESLint 10. Dbaj o dostępność ręcznie (semantyczny HTML, role, etykiety).

## Obraz produkcyjny

`infra/docker/store`: serwer standalone Next.js (uid 1000, port 3000, bez capabilities, read-only z tmpfs na `.next/cache`), bez menedżerów pakietów i źródeł. Serwerowe source mapy zostają (czytelne błędy), przeglądarkowe nie są publikowane. TLS i domeny obsłuży edge (etap 4).
