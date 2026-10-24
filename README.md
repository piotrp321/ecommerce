# E-commerce backend

Edukacyjny backend e-commerce w PHP 8.5 i Symfony 8.1 (docelowo 8.2), rozwijany w kierunku DDD i architektury heksagonalnej.
Projekt służy do nauki Agentic Software Development.

- Specyfikacja biznesowa: [docs/specs/01-placing-order.md](docs/specs/01-placing-order.md)
- Roadmapa: [docs/roadmap.md](docs/roadmap.md)

## Wymagania

- Docker z Docker Compose v2+
- GNU Make

PHP i Composer na hoście nie są potrzebne: wszystkie komendy działają w kontenerze `php`.

## Uruchomienie

```bash
make build
make up
make install
make migrate
```

Aplikacja działa pod adresem https://localhost (certyfikat generowany lokalnie przez Caddy).
W dev wszystkie porty (80, 443, 5432) są dostępne tylko z `127.0.0.1`.
Stan aplikacji i bazy: https://localhost/health

```json
{"status":"ok","database":"ok"}
```

## Komendy

`make help` wyświetla pełną listę.

| Komenda | Opis |
|---|---|
| `make build` / `make up` / `make down` | Budowa obrazów dev, start, zatrzymanie (wolumeny zostają) |
| `make build-prod` | Budowa obrazu produkcyjnego (bez sekretów) |
| `make install` | Instalacja zależności (dev) |
| `make composer c="…"` / `make console c="…"` | Composer i `bin/console` w kontenerze |
| `make migrate` | Migracje bazy danych (nie są uruchamiane automatycznie) |
| `make db-test` | Przygotowanie bazy testowej `app_test` (idempotentne) |
| `make test` | PHPUnit (suity `unit` i `functional`), najpierw `make db-test` |
| `make stan` | PHPStan, poziom `max` |
| `make check` | Wszystkie bramki jakości: obowiązkowe przed commitem |

## Środowiska: prod i dev

Obraz (`Dockerfile`) ma osobne etapy, konfiguracja serwera i PHP jest w `docker/frankenphp/`:

- **`frankenphp_prod`**: zależności produkcyjne (`--no-dev`) instalowane **podczas budowania obrazu**, kod wbudowany w obraz, `APP_ENV=prod`, proces działa jako użytkownik `app` (uid 1000). Budowany przez `make build-prod`, uruchamiany z `compose.yaml` + `compose.prod.yaml`.
- **`frankenphp_dev`**: uproszczenie tylko dla developmentu. Kod, `vendor/` i `var/` są montowane z hosta (bind mount), zależności instaluje się jawnie przez `make install`. Konfiguracja: `compose.yaml` + `compose.override.yaml` (ładowany automatycznie).

W żadnym środowisku kontener przy starcie nie instaluje zależności ani nie wykonuje migracji.

### Uruchomienie produkcyjne

Obraz nie zawiera sekretów ani wartości z `.env`. Konfigurację podaje się przy uruchomieniu:

| Zmienna | Wymagana | Opis |
|---|---|---|
| `APP_SECRET` | tak | Co najmniej 32 znaki, np. `openssl rand -hex 32` |
| `POSTGRES_PASSWORD` | tak | Hasło bazy, z niego składany jest `DATABASE_URL` |
| `SERVER_NAME` | nie | Domena serwera (domyślnie `localhost`) |

```bash
make build-prod
APP_SECRET=… POSTGRES_PASSWORD=… docker compose -f compose.yaml -f compose.prod.yaml up --detach --wait
```

Bez wymaganych zmiennych Compose odmawia startu. Uruchomiony bez Compose obraz sprawdza `APP_SECRET` i `DATABASE_URL` w entrypoincie i kończy działanie z błędem.
