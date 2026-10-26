# Architektura

Główne źródło prawdy o architekturze systemu. Dokument ma dwie wyraźnie oddzielone części: **Stan aktualny** (to, co działa w repozytorium) i **Planowane** (decyzje zatwierdzone, w realizacji; nic z tej części nie jest jeszcze wdrożone). Uzasadnienia pojedynczych decyzji są w [ADR](adr/), wymagania biznesowe w [specs](specs/), zakres etapów w [roadmapie](roadmap.md), kontrakt REST w [`api/openapi.yaml`](api/openapi.yaml).

## Stan aktualny

### Komponenty

| Komponent | Technologia | Rola |
|---|---|---|
| edge | Caddy (`infra/edge`) | Jedyny publiczny punkt wejścia produkcji: TLS, routing po domenie (`STORE_DOMAIN`, `ADMIN_DOMAIN`) i ścieżce ([ADR-0004](adr/0004-edge-proxy-and-production-topology.md)) |
| backend | Symfony, DDD + Hexagonal (`apps/backend`) | Jedyne źródło logiki biznesowej; bezstanowe REST API |
| store | Next.js, SSR (`apps/store`) | Interfejs sklepu; katalog czyta z backendu po stronie serwera; BFF logowania klienta (OIDC, sesje w Redis) |
| admin | React + Vite, SPA (`apps/admin`) | Interfejs administracyjny; dziś na danych demonstracyjnych, bez połączenia z API |
| database | PostgreSQL | Dane backendu; dostęp tylko z backendu |

### Przepływy komunikacji

- Przeglądarka woła `/api/...` na własnej domenie (same-origin). Edge przekazuje to do backendu bez prefiksu `/api`; w dev robi to serwer Vite admina. Sklep nie ma proxy `/api`: woła backend wyłącznie po stronie serwera (`STORE_BACKEND_URL`).
- Store renderuje katalog na serwerze i woła backend bezpośrednio (server-to-server, `STORE_BACKEND_URL`, bez edge i bez prefiksu `/api`) ([ADR-0009](adr/0009-store-catalog-api.md)).
- Store jako BFF loguje klienta w Keycloaku (szczegóły w „Store jako BFF” niżej) i woła backend z tokenem Bearer użytkownika, również server-to-server.
- Nagłówek `Authorization` przechodzi przez edge bez zmian.
- Tylko edge ma publiczne porty; backend, store, admin i baza nie są publikowane.

### Moduły backendu

Granice pilnuje Deptrac (`apps/backend/deptrac.yaml`); moduły komunikują się przez porty ([ADR-0005](adr/0005-catalog-inventory-and-admin-api-access.md)).

| Moduł | Status | Odpowiedzialność |
|---|---|---|
| Catalog | działa | Produkty (cena netto, stawka VAT, aktywność) i drzewo kategorii |
| Inventory | działa | Stan magazynowy |
| Shared | działa | Wspólne obiekty wartości (`Money`, `VatRate`, `LinePrice`), infrastruktura bezpieczeństwa |
| Cart | planowany | Koszyk gościa i klienta |
| Ordering | planowany | Składanie i cykl życia zamówienia |
| Payments | planowany | Płatności |

### Store jako BFF

Kod sklepu (`apps/store/src/auth`, zasady w [`apps/store/AGENTS.md`](../apps/store/AGENTS.md)) jest gotowy; do działania potrzebuje Keycloaka, `redis-session` i `GET /me` z części „Planowane”. Compose dev i prod nie uruchamiają jeszcze tych usług ani nie przekazują zmiennych auth do `store`.

- Next.js jest poufnym klientem `store-bff` (realm `store`): Authorization Code + PKCE S256, `state`, `nonce` i parametr `iss` (RFC 9207) wymagane. Tokeny wyłącznie po stronie serwera; w przeglądarce tylko nieprzezroczysty identyfikator sesji w ciasteczku `__Host-store_session` (`HttpOnly`, `Secure`, `SameSite=Lax`).
- Konfiguracja w runtime: `STORE_AUTH_MODE` (`oidc` domyślnie; `disabled` tylko z `STORE_ENVIRONMENT=development` albo `test`), `STORE_PUBLIC_URL`, `STORE_OIDC_ISSUER` (issuer publiczny), opcjonalnie `STORE_OIDC_INTERNAL_URL` (ten sam issuer w sieci wewnętrznej, ze ścieżką realmu, np. `http://keycloak:8080/realms/store`; przez niego idą discovery, token endpoint i JWKS), `STORE_OIDC_CLIENT_ID`, `STORE_OIDC_CLIENT_SECRET`, `STORE_REDIS_URL`, `STORE_SESSION_ENC_KEYS`. Bez kompletnej konfiguracji w trybie `oidc` serwer sklepu nie startuje.
- Sesje w `redis-session` (użytkownik ACL `store`, klucze z prefiksem `store:`, każdy z TTL): klucz rekordu to hash identyfikatora sesji, tokeny szyfrowane AES-256-GCM (pierścień kluczy z `kid`). Sesja wygasa po 30 min bezczynności, najpóźniej po 12 h.
- Odświeżanie tokenów: jedno wywołanie token endpointu na sesję także przy wielu replikach (lock w Redis i zapis compare-and-set).
- Wylogowanie: RP-initiated (`end_session` z `id_token_hint`) oraz back-channel (`POST /auth/backchannel-logout`, wołany przez Keycloak w sieci wewnętrznej); oba unieważniają sesję we wszystkich replikach.
- Katalog nie zależy od Redisa ani Keycloaka: przy ich awarii strony katalogu działają, a trasy logowania odpowiadają 503.
- Profil klienta: `GET /me` backendu z tokenem Bearer; autoryzacja zostaje na backendzie.

### Bezpieczeństwo

- Katalog (`/catalog/...`) jest publiczny i tylko do odczytu, bez logowania.
- Logowanie klienta sklepu: BFF opisany wyżej; tokeny nigdy nie trafiają do przeglądarki.
- API administracyjne (`/admin/...`) chroni tymczasowy token Bearer z sekretu `ADMIN_API_TOKEN` ([ADR-0005](adr/0005-catalog-inventory-and-admin-api-access.md), pkt 6). Używany wyłącznie w testach i wywołaniach serwerowych, nigdy w przeglądarce.
- Autoryzacja jest zawsze egzekwowana na backendzie.

## Planowane (zatwierdzone, w realizacji)

Poniższe elementy nie są jeszcze wdrożone. Opisują decyzje, do których zmierza kod; w miarę realizacji przenosi się je do części „Stan aktualny”.

### Diagram komponentów (docelowy)

```text
Przeglądarka
   |  HTTPS
   v
 edge (Caddy)
   |  STORE_DOMAIN        |  ADMIN_DOMAIN       |  AUTH_DOMAIN
   |                      |                     |  (/realms/store, /realms/admin;
   v                      v                     |   konsola /admin/ niepubliczna)
 store (Next.js, BFF)   oauth2-proxy / admin-bff  Keycloak <-- logowanie (OIDC)
   |      |                |      |                 ^  ^
   |      v                v      v (SPA statyczna) |  | JWKS (sieć wewnętrzna)
   |  redis-session     admin (SPA)                |  |
   |  (sesje, tokeny                               |  |
   |   szyfrowane)                                 |  |
   +--- Bearer (JWT) -----+-- Bearer (JWT) ------> backend (Symfony, bezstanowy)
        (dokleja store)       (dokleja proxy)         |
                                                      v
                                                 PostgreSQL
```

Tokeny dokleja po stronie serwera BFF sklepu oraz oauth2-proxy / admin-bff; SPA admina i przeglądarka ich nie widzą. Backend nie trzyma sesji: przy każdym żądaniu waliduje JWT.

### Keycloak (tożsamość)

- Jedna instancja Keycloak 26.8.0, dwa realmy: `store` (klienci sklepu) i `admin` (administratorzy; MFA).
- Issuer publiczny: dev `http://localhost:8180/realms/<realm>`, prod `https://${AUTH_DOMAIN}/realms/<realm>`. Na `AUTH_DOMAIN` będą publiczne endpointy obu realmów (`/realms/store/...`, `/realms/admin/...`, m.in. przekierowanie z `store-bff` na `/realms/store/protocol/openid-connect/auth`); konsola administracyjna Keycloak (`/admin/...`) nie będzie publiczna.
- Discovery i JWKS pobierane przez sieć wewnętrzną: `http://keycloak:8080/realms/<realm>/` (`KC_HOSTNAME_BACKCHANNEL_DYNAMIC=true`), a nie przez adres publiczny.
- Klienci: `store-bff` (poufny, Authorization Code + PKCE S256), `admin-bff` (zarezerwowany pod przyszły BFF admina), `store-api` i `admin-api` (występują jako audience tokenów, przez audience mapper). Rola klienta `admin` na `admin-api` odpowiada `ROLE_ADMIN` w backendzie.

### Backend: walidacja JWT

Backend pozostaje bezstanowy i sam waliduje każdy token Bearer:

- podpis przez klucze z JWKS pobieranego z sieci wewnętrznej,
- `iss` zgodny z issuerem realmu, `aud` zawiera właściwe API (`store-api` lub `admin-api`), `exp` ważny,
- `typ` (token dostępowy), `azp` (klient `store-bff` lub `admin-bff`),
- role z `resource_access.admin-api.roles` dla API administracyjnego.

Używane claimy: `sub`, `email`, `email_verified`, `typ`, `azp`, `resource_access.admin-api.roles`.

Nowe endpointy:

| Endpoint | Odpowiedź |
|---|---|
| `GET /me` | `{id, email \| null, emailVerified}` |
| `GET /admin/me` | `{id, email \| null, roles}` |

Błędy to `application/problem+json`: 401 z `WWW-Authenticate: Bearer error="invalid_token"`, 403 z `WWW-Authenticate: Bearer error="insufficient_scope"`. Tymczasowy `ADMIN_API_TOKEN` zostanie zastąpiony tokenami OIDC z realmu `admin`.

### Moduły tożsamości w backendzie

- `Customers` (agregat Customer) i `Backoffice` (agregat AdminUser) będą nowymi modułami backendu.
- Powiązanie z tożsamością zewnętrzną to para (issuer, `sub`); backend nie przechowuje haseł.
- Ryzyko: zmiana `AUTH_DOMAIN` zmienia `iss`, więc wymaga migracji powiązań (issuer, `sub`) w `Customers` i `Backoffice`.

### Sesje sklepu w Compose

- Osobny Redis `redis-session` (`redis:8.8.2-alpine`, `noeviction`, AOF, ACL z użytkownikiem `store` ograniczonym do prefiksu `store:`) w Compose dev i prod oraz zmienne auth usługi `store` (dev: issuer `http://localhost:8180/realms/store`, prod: `https://${AUTH_DOMAIN}/realms/store`; wewnętrznie `http://keycloak:8080/realms/store`). Kod BFF jest opisany w „Stan aktualny”.

### Admin

- SPA zostanie połączona z API później. Wstępnie przez oauth2-proxy (realm `admin`), docelowo ewentualnie własny BFF (`admin-bff`). Żadnych tokenów w przeglądarce.

### Redis, RabbitMQ, Elasticsearch

- Redis sesji (`redis-session`) powstaje teraz, razem z tożsamością.
- Redis cache powstanie później jako osobna instancja (inne wymagania niż sesje: eviction zamiast `noeviction`).
- RabbitMQ i Elasticsearch to opcjonalne profile Compose, bez integracji biznesowej; integrujemy je dopiero przy konkretnym przypadku użycia.
