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
| `infra/scripts` | `check-prod-backend.sh` (z tymczasowym plikiem Compose), `check-prod-admin.sh`, `check-prod-store.sh` |
| `docs` | Specyfikacje, roadmapa, ADR |
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
| `make build-prod` | Budowa obrazów produkcyjnych (bez sekretów) |
| `make check-prod` | Kontrola obrazów produkcyjnych (backend 8080/8443 w tymczasowym projekcie, admin 8081, sklep 8082) |
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

GitHub Actions (`.github/workflows/ci.yml`) uruchamia się dla każdego Pull Requesta do `main` i po pushu na `main`, na runnerze `ubuntu-24.04`, z tokenem tylko do odczytu. Używa tych samych komend co lokalnie:

- **Quality gates:** `make bootstrap` (dokładnie jak w „Uruchomienie”) i `make check` (backend: composer validate, lint, Deptrac, PHPStan max, PHPUnit; admin i sklep: ESLint, TypeScript, Vitest, build),
- **Production images:** `make check-prod` (backend z jednorazowymi, generowanymi sekretami; admin i sklep read-only, bez capabilities).

Workflow nie korzysta z żadnych sekretów repozytorium.

## Środowiska: prod i dev

Obraz backendu (`infra/docker/backend/Dockerfile`) budujemy z kontekstu w katalogu głównym, ograniczonego allowlistą `infra/docker/backend/Dockerfile.dockerignore`. Ma osobne etapy:

- **`frankenphp_prod`**: zależności produkcyjne (`--no-dev`) instalowane **podczas budowania obrazu**, kod wbudowany w obraz, `APP_ENV=prod`, proces działa jako użytkownik `app` (uid 1000). Budowany przez `make build-prod`, uruchamiany z `compose.yaml` + `compose.prod.yaml`.
- **`frankenphp_dev`**: uproszczenie tylko dla developmentu. `apps/backend` (kod, `vendor/`, `var/`) jest montowany z hosta (bind mount), zależności instaluje się jawnie przez `make install`. Konfiguracja: `compose.yaml` + `compose.override.yaml` (ładowany automatycznie).

W obu przypadkach aplikacja jest w kontenerze w `/app`. W żadnym środowisku kontener przy starcie nie instaluje zależności ani nie wykonuje migracji.

### Uruchomienie produkcyjne

Obraz nie zawiera sekretów ani wartości z `.env`. Konfigurację podaje się przy uruchomieniu:

| Zmienna | Wymagana | Opis |
|---|---|---|
| `APP_SECRET` | tak | Co najmniej 32 znaki, np. `openssl rand -hex 32` |
| `POSTGRES_PASSWORD` | tak | Hasło bazy, przekazywane aplikacji jako `DATABASE_PASSWORD` (dowolne znaki, bez kodowania URL) |
| `SERVER_NAME` | nie | Domena serwera (domyślnie `localhost`) |
| `PROD_HTTP_PORT`, `PROD_HTTPS_PORT`, `PROD_HTTP3_PORT` | nie | Porty publikowane na hoście (domyślnie 80/443) |

```bash
make build-prod
export APP_SECRET=… POSTGRES_PASSWORD=…
docker compose -f compose.yaml -f compose.prod.yaml up --detach --wait
```

Bez wymaganych zmiennych Compose odmawia startu. Uruchomiony bez Compose obraz sprawdza `APP_SECRET` i `DATABASE_PASSWORD` w entrypoincie i kończy działanie z błędem.

Produkcja działa jako osobny projekt Compose `ecommerce-prod` (własne kontenery, sieć i wolumeny `ecommerce-prod_*`), niezależny od projektu dev `ecommerce`.
Dev zajmuje `127.0.0.1:80/443`, więc gdy oba środowiska działają na jednym hoście, prod musi używać innych portów, np. `PROD_HTTP_PORT=8080 PROD_HTTPS_PORT=8443 PROD_HTTP3_PORT=8443`.

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
- bez TLS i bez proxy `/api`; te obsłuży centralny edge w etapie 4.

Do tego czasu admin nie jest częścią `compose.prod.yaml`. Obraz sprawdza `make admin-check-prod` na `127.0.0.1:8081`:
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

Do etapu 4 sklep nie jest częścią `compose.prod.yaml`. Obraz sprawdza `make store-check-prod` na `127.0.0.1:8082`:
- HTML renderowany na serwerze, renderowanie na żądanie (`no-store`),
- 404 dla nieznanych ścieżek, cache assetów,
- nagłówki bezpieczeństwa i brak `X-Powered-By`,
- uid,
- brak źródeł i przeglądarkowych source map, brak menedżerów pakietów.

### Kontrola obrazów produkcyjnych

`make check-prod` uruchamia `make admin-check-prod` i `make store-check-prod` (opisane wyżej). Obraz backendu buduje i uruchamia w tymczasowym projekcie `ecommerce-prod-check` na portach 8080/8443 (zmiana: `CHECK_PROD_HTTP_PORT`, `CHECK_PROD_HTTPS_PORT`), obok działającego dev.
Dane są w tmpfs, więc kontrola nie zostawia wolumenów. Sekrety generuje na czas testu i nigdzie ich nie zapisuje. Sprawdza:

- odmowę startu bez `APP_SECRET` i `POSTGRES_PASSWORD`,
- `/health` przy haśle bazy ze znakami specjalnymi,
- migracje,
- użytkownika uid 1000 i kod tylko do odczytu,
- 503 przy zatrzymanej bazie i powrót do 200,
- brak hasła w logach.
