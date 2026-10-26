# Raporty `/feature-delivery`

Orchestrator czyta ten plik w kroku 11. Wartości bierze z logu zdarzeń (ścieżka w bloku stanu), raportów agentów i GitHuba. Niczego nie szacuje.

## Opis PR

```
## Podsumowanie
<co i dlaczego, link do planu/AC>

## Kryteria akceptacji
| AC | Testy (plik::test) | Scenariusze QA | Wynik |
(AC bez testu albo bez scenariusza QA = otwarte, nie sukces)

## Code review
<werdykt i tryb (FULL/DELTA) per runda, uwagi zamknięte, otwarte P2/P3>

## QA
<werdykt i tryb per runda, scenariusze, otwarte P2/P3, czego nie przetestowano>

## Kontrole
- make check @ <SHA>: <wynik> (<Developer | Orchestrator>)
- CI Quality gates: <link, wynik @ SHA>
- CI Production image: <ręcznie: link, wynik @ SHA | nie uruchamiano: brak zmian wpływających na obrazy produkcyjne | zalecany przed merge: zmiany w ...>

## Odstępstwa od planu i ryzyka

## Sprzątanie (do wykonania przez użytkownika)
<worktree, gałęzie lokalne, projekty Compose fd-<slug>-* i ich wolumeny, z gotowymi komendami>

## Decyzja
Merge czeka na decyzję użytkownika.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## AGENTIC SDLC — EXECUTION REPORT

Jak policzyć:
- Odczytaj log (`cat <log>`). Licz od ostatniego `START`. Czas to różnica znaczników w sekundach (`echo $((B - A))`), podawana jako `1h 05m`.
- **Czas całkowity** = `END` − `START`. **Oczekiwanie na użytkownika** = suma (`ANSWER` − `ASK`). **Praca** = całkowity − oczekiwanie.
- **Implementacja** = suma (`DEV_END` − `DEV_START`). **Code Review** = suma (`REVIEW_END` − `REVIEW_START`). **QA** = suma (`QA_END` − `QA_START`). Review i QA biegną równolegle, więc ich czasy się nakładają. Pole `Czas` z raportu agenta to jego aktywny czas; podaj je, gdy różni się istotnie od czasu z logu.
- **Uruchomienia** = liczba zdarzeń `*_START` danego agenta (z podziałem na FULL i DELTA). **Pełne make check** = liczba zdarzeń `MAKE_CHECK`.
- **Modele** z definicji: `grep -E '^(model|effort):' .claude/agents/*.md`. Rzeczywisty model i effort działającego subagenta pokazuje `/tasks`.
- **Tokeny i koszt:** przepisz dane o użyciu tylko wtedy, gdy podało je powiadomienie o zakończeniu subagenta. Claude Code nie udostępnia kosztu sesji programowo, więc w przeciwnym razie wpisz „niedostępne programowo” i odeślij do `/usage`: blok Session pokazuje Total cost, czas i Usage by model, a na planach Pro, Max, Team i Enterprise także udział subagentów.

Szablon (krótki):
```
AGENTIC SDLC — EXECUTION REPORT
Zadanie: <slug> | PR: <url | brak> | SHA: <końcowy>
CI: Quality gates <wynik> | Production image <wynik | nie uruchamiano: powód>
Czas całkowity: <h m> (oczekiwanie na użytkownika: <h m | brak pomiaru>, praca: <h m>)
Implementacja: <h m> | Code Review: <h m> | QA: <h m> (review i QA równolegle)
Rundy poprawek: <k>/3
Uruchomienia: Developer <n> | Code Reviewer <n> (FULL <a>, DELTA <b>) | QA <n> (FULL <a>, DELTA <b>)
Pełne make check: <n> (Developer <a>, Orchestrator <b>)
Modele (definicje): developer <model/effort> | code-reviewer <…> | qa-tester <…> | Orchestrator: model sesji
Tokeny / koszt: <dane z powiadomień | niedostępne programowo: /usage>
```
