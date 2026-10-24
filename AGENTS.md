# AGENTS.md

Jedyne źródło instrukcji dla agentów AI pracujących w tym repozytorium (Claude Code, Codex i inne).
`CLAUDE.md` tylko importuje ten plik. Zmieniaj instrukcje tutaj, nie w kopiach.

Edukacyjny backend e-commerce: PHP 8.5, Symfony 8.1.* (docelowo 8.2.*), PostgreSQL 18, FrankenPHP w Dockerze.
Docelowo DDD i architektura heksagonalna. Projekt służy do nauki Agentic Software Development.

## Źródła prawdy

- Wymagania biznesowe: `docs/specs/01-placing-order.md`. Nie zmieniaj ustalonych reguł bez decyzji użytkownika.
- Zakres etapów: `docs/roadmap.md`. Realizuj wyłącznie bieżący milestone.
- Wersje i zainstalowane pakiety: `composer.json`, `symfony.lock`. Nie zakładaj, że pakiet jest zainstalowany (np. Twig, Messenger, maker-bundle), dopóki tam go nie ma.

## Komendy

Wszystko uruchamiaj w kontenerze przez `make`. Nie używaj `symfony serve`, `symfony console` ani PHP/Composera z hosta.

- `make up`, `make install`: start środowiska dev i instalacja zależności
- `make composer c="…"`, `make console c="…"`: Composer i `bin/console`
- `make migrate`: migracje, wyłącznie tą komendą, nigdy automatycznie przy starcie kontenera
- `make test`: PHPUnit (sam przygotowuje bazę testową przez `make db-test`)
- `make stan`: PHPStan
- `make check`: **obowiązkowa bramka przed każdym commitem**
- `make build-prod`: obraz produkcyjny; sekrety podaje się dopiero przy uruchomieniu (`compose.prod.yaml`)

Gdy coś nie działa, najpierw czytaj `var/log/`, logi kontenera (`make logs`) i `bin/console debug:*`, zanim zmienisz kod.

## Zasady pracy

- Małe commity, każdy z działającym stanem i zielonym `make check`. Format: `type: opis` (`feat`, `fix`, `chore`, `build`, `docs`, `test`, `refactor`).
- Przed commitem przejrzyj staged diff (`git diff --cached`). Nie dodawaj zmian, których nie wprowadzałeś.
- Najpierw test, potem implementacja. Kontroler testuj żądaniem HTTP (`WebTestCase`), serwis wywołaniem (`KernelTestCase` lub test jednostkowy).
- PHPStan na poziomie `max`, bez baseline'u i bez `@phpstan-ignore` bez uzasadnienia.
- `declare(strict_types=1);` w każdym nowym pliku PHP.
- Nie rozszerzaj zakresu ponad bieżący milestone. Pomysły zapisuj jako propozycje dla użytkownika.
- Gdy wymaganie jest niejasne, zapytaj zamiast zgadywać.

## Konwencje Symfony

- Nowe możliwości instaluj przez `make composer c="require …"` i receptę Flex. Nie dopisuj ręcznie bundli w `config/bundles.php`.
  Po każdej recepcie przejrzyj zmienione pliki: recepty potrafią dopisać konfigurację niezgodną z projektem (np. własną bazę w `compose.yaml`).
- Metadane frameworka przez atrybuty PHP (`#[Route]`, `#[MapRequestPayload]`, `#[Assert\…]`, `#[AsCommand]`…). Bez routingu w YAML/XML.
- Autowiring i autokonfiguracja. Gdy typ nie wystarcza: `#[Autowire]` / `#[Target]`. Definicja w YAML to ostateczność.
- Kontrolery: cienkie klasy `final readonly` z metodą `__invoke` i zależnościami w konstruktorze, bez dziedziczenia po `AbstractController` (łatwiejsze testy jednostkowe). Logika trafia do serwisów.
- Dane żądania wiąż przez `#[MapRequestPayload]` / `#[MapQueryString]`, nie przez ręczne `json_decode()`.
- DTO i value objects: promocja właściwości w konstruktorze i `readonly`.
- Wzajemne wykluczanie przez `symfony/lock`, nie ręczne flagi.
- Zmiany schematu bazy wyłącznie przez migracje Doctrine (`make console c="doctrine:migrations:diff"`), nigdy `doctrine:schema:update`.
- `.env` zawiera tylko domyślne wartości dev. Prawdziwe sekrety: `.env.local` (ignorowany przez git), sekrety Symfony albo zmienne środowiskowe przy uruchomieniu.
- Styl kodu: standard Symfony (PSR-12). php-cs-fixer nie jest zainstalowany.
- Dokumentacja: https://symfony.com/doc/current/. API zmienia się między wersjami, więc sprawdzaj w `vendor/` i przez `bin/console debug:*` zamiast polegać na pamięci.

## Bezpieczeństwo operacji

Bez wyraźnej zgody użytkownika **nie wykonuj**:

- operacji destrukcyjnych: `docker compose down -v`, `docker volume rm`, `doctrine:database:drop`, `doctrine:schema:drop`, `git reset --hard`, `git clean`, usuwania gałęzi,
- `git push` (w tym force push), merge ani żadnej publikacji projektu.

Nie zapisuj sekretów w repozytorium, obrazie Docker ani logach.

## Struktura

- `src/Shared/Infrastructure/Http/`: wspólne elementy HTTP (np. `/health`)
- `tests/Unit/`, `tests/Functional/`: struktura katalogów odzwierciedla `src/`
- `docker/frankenphp/`: konfiguracja serwera, PHP i entrypoint obrazu prod
- `compose.yaml` (wspólny), `compose.override.yaml` (dev, porty tylko na localhost), `compose.prod.yaml` (prod, wymagane sekrety)
- Mapowania Doctrine są rejestrowane per bounded context od Milestone 2 (`config/packages/doctrine.yaml`).
