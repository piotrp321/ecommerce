# AGENTS.md: store (`apps/store`)

Sklep: Next.js 16 (App Router, Turbopack) + React 19 + TypeScript. Uzupełnia główny [`AGENTS.md`](../../AGENTS.md); obowiązują oba pliki.

Ten plik prowadzi projekt. W `next.config.ts` jest `agentRules: false`, więc `next dev` go nie nadpisuje.

## Next.js 16

Next.js 16 różni się od wcześniejszych wersji (API, konwencje, struktura plików). Przed pisaniem kodu sprawdź aktualną dokumentację zgodną z zainstalowaną wersją: `apps/store/node_modules/next/dist/docs/` albo https://nextjs.org/docs. Respektuj ostrzeżenia o deprecjacjach.

## Zakres i granice

- Sklep to interfejs. Logika biznesowa (ceny, dostępność, koszyk, zamówienia, płatności) jest wyłącznie w backendzie; sklep jej nie duplikuje.
- Katalog (strona główna, kategorie, listy i strony produktów) pochodzi z publicznego API backendu albo z danych demonstracyjnych ([ADR-0006](../../docs/adr/0006-store-catalog-ui.md), [ADR-0009](../../docs/adr/0009-store-catalog-api.md)). Nie implementuj koszyka, checkoutu, płatności ani logowania, dopóki etap tego nie obejmuje.
- Typy i klient API pochodzą docelowo z kontraktu OpenAPI (`packages/sdk`, etap 5). Do tego czasu jedyną kopią kształtu danych katalogu są tymczasowe typy w `src/catalog/types.ts`; nie twórz kolejnych.

## Dane katalogu

- Komponenty i strony czytają katalog wyłącznie przez `catalog` z `src/catalog` (interfejs `CatalogSource`). O źródle danych decyduje tylko `src/catalog/index.ts` (`createCatalogSource`); nie importuj `src/catalog/demo` ani `src/catalog/http` w UI.
- `STORE_BACKEND_URL` (zmienna serwerowa, czytana w runtime): adres http(s) backendu, np. `http://backend:80` w sieci Compose. Ustawiona → źródło HTTP (`src/catalog/http`), nieustawiona albo pusta → dane demonstracyjne, niepoprawny URL → błąd. Ten sam build działa w obu trybach.
- Źródło HTTP woła backend bezpośrednio, bez edge i bez prefiksu `/api`, z `cache: 'no-store'`. Odpowiedzi mapuje pole po polu na typy z `src/catalog/types.ts` (produkty mają `image: null`). 404 pojedynczej encji → `null`, każda inna awaria → wyjątek i strona błędu, nigdy pusty katalog ani dane demo. Adres backendu nie trafia do komunikatów błędów, HTML ani bundla przeglądarki.
- Oznaczenia demo zależą od `catalog.isDemo`: komunikat w layoucie, `noindex, nofollow`, teksty w stopce, plakietka na stronie głównej i zdanie na stronie produktu; SKU `DEMO-` mają tylko dane demo. Przy API żadnych oznaczeń demo. Ceny brutto i `inStock` zapisuj tak, jak zwróci je backend; nie licz VAT ani dostępności.
- Wyróżnione produkty na stronie głównej: przy demo slugi z `src/content/home.ts`, przy API pierwsze aktywne produkty po nazwie.
- Kwoty to stringi dziesiętne (`"129.00"`); formatuj je przez `formatMoney`, bez arytmetyki na liczbach zmiennoprzecinkowych.
- `STORE_DEMO_DELAY_MS` (opcjonalnie, po stronie serwera) dodaje opóźnienie do źródła demo, żeby obejrzeć stany ładowania.
- Zdjęcia demo: Unsplash (licencja Unsplash), przez URL i loader `src/lib/image-loader.ts`; bez widocznych logotypów marek, z linkiem do źródła.

## UI

- Tailwind CSS v4 (tokeny w `src/app/globals.css`), komponenty shadcn/ui w `src/components/ui` (dodawaj tylko używane; `components.json` dla CLI), ikony Lucide React.
- Sortowanie i paginacja to linki z parametrami `sortowanie` i `strona` (`src/catalog/query.ts`); domyślne wartości nie trafiają do URL.
- Strona kategorii i produktu wczytuje encję przed streamingiem (status 404 dla nieznanego sluga); nie dodawaj tam `loading.tsx`, tylko `Suspense` wokół list.
- Strona główna musi zawierać dokładnie `<h1>Sklep</h1>` (sprawdzają to `infra/scripts/check-prod-*.sh`).

## Renderowanie i pobieranie danych

- Domyślnie Server Components i renderowanie na serwerze (SEO, SSR). Komponenty klienckie (`'use client'`) tylko tam, gdzie potrzebna jest interakcja.
- Dane pobieraj na serwerze, gdy to ma sens (SEO, sekrety, agregacja). Wywołania API z przeglądarki są dopuszczalne, gdy wynikają z charakteru funkcji (np. interakcje koszyka); wybór uzasadnij.
- Adres backendu na serwerze to `STORE_BACKEND_URL`, czytana w runtime (nie `NEXT_PUBLIC_*`). Nie czytaj jej poza `src/catalog/index.ts`.
- Zmienne `NEXT_PUBLIC_*` są publiczne i wbudowywane przy buildzie: nigdy nie umieszczaj w nich sekretów.
- Layout główny wywołuje `connection()`, a metadane (`robots`) pochodzą z `generateMetadata`. Dlatego każda strona, także 404, renderuje się na żądanie, a `next build` nie potrzebuje backendu. Nie wracaj do statycznego `metadata` ani prerenderowanych stron, które czytają katalog.
- Strona główna ma `dynamic = 'force-dynamic'` (renderowanie na żądanie). Dla treści statycznych świadomie wybieraj renderowanie statyczne lub cache.
- `GET /healthz` (`src/app/healthz/route.ts`) to liveness procesu Next.js dla `HEALTHCHECK` obrazów dev i prod: 200 `ok`, `Cache-Control: no-store`. Nie może używać katalogu, backendu, bazy ani danych środowiska, więc awaria backendu nie oznacza niezdrowego kontenera. Błędy stron wykrywają testy i `infra/scripts/check-prod-*.sh`. Nie przenoś trasy na `/health` (edge check oczekuje tam 404 sklepu) ani pod `/api/*` (to idzie do backendu).

## Bezpieczeństwo

Stan aktualny: sklep nie loguje; katalog jest publiczny.
Plan ([architektura](../../docs/architecture.md)): Next.js jako BFF z logowaniem OIDC (Keycloak, realm `store`, Authorization Code + PKCE), sesje w Redis.

- Autoryzacja zawsze na backendzie, który jest bezstanowy i sam waliduje token.
- Tokeny tylko po stronie serwera Next.js (BFF); w przeglądarce wyłącznie identyfikator sesji w ciasteczku `HttpOnly`, `Secure`, `SameSite`. Żadnych tokenów w `localStorage`, `sessionStorage` ani w kodzie klienckim.
- Server Actions i formularze zmieniające stan wymagają ochrony CSRF/Origin zgodnej z dokumentacją Next.js.

## Komendy

Z katalogu głównego (Docker): `make store-lint`, `make store-typecheck`, `make store-test`, `make store-build`, `make store-check` (część `make check`), `make store-check-prod`.
Lokalnie (macOS): `pnpm --filter store lint|typecheck|test|build`, serwer dev: `pnpm dev:store` (port 3000).

## Konwencje

- TypeScript `strict` (z `noUncheckedIndexedAccess`), ESLint `strictTypeChecked` + reguły Next.js (Core Web Vitals), bez wyłączania reguł bez uzasadnienia.
- Testy przez Vitest i Testing Library: sprawdzaj zachowanie widoczne dla użytkownika. Testy zaczynają od źródła demo (`STORE_BACKEND_URL` czyszczona w `vitest.config.ts`); źródło HTTP testuj z mockiem `fetch`. Komponenty asynchroniczne (async Server Components) testuj na poziomie funkcji/danych lub testami E2E, gdy powstaną.
- `eslint-config-next` nie jest używany: jego wtyczki React/import/jsx-a11y nie wspierają jeszcze ESLint 10. Dbaj o dostępność ręcznie (semantyczny HTML, role, etykiety).

## Obraz produkcyjny

`infra/docker/store`: serwer standalone Next.js (uid 1000, port 3000, bez capabilities, read-only z tmpfs na `.next/cache`), bez menedżerów pakietów i źródeł. Serwerowe source mapy zostają (czytelne błędy), przeglądarkowe nie są publikowane. TLS, domeny i `/api` obsługuje edge (`infra/edge`).
