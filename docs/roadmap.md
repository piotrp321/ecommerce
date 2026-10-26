# Roadmapa

Projekt realizujemy małymi, niezależnymi etapami. Każdy etap jest planowany szczegółowo dopiero przed jego rozpoczęciem.
Podstawa biznesowa: [specs/01-placing-order.md](specs/01-placing-order.md). Układ repozytorium: [ADR-0001](adr/0001-monorepo-layout.md).

## Milestones funkcjonalne

| # | Milestone | Zakres | Status |
|---|---|---|---|
| M1 | Szkielet projektu | Symfony 8.1, Docker Compose (FrankenPHP + PostgreSQL), Doctrine, PHPUnit, PHPStan, Deptrac, CI | zakończony |
| M2 | Katalog produktów | Produkty (cena netto, stawka VAT, aktywność) i drzewo kategorii (Catalog), stan magazynowy (Inventory), publiczne API odczytu i API administracyjne (tokeny dostępu OIDC realmu `admin`), kontrakt [`docs/api/openapi.yaml`](api/openapi.yaml) ([ADR-0005](adr/0005-catalog-inventory-and-admin-api-access.md)) | zakończony |
| M3 | Koszyk | Koszyk zalogowanego użytkownika | planowany |
| M4 | Składanie zamówienia | Atomowa rezerwacja magazynowa, snapshot cen, idempotency key | planowany |
| M5 | Cykl życia zamówienia | Płatności, anulowania, timeouty, powiadomienia, pozostałe reguły | planowany |

## Migracja do monorepo

Realizowana przed M2, jeden Pull Request na etap.

| Etap | Zakres | Status |
|---|---|---|
| 1 | Symfony do `apps/backend`, obraz w `infra/docker/backend`, Makefile, Deptrac, CI | zakończony |
| 2 | pnpm workspace i `apps/admin` (React + Vite), dev lokalnie i w Dockerze, obraz prod ([ADR-0002](adr/0002-frontend-workspace-and-admin.md)) | zakończony |
| 3 | `apps/store` (Next.js, SSR), dev lokalnie i w Dockerze, obraz prod ([ADR-0003](adr/0003-store-nextjs.md)) | zakończony |
| 4 | Topologia produkcyjna z centralnym edge Caddy, testy routingu i niezależnych wdrożeń ([ADR-0004](adr/0004-edge-proxy-and-production-topology.md)) | zakończony |
| 5 | Lint kontraktu OpenAPI i testy kontraktowe backendu ([ADR-0007](adr/0007-api-contract-tests.md)); następnie `packages/sdk` generowany z kontraktu, uzgodniony z pracą nad sklepem i adminem | w trakcie |
| 6 | Optymalizacja CI dla monorepo (tylko jeśli pomiary to uzasadnią) | planowany |

## Przed uruchomieniem produkcyjnym

Zagadnienia, które muszą być zamknięte przed pierwszym wdrożeniem na produkcję. Każde realizujemy jako osobne zadanie z testami.

| Zagadnienie | Zakres | Status |
|---|---|---|
| Trusted proxies w Symfony | `framework.trusted_proxies` / `trusted_headers` w `apps/backend/config`: backend za edge ma poprawnie rozpoznawać schemat (HTTPS), host i IP klienta z nagłówków `X-Forwarded-*`, ufając wyłącznie edge. Wymagane m.in. dla bezpiecznych ciasteczek, adresów bezwzględnych i limitów żądań ([ADR-0004](adr/0004-edge-proxy-and-production-topology.md)). | otwarte |
| TLS i ACME na rzeczywistych domenach | Rekordy DNS dla `STORE_DOMAIN` i `ADMIN_DOMAIN`, otwarte porty 80/443, wydanie i odnowienie certyfikatów przez edge (`EDGE_GLOBAL_OPTIONS`, np. e-mail ACME), weryfikacja HSTS i przekierowań na produkcyjnych domenach. Testy w CI używają lokalnego CA. | otwarte |
| Uwierzytelnianie administratorów | Logowanie do panelu admina z sesją w ciasteczkach `HttpOnly`/`Secure`/`SameSite` i ochroną CSRF. Administracyjne API backendu wymaga tokenu dostępu z rolą `admin` ([ADR-0005](adr/0005-catalog-inventory-and-admin-api-access.md)); panel uzyskuje go po stronie serwera, nigdy w przeglądarce. | otwarte |

Pozostałe punkty otwarte (np. kontener backendu w trybie read-only, wysoka dostępność) są opisane w ADR-0004.
