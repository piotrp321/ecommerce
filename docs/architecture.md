# Architektura

Główne źródło prawdy o architekturze systemu. Dokument ma dwie wyraźnie oddzielone części: **Stan aktualny** (to, co działa w repozytorium) i **Planowane** (decyzje zatwierdzone, w realizacji; nic z tej części nie jest jeszcze wdrożone). Uzasadnienia pojedynczych decyzji są w [ADR](adr/), wymagania biznesowe w [specs](specs/), zakres etapów w [roadmapie](roadmap.md), kontrakt REST w [`api/openapi.yaml`](api/openapi.yaml).

## Stan aktualny

### Komponenty

| Komponent | Technologia | Rola |
|---|---|---|
| edge | Caddy (`infra/edge`) | Jedyny publiczny punkt wejścia produkcji: TLS, routing po domenie (`STORE_DOMAIN`, `ADMIN_DOMAIN`, `AUTH_DOMAIN`) i ścieżce ([ADR-0004](adr/0004-edge-proxy-and-production-topology.md)) |
| backend | Symfony, DDD + Hexagonal (`apps/backend`) | Jedyne źródło logiki biznesowej; bezstanowe REST API |
| store | Next.js, SSR (`apps/store`) | Interfejs sklepu; katalog czyta z backendu po stronie serwera; BFF logowania klienta (OIDC, sesje w Redis) |
| admin | React + Vite, SPA (`apps/admin`) | Interfejs administracyjny; dziś na danych demonstracyjnych, bez połączenia z API |
| database | PostgreSQL | Dane backendu (dostęp tylko z backendu) i osobna baza `keycloak` z własną rolą |
| keycloak | Keycloak 26.8.0 (`infra/docker/keycloak`, realmy w `infra/keycloak/realms`) | Dostawca tożsamości (OIDC): realmy `store` i `admin` |
| redis-session | Redis 8.8.2 | Magazyn sesji sklepu (ACL, `noeviction`, AOF); dostęp tylko ze sklepu |
| rabbitmq | RabbitMQ 4.3.5 (z panelem zarządzania), profil Compose `messaging` | Przygotowany, opcjonalny, bez integracji z aplikacjami |
| elasticsearch | Elasticsearch 9.5.5, profil Compose `search` | Przygotowany, opcjonalny, bez integracji z aplikacjami |

### Przepływy komunikacji

- Przeglądarka woła `/api/...` na własnej domenie (same-origin). Edge przekazuje to do backendu bez prefiksu `/api`; w dev robi to serwer Vite admina. Sklep nie ma proxy `/api`: woła backend wyłącznie po stronie serwera (`STORE_BACKEND_URL`).
- Store renderuje katalog na serwerze i woła backend bezpośrednio (server-to-server, `STORE_BACKEND_URL`, bez edge i bez prefiksu `/api`) ([ADR-0009](adr/0009-store-catalog-api.md)).
- Store jako BFF loguje klienta w Keycloaku (szczegóły w „Store jako BFF” niżej) i woła backend z tokenem Bearer użytkownika, również server-to-server.
- Nagłówek `Authorization` przechodzi przez edge bez zmian.
- Przeglądarka loguje się na `https://AUTH_DOMAIN` (w dev `http://localhost:8180`). Wymiana kodu na tokeny, discovery i JWKS idą siecią wewnętrzną (`http://keycloak:8080`), nie przez edge.
- Tylko edge ma publiczne porty; backend, store, admin, Keycloak, Redis i baza nie są publikowane. Redis sesji jest w osobnej sieci `sessions`, wspólnej tylko ze sklepem.

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

### Store jako BFF

Kod: `apps/store/src/auth`, zasady w [`apps/store/AGENTS.md`](../apps/store/AGENTS.md). Compose dev i prod uruchamiają Keycloak i `redis-session` i przekazują usłudze `store` zmienne auth (issuer dev `http://localhost:${KEYCLOAK_PORT}/realms/store`, prod `https://${AUTH_DOMAIN}/realms/store`, wewnętrznie `http://keycloak:8080/realms/store`, Redis jako użytkownik ACL `store`); sklep działa w trybie `oidc`. Pełny przepływ logowania sprawdza `infra/scripts/check-auth-flow.sh`: w dev ręcznie, w topologii prod przez edge w ramach `check-prod-stack.sh`.

- Next.js jest poufnym klientem `store-bff` (realm `store`): Authorization Code + PKCE S256, `state`, `nonce` i parametr `iss` (RFC 9207) wymagane. Tokeny wyłącznie po stronie serwera; w przeglądarce tylko nieprzezroczysty identyfikator sesji w ciasteczku `__Host-store_session` (`HttpOnly`, `Secure`, `SameSite=Lax`).
- Konfiguracja w runtime: `STORE_AUTH_MODE` (`oidc` domyślnie; `disabled` tylko z `STORE_ENVIRONMENT=development` albo `test`), `STORE_PUBLIC_URL`, `STORE_OIDC_ISSUER` (issuer publiczny), opcjonalnie `STORE_OIDC_INTERNAL_URL` (ten sam issuer w sieci wewnętrznej, ze ścieżką realmu, np. `http://keycloak:8080/realms/store`; przez niego idą discovery, token endpoint i JWKS), `STORE_OIDC_CLIENT_ID`, `STORE_OIDC_CLIENT_SECRET`, `STORE_REDIS_URL`, `STORE_SESSION_ENC_KEYS`. Bez kompletnej konfiguracji w trybie `oidc` serwer sklepu nie startuje.
- Sesje w `redis-session` (użytkownik ACL `store`, klucze z prefiksem `store:`, każdy z TTL): klucz rekordu to hash identyfikatora sesji, tokeny szyfrowane AES-256-GCM (pierścień kluczy z `kid`). Sesja wygasa po 30 min bezczynności, najpóźniej po 12 h.
- Odświeżanie tokenów: jedno wywołanie token endpointu na sesję także przy wielu replikach (lock w Redis i zapis compare-and-set).
- Ochrona CSRF: każde żądanie zmieniające stan (Server Actions, także formularz bez JavaScriptu) musi mieć `Origin` równy `STORE_PUBLIC_URL` (bez `Origin` tylko z `Sec-Fetch-Site: same-origin`); inaczej proxy Next.js (`src/proxy.ts`) odpowiada 403, zanim żądanie dotrze do akcji.
- Wylogowanie: RP-initiated (`end_session` z `id_token_hint`) oraz back-channel (`POST /auth/backchannel-logout`, wołany przez Keycloak w sieci wewnętrznej); oba unieważniają sesję we wszystkich replikach.
- Katalog nie zależy od Redisa ani Keycloaka: przy ich awarii strony katalogu działają, a trasy logowania odpowiadają 503.
- Profil klienta (`/konto`): `GET /me` backendu (server-to-server, `STORE_BACKEND_URL`) z access tokenem sesji jako Bearer (realm `store`, audience `store-api`); odpowiedź `{id, email | null, emailVerified}` jest mapowana pole po polu. 401 → jeden wymuszony refresh i ponowienie; drugi 401 usuwa sesję i kończy się stroną błędu (`SessionRejectedError`), bez przekierowania na logowanie. 403 i inne błędy → strona błędu. Autoryzacja zostaje na backendzie.

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
- Logowanie klienta sklepu: BFF opisany w „Store jako BFF”; tokeny nigdy nie trafiają do przeglądarki.
- Konfiguracja: zmienne `OIDC_STORE_*` i `OIDC_ADMIN_*` (wartości dev w `apps/backend/.env` i `compose.override.yaml`, w produkcji wymagane przez `compose.prod.yaml`); tokeny wydaje Keycloak (sekcja „Tożsamość (Keycloak)”).

### Tożsamość (Keycloak)

- Jedna instancja Keycloak 26.8.0, dwa realmy: `store` (klienci sklepu) i `admin` (administratorzy; OTP zawsze wymagane w przepływie przeglądarkowym, `admin-cli` bez grantu hasłem). Realmy są importowane przy pierwszym starcie; sekrety i adresy to placeholdery z konfiguracji uruchomieniowej.
- Issuer publiczny: dev `http://localhost:8180/realms/<realm>`, prod `https://${AUTH_DOMAIN}/realms/<realm>`. Discovery, tokeny i JWKS usługi pobierają przez sieć wewnętrzną: `http://keycloak:8080/realms/<realm>/` (`KC_HOSTNAME_BACKCHANNEL_DYNAMIC=true`), z tym samym issuerem.
- Klienci: `store-bff` (poufny, Authorization Code + PKCE S256, redirect `${STORE_PUBLIC_URL}/auth/callback`, back-channel logout `http://store:3000/auth/backchannel-logout`), `admin-bff` (zarezerwowany pod przyszły BFF admina), `store-api` i `admin-api` (audience tokenów). Rola klienta `admin` na `admin-api` odpowiada `ROLE_ADMIN` w backendzie.
- Edge na `AUTH_DOMAIN` udostępnia tylko endpointy potrzebne przeglądarce: `/realms/store/*`, `/realms/admin/*`, `/resources/*`. Endpointy serwer-serwer tych realmów (`token`, `userinfo`, `revoke`, `token/introspect`, `ext/*`, `auth/device`, `clients-registrations/*`), konsola administracyjna, realm `master`, `/health` i `/metrics` zwracają 404. Administracja tylko przez `kcadm.sh` w kontenerze ([ADR-0004](adr/0004-edge-proxy-and-production-topology.md)).
- Prod: obraz `keycloak_prod` (`kc.sh build`, `start --optimized`), nie-root, `read_only`, `cap_drop: ALL`; baza i rola `keycloak` w tym samym PostgreSQL, tworzone przez `infra/scripts/keycloak-db.sh` przed startem Keycloaka.

### Sesje sklepu (redis-session)

- Osobny Redis `redis-session` (`redis:8.8.2-alpine`, `noeviction`, AOF): ACL z wyłączonym użytkownikiem `default`, użytkownik `store` ograniczony do kluczy `store:*` i poleceń magazynu sesji, `ops` do administracji. Definicja i ACL są wspólne dla dev i prod (`compose.yaml`).
- Prod: nie-root (`redis`), `read_only`, `cap_drop: ALL`, bez portów, tylko w sieci `sessions` ze sklepem.
- Sklep dostaje komplet konfiguracji logowania i sesji (`STORE_AUTH_MODE=oidc`, `STORE_OIDC_*`, `STORE_REDIS_URL`, `STORE_SESSION_ENC_KEYS`); kod BFF opisuje „Store jako BFF”.

### Usługi opcjonalne (RabbitMQ, Elasticsearch)

- Zdefiniowane w `compose.yaml` w profilach `messaging` (`rabbitmq`) i `search` (`elasticsearch`); `docker compose up` i `make up` ich nie uruchamiają, startują je `make rabbitmq-up` i `make elasticsearch-up`, a `make down` usuwa je razem z resztą. Żadna usługa nie ma na nie `depends_on`; żadna aplikacja ich nie używa.
- Uwierzytelnianie jest wymagane: RabbitMQ bez użytkownika `guest` (użytkownik z `RABBITMQ_DEFAULT_USER`), Elasticsearch z `xpack.security` (użytkownik `elastic`, bez TLS, bo tylko sieć Compose). Kontener nie startuje bez haseł; w dev domyślne wartości mają prefiks `dev-only-`, w prod hasła podaje się w środowisku i są potrzebne tylko aktywowanemu profilowi.
- Dev: porty tylko na `127.0.0.1`. Prod: bez portów, `cap_drop: ALL`, `no-new-privileges` (RabbitMQ jako użytkownik `rabbitmq`), dane w wolumenach `rabbitmq_data` i `elasticsearch_data`.
- Limity: RabbitMQ 512 MB, Elasticsearch 1 GB (sterta 512 MB, tryb `single-node`).

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


### Admin

- SPA zostanie połączona z API później. Wstępnie przez oauth2-proxy (realm `admin`), docelowo ewentualnie własny BFF (`admin-bff`). Żadnych tokenów w przeglądarce.

### Redis cache, integracja RabbitMQ i Elasticsearcha

- Redis cache powstanie później jako osobna instancja (inne wymagania niż sesje: eviction zamiast `noeviction`).
- RabbitMQ i Elasticsearch (opcjonalne profile, „Usługi opcjonalne”) integrujemy z aplikacjami dopiero przy konkretnym przypadku użycia.
