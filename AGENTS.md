# AGENTS.md

Instrukcje dla agentów AI pracujących w tym repozytorium (Claude Code, Codex i inne).
Ten plik opisuje całe monorepo. Każda aplikacja może mieć własny `AGENTS.md` z zasadami specyficznymi dla niej ([`apps/backend/AGENTS.md`](apps/backend/AGENTS.md), [`apps/admin/AGENTS.md`](apps/admin/AGENTS.md), [`apps/store/AGENTS.md`](apps/store/AGENTS.md)); pracując w aplikacji, stosuj oba.
Pliki `CLAUDE.md` tylko importują sąsiedni `AGENTS.md`. Zmieniaj instrukcje w `AGENTS.md`, nie w kopiach.

Edukacyjny system e-commerce rozwijany jako monorepo. Projekt służy do nauki Agentic Software Development.

## Źródła prawdy

- Wymagania biznesowe: `docs/specs/`. Nie zmieniaj ustalonych reguł bez decyzji użytkownika.
- Zakres etapów: `docs/roadmap.md`. Realizuj wyłącznie bieżący etap.
- Decyzje architektoniczne: `docs/adr/`. Nowa istotna decyzja = nowy ADR.

## Struktura monorepo

- `apps/backend`: Symfony, DDD + Hexagonal; jedyne źródło logiki biznesowej
- `apps/admin`: panel administracyjny, React + Vite + TypeScript (SPA)
- `apps/store`: sklep, Next.js + React + TypeScript (SSR)
- `packages/sdk`: planowany w etapie 5 (`docs/roadmap.md`); nie twórz go na zapas
- `infra/docker/<app>/`: obraz Docker danej aplikacji (Dockerfile i jego `Dockerfile.dockerignore`)
- `infra/edge/`: edge proxy (Caddy), jedyny publiczny punkt wejścia produkcji: TLS, routing po domenie i ścieżce (`/api/*` → backend bez prefiksu)
- `infra/scripts/`: skrypty kontroli prod (`check-prod-admin.sh`, `check-prod-store.sh`, `check-prod-stack.sh` dla całej topologii)
- `docs/`: specyfikacje, roadmapa, ADR, kontrakt REST API `docs/api/openapi.yaml` (OpenAPI 3.1)
- katalog główny: `compose.yaml` (wspólny, projekt dev `ecommerce`), `compose.override.yaml` (dev, porty tylko na localhost), `compose.prod.yaml` (osobny projekt `ecommerce-prod`, edge + trzy aplikacje, wymagane sekrety i domeny), `Makefile`, pnpm workspace (`package.json`, `pnpm-workspace.yaml`, jeden `pnpm-lock.yaml`), `.node-version`, `AGENTS.md`, `README.md`
- `.claude/`: wspólna konfiguracja Claude Code ([ADR-0008](docs/adr/0008-agentic-sdlc-claude-code.md)): skill `/feature-delivery` (`skills/`), subagenci `developer`, `code-reviewer`, `qa-tester` (`agents/`), reguły `ask` (`settings.json`); pozostałe pliki `.claude/` (np. `settings.local.json`, `worktrees/`) są lokalne i ignorowane

Obrazy budujemy z kontekstu w katalogu głównym. Co trafia do obrazu, określa allowlista w `infra/docker/<app>/Dockerfile.dockerignore`.

## Komendy

Wszystko uruchamiaj z katalogu głównego przez `make` (`make help` pokazuje listę).
Konwencja: cele zbiorcze bez prefiksu, cele aplikacji z prefiksem nazwy aplikacji (`backend-*`, `admin-*`, `store-*`, `edge-*`), cała topologia prod z prefiksem `stack-`, kontrakt API z prefiksem `contract-`, cele workspace z prefiksem `pnpm-`.

- `make bootstrap`: środowisko dev od zera (build, `pnpm-install`, up, Composer, migracje), dokładnie tak jak w README
- `make up`, `make down`, `make logs`: kontenery dev (`down` nie usuwa wolumenów)
- `make check`: **obowiązkowa bramka przed każdym commitem** (lint kontraktu API i wszystkie aplikacje)
- `make contract-lint`: lint `docs/api/openapi.yaml` (Redocly, `redocly.yaml`); zgodność backendu z kontraktem sprawdzają testy backendu
- `make build-prod`: obrazy produkcyjne; sekrety podaje się dopiero przy uruchomieniu (`compose.prod.yaml`)
- `make check-prod`: kontrola obrazów admina (8081) i sklepu (8082) oraz całej topologii prod z edge w tymczasowym projekcie (8080/8443: routing, ekspozycja, uprawnienia, backend, niezależne wdrożenia); uruchamiaj po zmianach w `infra/`, `compose*.yaml` lub `Makefile`
- `make pnpm-install`, `make pnpm c="…"`: zależności JS i pnpm w kontenerze (`node_modules` w wolumenach Dockera)
- CI (`.github/workflows/ci.yml`) uruchamia te same komendy: `make bootstrap`, `make check`, `make check-prod`. Nowe kontrole dodawaj do `Makefile`, nie bezpośrednio do workflow.

## Frontend: tryb lokalny i Docker

Aplikacje JS działają w dwóch trybach, na tym samym `pnpm-lock.yaml`:

- Docker (`make up`): `node_modules` z binarkami Linuksa leżą w wolumenach Dockera, instaluje je `make pnpm-install`.
- Lokalnie na macOS: Node z `.node-version` i pnpm przez corepack (`corepack enable pnpm`), potem `pnpm install` oraz `pnpm dev:admin` (port 5173) albo `pnpm dev:store` (port 3000). Nie uruchamiaj ich równolegle z kontenerami `admin`/`store` na tych samych portach. `node_modules` na hoście mają binarki macOS.

Nie kopiuj ani nie montuj `node_modules` między hostem a kontenerem. Każdy pakiet workspace z własnym `node_modules` (i `.next` sklepu) ma wolumen w `compose.override.yaml`; wolumeny `node_modules` montuj we **wszystkich** usługach frontendowych, bo `make pnpm-install` instaluje cały workspace. Zależności zmieniaj tylko przez pnpm (`make pnpm c="--filter admin add …"` albo lokalnie `pnpm --filter admin add …`) i commituj `pnpm-lock.yaml`. Wersje w `package.json` są przypięte dokładnie (bez `^`).

## Zasady pracy

- Małe commity, każdy z działającym stanem i zielonym `make check`. Format: `type: opis` (`feat`, `fix`, `chore`, `build`, `ci`, `docs`, `test`, `refactor`).
- Przed commitem przejrzyj staged diff (`git diff --cached`). Nie dodawaj zmian, których nie wprowadzałeś.
- Przenosząc pliki, używaj `git mv` (zachowanie historii) i nie zmieniaj przy tym ich treści bez potrzeby.
- Nie rozszerzaj zakresu ponad bieżący etap. Pomysły zapisuj jako propozycje dla użytkownika.
- KISS i YAGNI: nie dodawaj narzędzi, pakietów ani katalogów na zapas (np. Turborepo, puste pakiety).
- Gdy wymaganie jest niejasne, zapytaj zamiast zgadywać.

## Produkcja

- Publiczne porty ma wyłącznie `edge`. Nie publikuj portów backendu, sklepu, admina ani bazy w `compose.prod.yaml`.
- Każda aplikacja i edge to osobny obraz, wdrażany niezależnie (`up -d --no-deps <usługa>`). Zmiana routingu = zmiana `infra/edge/Caddyfile` i nowy obraz edge.
- Kontrakt routingu API: frontendy wołają `/api/...` na własnej domenie, edge przekazuje to do backendu bez prefiksu. Nowe endpointy backendu nie wymagają zmian w edge.
- Pracując równolegle z innym agentem lub worktree, uruchamiaj Docker w izolowanym projekcie (`COMPOSE_PROJECT_NAME`, `IMAGES_PREFIX`, inne porty), żeby nie przejąć cudzych kontenerów. Najprościej zapisać je w `.env` w katalogu głównym worktree (ignorowany przez git) i przed pierwszym poleceniem sprawdzić `docker compose config | head -1`. `make check-prod` używa stałego projektu `ecommerce-prod-check`: nie uruchamiaj go równolegle z inną sesją ani przy ustawionym `COMPOSE_PROJECT_NAME` (także z `.env`).

## Bezpieczeństwo operacji

Bez wyraźnej zgody użytkownika **nie wykonuj**:

- operacji destrukcyjnych: `docker compose down -v`, `docker volume rm`, `doctrine:database:drop`, `doctrine:schema:drop`, `git reset --hard`, `git clean`, usuwania gałęzi,
- `git push` (w tym force push), merge ani żadnej publikacji projektu.

Nie zapisuj sekretów w repozytorium, obrazie Docker ani logach.
Pliki ignorowane przez git (np. `.env.local`, `vendor/`, `var/`) nie przenoszą się przez `git mv`; przy reorganizacji przenieś je świadomie albo opisz w README.
