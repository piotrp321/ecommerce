# Architektura

Główne źródło prawdy o architekturze systemu. Dokument ma dwie wyraźnie oddzielone części: **Stan aktualny** (to, co działa w repozytorium) i **Planowane** (decyzje zatwierdzone, w realizacji; nic z tej części nie jest jeszcze wdrożone). Uzasadnienia pojedynczych decyzji są w [ADR](adr/), wymagania biznesowe w [specs](specs/), zakres etapów w [roadmapie](roadmap.md), kontrakt REST w [`api/openapi.yaml`](api/openapi.yaml).

## Stan aktualny

### Komponenty

| Komponent | Technologia | Rola |
|---|---|---|
| edge | Caddy (`infra/edge`) | Jedyny publiczny punkt wejścia produkcji: TLS, routing po domenie (`STORE_DOMAIN`, `ADMIN_DOMAIN`) i ścieżce ([ADR-0004](adr/0004-edge-proxy-and-production-topology.md)) |
| backend | Symfony, DDD + Hexagonal (`apps/backend`) | Jedyne źródło logiki biznesowej; bezstanowe REST API |
| store | Next.js, SSR (`apps/store`) | Interfejs sklepu; katalog czyta z backendu po stronie serwera |
| admin | React + Vite, SPA (`apps/admin`) | Interfejs administracyjny; dziś na danych demonstracyjnych, bez połączenia z API |
| database | PostgreSQL | Dane backendu; dostęp tylko z backendu |

### Przepływy komunikacji

- Przeglądarka woła `/api/...` na własnej domenie (same-origin). Edge przekazuje to do backendu bez prefiksu `/api`; w dev robi to serwer Vite admina. Sklep nie ma proxy `/api`: woła backend wyłącznie po stronie serwera (`STORE_BACKEND_URL`).
- Store renderuje katalog na serwerze i woła backend bezpośrednio (server-to-server, `STORE_BACKEND_URL`, bez edge i bez prefiksu `/api`) ([ADR-0009](adr/0009-store-catalog-api.md)).
- Nagłówek `Authorization` przechodzi przez edge bez zmian.
- Tylko edge ma publiczne porty; backend, store, admin i baza nie są publikowane.

### Moduły backendu

Granice pilnuje Deptrac (`apps/backend/deptrac.yaml`); moduły komunikują się przez porty ([ADR-0005](adr/0005-catalog-inventory-and-admin-api-access.md)).

| Moduł | Status | Odpowiedzialność |
|---|---|---|
| Catalog | działa | Produkty (cena netto, stawka VAT, aktywność) i drzewo kategorii |
| Inventory | działa | Stan magazynowy |
| Customers | działa | Klienci sklepu (agregat `Customer`) powiązani z tożsamością w realmie `store` |
| Backoffice | działa | Administratorzy (agregat `AdminUser`) powiązani z tożsamością w realmie `admin`; lokalna blokada |
| Shared | działa | Wspólne obiekty wartości (`Money`, `VatRate`, `LinePrice`, `ExternalIdentity`), infrastruktura bezpieczeństwa |
| Cart | planowany | Koszyk gościa i klienta |
| Ordering | planowany | Składanie i cykl życia zamówienia |
| Payments | planowany | Płatności |

### Bezpieczeństwo

Backend jest bezstanowy: przy każdym żądaniu sam waliduje token dostępu OIDC (JWT) z Keycloaka, bez sesji i ciasteczek ([ADR-0005](adr/0005-catalog-inventory-and-admin-api-access.md), pkt 6). Autoryzacja jest zawsze egzekwowana na backendzie.

| Ścieżki | Firewall | Wymagania |
|---|---|---|
| `/catalog/...`, `/health` | `public` | Bez uwierzytelniania; przesłany token jest ignorowany. Katalog tylko do odczytu. |
| `/admin/...` | `admin_api` | Token realmu `admin`, audience `admin-api`; `ROLE_ADMIN` wyłącznie z roli klienta `admin` na `admin-api` (`resource_access.admin-api.roles`) |
| każda inna, np. `/me` | `store_api` | Token realmu `store`, audience `store-api` (`ROLE_CUSTOMER`); nowa trasa jest domyślnie chroniona |

- Walidacja: podpis RS256 kluczami z JWKS realmu (discovery pod adresem wewnętrznym `OIDC_*_DISCOVERY_URL`), dokładny `iss` (`OIDC_*_ISSUER`), `aud` (`OIDC_*_AUDIENCE`), `exp`, `nbf`, `iat`, `sub`, a także `typ: Bearer` i `azp` z listy `OIDC_*_CLIENTS` (`store-bff`, `admin-bff`). Używane claimy: `sub`, `email`, `email_verified`, `typ`, `azp`, `resource_access.admin-api.roles`.
- Klucze są w cache `cache.oidc` (czas życia z `max-age` JWKS); niedostępny Keycloak oznacza 401 w ciągu 3 s, nigdy 500.
- Błędy to `application/problem+json`: 401 z `WWW-Authenticate: Bearer` (brak tokenu) albo `Bearer error="invalid_token"`, 403 z `Bearer error="insufficient_scope"`.
- Endpointy tożsamości:

| Endpoint | Odpowiedź |
|---|---|
| `GET /me` | `{id, email \| null, emailVerified}` |
| `GET /admin/me` | `{id, email \| null, roles}` |

- Powiązanie z tożsamością zewnętrzną to para (issuer, `sub`), unikalna w `Customers` i `Backoffice`; rekord powstaje przy pierwszym żądaniu (just-in-time), e-mail jest synchronizowany z tokenu. Backend nie przechowuje haseł ani ról: role pochodzą z tokenu, `AdminUser` ma tylko lokalną blokadę (403). Ryzyko: zmiana `AUTH_DOMAIN` zmienia `iss`, więc wymaga migracji powiązań (issuer, `sub`).
- Konfiguracja: zmienne `OIDC_STORE_*` i `OIDC_ADMIN_*` (wartości dev w `apps/backend/.env`, w produkcji wymagane przez `compose.prod.yaml`). Keycloak nie działa jeszcze w Compose (część „Planowane”), więc dev odpowiada na chronione API kodem 401.

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

Tokeny dokleja po stronie serwera BFF sklepu oraz oauth2-proxy / admin-bff; SPA admina i przeglądarka ich nie widzą. Walidację tokenów w backendzie opisuje część „Stan aktualny”.

### Keycloak (tożsamość)

- Jedna instancja Keycloak 26.8.0, dwa realmy: `store` (klienci sklepu) i `admin` (administratorzy; MFA).
- Issuer publiczny: dev `http://localhost:8180/realms/<realm>`, prod `https://${AUTH_DOMAIN}/realms/<realm>`. Na `AUTH_DOMAIN` będą publiczne endpointy obu realmów (`/realms/store/...`, `/realms/admin/...`, m.in. przekierowanie z `store-bff` na `/realms/store/protocol/openid-connect/auth`); konsola administracyjna Keycloak (`/admin/...`) nie będzie publiczna.
- Discovery i JWKS pobierane przez sieć wewnętrzną: `http://keycloak:8080/realms/<realm>/` (`KC_HOSTNAME_BACKCHANNEL_DYNAMIC=true`), a nie przez adres publiczny.
- Klienci: `store-bff` (poufny, Authorization Code + PKCE S256), `admin-bff` (zarezerwowany pod przyszły BFF admina), `store-api` i `admin-api` (występują jako audience tokenów, przez audience mapper). Rola klienta `admin` na `admin-api` odpowiada `ROLE_ADMIN` w backendzie.

### Store jako BFF

- Next.js będzie pełnił rolę BFF: logowanie Authorization Code + PKCE S256 (klient `store-bff`), tokeny wyłącznie po stronie serwera, w przeglądarce tylko identyfikator sesji w ciasteczku.
- Sesje w osobnym Redis `redis-session` (`redis:8.8.2-alpine`, `noeviction`, AOF, ACL). Tokeny w Redis szyfrowane AES-256-GCM, klucz rekordu to hash identyfikatora sesji.
- Store wywołuje backend z tokenem Bearer użytkownika; autoryzacja zostaje na backendzie.

### Admin

- SPA zostanie połączona z API później. Wstępnie przez oauth2-proxy (realm `admin`), docelowo ewentualnie własny BFF (`admin-bff`). Żadnych tokenów w przeglądarce.

### Redis, RabbitMQ, Elasticsearch

- Redis sesji (`redis-session`) powstaje teraz, razem z tożsamością.
- Redis cache powstanie później jako osobna instancja (inne wymagania niż sesje: eviction zamiast `noeviction`).
- RabbitMQ i Elasticsearch to opcjonalne profile Compose, bez integracji biznesowej; integrujemy je dopiero przy konkretnym przypadku użycia.
