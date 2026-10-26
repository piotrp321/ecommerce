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
| `infra/edge` | Edge proxy (Caddy): jedyny publiczny punkt wejścia produkcji, TLS i routing |
| `infra/scripts` | `check-prod-stack.sh` (cała topologia, z tymczasowym plikiem Compose), `check-prod-admin.sh`, `check-prod-store.sh` |
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

`make bootstrap` buduje obrazy dev, instaluje zależności JS (do wolumenów Dockera), uruchamia PostgreSQL, backend, admina i sklep, instaluje zależności Composera i wykonuje migracje.

| Aplikacja | Adres |
|---|---|
| Backend | https://localhost (certyfikat generowany lokalnie przez Caddy), stan: https://localhost/health |
| Admin (Vite, HMR) | http://localhost:5173, API przez proxy: http://localhost:5173/api/health |
| Sklep (Next.js, SSR, HMR) | http://localhost:3000 |

W dev wszystkie porty (80, 443, 3000, 5173, 5432) są dostępne tylko z `127.0.0.1`. Odpowiedź `/health`:

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
| `make build` / `make up` / `make down` | Budowa obrazów dev, start, zatrzymanie (wolumeny zostają) |
| `make install` | Instalacja zależności wszystkich aplikacji (dev; Composer wymaga `make up`) |
| `make pnpm-install` / `make pnpm c="…"` | Zależności JS do wolumenów Dockera / dowolna komenda pnpm w kontenerze |
| `make check` | Wszystkie bramki jakości: obowiązkowe przed commitem |
| `make contract-lint` | Lint kontraktu API `docs/api/openapi.yaml` (Redocly) |
| `make build-prod` | Budowa obrazów produkcyjnych (bez sekretów) |
| `make check-prod` | Kontrola obrazów admina (8081) i sklepu (8082) oraz całej topologii prod z edge (8080/8443) |
| `make edge-build-prod` / `make stack-check-prod` | Obraz edge / kontrola całej topologii prod |
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

- **Quality gates** (automatycznie dla każdego Pull Requesta do `main` i po pushu na `main`): `make bootstrap` (dokładnie jak w „Uruchomienie”) i `make check` (lint kontraktu API; backend: composer validate, lint, Deptrac, PHPStan max, PHPUnit z walidacją każdej odpowiedzi API względem kontraktu i zgodnością tras; admin i sklep: ESLint, TypeScript, Vitest, build),
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
                      ├─ STORE_DOMAIN /*      ───► store :3000
                      └─ ADMIN_DOMAIN /*      ───► admin :8080
```

- **edge** (`infra/edge`, obraz `ecommerce-edge`) kończy TLS (automatyczne certyfikaty) i kieruje ruch:
  - `https://STORE_DOMAIN/api/*` i `https://ADMIN_DOMAIN/api/*` → backend, z usuniętym prefiksem `/api` (kontrakt OpenAPI: `servers: /api`),
  - pozostałe ścieżki → sklep albo admin,
  - HTTP przekierowuje na HTTPS (308), a nieznane domeny nie są obsługiwane.
- **Sieć wewnętrzna:** backend, sklep, admin i PostgreSQL nie publikują portów. Backend działa za edge na zwykłym HTTP `:80`.
- **Uprawnienia:** wszystkie kontenery aplikacji działają jako uid 1000. Edge, sklep i admin mają `read_only`, `cap_drop: ALL` i `no-new-privileges`.

### Uruchomienie produkcyjne

Obrazy nie zawierają sekretów ani wartości z `.env`. Konfigurację podaje się przy uruchomieniu:

| Zmienna | Wymagana | Opis |
|---|---|---|
| `APP_SECRET` | tak | Co najmniej 32 znaki, np. `openssl rand -hex 32` |
| `POSTGRES_PASSWORD` | tak | Hasło bazy, przekazywane aplikacji jako `DATABASE_PASSWORD` (dowolne znaki, bez kodowania URL) |
| `STORE_DOMAIN` | tak | Domena sklepu, np. `shop.example.com` |
| `ADMIN_DOMAIN` | tak | Domena panelu, np. `admin.example.com` |
| `OIDC_STORE_ISSUER`, `OIDC_ADMIN_ISSUER` | tak | Dokładny `iss` tokenów realmu `store` / `admin`, np. `https://auth.example.com/realms/store` |
| `OIDC_STORE_DISCOVERY_URL`, `OIDC_ADMIN_DISCOVERY_URL` | tak | Adres realmu w sieci Compose, zakończony `/`, np. `http://keycloak:8080/realms/store/` |
| `OIDC_STORE_AUDIENCE`, `OIDC_ADMIN_AUDIENCE` | tak | Wymagany `aud`: `store-api` / `admin-api` |
| `OIDC_STORE_CLIENTS`, `OIDC_ADMIN_CLIENTS` | tak | Dozwoleni klienci (`azp`, po przecinku): `store-bff` / `admin-bff` |
| `EDGE_GLOBAL_OPTIONS` | nie | Dodatkowe opcje globalne Caddy, np. `email ops@example.com` dla ACME |
| `STORE_BACKEND_URL` | nie | Adres backendu dla serwera sklepu, domyślnie `http://backend:80`; pusta wartość włącza dane demo (sekcja „Sklep: katalog z API albo dane demo”) |
| `PROD_HTTP_PORT`, `PROD_HTTPS_PORT`, `PROD_HTTP3_PORT` | nie | Porty edge na hoście (domyślnie 80/443) |

```bash
make build-prod
export APP_SECRET=… POSTGRES_PASSWORD=… STORE_DOMAIN=shop.example.com ADMIN_DOMAIN=admin.example.com
export OIDC_STORE_ISSUER=… OIDC_STORE_DISCOVERY_URL=… OIDC_STORE_AUDIENCE=store-api OIDC_STORE_CLIENTS=store-bff
export OIDC_ADMIN_ISSUER=… OIDC_ADMIN_DISCOVERY_URL=… OIDC_ADMIN_AUDIENCE=admin-api OIDC_ADMIN_CLIENTS=admin-bff
docker compose -f compose.yaml -f compose.prod.yaml up --detach --wait
```

Bez wymaganych zmiennych Compose odmawia startu. Uruchomiony bez Compose obraz backendu sprawdza `APP_SECRET` i `DATABASE_PASSWORD` w entrypoincie i kończy działanie z błędem.

Produkcja działa jako osobny projekt Compose `ecommerce-prod` (własne kontenery, sieć i wolumeny `ecommerce-prod_*`), niezależny od projektu dev `ecommerce`.
Dev zajmuje `127.0.0.1:80/443`, więc gdy oba środowiska działają na jednym hoście, prod musi używać innych portów, np. `PROD_HTTP_PORT=8080 PROD_HTTPS_PORT=8443 PROD_HTTP3_PORT=8443`.

### Niezależne wdrożenia

Każda aplikacja i edge to osobny obraz. Wdrożenie jednej z nich nie restartuje pozostałych, bo edge rozwiązuje adresy usług przy każdym połączeniu:

```bash
make store-build-prod      # albo backend-, admin-, edge-build-prod
docker compose -f compose.yaml -f compose.prod.yaml up --detach --no-deps --wait store
```

Topologia nie zakłada jednego hosta: edge kieruje ruch po nazwach usług (`backend`, `store`, `admin`). Przy rozdzieleniu aplikacji na osobne hosty zmienia się tylko adres upstream w `infra/edge/Caddyfile`.

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
- `make stack-check-prod`, który uruchamia całą topologię (edge, backend, sklep, admin, PostgreSQL) w tymczasowym projekcie `ecommerce-prod-check`, z edge na portach 8080/8443 (zmiana: `CHECK_PROD_HTTP_PORT`, `CHECK_PROD_HTTPS_PORT`), obok działającego dev.

Kontrola stosu używa testowych domen `store.localhost` i `admin.localhost` z lokalnym CA Caddy. Dane trzyma w tmpfs, więc nie zostawia wolumenów, a sekrety generuje na czas testu i nigdzie ich nie zapisuje. Sprawdza:

- **konfigurację:** odmowę startu bez `APP_SECRET`, `POSTGRES_PASSWORD`, `STORE_DOMAIN`, `ADMIN_DOMAIN` i każdej ze zmiennych `OIDC_*`,
- **routing:** sklep i admin po domenie, fallback SPA, `/api/*` → backend bez prefiksu na obu domenach, ścieżki spoza `/api` zostają przy frontendzie, przekierowanie HTTP → HTTPS (308) na publiczny port, brak obsługi nieznanych domen,
- **edge:** nagłówki (HSTS, `nosniff`, brak `Server`, `Via` i `X-Powered-By`),
- **ekspozycję:** porty publikuje tylko edge,
- **uprawnienia:** uid inny niż 0 we wszystkich aplikacjach, zero efektywnych capabilities w edge, sklepie i adminie,
- **backend za edge:** `/health` przy haśle bazy ze znakami specjalnymi, 401 (nigdy 500) z `/api/me` i `/api/admin/me` bez tokenu i z odrzuconym tokenem, migracje (zaraz po starcie, przed sprawdzaniem stron), kod tylko do odczytu, 503 przy zatrzymanej bazie i powrót do 200, brak hasła w logach,
- **sklep z API:** pusty katalog z backendu (strona główna, lista, 404) bez oznaczeń demo i bez `robots`; przy zatrzymanym backendzie kontener sklepu zostaje zdrowy, `/healthz` zwraca 200, a strony 500,
- **niezależne wdrożenia:** odtworzenie samego sklepu, admina, backendu i edge zostawia pozostałe kontenery nietknięte, a wszystkie trasy dalej działają.
