# AGENTS.md: store (`apps/store`)

Sklep: Next.js 16 (App Router, Turbopack) + React 19 + TypeScript. Uzupełnia główny [`AGENTS.md`](../../AGENTS.md); obowiązują oba pliki.

Ten plik prowadzi projekt. W `next.config.ts` jest `agentRules: false`, więc `next dev` go nie nadpisuje.

## Next.js 16

Next.js 16 różni się od wcześniejszych wersji (API, konwencje, struktura plików). Przed pisaniem kodu sprawdź aktualną dokumentację zgodną z zainstalowaną wersją: `apps/store/node_modules/next/dist/docs/` albo https://nextjs.org/docs. Respektuj ostrzeżenia o deprecjacjach.

## Zakres i granice

- Sklep to interfejs. Logika biznesowa (ceny, dostępność, koszyk, zamówienia, płatności) jest wyłącznie w backendzie; sklep jej nie duplikuje.
- Katalog (strona główna, kategorie, listy i strony produktów) pochodzi z publicznego API backendu albo z danych demonstracyjnych ([ADR-0006](../../docs/adr/0006-store-catalog-ui.md), [ADR-0009](../../docs/adr/0009-store-catalog-api.md)). Nie implementuj koszyka, checkoutu ani płatności, dopóki etap tego nie obejmuje.
- Logowanie klienta: sklep jest poufnym klientem OIDC (BFF) Keycloaka, sesje trzyma w Redisie (sekcja „Logowanie (BFF)”). Profil klienta pochodzi z `GET /me` backendu.
- Typy i klient API pochodzą docelowo z kontraktu OpenAPI (`packages/sdk`, etap 5). Do tego czasu jedyną kopią kształtu danych katalogu są tymczasowe typy w `src/catalog/types.ts`; nie twórz kolejnych.

## Dane katalogu

- Komponenty i strony czytają katalog wyłącznie przez `catalog` z `src/catalog` (interfejs `CatalogSource`). O źródle danych decyduje tylko `src/catalog/index.ts` (`createCatalogSource`); nie importuj `src/catalog/demo` ani `src/catalog/http` w UI.
- `STORE_BACKEND_URL` (zmienna serwerowa, czytana w runtime): adres http(s) backendu, np. `http://backend:80` w sieci Compose. Ustawiona → źródło HTTP (`src/catalog/http`), nieustawiona albo pusta → dane demonstracyjne, niepoprawny URL → błąd. Ten sam build działa w obu trybach. Czyta ją wyłącznie wspólny helper `backendBaseUrl(env)` z `src/lib/backend-url.ts` (katalog i klient `/me`); nie czytaj jej nigdzie indziej (pilnuje tego test).
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
- Adres backendu na serwerze to `STORE_BACKEND_URL`, czytana w runtime (nie `NEXT_PUBLIC_*`) tylko przez `src/lib/backend-url.ts`.
- Zmienne `NEXT_PUBLIC_*` są publiczne i wbudowywane przy buildzie: nigdy nie umieszczaj w nich sekretów.
- Layout główny wywołuje `connection()`, a metadane (`robots`) pochodzą z `generateMetadata`. Dlatego każda strona, także 404, renderuje się na żądanie, a `next build` nie potrzebuje backendu. Nie wracaj do statycznego `metadata` ani prerenderowanych stron, które czytają katalog.
- Strona główna ma `dynamic = 'force-dynamic'` (renderowanie na żądanie). Dla treści statycznych świadomie wybieraj renderowanie statyczne lub cache.
- `GET /healthz` (`src/app/healthz/route.ts`) to liveness procesu Next.js dla `HEALTHCHECK` obrazów dev i prod: 200 `ok`, `Cache-Control: no-store`. Nie może używać katalogu, backendu, bazy ani danych środowiska, więc awaria backendu nie oznacza niezdrowego kontenera. Błędy stron wykrywają testy i `infra/scripts/check-prod-*.sh`. Nie przenoś trasy na `/health` (edge check oczekuje tam 404 sklepu) ani pod `/api/*` (to idzie do backendu).

## Logowanie (BFF)

Sklep jest poufnym klientem OIDC `store-bff` Keycloaka (realm `store`, authorization code z PKCE S256, `openid-client`). Tokeny zostają na serwerze; przeglądarka dostaje tylko nieprzezroczyste id sesji w ciasteczku.

- Tryb i konfiguracja: wyłącznie `createAuth(env)` w `src/auth/index.ts` (jedyne miejsce czytające zmienne auth, wzór `createCatalogSource`); `instrumentation.ts` waliduje je przy starcie i kończy proces przy błędzie. Redis i Keycloak nie są kontaktowane przy starcie.
  - `STORE_AUTH_MODE=oidc` (domyślnie) wymaga `STORE_PUBLIC_URL` (sam origin; `http:` tylko dla localhost), `STORE_OIDC_ISSUER` (publiczny issuer, `iss` tokenów), `STORE_OIDC_CLIENT_ID`, `STORE_OIDC_CLIENT_SECRET`, `STORE_REDIS_URL`, `STORE_SESSION_ENC_KEYS` (`kid:base64` 32 bajtów, po przecinku, pierwszy aktywny). Opcjonalnie `STORE_OIDC_INTERNAL_URL`: adres tego samego issuera w sieci (np. `http://keycloak:8080/realms/store`) dla discovery, tokenów i JWKS.
  - `STORE_AUTH_MODE=disabled` tylko z `STORE_ENVIRONMENT=development` albo `test`: brak linku logowania, trasy auth i `/konto` dają 404. Każda inna kombinacja kończy start błędem.
- Moduły:
  - `src/auth/core/*`: bez importów `next/*`. Klient OIDC (`oidc.ts`: rozdzielony issuer przez `customFetch`, leniwe discovery z krótkim cache porażki, `allowInsecureRequests` tylko dla publicznego `http://localhost`), `SessionManager` (logowanie, sesje, refresh single-flight, wylogowanie, back-channel), port `SessionStore` nad portem `RedisCommands` z adapterami node-redis (`node-redis.ts`) i in-memory (`memory-redis.ts`, testy; ta sama semantyka NX/PX/GETDEL i skryptów Lua), walidacja `returnTo` i `Origin`, weryfikacja logout tokenu (`jose`), szyfrowanie AES-256-GCM.
  - `src/auth/handlers.ts`: Route Handlery na Web `Request`/`Response` (`/logowanie`, `/auth/callback`, `/auth/backchannel-logout`), testowane bez Next.js.
  - `src/auth/session.ts` (`server-only`): `getSession()` (DTO bez tokenów, React `cache()`), `requireSession(returnTo)`, `getAccessToken()`, `withAccessToken()`, `hasSessionCookie()`; `src/auth/actions.ts`: wylogowanie (Server Action).
  - `src/account/backend.ts`: klient `GET /me` z Bearer.
- Trasy:
  - `GET /logowanie?powrot=`: state, nonce, PKCE; transakcja `store:tx:{state}` na 10 min; ciasteczko logowania; 303 na publiczny authorization endpoint. W UI to zwykły `<a>` (Route Handler, bez prefetchu).
  - `GET /auth/callback`: `state` = ciasteczko logowania, transakcja jednorazowo (`GETDEL`), wymagany parametr `iss` (RFC 9207), nonce i PKCE; URL do walidacji budowany z `STORE_PUBLIC_URL`, nigdy z `Host`. Zawsze nowe id sesji (poprzednia sesja przeglądarki jest usuwana); 303 na `returnTo`. Błąd (także `?error=`) → `/logowanie/blad`.
  - Wylogowanie: Server Action z `assertSameOrigin()` (`Origin` = `STORE_PUBLIC_URL`; brak `Origin` tylko z `Sec-Fetch-Site: same-origin`), usuwa sesję i indeks, czyści ciasteczko, przekierowuje na `end_session` z `id_token_hint`. Redis niedostępny → fail-open: ciasteczko usunięte, `end_session` z `client_id`.
  - `POST /auth/backchannel-logout` (Keycloak woła wewnętrznie): logout token z JWKS (adres wewnętrzny), `iss` publiczny, `aud` = client id, `iat`/`exp`, event back-channel logout, bez `nonce`, wymagany `sid`, replay `jti` odrzucany; usuwa wszystkie sesje z `store:kcsid:{sid}`. 200/400/503, `Cache-Control: no-store`.
  - `/konto`: Server Component z `requireSession`, profil z `/me`.
- `returnTo` (`powrot`): tylko lokalna ścieżka sklepu (`safeReturnTo`), bez `//`, `/\`, schematów, obcego originu, znaków sterujących i tras auth; inaczej `/`.
- Sesja: id = 32 losowe bajty (base64url) w ciasteczku `__Host-store_session` (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`); na `http://localhost` nazwa `store_session` bez `Secure` (tak samo ciasteczko logowania `__Host-store_login`/`store_login`). To jedyne ciasteczka sklepu.
- Redis (`STORE_REDIS_URL`, użytkownik ACL `store`): wszystkie klucze z prefiksem `store:` i **zawsze z TTL** (test): `store:sess:{sha256(id)}` (hash: v, iss, sub, kc_sid, created, last_seen, abs_exp, at_exp, rtv i zaszyfrowane at/rt/idt), `store:kcsid:{sid}`, `store:tx:{state}`, `store:lock:refresh:{hash}`, `store:jti:{jti}`. Tokeny szyfrowane AES-256-GCM z AAD = klucz + pole, z prefiksem `kid` (rotacja: nowy klucz na początek pierścienia, stary usunąć po 12 h). Idle 30 min (sliding, zapis najwyżej raz na minutę), absolutnie 12 h. Klient leniwy, timeouty ok. 1 s, `disableOfflineQueue`; awaria → `SessionStoreUnavailableError`.
- Refresh: gdy do wygaśnięcia access tokenu zostaje < 30 s. Single flight w procesie (`Map`) i między replikami (`SET store:lock:refresh:* NX PX 10000`, zapis przez Lua CAS na `rtv`, zwolnienie compare-and-delete; przegrani czekają do ok. 3 s). `invalid_grant` → sesja usunięta (anonim); błąd sieci, 5xx, timeout locka → sesja zostaje, 503. `/me` 401 → jeden wymuszony refresh i ponowienie, drugi 401 kończy sesję.
- Awarie: Redis niedostępny → katalog i nagłówek działają, `/logowanie`, callback i back-channel 503, `/konto` strona błędu (bez pętli przekierowań), `/healthz` bez zmian. Keycloak niedostępny → trasy auth 503, katalog działa.
- Nagłówek pokazuje „Zaloguj” albo „Moje konto” wyłącznie po obecności ciasteczka sesji (`hasSessionCookie`): strony katalogu nigdy nie czytają Redisa i nie ustawiają `Set-Cookie`.
- Logi: tylko klasa i powód błędu; nigdy tokeny, kody, id sesji, sekrety ani `STORE_REDIS_URL`.
- Plan (poza tym modułem): Compose dev i prod nie przekazują jeszcze zmiennych auth do usługi `store`, więc kontener sklepu w trybie `oidc` nie wystartuje, dopóki Keycloak i `redis-session` nie trafią do Compose. Do lokalnego podglądu bez logowania: `STORE_AUTH_MODE=disabled STORE_ENVIRONMENT=development pnpm dev:store`.

## Bezpieczeństwo

Architektura tożsamości: [docs/architecture.md](../../docs/architecture.md).

- Autoryzacja zawsze na backendzie, który jest bezstanowy i sam waliduje token (Bearer, audience `store-api`); sklep jej nie duplikuje.
- Tokeny tylko po stronie serwera Next.js (BFF); w przeglądarce wyłącznie identyfikator sesji w ciasteczku `HttpOnly`, `Secure`, `SameSite=Lax`. Żadnych tokenów w HTML, kodzie klienckim, `localStorage` ani `sessionStorage`; strony dostają tylko `SessionView`.
- Danych sesji nigdy nie umieszczaj w `use cache`, ISR ani innym współdzielonym cache (pilnuje tego test).
- Server Actions i formularze zmieniające stan wymagają ochrony CSRF/Origin zgodnej z dokumentacją Next.js oraz `assertSameOrigin()`; nowe trasy auth dodawaj tylko pod `/logowanie` i `/auth/`.

## Komendy

Z katalogu głównego (Docker): `make store-lint`, `make store-typecheck`, `make store-test`, `make store-build`, `make store-check` (część `make check`), `make store-check-prod`.
Lokalnie (macOS): `pnpm --filter store lint|typecheck|test|build`, serwer dev: `pnpm dev:store` (port 3000).

## Konwencje

- TypeScript `strict` (z `noUncheckedIndexedAccess`), ESLint `strictTypeChecked` + reguły Next.js (Core Web Vitals), bez wyłączania reguł bez uzasadnienia.
- Testy przez Vitest i Testing Library: sprawdzaj zachowanie widoczne dla użytkownika. Testy zaczynają od źródła demo (`STORE_BACKEND_URL` czyszczona w `vitest.config.ts`); źródło HTTP testuj z mockiem `fetch`.
- Testy auth (`// @vitest-environment node`): prawdziwy `openid-client` przeciw fałszywemu Keycloakowi (`src/test/fake-oidc.ts`: discovery, token endpoint z PKCE i rotacją refresh tokenów, JWKS, tokeny podpisane `jose`) i in-memory Redis; „repliki” to kolejne `createAuth` na wspólnym store (`src/test/auth-harness.ts`). `vitest.config.ts` czyści wszystkie zmienne auth. Pełny przepływ z dev Keycloakiem sprawdza `infra/scripts/check-auth-flow.sh` (curl z cookie jar; wymaga `CHECK_AUTH_PASSWORD`). Komponenty asynchroniczne (async Server Components) testuj na poziomie funkcji/danych lub testami E2E, gdy powstaną.
- `eslint-config-next` nie jest używany: jego wtyczki React/import/jsx-a11y nie wspierają jeszcze ESLint 10. Dbaj o dostępność ręcznie (semantyczny HTML, role, etykiety).

## Obraz produkcyjny

`infra/docker/store`: serwer standalone Next.js (uid 1000, port 3000, bez capabilities, read-only z tmpfs na `.next/cache`), bez menedżerów pakietów i źródeł. Obraz bez konfiguracji auth nie startuje; `infra/scripts/check-prod-store.sh` uruchamia go z `STORE_AUTH_MODE=disabled STORE_ENVIRONMENT=test` i sprawdza oba przypadki negatywne. Serwerowe source mapy zostają (czytelne błędy), przeglądarkowe nie są publikowane. TLS, domeny i `/api` obsługuje edge (`infra/edge`).
