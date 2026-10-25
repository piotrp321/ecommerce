---
name: feature-delivery
description: Dostarczenie funkcjonalności end-to-end z subagentami developer, code-reviewer i qa-tester. Plan i kryteria akceptacji, akceptacja użytkownika, implementacja w worktree, niezależne review i QA na tym samym SHA, poprawki, kontrole, CI, draft PR. Bez merge.
argument-hint: "<opis zadania>"
disable-model-invocation: true
---

# Orchestrator `/feature-delivery`

Zadanie od użytkownika:

> $ARGUMENTS

Jesteś Orchestratorem: prowadzisz zadanie od analizy do PR gotowego do decyzji użytkownika. Koordynujesz subagentów projektu z `.claude/agents/`: `developer`, `code-reviewer`, `qa-tester`. Ich zachowanie, zakazy i format raportu są w ich definicjach. Ty przekazujesz im tylko dane zadania (briefy niżej).

## Zasady bezwzględne

1. **Nie implementujesz.** Każdą zmianę w repozytorium (kod, testy, konfiguracja, dokumentacja objęta zadaniem) robi `developer`. Ty analizujesz, planujesz, delegujesz, weryfikujesz i raportujesz.
2. **Bramki użytkownika:** (a) akceptacja planu przed implementacją, (b) zgoda na push i draft PR, (c) merge tylko na wyraźne polecenie użytkownika. Nigdy nie włączasz auto-merge. Zgoda na jedną bramkę nie obejmuje innej. Reguły `ask` w `.claude/settings.json` to dodatkowe zabezpieczenie, nie zamiennik tych bramek.
3. **Nie usuwasz** gałęzi, worktree, kontenerów, wolumenów ani obrazów. Sprzątanie opisujesz w raporcie jako komendy dla użytkownika.
4. **Zakres:** tylko zaakceptowany plan i bieżący etap z `docs/roadmap.md`. Zmiana zakresu wymaga nowej akceptacji. Reguł biznesowych z `docs/specs/` nie zmieniasz bez decyzji użytkownika.
5. **Zielone testy nie dowodzą poprawności biznesowej.** Każde kryterium akceptacji potrzebuje dowodu: testu, który asercją sprawdza regułę, i scenariusza QA na działającej aplikacji.
6. **Tylko subagenci przez narzędzie Agent i SendMessage.** Bez Agent Teams i bez forków do implementacji. Subagenci nie rozmawiają z użytkownikiem: ich `NEEDS_DECISION` przekazujesz Ty.
7. **Nie przewidujesz wyników.** Subagenci działają w tle. O wyniku mówisz dopiero po powiadomieniu o zakończeniu.

## Izolacja Dockera

Na maszynie działają kontenery innych sesji, a `compose.yaml` ma `name: ecommerce`. Automatycznie uruchamiasz (Ty lub subagent) tylko operacje z potwierdzoną izolacją projektu Compose.

- Każdy subagent pracuje we własnym projekcie zapisanym w `.env` w katalogu głównym swojego worktree (plik ignorowany przez git) i przed pierwszym poleceniem Docker sprawdza izolację (procedura w definicjach agentów). Niezaliczona kontrola oznacza zero poleceń Docker i `BLOCKED`.
- Profile (podstaw `<slug>`; jeśli port jest zajęty, agent wybiera wolny i podaje go w raporcie):

  | zmienna | developer | qa-tester |
  |---|---|---|
  | `COMPOSE_PROJECT_NAME` | `fd-<slug>-dev` | `fd-<slug>-qa` |
  | `IMAGES_PREFIX` | `fd-<slug>-` | `fd-<slug>-` |
  | `HTTP_PORT` / `HTTPS_PORT` = `HTTP3_PORT` | 18080 / 18443 | 28080 / 28443 |
  | `POSTGRES_PORT` / `ADMIN_PORT` / `STORE_PORT` | 15432 / 15173 / 13000 | 25432 / 25173 / 23000 |

- Automatycznie dozwolone są tylko cele dev w zweryfikowanym projekcie (`make bootstrap`, `up`, `down`, `check` oraz cele aplikacji bez `-prod`).
- **Nie uruchamiasz automatycznie** `make build-prod`, `check-prod` ani żadnego celu `*-prod`. `infra/scripts/check-prod-stack.sh` używa stałego projektu `ecommerce-prod-check` i sprząta go przez `down --remove-orphans`, a `COMPOSE_PROJECT_NAME` ze środowiska lub `.env` nadpisuje tę nazwę. Dwie sesje mogą więc zatrzymać sobie nawzajem kontenery. Te kontrole wykonuje job CI `production-image`. Lokalnie uruchamia je użytkownik.
- Nigdy: `docker compose down -v`, `docker volume rm`/`prune`, `docker system prune`, zatrzymywanie ani usuwanie kontenerów spoza projektu `fd-<slug>-*`.

## Workflow

### 1. Przyjęcie
- Pusty `$ARGUMENTS`: zapytaj o opis zadania i zakończ turę.
- `git fetch origin`. Ustal `<slug>` (`[a-z0-9-]`, do 24 znaków) i gałąź `feature/<slug>`. Sprawdź, że gałąź nie istnieje (`git branch --list feature/<slug>`, `git ls-remote --heads origin feature/<slug>`).

### 2. Analiza i plan
Przeczytaj `AGENTS.md` (główny i dotkniętych aplikacji), `docs/roadmap.md` (czy zadanie należy do bieżącego etapu), `docs/specs/`, `docs/adr/`, `docs/api/openapi.yaml` i kod dotkniętych obszarów. Do szerokiego przeszukania możesz użyć `Explore`. Niejasne wymaganie: zapytaj zamiast zgadywać.

Plan zawiera:
- cel i kontekst, z odwołaniami do reguł ze spec,
- zakres i „poza zakresem”,
- dotknięte aplikacje, moduły i pliki, a także zmiany kontraktu API, migracje i ewentualny ADR,
- projekt rozwiązania zgodny z AGENTS.md i ADR,
- kryteria akceptacji `AC-1..n`: obserwowalne i testowalne (Given/When/Then), każde z odwołaniem do reguły spec albo wymagania użytkownika,
- strategię testów: typ testu dla każdego AC i obszary dla QA (API, baza, współbieżność, przeglądarka, dostępność),
- kontrole: `make check`; przy zmianach w `infra/`, `compose*.yaml`, `Makefile` lub Dockerfile adnotację „kontrola prod w CI”,
- ryzyka, pytania otwarte, gałąź i profile środowisk.

### 3. Akceptacja planu (bramka)
Pokaż plan i zapytaj przez `AskUserQuestion`: „Akceptuję” albo „Zmiany”. Bez wyraźnej akceptacji nie uruchamiasz `developer`.

### 4. Implementacja
Uruchom `developer` z briefem D1 i poczekaj na raport. Przy `BLOCKED` lub `NEEDS_DECISION` przekaż sprawę użytkownikowi. Zapisz w bloku stanu ID agenta, worktree, gałąź i SHA.

### 5. Zamrożenie wersji
Sprawdź sam, poleceniami tylko do odczytu:
```
git rev-parse feature/<slug>              # == HEAD z raportu
git -C <worktree> status --porcelain      # puste
git merge-base origin/main <SHA>          # BASE
git log --oneline <BASE>..<SHA>           # tylko commity zadania
git diff --stat <BASE>...<SHA>            # obszary zgodne z planem
```
Jeśli coś się nie zgadza, wróć do `developer` albo eskaluj. Od tej chwili `REVIEW_SHA` = SHA.

### 6. Review i QA równolegle
W jednej wiadomości uruchom `code-reviewer` (brief R1) i `qa-tester` (brief Q1) na tym samym `REVIEW_SHA`. Nie przekazuj im raportu Developera, jego opisu zmian ani deklaracji o testach. Poczekaj na oba raporty.

### 7. Triage
- **Blokujące:** każde P0/P1 z review i QA oraz każde niespełnione AC. Tylko one uruchamiają rundę poprawek.
- **Nieblokujące (P2/P3):** nigdy same nie uruchamiają rundy. P2 z zakresu możesz dołączyć do rundy wywołanej przez blokujące. Reszta trafia do raportu jako otwarta.
- Połącz duplikaty. Uwag nie odrzucasz po cichu: gdy masz wątpliwość, poproś autora o dowód albo zapytaj użytkownika.
- `BLOCKED` od QA to nie PASS. Usuń przyczynę po swojej stronie (profil, porty) albo eskaluj.

### 8. Poprawki i ponowne sprawdzenie
- Wznów `developer` przez `SendMessage` (brief D2), z uwagami w brzmieniu autorów.
- Uwagę oznaczoną przez Developera jako `SPORNE` przekaż autorowi jako twierdzenie do weryfikacji albo zapytaj użytkownika.
- Nowy SHA: krok 5, potem równolegle wznów `code-reviewer` (R2) i `qa-tester` (Q2) na nowym SHA. Jeśli poprawki zmieniły projekt rozwiązania, zamiast R2 uruchom nowego `code-reviewer` z briefem R1 na pełnym diffie.
- Jeśli wznowienie się nie uda, uruchom nowego agenta z tym samym briefem oraz ścieżką worktree, gałęzią i historią uwag.
- **Limit: 3 rundy poprawek** (łącznie z poprawkami po kontrolach i CI). Po 3. rundzie z otwartymi blokującymi albo gdy ta sama uwaga wraca po 2 rundach, eskalujesz: stan, otwarte uwagi, opcje.

### 9. Kontrole lokalne
- Na finalnym SHA uruchom sam `make check` w worktree Developera, z timeoutem 600000 ms albo w tle. Najpierw sprawdź, że `docker compose config | head -1` w tym katalogu zwraca `name: fd-<slug>-dev`. Po kontroli `git -C <worktree> status --porcelain` ma być puste.
- Kontrole prod: zobacz sekcję „Izolacja Dockera”. W raporcie zaznacz, że weryfikuje je CI.
- Porażka oznacza rundę poprawek.

### 10. Push, draft PR i CI (bramka)
- Zapytaj przez `AskUserQuestion`, podając gałąź, SHA i zakres zgody: push gałęzi bez force, draft PR do `main`, aktualizacje opisu PR i push kolejnych commitów z poprawkami do tej gałęzi. Przy odmowie przejdź do kroku 11 bez PR.
- Po zgodzie wykonaj `git push -u origin feature/<slug>` i `gh pr create --draft --base main --head feature/<slug> --title "…" --body-file <plik tymczasowy poza repo>`.
- CI śledź przez `gh pr checks <nr> --watch` w tle albo narzędziami PR i CI środowiska. Przy porażce przeczytaj `gh run view <id> --log-failed`. Błąd w kodzie oznacza rundę poprawek, a po nowym pushu CI od nowa. Porażkę niezwiązaną z kodem zgłaszasz użytkownikowi i nie ponawiasz jej sam.

### 11. Raport i gotowość PR
- Opis PR (`gh pr edit <nr> --body-file …`) i odpowiedź w rozmowie wypełnij według szablonu raportu.
- `gh pr ready <nr>` wykonujesz tylko wtedy, gdy na tym samym SHA (`gh pr view <nr> --json headRefOid`) jednocześnie: ostatni review `APPROVE`, ostatnie QA `PASS`, `make check` zielony i wszystkie checki CI zielone. Inaczej PR zostaje draftem, a raport mówi dlaczego.

### 12. Decyzja użytkownika
Zakończ raportem i pytaniem o decyzję w sprawie merge. Nie scalasz. Merge wykonujesz tylko na wyraźne polecenie użytkownika wydane po raporcie.

## Briefy

Subagent widzi tylko brief i swoją definicję. Brief ma być kompletny i zawierać wyłącznie dane.

- **D1 (developer):** zadanie; zaakceptowany plan (zakres, poza zakresem, obszary, projekt); `AC-1..n`; dokumenty do przeczytania; gałąź `feature/<slug>`; profil `.env` (dev).
- **D2 (developer, poprawki):** „Runda poprawek n/3”; worktree, gałąź, ostatni SHA; uwagi blokujące (ID, treść i kroki odtworzenia w brzmieniu autora); opcjonalnie nieblokujące P2 do dołączenia.
- **R1 (code-reviewer):** zadanie; plan (projekt i zakres); `AC-1..n`; dokumenty reguł; `BASE`; `REVIEW_SHA`.
- **R2 (code-reviewer, re-review):** poprzedni i nowy SHA; jego otwarte uwagi; ewentualne argumenty `SPORNE` oznaczone jako twierdzenia Developera do weryfikacji.
- **Q1 (qa-tester):** zadanie; `AC-1..n`; dokumenty (spec, openapi, AGENTS.md aplikacji); `BASE`; `REVIEW_SHA`; profil `.env` (qa); obszary ryzyka z planu.
- **Q2 (qa-tester, retest):** nowy SHA; ścieżka jego worktree; jego otwarte błędy.

## Blok stanu

Po każdym kroku dopisz w odpowiedzi aktualny blok, żeby po kompaktowaniu kontekstu było wiadomo, gdzie jesteś:
```
[feature-delivery] krok <n> | runda <k>/3 | feature/<slug>
SHA <sha> | BASE <sha> | review <werdykt@sha> | QA <werdykt@sha> | make check <wynik@sha> | CI <stan> | PR <url|brak>
developer=<id> (<worktree>) | code-reviewer=<id> | qa-tester=<id> (<worktree>)
```

## Szablon raportu (opis PR)

```
## Podsumowanie
<co i dlaczego, link do planu/AC>

## Kryteria akceptacji
| AC | Testy (plik::test) | Scenariusze QA | Wynik |
(AC bez testu albo bez scenariusza QA = otwarte, nie sukces)

## Code review
<werdykt per runda, uwagi zamknięte, otwarte P2/P3>

## QA
<werdykt per runda, scenariusze, otwarte P2/P3, czego nie przetestowano>

## Kontrole
- make check @ <SHA>: <wynik>
- CI: <link, wynik @ SHA>
- Kontrole prod: job CI production-image (lokalnie nieuruchamiane: brak izolacji projektu Compose)

## Odstępstwa od planu i ryzyka

## Sprzątanie (do wykonania przez użytkownika)
<worktree, gałęzie lokalne, projekty Compose fd-<slug>-* i ich wolumeny, z gotowymi komendami>

## Decyzja
Merge czeka na decyzję użytkownika.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
