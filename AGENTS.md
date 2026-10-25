# AGENTS.md

Instrukcje dla agentów AI pracujących w tym repozytorium (Claude Code, Codex i inne).
Ten plik opisuje całe monorepo. Każda aplikacja może mieć własny `AGENTS.md` z zasadami specyficznymi dla niej (obecnie [`apps/backend/AGENTS.md`](apps/backend/AGENTS.md)); pracując w aplikacji, stosuj oba.
Pliki `CLAUDE.md` tylko importują sąsiedni `AGENTS.md`. Zmieniaj instrukcje w `AGENTS.md`, nie w kopiach.

Edukacyjny system e-commerce rozwijany jako monorepo. Projekt służy do nauki Agentic Software Development.

## Źródła prawdy

- Wymagania biznesowe: `docs/specs/`. Nie zmieniaj ustalonych reguł bez decyzji użytkownika.
- Zakres etapów: `docs/roadmap.md`. Realizuj wyłącznie bieżący etap.
- Decyzje architektoniczne: `docs/adr/`. Nowa istotna decyzja = nowy ADR.

## Struktura monorepo

- `apps/backend`: Symfony, DDD + Hexagonal; jedyne źródło logiki biznesowej
- `apps/store`, `apps/admin`, `packages/sdk`: planowane w kolejnych etapach (`docs/roadmap.md`); nie twórz ich na zapas
- `infra/docker/<app>/`: obraz Docker danej aplikacji (Dockerfile i jego `Dockerfile.dockerignore`)
- `infra/scripts/`: skrypty narzędziowe (np. `check-prod.sh`)
- `docs/`: specyfikacje, roadmapa, ADR
- katalog główny: `compose.yaml` (wspólny, projekt dev `ecommerce`), `compose.override.yaml` (dev, porty tylko na localhost), `compose.prod.yaml` (osobny projekt `ecommerce-prod`, wymagane sekrety), `Makefile`, `AGENTS.md`, `README.md`

Obrazy budujemy z kontekstu w katalogu głównym. Co trafia do obrazu, określa allowlista w `infra/docker/<app>/Dockerfile.dockerignore`.

## Komendy

Wszystko uruchamiaj z katalogu głównego przez `make` (`make help` pokazuje listę).
Konwencja: cele zbiorcze bez prefiksu, cele aplikacji z prefiksem nazwy aplikacji (`backend-*`, później `store-*`, `admin-*`).

- `make bootstrap`: środowisko dev od zera (build, up, install, migracje), dokładnie tak jak w README
- `make up`, `make down`, `make logs`: kontenery dev (`down` nie usuwa wolumenów)
- `make check`: **obowiązkowa bramka przed każdym commitem** (wszystkie aplikacje)
- `make build-prod`: obrazy produkcyjne; sekrety podaje się dopiero przy uruchomieniu (`compose.prod.yaml`)
- `make check-prod`: kontrola obrazów prod w tymczasowym projekcie na portach 8080/8443; uruchamiaj po zmianach w `infra/`, `compose*.yaml` lub `Makefile`
- CI (`.github/workflows/ci.yml`) uruchamia te same komendy: `make bootstrap`, `make check`, `make check-prod`. Nowe kontrole dodawaj do `Makefile`, nie bezpośrednio do workflow.

## Zasady pracy

- Małe commity, każdy z działającym stanem i zielonym `make check`. Format: `type: opis` (`feat`, `fix`, `chore`, `build`, `ci`, `docs`, `test`, `refactor`).
- Przed commitem przejrzyj staged diff (`git diff --cached`). Nie dodawaj zmian, których nie wprowadzałeś.
- Przenosząc pliki, używaj `git mv` (zachowanie historii) i nie zmieniaj przy tym ich treści bez potrzeby.
- Nie rozszerzaj zakresu ponad bieżący etap. Pomysły zapisuj jako propozycje dla użytkownika.
- KISS i YAGNI: nie dodawaj narzędzi, pakietów ani katalogów na zapas (np. Turborepo, puste pakiety).
- Gdy wymaganie jest niejasne, zapytaj zamiast zgadywać.

## Bezpieczeństwo operacji

Bez wyraźnej zgody użytkownika **nie wykonuj**:

- operacji destrukcyjnych: `docker compose down -v`, `docker volume rm`, `doctrine:database:drop`, `doctrine:schema:drop`, `git reset --hard`, `git clean`, usuwania gałęzi,
- `git push` (w tym force push), merge ani żadnej publikacji projektu.

Nie zapisuj sekretów w repozytorium, obrazie Docker ani logach.
Pliki ignorowane przez git (np. `.env.local`, `vendor/`, `var/`) nie przenoszą się przez `git mv`; przy reorganizacji przenieś je świadomie albo opisz w README.
