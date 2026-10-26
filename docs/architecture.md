# Architektura

Główne źródło prawdy o architekturze systemu. Dokument ma dwie wyraźnie oddzielone części: **Stan aktualny** (to, co działa w repozytorium) i **Planowane** (decyzje zatwierdzone, w realizacji; nic z tej części nie jest jeszcze wdrożone). Uzasadnienia pojedynczych decyzji są w [ADR](adr/), wymagania biznesowe w [specs](specs/), zakres etapów w [roadmapie](roadmap.md), kontrakt REST w [`api/openapi.yaml`](api/openapi.yaml).

## Stan aktualny

### Komponenty

| Komponent | Technologia | Rola |
|---|---|---|
| edge | Caddy (`infra/edge`) | Jedyny publiczny punkt wejścia produkcji: TLS, routing po domenie (`STORE_DOMAIN`, `ADMIN_DOMAIN`, `AUTH_DOMAIN`) i ścieżce ([ADR-0004](adr/0004-edge-proxy-and-production-topology.md)) |
| backend | Symfony, DDD + Hexagonal (`apps/backend`) | Jedyne źródło logiki biznesowej; bezstanowe REST API |
| store | Next.js, SSR (`apps/store`) | Interfejs sklepu; katalog czyta z backendu po stronie serwera |
| admin | React + Vite, SPA (`apps/admin`) | Interfejs administracyjny; dziś na danych demonstracyjnych, bez połączenia z API |
| database | PostgreSQL | Dane backendu (dostęp tylko z backendu) i osobna baza `keycloak` z własną rolą |
| keycloak | Keycloak 26.8.0 (`infra/docker/keycloak`, realmy w `infra/keycloak/realms`) | Dostawca tożsamości (OIDC): realmy `store` i `admin` |
| redis-session | Redis 8.8.2 | Magazyn sesji sklepu (ACL, `noeviction`, AOF); dostęp tylko ze sklepu |

### Przepływy komunikacji

- Przeglądarka woła `/api/...` na własnej domenie (same-origin). Edge przekazuje to do backendu bez prefiksu `/api`; w dev robi to serwer Vite admina. Sklep nie ma proxy `/api`: woła backend wyłącznie po stronie serwera (`STORE_BACKEND_URL`).
- Store renderuje katalog na serwerze i woła backend bezpośrednio (server-to-server, `STORE_BACKEND_URL`, bez edge i bez prefiksu `/api`) ([ADR-0009](adr/0009-store-catalog-api.md)).
- Nagłówek `Authorization` przechodzi przez edge bez zmian.
- Przeglądarka loguje się na `https://AUTH_DOMAIN` (w dev `http://localhost:8180`). Wymiana kodu na tokeny, discovery i JWKS idą siecią wewnętrzną (`http://keycloak:8080`), nie przez edge.
- Tylko edge ma publiczne porty; backend, store, admin, Keycloak, Redis i baza nie są publikowane. Redis sesji jest w osobnej sieci `sessions`, wspólnej tylko ze sklepem.

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

### Bezpieczeństwo

- Katalog (`/catalog/...`) jest publiczny i tylko do odczytu, bez logowania.
- API administracyjne (`/admin/...`) chroni tymczasowy token Bearer z sekretu `ADMIN_API_TOKEN` ([ADR-0005](adr/0005-catalog-inventory-and-admin-api-access.md), pkt 6). Używany wyłącznie w testach i wywołaniach serwerowych, nigdy w przeglądarce.
- Autoryzacja jest zawsze egzekwowana na backendzie.

### Tożsamość (Keycloak)

- Jedna instancja Keycloak 26.8.0, dwa realmy: `store` (klienci sklepu) i `admin` (administratorzy; OTP zawsze wymagane w przepływie przeglądarkowym, `admin-cli` bez grantu hasłem). Realmy są importowane przy pierwszym starcie; sekrety i adresy to placeholdery z konfiguracji uruchomieniowej.
- Issuer publiczny: dev `http://localhost:8180/realms/<realm>`, prod `https://${AUTH_DOMAIN}/realms/<realm>`. Discovery, tokeny i JWKS usługi pobierają przez sieć wewnętrzną: `http://keycloak:8080/realms/<realm>/` (`KC_HOSTNAME_BACKCHANNEL_DYNAMIC=true`), z tym samym issuerem.
- Klienci: `store-bff` (poufny, Authorization Code + PKCE S256, redirect `${STORE_PUBLIC_URL}/auth/callback`, back-channel logout `http://store:3000/auth/backchannel-logout`), `admin-bff` (zarezerwowany pod przyszły BFF admina), `store-api` i `admin-api` (audience tokenów). Rola klienta `admin` na `admin-api` odpowiada `ROLE_ADMIN` w backendzie.
- Edge na `AUTH_DOMAIN` udostępnia tylko endpointy potrzebne przeglądarce: `/realms/store/*`, `/realms/admin/*`, `/resources/*`. Endpointy serwer-serwer tych realmów (`token`, `userinfo`, `revoke`, `token/introspect`, `ext/*`, `auth/device`, `clients-registrations/*`), konsola administracyjna, realm `master`, `/health` i `/metrics` zwracają 404. Administracja tylko przez `kcadm.sh` w kontenerze ([ADR-0004](adr/0004-edge-proxy-and-production-topology.md)).
- Prod: obraz `keycloak_prod` (`kc.sh build`, `start --optimized`), nie-root, `read_only`, `cap_drop: ALL`; baza i rola `keycloak` w tym samym PostgreSQL, tworzone przez `infra/scripts/keycloak-db.sh` przed startem Keycloaka.

### Sesje sklepu (redis-session)

- Osobny Redis `redis-session` (`redis:8.8.2-alpine`, `noeviction`, AOF): ACL z wyłączonym użytkownikiem `default`, użytkownik `store` ograniczony do kluczy `store:*` i poleceń magazynu sesji, `ops` do administracji. Definicja i ACL są wspólne dla dev i prod (`compose.yaml`).
- Prod: nie-root (`redis`), `read_only`, `cap_drop: ALL`, bez portów, tylko w sieci `sessions` ze sklepem.
- Sklep dostaje komplet konfiguracji logowania i sesji (`STORE_AUTH_MODE=oidc`, `STORE_OIDC_*`, `STORE_REDIS_URL`, `STORE_SESSION_ENC_KEYS`); kod BFF opisuje część „Planowane”.

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

### Store jako BFF

- Next.js będzie pełnił rolę BFF: logowanie Authorization Code + PKCE S256 (klient `store-bff`), tokeny wyłącznie po stronie serwera, w przeglądarce tylko identyfikator sesji w ciasteczku.
- Sesje w `redis-session` (część „Stan aktualny”). Tokeny w Redis szyfrowane AES-256-GCM, klucz rekordu to hash identyfikatora sesji.
- Store wywołuje backend z tokenem Bearer użytkownika; autoryzacja zostaje na backendzie.

### Admin

- SPA zostanie połączona z API później. Wstępnie przez oauth2-proxy (realm `admin`), docelowo ewentualnie własny BFF (`admin-bff`). Żadnych tokenów w przeglądarce.

### Redis, RabbitMQ, Elasticsearch

- Redis cache powstanie później jako osobna instancja (inne wymagania niż sesje: eviction zamiast `noeviction`).
- RabbitMQ i Elasticsearch to opcjonalne profile Compose, bez integracji biznesowej; integrujemy je dopiero przy konkretnym przypadku użycia.
