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
make db-test
```

Aplikacja działa pod adresem https://localhost (certyfikat generowany lokalnie przez Caddy).
Stan aplikacji i bazy: https://localhost/health

```json
{"status":"ok","database":"ok"}
```

## Komendy

`make help` wyświetla pełną listę.

| Komenda | Opis |
|---|---|
| `make build` / `make up` / `make down` | Budowa obrazów dev, start, zatrzymanie (wolumeny zostają) |
| `make build-prod` | Budowa obrazu produkcyjnego |
| `make install` | Instalacja zależności (dev) |
| `make composer c="…"` / `make console c="…"` | Composer i `bin/console` w kontenerze |
| `make migrate` | Migracje bazy danych (nie są uruchamiane automatycznie) |
| `make db-test` | Utworzenie bazy testowej (`app_test`) |
| `make test` | PHPUnit (suity `unit` i `functional`) |
| `make stan` | PHPStan, poziom `max` |
| `make check` | Wszystkie bramki jakości: obowiązkowe przed commitem |

## Środowiska: prod i dev

Obraz (`Dockerfile`) ma osobne etapy:

- **`frankenphp_prod`**: zależności produkcyjne (`--no-dev`) instalowane **podczas budowania obrazu**, kod wbudowany w obraz, `APP_ENV=prod`. Konfiguracja: `compose.yaml`, budowany przez `make build-prod`.
- **`frankenphp_dev`**: uproszczenie tylko dla developmentu. Kod i `vendor/` są montowane z hosta (bind mount), zależności instaluje się jawnie przez `make install`. Konfiguracja: `compose.override.yaml`, ładowany automatycznie przez `docker compose`.

W żadnym środowisku kontener przy starcie nie instaluje zależności ani nie wykonuje migracji.
