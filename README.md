# E-commerce

[![CI](https://github.com/piotrp321/ecommerce/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/piotrp321/ecommerce/actions/workflows/ci.yml)

Edukacyjny system e-commerce rozwijany jako monorepo. Projekt służy do nauki Agentic Software Development.

- Specyfikacja biznesowa: [docs/specs/01-placing-order.md](docs/specs/01-placing-order.md)
- Roadmapa: [docs/roadmap.md](docs/roadmap.md)
- Decyzje architektoniczne: [docs/adr/](docs/adr/)
- Instrukcje dla agentów AI: [AGENTS.md](AGENTS.md)

## Struktura

| Katalog | Zawartość |
|---|---|
| `apps/backend` | Symfony 8.1, PHP 8.5, DDD + Hexagonal (modularny monolit) |
| `apps/admin` | Panel administracyjny: React 19 + Vite 8 + TypeScript (SPA) |
| `apps/store` | Sklep: Next.js 16 + React 19 + TypeScript (SSR) |
| `infra/docker/backend` | Obraz backendu (FrankenPHP): Dockerfile, Caddyfile, PHP ini, entrypoint prod |
| `infra/docker/admin` | Obraz admina: Vite dev (HMR) i produkcyjny statyczny Caddy |
| `infra/docker/store` | Obraz sklepu: Next.js dev (HMR) i produkcyjny serwer standalone |
| `infra/docker/keycloak` | Obraz Keycloaka (dostawca tożsamości): dev (`start-dev`) i produkcyjny (`kc.sh build`, `start --optimized`), oba z importem realmów |
| `infra/keycloak/realms` | Definicje realmów `store` i `admin` (import przy pierwszym starcie, sekrety jako placeholdery `${ENV}`) |
| `infra/edge` | Edge proxy (Caddy): jedyny publiczny punkt wejścia produkcji, TLS i routing (`STORE_DOMAIN`, `ADMIN_DOMAIN`, `AUTH_DOMAIN`) |
| `infra/scripts` | `check-prod-stack.sh` (cała topologia, z tymczasowym plikiem Compose), `check-prod-admin.sh`, `check-prod-store.sh`; baza Keycloaka w dev i prod: `keycloak-db.sh`; dev: `keycloak-dev-seed.sh`, `check-dev-infra.sh` |
| `docs` | Specyfikacje, roadmapa, ADR |
| `.claude` | Wspólna konfiguracja Claude Code: skill `/feature-delivery`, subagenci, reguły `ask` (sekcja „Agentic SDLC”) |
| katalog główny | `compose*.yaml`, `Makefile`, pnpm workspace (`package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`), `.node-version`, `AGENTS.md` |

SDK (`packages/sdk`) powstanie w etapie 5 ([roadmapa](docs/roadmap.md)).

## Wymagania

- Docker z Docker Compose v2.24+
- GNU Make

PHP, Composer, Node.js i pnpm na hoście nie są potrzebne: wszystkie komendy działają w kontenerach. Opcjonalny tryb lokalny frontendu opisuje sekcja „Frontend lokalnie (macOS)”.

## Uruchomienie

```bash
make bootstrap
```

`make bootstrap` buduje obrazy dev, instaluje zależności JS (do wolumenów Dockera), uruchamia PostgreSQL, bazę Keycloaka, backend, admina, sklep, Keycloak i Redis sesji, instaluje zależności Composera i wykonuje migracje.

| Usługa | Adres |
|---|---|
| Backend | https://localhost (certyfikat generowany lokalnie przez Caddy), stan: https://localhost/health |
| Admin (Vite, HMR) | http://localhost:5173, API przez proxy: http://localhost:5173/api/health |
| Sklep (Next.js, SSR, HMR) | http://localhost:3000 |
| Keycloak (dev) | http://localhost:8180, konsola: http://localhost:8180/admin (`admin` / `dev-only-keycloak-admin-password`) |
| Redis sesji sklepu | `127.0.0.1:6379` (tylko z hasłem, sekcja „Keycloak i Redis sesji”) |
| RabbitMQ, Elasticsearch (opcjonalne) | nie startują z `make up`; `make rabbitmq-up` / `make elasticsearch-up`, sekcja „Usługi opcjonalne” |

W dev wszystkie porty (80, 443, 3000, 5173, 5432, 8180, 6379) są dostępne tylko z `127.0.0.1`. Odpowiedź `/health`:

```json
{"status":"ok","database":"ok"}
```

### Sklep: katalog z API albo dane demo

Katalog sklepu pochodzi z publicznego API backendu albo z danych demonstracyjnych. Decyduje o tym zmienna serwerowa `STORE_BACKEND_URL`, czytana przy starcie serwera, bez przebudowy ([ADR-0009](docs/adr/0009-store-catalog-api.md)):

| `STORE_BACKEND_URL` | Katalog |
|---|---|
| adres http(s) backendu, np. `http://backend:80` | API backendu, bez oznaczeń demo |
| nieustawiona albo pusta | dane demonstracyjne z komunikatem „Wersja demonstracyjna” i `noindex` |

- **Docker:** `compose.override.yaml` i `compose.prod.yaml` ustawiają domyślnie `http://backend:80` (wywołanie w sieci Compose, bez edge i bez `/api`). Tryb demo włączysz pustą wartością: dopisz `STORE_BACKEND_URL=` do `.env` w katalogu głównym albo wyeksportuj ją, potem `make up`. Usunięcie wpisu przywraca API.
- **Lokalnie (macOS):** bez zmiennej `pnpm dev:store` pokazuje dane demo. Żeby użyć API backendu dev (HTTPS z lokalnym CA Caddy):

  ```bash
  docker compose cp backend:/data/caddy/pki/authorities/local/root.crt /tmp/caddy-root.crt
  STORE_BACKEND_URL=https://localhost NODE_EXTRA_CA_CERTS=/tmp/caddy-root.crt pnpm dev:store
  ```

- **Awaria backendu:** strony sklepu zwracają stronę błędu (HTTP 500), nigdy pustego katalogu ani danych demo. Kontener sklepu zostaje zdrowy, bo `HEALTHCHECK` sprawdza tylko `/healthz` (żywotność procesu Next.js).

Po `make bootstrap` katalog w backendzie jest pusty. Dane dodasz przez administracyjne API z tokenem dostępu administratora: token realmu `admin` z Keycloaka, wydany klientowi `admin-bff`, z rolą klienta `admin` na `admin-api` ([ADR-0005](docs/adr/0005-catalog-inventory-and-admin-api-access.md)). Backend sprawdza go bez sesji; adresy realmów ustawiają zmienne `OIDC_ADMIN_*` w `apps/backend/.env`.

> **Plan:** Keycloak w środowisku dev i sposób pobrania tokenu opisze osobna zmiana. Do tego czasu backend dev odpowiada na administracyjne API kodem 401.

```bash
TOKEN='<token dostępu administratora>'   # nie zapisuj go w repozytorium
API=https://localhost   # backend dev; -k akceptuje lokalny certyfikat Caddy

curl -k -X POST "$API/admin/catalog/categories" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"slug":"kuchnia","name":"Kuchnia"}'          # zwraca "id" kategorii
curl -k -X POST "$API/admin/catalog/products" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"sku":"KUB-01","slug":"kubek","name":"Kubek","netPrice":"40.00","vatRate":23,"categoryId":"<id kategorii>"}'
curl -k -X POST "$API/admin/catalog/products/<id produktu>/activate" -H "Authorization: Bearer $TOKEN"   # produkty powstają nieaktywne
curl -k -X PUT "$API/admin/inventory/stock/<id produktu>" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"onHand":10}'
```

Sklep pokaże produkt „Kubek” z ceną brutto 49,20 zł wyliczoną przez backend. Pełny opis operacji jest w [`docs/api/openapi.yaml`](docs/api/openapi.yaml).

### Keycloak i Redis sesji (dev)

Środowisko dev zawiera dostawcę tożsamości i magazyn sesji sklepu. Backend dostaje zmienne `OIDC_STORE_*` i `OIDC_ADMIN_*` (jeszcze nieużywane). Sklep dostaje komplet zmiennych trybu `STORE_AUTH_MODE=oidc` z działającymi wartościami dev: `STORE_ENVIRONMENT`, `STORE_PUBLIC_URL`, `STORE_OIDC_ISSUER` (dokładnie claim `iss`), `STORE_OIDC_INTERNAL_URL` (`http://keycloak:8080/realms/store`), `STORE_OIDC_CLIENT_ID`, `STORE_OIDC_CLIENT_SECRET`, `STORE_REDIS_URL` i `STORE_SESSION_ENC_KEYS` (`kid:base64(32 bajty)`, pierwszy aktywny). Żadna usługa aplikacji nie zależy od Keycloaka ani Redisa (`depends_on`): backend i katalog sklepu działają, gdy oba są zatrzymane. Keycloak dev jest zdefiniowany w `compose.override.yaml`. Redis sesji ma wspólną definicję z ACL w `compose.yaml`, a hasła i port dev w `compose.override.yaml`. Obie usługi działają też w topologii prod (sekcja „Topologia produkcyjna”).

**Keycloak 26.8.0** (`infra/docker/keycloak`, `start-dev`) działa na `http://localhost:${KEYCLOAK_PORT:-8180}`. Port zarządzania 9000 (`/health/ready`, healthcheck) nie jest publikowany.

- **Issuer** jest publiczny: `http://localhost:<KEYCLOAK_PORT>/realms/<realm>` (`KC_HOSTNAME`). Usługi w sieci Compose pobierają discovery z `http://keycloak:8080/realms/<realm>/.well-known/openid-configuration` i dostają w nim endpointy back-channel (token, JWKS) pod `http://keycloak:8080` (`KC_HOSTNAME_BACKCHANNEL_DYNAMIC`), z tym samym publicznym issuerem.
- **Baza:** osobna baza i rola `keycloak` w tym samym PostgreSQL. Tworzy je `infra/scripts/keycloak-db.sh`, uruchamiany przez `make up` po starcie bazy, a przed resztą usług. Skrypt jest idempotentny: tworzy tylko brakujące obiekty, przy każdym uruchomieniu ustawia hasło z `KEYCLOAK_DB_PASSWORD` i odbiera grupie `PUBLIC` prawa `CONNECT` i `TEMPORARY` na bazach `keycloak`, `app` i `postgres`. Rola `keycloak` łączy się więc spośród nich tylko z własną bazą. Superużytkownik aplikacji i `pg_isready` nie są tym ograniczeni. Baza testowa `app_test` zachowuje `CONNECT` dla `PUBLIC`, bo testy backendu łączą się z nią rolami, które same tworzą. Rola `keycloak` nie odczyta tam żadnej tabeli i niczego nie utworzy. Skrypt działa też na istniejącym wolumenie i niczego nie usuwa.
- **Realmy** (`infra/keycloak/realms/*.json`) są importowane przy starcie (`--import-realm`) tylko wtedy, gdy jeszcze nie istnieją. Zmiana pliku nie zmienia więc istniejącego realmu: obowiązuje w nowym projekcie Compose albo po usunięciu realmu w konsoli. Dotyczy to np. wyłączenia grantu hasłem dla `admin-cli` w realmie `admin`: istniejące środowisko dev dostanie je dopiero po odtworzeniu bazy Keycloaka. Sekrety i adresy są placeholderami Keycloaka (`${STORE_OIDC_CLIENT_SECRET}`, `${STORE_PUBLIC_URL}` …), które Compose przekazuje do kontenera.

| Realm | Konfiguracja |
|---|---|
| `store` | rejestracja, login e-mailem, weryfikacja e-mail, ochrona brute force (czasowa blokada), hasło `length(12)`, `notUsername`, `notEmail`, access token 5 min, sesja SSO 30 min bezczynności / 12 h, rotacja refresh tokenów (bez ponownego użycia), konsola konta wyłączona |
| `admin` | bez rejestracji i „zapomniałem hasła”, ochrona brute force (czasowa blokada), OTP zawsze wymagane: własny browser flow `admin browser` z OTP Form jako REQUIRED (użytkownik bez OTP musi je skonfigurować przy logowaniu), Configure OTP jako domyślna akcja wymagana, akcja usuwania poświadczeń wyłączona; hasło `length(14)`, sesja SSO 15 min / 8 h, ta sama rotacja refresh tokenów, konsola konta wyłączona |

| Klient | Realm | Konfiguracja |
|---|---|---|
| `store-bff` | `store` | poufny, tylko authorization code z PKCE S256, redirect `${STORE_PUBLIC_URL}/auth/callback`, po wylogowaniu `${STORE_PUBLIC_URL}/`, bez web origins, back-channel logout `http://store:3000/auth/backchannel-logout` (z sesją), audience `store-api` |
| `store-api` | `store` | tylko audience (bez przepływów) |
| `admin-bff` | `admin` | poufny, tylko authorization code z PKCE S256, redirect `${ADMIN_PUBLIC_URL}/auth/callback`, audience `admin-api`, role w `resource_access.admin-api.roles` |
| `admin-api` | `admin` | tylko audience, rola klienta `admin` |

`STORE_PUBLIC_URL` i `ADMIN_PUBLIC_URL` mają domyślnie wartości `http://localhost:${STORE_PORT}` i `http://localhost:${ADMIN_PORT}`. Konsolę konta wyłącza zablokowany klient `account`: `/realms/<realm>/account` zwraca 404.

**Redis 8.8.2** (`redis-session`) przechowuje sesje sklepu. AOF jest włączony (`everysec`), bez snapshotów RDB, z limitem `maxmemory 256mb` i polityką `noeviction`, więc przy pełnej pamięci zapis zwraca błąd i żadna sesja nie znika po cichu. Dane leżą w wolumenie `redis_session_data`. Plik ACL powstaje przy starcie z haseł w zmiennych środowiskowych:

- `default`: wyłączony, więc polecenie bez logowania zwraca `NOAUTH`,
- `store`: tylko klucze `store:*` i polecenia magazynu sesji sklepu, wywoływane bezpośrednio i w skryptach Lua (`EVAL`): `eval`, `evalsha`, `multi`, `exec`, `get`, `getdel`, `set`, `del`, `exists`, `hget`, `hset`, `hgetall`, `hincrby`, `pexpire`, `sadd`, `smembers`, `srem`, `ping` oraz handshake node-redis (`hello`, `auth`, `client setinfo`); `CLIENT LIST`, `ACL`, `CONFIG`, `KEYS` i `FLUSHALL` są zabronione,
- `ops`: administracja i healthcheck, np. `docker compose exec redis-session sh -c 'REDISCLI_AUTH="$REDIS_OPS_PASSWORD" redis-cli --user ops INFO memory'`.

**Sekrety dev** mają wartości domyślne z prefiksem `dev-only-`, zapisane w `compose.override.yaml`. Można je nadpisać w `.env` lub w środowisku: `KEYCLOAK_DB_PASSWORD`, `KEYCLOAK_ADMIN_PASSWORD`, `STORE_OIDC_CLIENT_SECRET`, `ADMIN_OIDC_CLIENT_SECRET`, `REDIS_SESSION_PASSWORD`, `REDIS_OPS_PASSWORD`, `STORE_SESSION_ENC_KEYS` (klucz dev ma identyfikator `dev-only-1`). Hasła Redisa nie mogą zawierać białych znaków. Hasło użytkownika `store` trafia bez kodowania do `STORE_REDIS_URL`, więc może zawierać tylko znaki bezpieczne w URL (bez `@ : / ? # %`). Nigdy nie używaj tych wartości poza dev.

**E-mail w dev:** środowisko nie ma serwera SMTP. Samodzielna rejestracja w realmie `store` (w Keycloaku 26 formularz bez hasła, potem wymagane VERIFY_EMAIL i UPDATE_PASSWORD) nie wyśle więc maila i nie da się jej dokończyć. Testy ręczne i automatyczne używają użytkowników z `make keycloak-dev-seed`.

#### Keycloak: użytkownicy testowi

```bash
make keycloak-dev-seed   # po make up; idempotentny (istniejący użytkownik zostaje bez zmian)
```

Seed tworzy użytkowników tylko w Keycloaku dev. Odmawia działania, gdy Keycloak nie ma hostname `http://localhost:*`. Realmy nie zawierają żadnych użytkowników. Wartości można zmienić zmiennymi środowiskowymi przy wywołaniu `make`:

| Realm | Użytkownik | Hasło | Uwagi |
|---|---|---|---|
| `store` | `customer@example.test` (`KEYCLOAK_DEV_CUSTOMER_EMAIL`) | `dev-only-Customer-2026` (`KEYCLOAK_DEV_CUSTOMER_PASSWORD`) | e-mail zweryfikowany |
| `admin` | `admin` / `admin@example.test` (`KEYCLOAK_DEV_ADMIN_USERNAME`, `KEYCLOAK_DEV_ADMIN_EMAIL`) | `dev-only-Admin-password-2026` (`KEYCLOAK_DEV_ADMIN_PASSWORD`) | rola `admin-api/admin`, TOTP z sekretem `KEYCLOAK_DEV_ADMIN_TOTP_SECRET` |

Logowanie admina wymaga kodu OTP. Keycloak przechowuje surowy sekret (domyślnie `dev-only-admin-totp-secret-000`), a aplikacje uwierzytelniające i `oathtool` używają jego postaci Base32:

```bash
oathtool --totp -b MRSXMLLPNZWHSLLBMRWWS3RNORXXI4BNONSWG4TFOQWTAMBQ        # domyślny sekret
oathtool --totp -b "$(printf %s "$KEYCLOAK_DEV_ADMIN_TOTP_SECRET" | base32)"  # własny sekret
```

Testy automatyczne (E2E, QA) mogą wyliczyć kod tak jak `infra/scripts/check-dev-infra.sh` (funkcja `totp`: HMAC-SHA1 z surowego sekretu, 6 cyfr, okres 30 s), np. w Node: `crypto.createHmac('sha1', secret)`.

#### Kontrola infrastruktury dev

`make stack-check-dev` uruchamia `infra/scripts/check-dev-infra.sh`. Skrypt stawia całą topologię dev we własnym projekcie `ecommerce-dev-check`, przekazywanym jawnie przez `-p`, więc wygrywa z `COMPOSE_PROJECT_NAME` z `.env`. Porty projektu to 28080/28443/25432/25173/23000/28180/26379 (z `make stack-check-dev-optional` także 28672/28673/28920). Projekt zmienisz zmienną `DEV_CHECK_PROJECT`, a porty zmiennymi `DEV_CHECK_*_PORT`, co pozwala na równoległe sesje. Na końcu skrypt usuwa kontenery i zostawia wolumeny (nigdy `down -v`). Świeży przebieg wymaga więc nowej nazwy projektu, a zmiana portów także, bo realmy importują się raz. Skrypt sam buduje obrazy z bieżącego drzewa roboczego (z cache warstw), więc sprawdza aktualne pliki realmów. Gdy projekt ma już wolumeny, skrypt wypisuje na początku ostrzeżenie `WARN`, bo zmiany w `infra/keycloak/realms/*.json` nie zostaną wtedy sprawdzone. Przy porażce wypisuje logi Keycloaka i Redisa, zanim usunie kontenery. Skrypt sprawdza:

- **usługi:** health Keycloaka i Redisa, `keycloak-db.sh` i `keycloak-dev-seed` uruchomione kilka razy bez błędów, rola `keycloak` bez połączenia z `app` i `postgres` i bez odczytu oraz tworzenia obiektów w `app_test`, `pg_isready` bez zmian,
- **discovery:** obu realmów z hosta (issuer publiczny) i z sieci Compose (JWKS i token endpoint pod `http://keycloak:8080`),
- **konfigurację:** realmów i klientów (kcadm, m.in. brute force w obu realmach i OTP Form REQUIRED w realmie admin), odrzucenie password grant, client credentials, żądania bez PKCE, PKCE `plain`, obcego redirect URI i wymiany kodu bez `code_verifier`; klient uwierzytelniany przez `client_secret_basic`,
- **OTP w realmie admin:** `kc_action=delete_credential` nie usuwa OTP admina, a użytkownik założony przez API bez OTP (z `"requiredActions": []`) musi skonfigurować OTP przy logowaniu i nie dostaje kodu,
- **sklep:** zmienne trybu `oidc` ustawione i niepuste, issuer i sekret zgodne z Keycloakiem, `STORE_SESSION_ENC_KEYS` w formacie `kid:base64(32 bajty)`, a `STORE_REDIS_URL` loguje się do Redisa jako `store` (wartości nie są wypisywane),
- **logowanie:** klienta i admina (z kodem TOTP) przez przeglądarkowy flow z PKCE, a w tokenach `iss`, `aud`, `azp`, `typ`, `email_verified`, `resource_access.admin-api.roles` i czas życia 5 min,
- **Redis:** `NOAUTH` bez hasła, wyłączony `default`, `noeviction`, ACL użytkownika `store` (działają `MULTI`/`EXEC`, `EVAL`, `CLIENT SETINFO`; zabronione `FLUSHALL`, `CONFIG`, `KEYS`, `CLIENT LIST`, `ACL` i klucze spoza `store:*`),
- **porty:** wyłącznie `127.0.0.1`, port 9000 niepublikowany,
- **niezależność aplikacji:** backend `/health` i strona sklepu przy zatrzymanym Keycloaku i Redisie, brak `depends_on` na nich,
- **trwałość:** po `down`/`up` klucz Redisa, realmy i użytkownicy zostają, a dane aplikacji (tabele i liczba wierszy) są nietknięte,
- **usługi opcjonalne:** `make up` nie uruchamia RabbitMQ ani Elasticsearcha, żadna usługa nie ma na nie `depends_on`, a `make down` usuwa też kontenery z profili.

`make stack-check-dev-optional` (ten sam skrypt z `DEV_CHECK_OPTIONAL=1`; porty `DEV_CHECK_RABBITMQ_PORT`, `DEV_CHECK_RABBITMQ_MANAGEMENT_PORT`, `DEV_CHECK_ELASTICSEARCH_PORT`) uruchamia dodatkowo `make rabbitmq-up` i `make elasticsearch-up` (obrazy RabbitMQ i Elasticsearcha są pobierane przy pierwszym przebiegu) i sprawdza:

- **health** obu usług oraz odmowę startu bez hasła,
- **uwierzytelnianie:** RabbitMQ odrzuca złe hasło i `guest/guest` spoza kontenera (401), nie ma użytkownika `guest`, a broker odrzuca złe hasło; Elasticsearch odpowiada 401 bez danych logowania i ze złym hasłem, a użytkownik `elastic` ma klaster `green` lub `yellow`,
- **porty:** RabbitMQ (5672, 15672) i Elasticsearch (9200) tylko na `127.0.0.1`,
- **trwałość:** trwała kolejka RabbitMQ z trwałą wiadomością i dokument Elasticsearcha przeżywają `make down` i ponowny start.

Ta kontrola nie działa w CI (pobiera duże obrazy); uruchamiaj ją po zmianach profili `messaging` i `search`, `compose*.yaml` lub `Makefile`.

### Usługi opcjonalne: RabbitMQ i Elasticsearch

RabbitMQ (`rabbitmq:4.3.5-management-alpine`, profil Compose `messaging`) i Elasticsearch (`9.5.5`, profil `search`) są przygotowane na kolejne etapy i nie mają jeszcze integracji z aplikacjami: żadna usługa nie ma na nie `depends_on`. Profil domyślny ich nie uruchamia, więc `make up` i `make bootstrap` ich nie startują i nie potrzebują ich pamięci.

| Komenda | Efekt |
|---|---|
| `make rabbitmq-up` / `make rabbitmq-down` | Start (czeka na health) / zatrzymanie i usunięcie kontenera RabbitMQ; wolumen `rabbitmq_data` zostaje |
| `make elasticsearch-up` / `make elasticsearch-down` | Jak wyżej dla Elasticsearcha; wolumen `elasticsearch_data` zostaje |
| `make down` | Zatrzymuje i usuwa też usługi z profili (wolumeny zostają) |
| `make logs` | Logi także usług z profili, jeśli działają |

Adresy dev (tylko `127.0.0.1`, porty zmienisz w `.env`):

| Usługa | Adres | Dane logowania dev |
|---|---|---|
| RabbitMQ AMQP | `127.0.0.1:5672` (`RABBITMQ_PORT`) | `RABBITMQ_DEFAULT_USER` (`app`) / `RABBITMQ_DEFAULT_PASS` (`dev-only-rabbitmq-password`) |
| RabbitMQ panel zarządzania | http://localhost:15672 (`RABBITMQ_MANAGEMENT_PORT`) | jak wyżej |
| Elasticsearch | http://localhost:9200 (`ELASTICSEARCH_PORT`) | użytkownik `elastic`, hasło `ELASTIC_PASSWORD` (`dev-only-elastic-password`) |

Uwierzytelnianie jest wymagane: RabbitMQ nie tworzy użytkownika `guest`, a Elasticsearch ma włączone `xpack.security` (bez TLS, bo jest dostępny tylko w sieci Compose i na `127.0.0.1`); bez danych logowania odpowiada 401. Kontenery nie wystartują bez hasła (`RABBITMQ_DEFAULT_USER`, `RABBITMQ_DEFAULT_PASS`, `ELASTIC_PASSWORD`). Wartości `dev-only-…` są tylko dla dev.

Ograniczenia: RabbitMQ ma limit pamięci 512 MB, a Elasticsearch 1 GB (sterta JVM 512 MB). W Docker Desktop na macOS przydziel Dockerowi co najmniej 6 GB RAM, gdy działają wszystkie usługi z obu profilami. Elasticsearch wymaga `vm.max_map_count` co najmniej 262144 w maszynie wirtualnej Dockera; Docker Desktop ustawia tę wartość, co sprawdzisz poleceniem `docker run --rm alpine sysctl vm.max_map_count` (przy mniejszej wartości Elasticsearch kończy start błędem w logach, `make logs`). RabbitMQ używa stałej nazwy hosta `rabbitmq`, bo katalog danych zależy od nazwy węzła.

### Przejście z układu sprzed monorepo

Po aktualizacji z wersji, w której Symfony było w katalogu głównym:

1. Zatrzymaj stare kontenery: `make down`. `make up` i tak usuwa osierocony kontener `php`, ale wolumeny zawsze zostają.
2. Pliki ignorowane przez git nie przenoszą się same. Przenieś je do `apps/backend/`: `.env.local` (jeśli masz), a opcjonalnie też `vendor/` i `var/`. Możesz je też usunąć z katalogu głównego i wykonać `make install`.
3. `make bootstrap`. Lokalna baza zostaje, bo nazwa projektu `ecommerce` i wolumen `ecommerce_database_data` się nie zmieniają.

### Frontend lokalnie (macOS)

Do pracy z IDE, debuggerem i natywnym HMR frontend można uruchomić bez Dockera. Backend nadal działa w Dockerze.

```bash
nvm install "$(cat .node-version)"   # albo fnm/mise, które czytają .node-version
corepack enable pnpm                  # pnpm w wersji z packageManager
pnpm install
docker compose stop admin store       # porty 5173 i 3000 zajmują kontenery
pnpm dev:admin                        # http://localhost:5173, /api -> https://localhost
pnpm dev:store                        # http://localhost:3000 (w drugim terminalu)
```

Lokalne `node_modules` (binarki macOS) i `node_modules` kontenera (binarki Linuksa, w wolumenach Dockera) są od siebie niezależne i korzystają z jednego `pnpm-lock.yaml`.
Inna wersja Node niż w `.node-version` kończy `pnpm install` błędem (`engineStrict`). Jeśli HMR w Dockerze nie wykrywa zmian, ustaw `ADMIN_DEV_POLLING=1` lub `STORE_DEV_POLLING=1`.

## Komendy

`make help` wyświetla pełną listę. Konwencja: cele zbiorcze bez prefiksu, cele aplikacji z jej prefiksem.

| Komenda | Opis |
|---|---|
| `make bootstrap` | Środowisko dev od zera: build, up, install, migracje |
| `make build` / `make up` / `make down` | Budowa obrazów dev, start (najpierw PostgreSQL i `keycloak-db.sh`, potem reszta bez usług opcjonalnych), zatrzymanie także usług z profili (wolumeny zostają) |
| `make keycloak-dev-seed` | Użytkownicy testowi w Keycloaku dev (klient sklepu, admin z TOTP), idempotentnie |
| `make rabbitmq-up` / `rabbitmq-down` / `elasticsearch-up` / `elasticsearch-down` | Opcjonalne usługi z profili (nie startują z `make up`), sekcja „Usługi opcjonalne” |
| `make stack-check-dev` | Kontrola infrastruktury dev (Keycloak, Redis, porty) we własnym projekcie `ecommerce-dev-check` |
| `make stack-check-dev-optional` | To samo, z uruchomieniem i kontrolą RabbitMQ i Elasticsearcha (profile `messaging`, `search`) |
| `make install` | Instalacja zależności wszystkich aplikacji (dev; Composer wymaga `make up`) |
| `make pnpm-install` / `make pnpm c="…"` | Zależności JS do wolumenów Dockera / dowolna komenda pnpm w kontenerze |
| `make check` | Wszystkie bramki jakości: obowiązkowe przed commitem |
| `make contract-lint` | Lint kontraktu API `docs/api/openapi.yaml` (Redocly) |
| `make build-prod` | Budowa obrazów produkcyjnych (bez sekretów) |
| `make check-prod` | Kontrola obrazów admina (8081) i sklepu (8082) oraz całej topologii prod z edge (8080/8443), w tym przepływu logowania (`infra/scripts/check-auth-flow.sh`) |
| `make edge-build-prod` / `make keycloak-build-prod` / `make stack-check-prod` | Obraz edge / obraz Keycloaka / kontrola całej topologii prod |
| `make backend-composer c="…"` / `make backend-console c="…"` | Composer i `bin/console` w kontenerze |
| `make backend-migrate` | Migracje bazy danych (nie są uruchamiane automatycznie) |
| `make backend-test` | PHPUnit (suity `unit` i `functional`), najpierw `make backend-db-test` |
| `make backend-stan` | PHPStan, poziom `max` |
| `make backend-arch` | Kontrola architektury DDD/Hexagonal (Deptrac, zasady w [`apps/backend/AGENTS.md`](apps/backend/AGENTS.md)) |
| `make backend-check` | Wszystkie kontrole backendu (część `make check`) |
| `make admin-lint` / `admin-typecheck` / `admin-test` / `admin-build` | ESLint, TypeScript, Vitest, build Vite |
| `make admin-check` | Wszystkie kontrole admina (część `make check`) |
| `make store-lint` / `store-typecheck` / `store-test` / `store-build` | ESLint, TypeScript (z typami tras), Vitest, build Next.js |
| `make store-check` | Wszystkie kontrole sklepu (część `make check`) |

## CI

GitHub Actions (`.github/workflows/ci.yml`) działa na runnerze `ubuntu-24.04`, z tokenem tylko do odczytu, i używa tych samych komend co lokalnie:

- **Quality gates** (automatycznie dla każdego Pull Requesta do `main` i po pushu na `main`): `make bootstrap` (dokładnie jak w „Uruchomienie”), `make check` (lint kontraktu API; backend: composer validate, lint, Deptrac, PHPStan max, PHPUnit z walidacją każdej odpowiedzi API względem kontraktu i zgodnością tras; admin i sklep: ESLint, TypeScript, Vitest, build) i `make stack-check-dev` (Keycloak, Redis sesji i porty dev w osobnym projekcie, sekcja „Kontrola infrastruktury dev”),
- **Production image** (czasowo tylko ręcznie, `workflow_dispatch`): `make check-prod` (obrazy admina i sklepu osobno, potem cała topologia z edge, z jednorazowymi, generowanymi sekretami). Uruchomienie z zakładki Actions albo `gh workflow run ci.yml --ref <gałąź>` wykonuje tylko ten job. Zalecane przed merge zmian wpływających na obrazy produkcyjne: `infra/`, `compose*.yaml`, `Makefile`, Dockerfile, manifesty i lockfile zależności.

Ręczny przebieg i automatyczne Quality gates na `main` są w osobnych grupach `concurrency`, więc nie anulują się nawzajem.

Workflow nie korzysta z żadnych sekretów repozytorium.

## Agentic SDLC (Claude Code)

Funkcjonalności można dostarczać procesem z rozdzielonymi rolami ([ADR-0008](docs/adr/0008-agentic-sdlc-claude-code.md), wersja 1.1: [ADR-0010](docs/adr/0010-agentic-sdlc-performance.md)):

```
/feature-delivery <opis zadania>
```

| Rola | Plik | Model / effort | Zakres |
|---|---|---|---|
| Orchestrator | `.claude/skills/feature-delivery/SKILL.md` (+ `reports.md`) | model głównej sesji | analiza, plan i kryteria akceptacji, bramki zgody, delegowanie, triage uwag, `make check` tylko bez wiarygodnego wyniku Developera, PR, raport wykonania |
| Developer | `.claude/agents/developer.md` | opus / medium | implementacja i testy we własnym worktree, kontrole zmienianych modułów, pełne `make check` na wersji do review, poprawki |
| Code Reviewer | `.claude/agents/code-reviewer.md` | opus / high | review commita (SHA), tylko odczyt, FULL w 1. rundzie, potem DELTA, `APPROVE` / `REQUEST CHANGES` |
| QA Tester | `.claude/agents/qa-tester.md` | sonnet / medium | testy działającej aplikacji na tym samym SHA, FULL w 1. rundzie, potem DELTA (retest i regresja), błędy z krokami odtworzenia |

Przebieg: plan → akceptacja użytkownika → Developer → równolegle Code Review i QA (FULL) na tym samym SHA → poprawki i DELTA (najwyżej 3 rundy, potem eskalacja) → `make check` (bez powtarzania wyniku Developera dla tego samego SHA) → zgoda użytkownika na push i draft PR → CI → raport z `AGENTIC SDLC — EXECUTION REPORT`. Blokują tylko uwagi P0/P1 i niespełnione kryteria akceptacji. Merge wyłącznie na polecenie użytkownika.

Model i effort subagentów ustala ich frontmatter, który ma pierwszeństwo przed `CLAUDE_CODE_SUBAGENT_MODEL`. Nadpisują go tylko zmienne środowiskowe `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` (model) i `CLAUDE_CODE_EFFORT_LEVEL` (effort); ustawienia projektu ich nie ustawiają. Orchestrator nie przekazuje modelu ani effortu przy wywołaniu agenta. Rzeczywisty model i effort działającego subagenta pokazuje `/tasks`.

Zabezpieczenia:

- Każdy agent uruchamia Dockera we własnym projekcie Compose (`fd-<slug>-dev`, `fd-<slug>-qa`), zapisanym w `.env` w katalogu głównym swojego worktree (plik ignorowany przez git), i przed pierwszym poleceniem sprawdza izolację. Projekt `ecommerce` i projekty innych sesji nie są dotykane.
- `make check-prod` nie jest uruchamiany lokalnie (stała nazwa projektu `ecommerce-prod-check`). Job CI `production-image` uruchamia się tylko ręcznie; przy zmianach wpływających na obrazy produkcyjne Orchestrator zaleca go przed merge.
- `.claude/settings.json` wymusza pytanie o zgodę przy push, merge, usuwaniu gałęzi i worktree, destrukcyjnych operacjach git i usuwaniu wolumenów Dockera. To dodatkowa warstwa: skill ma własne bramki zgody.
- Proces niczego nie usuwa. Raport końcowy zawiera komendy sprzątania (worktree, gałęzie, projekty Compose).

W repozytorium są tylko `.claude/settings.json`, `.claude/skills/` i `.claude/agents/`. Pozostałe pliki `.claude/` (np. `settings.local.json`, `worktrees/`) są lokalne. Sesje w aplikacji desktop czytają skills i agentów z głównego checkoutu, a definicje agentów ładują się przy starcie sesji.

### Smoke test

Sprawdzenie bez implementowania funkcjonalności, w sesji Claude Code w katalogu repozytorium:

1. **Konfiguracja:** `/agents` wymienia `developer`, `code-reviewer` i `qa-tester` jako agentów projektu, a `/feature-delivery` jest w menu z podpowiedzią `<opis zadania>`. Podczas pracy subagenta `/tasks` pokazuje jego model i effort (developer opus/medium, code-reviewer opus/high, qa-tester sonnet/medium).
2. **Izolacja Developera:** „Użyj subagenta developer. Podaj tylko wynik `pwd`, `git branch --show-current`, `git rev-parse --git-dir` i `git rev-parse --git-common-dir`. Niczego nie zmieniaj.” Oczekiwane: katalog w `.claude/worktrees/`, różne `git-dir` i `git-common-dir`, worktree usunięty po zakończeniu (brak zmian).
3. **Code Reviewer:** „Użyj subagenta code-reviewer. BASE=`<sha>^`, REVIEW_SHA=`<sha>`, zadanie: <opis zmergowanego PR>.” Oczekiwane: raport z `VERDICT` i uwagami w ustalonym formacie, `git status` bez zmian.
4. **QA:** subagent qa-tester z kryterium istniejącej funkcji, np. „GET /catalog/products/{nieistniejący slug} zwraca 404 w formacie problem+json”, REVIEW_SHA = `origin/main` i profilem `fd-smoke-qa` (porty 28xxx). Oczekiwane: `VERDICT`, własny projekt w `docker compose ls`, kontenery `ecommerce` bez zmian (`docker ps` przed i po). Na commicie bez wpisu `/.env` w `.gitignore` QA celowo zwraca `BLOCKED` i nie uruchamia Dockera.
5. **Cały przebieg:** `/feature-delivery` z małym zadaniem dotyczącym tylko testów. Przejdź przez plan, implementację, review i QA, a przy bramce push odmów. Komendy sprzątania z raportu wykonujesz ręcznie.

## Środowiska: prod i dev

Obraz backendu (`infra/docker/backend/Dockerfile`) budujemy z kontekstu w katalogu głównym, ograniczonego allowlistą `infra/docker/backend/Dockerfile.dockerignore`. Ma osobne etapy:

- **`frankenphp_prod`**: zależności produkcyjne (`--no-dev`) instalowane **podczas budowania obrazu**, kod wbudowany w obraz, `APP_ENV=prod`, proces działa jako użytkownik `app` (uid 1000). Budowany przez `make build-prod`, uruchamiany z `compose.yaml` + `compose.prod.yaml`.
- **`frankenphp_dev`**: uproszczenie tylko dla developmentu. `apps/backend` (kod, `vendor/`, `var/`) jest montowany z hosta (bind mount), zależności instaluje się jawnie przez `make install`. Konfiguracja: `compose.yaml` + `compose.override.yaml` (ładowany automatycznie).

W obu przypadkach aplikacja jest w kontenerze w `/app`. W żadnym środowisku kontener przy starcie nie instaluje zależności ani nie wykonuje migracji.

### Topologia produkcyjna

```
Internet ──80/443──► edge (Caddy, TLS)
                      ├─ STORE_DOMAIN /api/* ──┐
                      ├─ ADMIN_DOMAIN /api/* ──┴─► backend :80 ──► database
                      ├─ STORE_DOMAIN /*      ───► store :3000 ──(sieć sessions)──► redis-session
                      ├─ ADMIN_DOMAIN /*      ───► admin :8080
                      └─ AUTH_DOMAIN  /realms/{store,admin}/*, /resources/*
                                              ───► keycloak :8080 ──► database (baza keycloak)
```

- **edge** (`infra/edge`, obraz `ecommerce-edge`) kończy TLS (automatyczne certyfikaty) i kieruje ruch:
  - `https://STORE_DOMAIN/api/*` i `https://ADMIN_DOMAIN/api/*` → backend, z usuniętym prefiksem `/api` (kontrakt OpenAPI: `servers: /api`),
  - pozostałe ścieżki → sklep albo admin,
  - na `STORE_DOMAIN` ścieżki wewnętrzne `/api/admin/*` i `/auth/backchannel-logout` (także z `;` i w dowolnej wielkości liter) zwracają 404 (API admina jest na `ADMIN_DOMAIN`, a back-channel logout Keycloak woła w sieci: `http://store:3000/auth/backchannel-logout`),
  - `https://AUTH_DOMAIN` → Keycloak, tylko to, czego potrzebuje przeglądarka: `/realms/store/*`, `/realms/admin/*` i `/resources/*`. W tych realmach endpointy serwer-serwer (`protocol/openid-connect/token`, `userinfo`, `revoke`, `token/introspect`, `ext/*`, `auth/device`, `clients-registrations/*`) zwracają 404. Caddy dopasowuje ścieżkę już zdekodowaną i oczyszczoną (bez pustych segmentów i `.`/`..`), więc zapisy typu `//token` czy `x/../token` trafiają w tę samą blokadę; ścieżki ze znakami, których Caddy nie usuwa (`;` parametrów macierzowych, `\`), też zwracają 404. JWKS (`certs`) i discovery są publiczne. Konsola administracyjna (`/admin/*`), realm `master`, `/health`, `/metrics` i `/` zwracają 404,
  - HTTP przekierowuje na HTTPS (308), a nieznane domeny nie są obsługiwane.
- **Sieć wewnętrzna:** backend, sklep, admin, Keycloak, PostgreSQL i Redis nie publikują portów (port zarządzania Keycloaka 9000 także nie). Backend działa za edge na zwykłym HTTP `:80`. Redis sesji jest wyłącznie w sieci `sessions` (`internal`), którą współdzieli tylko ze sklepem.
- **Tożsamość:** issuer tokenów to `https://AUTH_DOMAIN/realms/<realm>`. Usługi w sieci (sklep, backend) pobierają discovery, tokeny i JWKS z `http://keycloak:8080/realms/<realm>` (`KC_HOSTNAME_BACKCHANNEL_DYNAMIC`). Wymiana kodu na tokeny jest więc możliwa tylko z wnętrza sieci. Keycloak ufa nagłówkom `X-Forwarded-*` od edge (`KC_PROXY_HEADERS=xforwarded`). Konsola administracyjna ma adres niepubliczny (`KC_HOSTNAME_ADMIN=http://localhost:8080`), a administracja odbywa się przez `kcadm.sh` w kontenerze:

  ```bash
  docker compose -f compose.yaml -f compose.prod.yaml exec keycloak bash -c \
    'KC_CLI_PASSWORD="$KC_BOOTSTRAP_ADMIN_PASSWORD" /opt/keycloak/bin/kcadm.sh config credentials \
       --config /tmp/kcadm.config --server http://localhost:8080 --realm master --user "$KC_BOOTSTRAP_ADMIN_USERNAME" \
     && /opt/keycloak/bin/kcadm.sh get realms/store --config /tmp/kcadm.config'
  ```

- **Uprawnienia:** kontenery aplikacji działają jako uid 1000, Keycloak jako `keycloak` (uid 1000), Redis jako `redis` (uid 999). Edge, sklep, admin, Keycloak i Redis mają `read_only` (z tmpfs na pliki tymczasowe), `cap_drop: ALL` i `no-new-privileges`.

### Uruchomienie produkcyjne

Obrazy nie zawierają sekretów ani wartości z `.env`. Konfigurację podaje się przy uruchomieniu:

| Zmienna | Wymagana | Opis |
|---|---|---|
| `APP_SECRET` | tak | Co najmniej 32 znaki, np. `openssl rand -hex 32` |
| `POSTGRES_PASSWORD` | tak | Hasło bazy, przekazywane aplikacji jako `DATABASE_PASSWORD` (dowolne znaki, bez kodowania URL) |
| `STORE_DOMAIN` | tak | Domena sklepu, np. `shop.example.com` |
| `ADMIN_DOMAIN` | tak | Domena panelu, np. `admin.example.com` |
| `AUTH_DOMAIN` | tak | Domena Keycloaka (issuer `https://AUTH_DOMAIN/realms/<realm>`), np. `auth.example.com`. Zmiana domeny zmienia `iss` tokenów |
| `KEYCLOAK_DB_PASSWORD` | tak | Hasło roli `keycloak` w PostgreSQL (ustawia je `infra/scripts/keycloak-db.sh`) |
| `KEYCLOAK_ADMIN_USERNAME`, `KEYCLOAK_ADMIN_PASSWORD` | tak | Tymczasowy administrator Keycloaka (realm `master`) tworzony przy pierwszym starcie |
| `STORE_OIDC_CLIENT_SECRET`, `ADMIN_OIDC_CLIENT_SECRET` | tak | Sekrety klientów `store-bff` i `admin-bff`, importowane do realmów i przekazywane sklepowi |
| `RABBITMQ_DEFAULT_USER`, `RABBITMQ_DEFAULT_PASS`, `ELASTIC_PASSWORD` | tylko z profilami `messaging` / `search` | Dane logowania opcjonalnych usług (sekcja „Usługi opcjonalne”). Profil domyślny ich nie wymaga; kontener aktywowanego profilu nie wystartuje bez nich. Usługi nie publikują portów |
| `REDIS_SESSION_PASSWORD`, `REDIS_OPS_PASSWORD` | tak | Hasła użytkowników `store` i `ops` Redisa sesji; bez białych znaków, hasło `store` tylko ze znaków bezpiecznych w URL (trafia do `STORE_REDIS_URL`) |
| `STORE_SESSION_ENC_KEYS` | tak | Klucze szyfrowania sesji sklepu `kid:base64(32 bajty)[,…]`, pierwszy aktywny, np. `k1:$(openssl rand -base64 32)` |
| `OIDC_STORE_ISSUER`, `OIDC_ADMIN_ISSUER` | tak | Dokładny `iss` tokenów realmu `store` / `admin`, np. `https://auth.example.com/realms/store` (`https://AUTH_DOMAIN/realms/<realm>`) |
| `OIDC_STORE_DISCOVERY_URL`, `OIDC_ADMIN_DISCOVERY_URL` | tak | Adres realmu w sieci Compose, zakończony `/`, np. `http://keycloak:8080/realms/store/` |
| `OIDC_STORE_AUDIENCE`, `OIDC_ADMIN_AUDIENCE` | tak | Wymagany `aud`: `store-api` / `admin-api` |
| `OIDC_STORE_CLIENTS`, `OIDC_ADMIN_CLIENTS` | tak | Dozwoleni klienci (`azp`, po przecinku): `store-bff` / `admin-bff` |
| `EDGE_GLOBAL_OPTIONS` | nie | Dodatkowe opcje globalne Caddy, np. `email ops@example.com` dla ACME |
| `STORE_BACKEND_URL` | nie | Adres backendu dla serwera sklepu, domyślnie `http://backend:80`; pusta wartość włącza dane demo (sekcja „Sklep: katalog z API albo dane demo”) |
| `PROD_HTTP_PORT`, `PROD_HTTPS_PORT`, `PROD_HTTP3_PORT` | nie | Porty edge na hoście (domyślnie 80/443) |

Sklep dostaje w produkcji na stałe `STORE_ENVIRONMENT=production`, `STORE_AUTH_MODE=oidc`, `STORE_OIDC_CLIENT_ID=store-bff` i `STORE_OIDC_INTERNAL_URL=http://keycloak:8080/realms/store`, a z powyższych zmiennych `STORE_PUBLIC_URL=https://STORE_DOMAIN`, `STORE_OIDC_ISSUER=https://AUTH_DOMAIN/realms/store`, `STORE_OIDC_CLIENT_SECRET`, `STORE_REDIS_URL` i `STORE_SESSION_ENC_KEYS`.

Kolejność startu: baza, potem rola i baza Keycloaka (`keycloak-db.sh`, idempotentny), potem reszta. Realmy importują się przy pierwszym starcie Keycloaka; istniejące realmy nie są nadpisywane.

```bash
make build-prod
export APP_SECRET=… POSTGRES_PASSWORD=… STORE_DOMAIN=shop.example.com ADMIN_DOMAIN=admin.example.com AUTH_DOMAIN=auth.example.com \
  KEYCLOAK_DB_PASSWORD=… KEYCLOAK_ADMIN_USERNAME=… KEYCLOAK_ADMIN_PASSWORD=… STORE_OIDC_CLIENT_SECRET=… ADMIN_OIDC_CLIENT_SECRET=… \
  REDIS_SESSION_PASSWORD=… REDIS_OPS_PASSWORD=… STORE_SESSION_ENC_KEYS=…
export OIDC_STORE_ISSUER=https://auth.example.com/realms/store OIDC_STORE_DISCOVERY_URL=http://keycloak:8080/realms/store/ \
  OIDC_STORE_AUDIENCE=store-api OIDC_STORE_CLIENTS=store-bff
export OIDC_ADMIN_ISSUER=https://auth.example.com/realms/admin OIDC_ADMIN_DISCOVERY_URL=http://keycloak:8080/realms/admin/ \
  OIDC_ADMIN_AUDIENCE=admin-api OIDC_ADMIN_CLIENTS=admin-bff
docker compose -f compose.yaml -f compose.prod.yaml up --detach --wait database
DOCKER_COMP="docker compose -f compose.yaml -f compose.prod.yaml" ./infra/scripts/keycloak-db.sh
docker compose -f compose.yaml -f compose.prod.yaml up --detach --wait
```

Bez wymaganych zmiennych Compose odmawia startu. Uruchomiony bez Compose obraz backendu sprawdza `APP_SECRET` i `DATABASE_PASSWORD` w entrypoincie i kończy działanie z błędem.

Produkcja działa jako osobny projekt Compose `ecommerce-prod` (własne kontenery, sieć i wolumeny `ecommerce-prod_*`), niezależny od projektu dev `ecommerce`.
Dev zajmuje `127.0.0.1:80/443`, więc gdy oba środowiska działają na jednym hoście, prod musi używać innych portów, np. `PROD_HTTP_PORT=8080 PROD_HTTPS_PORT=8443 PROD_HTTP3_PORT=8443`.

### Niezależne wdrożenia

Każda aplikacja i edge to osobny obraz. Wdrożenie jednej z nich nie restartuje pozostałych, bo edge rozwiązuje adresy usług przy każdym połączeniu:

```bash
make store-build-prod      # albo backend-, admin-, edge-, keycloak-build-prod
docker compose -f compose.yaml -f compose.prod.yaml up --detach --no-deps --wait store
```

Tak samo wdraża się `keycloak` i `redis-session` (Redis po odtworzeniu kontenera zachowuje dane w wolumenie `redis_session_data`). Topologia nie zakłada jednego hosta: edge kieruje ruch po nazwach usług (`backend`, `store`, `admin`, `keycloak`). Przy rozdzieleniu aplikacji na osobne hosty zmienia się tylko adres upstream w `infra/edge/Caddyfile`.

### Migracje w produkcji

Migracje nigdy nie uruchamiają się automatycznie. Po wdrożeniu nowego obrazu wykonaj je jawnie w działającym kontenerze, z tymi samymi zmiennymi środowiskowymi:

```bash
docker compose -f compose.yaml -f compose.prod.yaml exec backend \
  php bin/console doctrine:migrations:migrate --no-interaction --allow-no-migration
```

Zalecenia:

- Przed migracją zrób kopię zapasową bazy, np. `docker compose -f compose.yaml -f compose.prod.yaml exec database pg_dump -U app app > backup.sql`.
- Stan sprawdzisz komendą `doctrine:migrations:status`.
- Pisz migracje zgodne wstecz (najpierw dodanie kolumny, usunięcie w kolejnym wdrożeniu), bo przez chwilę stara wersja aplikacji działa na nowym schemacie.

### Obraz produkcyjny admina

`infra/docker/admin` buduje statyczne pliki (Vite) i serwuje je przez Caddy na Alpine:
- użytkownik uid 1000, port 8080, bez capabilities, z systemem plików tylko do odczytu,
- fallback SPA i długie cache dla hashowanych assetów,
- bez TLS i bez proxy `/api`; to zadanie edge.

Obraz sprawdza osobno `make admin-check-prod` na `127.0.0.1:8081`:
- start z `--read-only` i `--cap-drop ALL`,
- uid inny niż 0,
- `index.html` i fallback SPA,
- nagłówki cache i bezpieczeństwa, `Content-Type`,
- wyłączone API administracyjne Caddy,
- brak źródeł, source map i Node.js w obrazie.

### Obraz produkcyjny sklepu

`infra/docker/store` buduje serwer standalone Next.js i uruchamia go jako użytkownik `node` (uid 1000) na porcie 3000:
- bez menedżerów pakietów, źródeł i zależności dev,
- bez capabilities, z read-only root filesystem i tmpfs na `.next/cache`,
- z wyłączoną telemetrią.

Obraz sprawdza osobno `make store-check-prod` na `127.0.0.1:8082` (bez backendu i bez `STORE_BACKEND_URL`):
- HTML renderowany na serwerze, renderowanie na żądanie (`no-store`),
- dane demo z komunikatem demo i `noindex, nofollow`, `/healthz` (200, `no-store`),
- 404 dla nieznanych ścieżek, cache assetów,
- nagłówki bezpieczeństwa i brak `X-Powered-By`,
- uid,
- brak źródeł i przeglądarkowych source map, brak menedżerów pakietów.

### Kontrola produkcji

`make check-prod` uruchamia kolejno:
- `make admin-check-prod` i `make store-check-prod` (opisane wyżej),
- `make stack-check-prod`, który uruchamia całą topologię (edge, backend, sklep, admin, Keycloak, Redis sesji, PostgreSQL) w tymczasowym projekcie `ecommerce-prod-check`, z edge na portach 8080/8443 (zmiana: `CHECK_PROD_HTTP_PORT`, `CHECK_PROD_HTTPS_PORT`), obok działającego dev; przed zatrzymaniem stosu woła `infra/scripts/check-auth-flow.sh` przez edge (`https://store.localhost`).

Ten sam skrypt sprawdza logowanie w działającym dev: `make up`, `make keycloak-dev-seed`, potem `STORE_URL=http://localhost:3000 CHECK_AUTH_PASSWORD=… CHECK_AUTH_KEYCLOAK_COMPOSE="docker compose" infra/scripts/check-auth-flow.sh` (bez `CHECK_AUTH_KEYCLOAK_COMPOSE` pomija krok back-channel logout).

Kontrola stosu używa testowych domen `store.localhost`, `admin.localhost` i `auth.localhost` z lokalnym CA Caddy. Dane trzyma w tmpfs, więc nie zostawia wolumenów, a sekrety generuje na czas testu i nigdzie ich nie zapisuje. Sprawdza:

- **konfigurację:** odmowę startu bez `APP_SECRET`, `POSTGRES_PASSWORD`, `STORE_DOMAIN` i `ADMIN_DOMAIN` oraz bez każdej ze zmiennych tożsamości, sesji i `OIDC_*` (tabela wyżej), domyślny profil bez usług opcjonalnych, brak sekretów i hostname w obrazie Keycloaka,
- **routing:** sklep i admin po domenie, fallback SPA, `/api/*` → backend bez prefiksu na obu domenach, ścieżki spoza `/api` zostają przy frontendzie, przekierowanie HTTP → HTTPS (308) na publiczny port, brak obsługi nieznanych domen,
- **edge:** nagłówki (HSTS, `nosniff`, brak `Server`, `Via` i `X-Powered-By`),
- **ekspozycję:** porty publikuje tylko edge,
- **uprawnienia:** uid inny niż 0 we wszystkich aplikacjach, w Keycloaku i Redisie, zero efektywnych capabilities w edge, sklepie, adminie, Keycloaku i Redisie, `read_only`, `cap_drop: ALL` i `no-new-privileges` Keycloaka i Redisa, brak portów Keycloaka (z 9000) i Redisa, sieć `sessions` tylko dla sklepu i Redisa,
- **Redis sesji:** `NOAUTH` bez hasła, `STORE_REDIS_URL` sklepu loguje się jako `store`, skrypt Lua z `HSET`, `HINCRBY`, `EXISTS` i `HGET` na kluczu `store:*`, `NOPERM` poza `store:*` i dla `FLUSHALL`,
- **Keycloak przez edge:** discovery obu realmów z issuerem `https://auth.localhost/realms/<realm>`, publiczny JWKS, discovery w sieci z endpointem tokenów na `http://keycloak:8080`; 404 z edge (pusta odpowiedź) dla `/`, konsoli administracyjnej, realmu `master`, `/health`, `/metrics`, publicznych endpointów serwer-serwer i ich wariantów (`//`, `..`, kodowanie, `;`, `\`, wielkie litery), a na domenie sklepu dla `/api/admin/*` i `/auth/backchannel-logout` (GET i POST, z wariantami `;`, `//` i wielkimi literami); z tokenem dostępowym `GET /api/me` przez edge zwraca 200; przekierowanie HTTP → HTTPS i HSTS,
- **logowanie:** Authorization Code z PKCE S256 dla `store-bff` jak w przeglądarce (curl z ciasteczkami, użytkownik testowy tworzony przez `kcadm`): formularz logowania na `auth.localhost`, przekierowanie z kodem na `https://store.localhost/auth/callback`, wymiana kodu przez publiczny endpoint tokenów zwraca 404, a przez wewnętrzny `http://keycloak:8080/...` daje token z `iss` `https://auth.localhost/realms/store`, `azp` `store-bff` i `aud` `store-api`, a z tym tokenem `GET https://store.localhost/api/me` przez edge zwraca 200 (backend waliduje token z Keycloaka); publiczny `userinfo` zwraca 404 nawet z ważnym tokenem; w realmie `admin` grant hasłem przez `admin-cli` (z pominięciem OTP) jest odrzucany,
- **backend za edge:** `/health` przy haśle bazy ze znakami specjalnymi, 401 (nigdy 500) z `/api/me` i `/api/admin/me` bez tokenu i z odrzuconym tokenem, migracje (zaraz po starcie, przed sprawdzaniem stron), kod tylko do odczytu, 503 przy zatrzymanej bazie i powrót do 200; po restarcie bazy (tmpfs, pusty klaster) ponownie `keycloak-db.sh` i restart Keycloaka; brak sekretów, haseł testowych i tokenów w logach wszystkich kontenerów,
- **sklep z API:** pusty katalog z backendu (strona główna, lista, 404) bez oznaczeń demo i bez `robots`; przy zatrzymanym backendzie kontener sklepu zostaje zdrowy, `/healthz` zwraca 200, a strony 500,
- **niezależne wdrożenia:** odtworzenie samego sklepu, admina, backendu, edge, Keycloaka i Redisa zostawia pozostałe kontenery nietknięte, a wszystkie trasy, discovery Keycloaka przez edge i logowanie sklepu do Redisa dalej działają.
