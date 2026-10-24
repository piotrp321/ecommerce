# CLAUDE.md

Edukacyjny backend e-commerce: PHP 8.5, Symfony 8.1.* (docelowo 8.2.*), PostgreSQL 18, FrankenPHP w Dockerze.
Docelowo DDD i architektura heksagonalna. Projekt służy do nauki Agentic Software Development.

Ogólne konwencje Symfony opisuje @AGENTS.md (z recepty skeletonu). Ten plik ma pierwszeństwo, jeśli są sprzeczne.

## Źródła prawdy

- Wymagania biznesowe: `docs/specs/01-placing-order.md`. Nie zmieniaj ustalonych reguł bez decyzji użytkownika.
- Zakres etapów: `docs/roadmap.md`. Realizuj wyłącznie bieżący milestone.

## Komendy

Wszystko uruchamiaj w kontenerze przez `make` (nie `symfony serve`, nie PHP z hosta):

- `make up`, `make install`: start środowiska dev i instalacja zależności
- `make composer c="…"`, `make console c="…"`: Composer i `bin/console`
- `make migrate`: migracje, wyłącznie tą komendą, nigdy automatycznie
- `make db-test`: baza testowa
- `make test`, `make stan`: PHPUnit, PHPStan
- `make check`: **obowiązkowa bramka przed każdym commitem**

## Zasady pracy

- Małe commity, każdy z działającym stanem i zielonym `make check`. Format: `type: opis` (`feat`, `fix`, `chore`, `docs`, `test`, `refactor`).
- Najpierw test, potem implementacja. Kontroler testuj żądaniem HTTP (`WebTestCase`).
- PHPStan na poziomie `max`, bez baseline'u i bez `@phpstan-ignore` bez uzasadnienia.
- `declare(strict_types=1);` w każdym nowym pliku PHP.
- Nie rozszerzaj zakresu ponad bieżący milestone. Pomysły zapisuj jako propozycje dla użytkownika.
- Gdy wymaganie jest niejasne, zapytaj zamiast zgadywać.

## Bezpieczeństwo operacji

Bez wyraźnej zgody użytkownika **nie wykonuj**:

- operacji destrukcyjnych: `docker compose down -v`, `docker volume rm`, `doctrine:database:drop`, `doctrine:schema:drop`, `git reset --hard`, `git clean`, usuwania gałęzi,
- `git push` (w tym force push) ani żadnej publikacji projektu.

## Struktura

- `src/Shared/Infrastructure/Http/`: wspólne elementy HTTP (np. `/health`)
- `tests/Unit/`, `tests/Functional/`: struktura katalogów odzwierciedla `src/`
- Mapowania Doctrine są rejestrowane per bounded context od Milestone 2 (`config/packages/doctrine.yaml`).
