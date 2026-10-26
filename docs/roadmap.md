# Roadmapa

Projekt realizujemy małymi, niezależnymi etapami. Każdy etap jest planowany szczegółowo dopiero przed jego rozpoczęciem.
Podstawa biznesowa: [specs/01-placing-order.md](specs/01-placing-order.md). Układ repozytorium: [ADR-0001](adr/0001-monorepo-layout.md).

## Milestones funkcjonalne

| # | Milestone | Zakres | Status |
|---|---|---|---|
| M1 | Szkielet projektu | Symfony 8.1, Docker Compose (FrankenPHP + PostgreSQL), Doctrine, PHPUnit, PHPStan, Deptrac, CI | zakończony |
| M2 | Katalog produktów | Produkty (cena netto, stawka VAT, aktywność) i drzewo kategorii (Catalog), stan magazynowy (Inventory), publiczne API odczytu i API administracyjne z tymczasowym tokenem, kontrakt [`docs/api/openapi.yaml`](api/openapi.yaml) ([ADR-0005](adr/0005-catalog-inventory-and-admin-api-access.md)) | zakończony |
| M3 | Tożsamość i dostęp | Keycloak (realmy `store` i `admin`), moduły `Customers` (Customer) i `Backoffice` (AdminUser), BFF sklepu z sesją w Redis, API admina na OIDC zamiast tymczasowego tokenu ([architektura](architecture.md)) | w realizacji |
| M4 | Koszyk | Koszyk dla gości i klientów, scalanie koszyka gościa po zalogowaniu | planowany |
| M5 | Składanie zamówienia | Atomowa rezerwacja magazynowa, snapshot cen, idempotency key | planowany |
| M6 | Cykl życia zamówienia | Płatności, anulowania, timeouty, powiadomienia, pozostałe reguły | planowany |

## Infrastruktura

| Element | Zakres | Status |
|---|---|---|
| Keycloak | Jedna instancja, realmy `store` i `admin` (M3) | w realizacji |
| Redis sesji | `redis-session` dla sesji BFF sklepu (M3) | w realizacji |
| Redis cache | Osobna instancja, gdy pojawi się potrzeba cache | planowany |
| RabbitMQ, Elasticsearch | Opcjonalne profile Compose, bez integracji biznesowej; integracje powstają przy konkretnych przypadkach użycia | planowany |

## Migracja do monorepo

Otwarte pozycje; jeden Pull Request na etap.

| Etap | Zakres | Status |
|---|---|---|
| 5 | `packages/sdk` generowany z kontraktu OpenAPI, uzgodniony z pracą nad sklepem i adminem | w trakcie |
| 6 | Optymalizacja CI dla monorepo, tylko przy mierzalnej potrzebie | planowany |

## Przed uruchomieniem produkcyjnym

Zagadnienia, które muszą być zamknięte przed pierwszym wdrożeniem na produkcję. Każde realizujemy jako osobne zadanie z testami.

| Zagadnienie | Zakres | Status |
|---|---|---|
| Trusted proxies w Symfony | `framework.trusted_proxies` / `trusted_headers` w `apps/backend/config`: backend za edge ma poprawnie rozpoznawać schemat (HTTPS), host i IP klienta z nagłówków `X-Forwarded-*`, ufając wyłącznie edge. Wymagane m.in. dla bezpiecznych ciasteczek, adresów bezwzględnych i limitów żądań ([ADR-0004](adr/0004-edge-proxy-and-production-topology.md)). | otwarte |
| TLS i ACME na rzeczywistych domenach | Rekordy DNS dla `STORE_DOMAIN` i `ADMIN_DOMAIN`, otwarte porty 80/443, wydanie i odnowienie certyfikatów przez edge (`EDGE_GLOBAL_OPTIONS`, np. e-mail ACME), weryfikacja HSTS i przekierowań na produkcyjnych domenach. Testy w CI używają lokalnego CA. | otwarte |
| Uwierzytelnianie administratorów | Panel admina przez OIDC (realm admin z MFA) i BFF. Autoryzacja na backendzie zastąpi tymczasowy dostęp do administracyjnego API. | otwarte |
| Keycloak produkcyjny | Backup bazy, aktualizacje, SMTP do weryfikacji e-mail, konsola admina niepubliczna. | otwarte |

Pozostałe punkty otwarte (np. kontener backendu w trybie read-only, wysoka dostępność) są opisane w ADR-0004.
