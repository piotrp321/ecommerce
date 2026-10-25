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
| `infra/docker/backend` | Obraz backendu (FrankenPHP): Dockerfile, Caddyfile, PHP ini, entrypoint prod |
| `infra/scripts` | `check-prod.sh` i jego tymczasowy plik Compose |
| `docs` | Specyfikacje, roadmapa, ADR |
| katalog główny | `compose*.yaml`, `Makefile`, `AGENTS.md` |

Aplikacje frontendowe (`apps/store`, `apps/admin`) i SDK (`packages/sdk`) powstaną w kolejnych etapach ([roadmapa](docs/roadmap.md)).

## Wymagania

- Docker z Docker Compose v2.24+
- GNU Make

PHP i Composer na hoście nie są potrzebne: wszystkie komendy działają w kontenerze `backend`.

## Uruchomienie

```bash
make bootstrap
```

`make bootstrap` buduje obrazy dev, uruchamia PostgreSQL i backend, instaluje zależności i wykonuje migracje.

Backend działa pod adresem https://localhost (certyfikat generowany lokalnie przez Caddy).
W dev wszystkie porty (80, 443, 5432) są dostępne tylko z `127.0.0.1`.
Stan aplikacji i bazy: https://localhost/health

```json
{"status":"ok","database":"ok"}
```

### Przejście z układu sprzed monorepo

Po aktualizacji z wersji, w której Symfony było w katalogu głównym:

1. Zatrzymaj stare kontenery: `make down`. `make up` i tak usuwa osierocony kontener `php`, ale wolumeny zawsze zostają.
2. Pliki ignorowane przez git nie przenoszą się same. Przenieś je do `apps/backend/`: `.env.local` (jeśli masz), a opcjonalnie też `vendor/` i `var/`. Możesz je też usunąć z katalogu głównego i wykonać `make install`.
3. `make bootstrap`. Lokalna baza zostaje, bo nazwa projektu `ecommerce` i wolumen `ecommerce_database_data` się nie zmieniają.

## Komendy

`make help` wyświetla pełną listę. Konwencja: cele zbiorcze bez prefiksu, cele aplikacji z jej prefiksem.

| Komenda | Opis |
|---|---|
| `make bootstrap` | Środowisko dev od zera: build, up, install, migracje |
| `make build` / `make up` / `make down` | Budowa obrazów dev, start, zatrzymanie (wolumeny zostają) |
| `make install` | Instalacja zależności wszystkich aplikacji (dev) |
| `make check` | Wszystkie bramki jakości: obowiązkowe przed commitem |
| `make build-prod` | Budowa obrazów produkcyjnych (bez sekretów) |
| `make check-prod` | Kontrola obrazów produkcyjnych w tymczasowym projekcie (porty 8080/8443) |
| `make backend-composer c="…"` / `make backend-console c="…"` | Composer i `bin/console` w kontenerze |
| `make backend-migrate` | Migracje bazy danych (nie są uruchamiane automatycznie) |
| `make backend-test` | PHPUnit (suity `unit` i `functional`), najpierw `make backend-db-test` |
| `make backend-stan` | PHPStan, poziom `max` |
| `make backend-arch` | Kontrola architektury DDD/Hexagonal (Deptrac, zasady w [`apps/backend/AGENTS.md`](apps/backend/AGENTS.md)) |
| `make backend-check` | Wszystkie kontrole backendu (część `make check`) |

## CI

GitHub Actions (`.github/workflows/ci.yml`) uruchamia się dla każdego Pull Requesta do `main` i po pushu na `main`, na runnerze `ubuntu-24.04`, z tokenem tylko do odczytu. Używa tych samych komend co lokalnie:

- **Quality gates:** `make bootstrap` (dokładnie jak w „Uruchomienie”) i `make check` (composer validate, lint, Deptrac, PHPStan max, PHPUnit z przygotowaniem bazy testowej),
- **Production images:** `make check-prod` (obrazy prod z jednorazowymi, generowanymi sekretami).

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

### Kontrola obrazów produkcyjnych

`make check-prod` buduje obraz prod i uruchamia go w tymczasowym projekcie `ecommerce-prod-check` na portach 8080/8443 (zmiana: `CHECK_PROD_HTTP_PORT`, `CHECK_PROD_HTTPS_PORT`), obok działającego dev.
Dane są w tmpfs, więc kontrola nie zostawia wolumenów. Sekrety generuje na czas testu i nigdzie ich nie zapisuje. Sprawdza:

- odmowę startu bez `APP_SECRET` i `POSTGRES_PASSWORD`,
- `/health` przy haśle bazy ze znakami specjalnymi,
- migracje,
- użytkownika uid 1000 i kod tylko do odczytu,
- 503 przy zatrzymanej bazie i powrót do 200,
- brak hasła w logach.
