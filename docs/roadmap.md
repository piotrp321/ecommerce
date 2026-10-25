# Roadmapa

Projekt realizujemy małymi, niezależnymi etapami. Każdy etap jest planowany szczegółowo dopiero przed jego rozpoczęciem.
Podstawa biznesowa: [specs/01-placing-order.md](specs/01-placing-order.md). Układ repozytorium: [ADR-0001](adr/0001-monorepo-layout.md).

## Milestones funkcjonalne

| # | Milestone | Zakres | Status |
|---|---|---|---|
| M1 | Szkielet projektu | Symfony 8.1, Docker Compose (FrankenPHP + PostgreSQL), Doctrine, PHPUnit, PHPStan, Deptrac, CI | zakończony |
| M2 | Katalog produktów | Podstawowy model produktu (cena netto, stawka VAT, aktywność, stan) i API odczytu | planowany |
| M3 | Koszyk | Koszyk zalogowanego użytkownika | planowany |
| M4 | Składanie zamówienia | Atomowa rezerwacja magazynowa, snapshot cen, idempotency key | planowany |
| M5 | Cykl życia zamówienia | Płatności, anulowania, timeouty, powiadomienia, pozostałe reguły | planowany |

## Migracja do monorepo

Realizowana przed M2, jeden Pull Request na etap.

| Etap | Zakres | Status |
|---|---|---|
| 1 | Symfony do `apps/backend`, obraz w `infra/docker/backend`, Makefile, Deptrac, CI | zakończony |
| 2 | pnpm workspace i `apps/admin` (React + Vite), dev lokalnie i w Dockerze, obraz prod ([ADR-0002](adr/0002-frontend-workspace-and-admin.md)) | w trakcie |
| 3 | `apps/store` (Next.js) | planowany |
| 4 | Topologia produkcyjna z centralnym edge Caddy | planowany |
| 5 | Kontrakt OpenAPI, testy kontraktowe, `packages/sdk` (gdy pojawią się endpointy biznesowe) | planowany |
| 6 | Optymalizacja CI dla monorepo (tylko jeśli pomiary to uzasadnią) | planowany |
