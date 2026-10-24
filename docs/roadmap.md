# Roadmapa

Projekt realizujemy małymi, niezależnymi etapami. Każdy milestone jest planowany szczegółowo dopiero przed jego rozpoczęciem.
Podstawa biznesowa: [specs/01-placing-order.md](specs/01-placing-order.md).

| # | Milestone | Zakres | Status |
|---|---|---|---|
| M1 | Szkielet projektu | Symfony 8.1, Docker Compose (FrankenPHP + PostgreSQL), Doctrine, PHPUnit, PHPStan, konfiguracja | w trakcie |
| M2 | Katalog produktów | Podstawowy model produktu (cena netto, stawka VAT, aktywność, stan) i API odczytu | planowany |
| M3 | Koszyk | Koszyk zalogowanego użytkownika | planowany |
| M4 | Składanie zamówienia | Atomowa rezerwacja magazynowa, snapshot cen, idempotency key | planowany |
| M5 | Cykl życia zamówienia | Płatności, anulowania, timeouty, powiadomienia, pozostałe reguły | planowany |
