# AGENTS.md: backend (`apps/backend`)

Instrukcje dla pracy w `apps/backend`: Symfony 8.1.* (docelowo 8.2.*), PHP 8.5, PostgreSQL 18, FrankenPHP.
Uzupełniają główny [`AGENTS.md`](../../AGENTS.md) (struktura monorepo, komendy, bezpieczeństwo). Obowiązują oba pliki.

Ten plik jest też plikiem recepty `symfony/framework-bundle` (patrz `symfony.lock`). Przy `composer recipes:update` przejrzyj diff i zachowaj treść projektu.

## Źródła prawdy

- Wersje i zainstalowane pakiety: `composer.json`, `symfony.lock`. Nie zakładaj, że pakiet jest zainstalowany (np. Twig, Messenger, maker-bundle), dopóki tam go nie ma.
- Logika biznesowa (ceny, stany magazynowe, zamówienia, płatności) jest wyłącznie w backendzie. Frontendy jej nie duplikują.
- Kontrakt REST API: [`docs/api/openapi.yaml`](../../docs/api/openapi.yaml). Każdą zmianę endpointu lub formatu JSON wprowadzaj w tym samym commicie w kontrakcie. Testy to wymuszają ([ADR-0007](../../docs/adr/0007-api-contract-tests.md)):
  - każda odpowiedź z `ApiTestCase::request()` jest walidowana względem kontraktu (status, `Content-Type`, schemat JSON),
  - `ApiRoutesMatchContractTest` wymaga, żeby trasy Symfony i operacje kontraktu były identyczne,
  - `make contract-lint` (Redocly, część `make check`) sprawdza poprawność kontraktu.

## Komendy

Uruchamiaj z katalogu głównego repozytorium przez `make`, w kontenerze `backend` (w kontenerze aplikacja jest w `/app`).
Nie używaj `symfony serve`, `symfony console` ani PHP/Composera z hosta.

- `make backend-composer c="…"`, `make backend-console c="…"`: Composer i `bin/console`
- `make backend-migrate`: migracje, wyłącznie tą komendą, nigdy automatycznie przy starcie kontenera
- `make backend-test`: PHPUnit (sam przygotowuje bazę testową przez `make backend-db-test`)
- `make backend-stan`: PHPStan
- `make backend-arch`: kontrola architektury (Deptrac, `deptrac.yaml`); **obowiązkowa po każdej zmianie w `src/`**
- `make backend-check`: wszystkie kontrole backendu (część `make check`)

Gdy coś nie działa, najpierw czytaj `var/log/`, logi kontenera (`make logs`) i `bin/console debug:*`, zanim zmienisz kod.

## Zasady pracy

- Najpierw test, potem implementacja. Kontroler testuj żądaniem HTTP (`WebTestCase`), serwis wywołaniem (`KernelTestCase` lub test jednostkowy).
- PHPStan na poziomie `max`, bez baseline'u i bez `@phpstan-ignore` bez uzasadnienia.
- `declare(strict_types=1);` w każdym nowym pliku PHP.

## Architektura

Modularny monolit, DDD + architektura heksagonalna (Clean Architecture). Reguły wymusza Deptrac (`deptrac.yaml`, `make backend-arch`).

- Każda klasa w `src/` należy do `App\<Moduł>\<Warstwa>\…`:
  - moduły: `Catalog`, `Inventory`, `Cart`, `Ordering`, `Payments` oraz `Shared`,
  - warstwy: `Domain`, `Application`, `Infrastructure`.
  Wyjątek: `App\Kernel`. Klasa poza tą strukturą kończy `make backend-arch` błędem.
- Kierunek zależności wewnątrz modułu: `Infrastructure` → `Application` → `Domain`.
  - `Domain` zależy tylko od `Shared\Domain`.
  - `Application` zależy od `Domain` swojego modułu oraz od `Shared\Domain` i `Shared\Application`.
  - `Infrastructure` może używać wszystkich warstw swojego modułu i `Shared`.
- `Domain` i `Application` nie używają HTTP (HttpFoundation, HttpKernel, Routing, kontrolery, PSR-7) ani persystencji (Doctrine DBAL, ORM, Migrations). Kontrolery, repozytoria Doctrine i inne adaptery są w `Infrastructure`. Mapowanie encji Doctrine też jest w `Infrastructure` (np. XML), a nie w atrybutach ORM w klasach domeny.
- Zależności między modułami są domyślnie zabronione. Nową zależność dodaje się świadomie w `ruleset` w `deptrac.yaml`, z uzasadnieniem w commicie, najlepiej tylko do warstwy `Application` drugiego modułu. Nigdy do jego `Domain` ani `Infrastructure`.
- `Shared` tylko dla elementów rzeczywiście używanych przez kilka modułów (np. `Money`). `Shared` nie zależy od żadnego modułu.
- Autoryzacja zawsze na backendzie, niezależnie od zabezpieczeń interfejsu.
- Nie dodawaj `skip_violations` ani wyjątków w `deptrac.yaml`, żeby uciszyć naruszenie. Popraw kod albo zapytaj użytkownika o zmianę reguły.
- Moduły rozmawiają przez porty: moduł potrzebujący danych definiuje interfejs w swojej warstwie `Application`, a adapter łączący moduły leży w `Infrastructure` (np. `src/Catalog/Infrastructure/Inventory`). Dane do list pobieraj zbiorczo (jedno zapytanie na stronę), bez N+1.

## API

- Klienci wołają `/api/...`, proxy usuwa prefiks, więc trasy Symfony są bez `/api` ([ADR-0005](../../docs/adr/0005-catalog-inventory-and-admin-api-access.md)).
- `/catalog/...` (i inne publiczne): tylko odczyt. Każda operacja zapisu jest pod `/admin/...`, za firewallem `admin_api`; pilnuje tego test `AdminApiSecurityTest`.
- Trasy JSON mają `format: 'json'`. Błędy to `application/problem+json` (`ApiExceptionSubscriber`): wyjątki domenowe `NotFound` → 404, `Conflict` → 409, `InvalidValue` → 422.
- Administracyjne API chroni **tymczasowy** token Bearer z sekretu `ADMIN_API_TOKEN` (min. 32 znaki, pusty = brak dostępu). Tylko testy i wywołania serwerowe; nigdy w kodzie przeglądarki ani w zmiennych `VITE_*`/`NEXT_PUBLIC_*`. Przed podłączeniem panelu admina zastąpi go logowanie z sesją HttpOnly i CSRF. Lokalnie ustaw go w `.env.local` (`openssl rand -hex 32`); testy generują własny.

## Konwencje Symfony

- Nowe możliwości instaluj przez `make backend-composer c="require …"` i receptę Flex. Nie dopisuj ręcznie bundli w `config/bundles.php`.
  Po każdej recepcie przejrzyj zmienione pliki: recepty potrafią dopisać konfigurację niezgodną z projektem (np. własną bazę do pliku compose).
- Metadane frameworka przez atrybuty PHP (`#[Route]`, `#[MapRequestPayload]`, `#[Assert\…]`, `#[AsCommand]`…). Bez routingu w YAML/XML.
- Autowiring i autokonfiguracja. Gdy typ nie wystarcza: `#[Autowire]` / `#[Target]`. Definicja w YAML to ostateczność.
- Kontrolery: cienkie klasy `final readonly` z metodą `__invoke` i zależnościami w konstruktorze, bez dziedziczenia po `AbstractController` (łatwiejsze testy jednostkowe). Logika trafia do serwisów.
- Dane żądania wiąż przez `#[MapRequestPayload]` / `#[MapQueryString]`, nie przez ręczne `json_decode()`.
- DTO i value objects: promocja właściwości w konstruktorze i `readonly`.
- Wzajemne wykluczanie przez `symfony/lock`, nie ręczne flagi.
- Zmiany schematu bazy wyłącznie przez migracje Doctrine (`make backend-console c="doctrine:migrations:diff"`), nigdy `doctrine:schema:update`.
- `.env` zawiera tylko domyślne wartości dev. Prawdziwe sekrety: `.env.local` (ignorowany przez git), sekrety Symfony albo zmienne środowiskowe przy uruchomieniu.
- Połączenie z bazą: osobne parametry `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD`, `DATABASE_SERVER_VERSION`; nie wprowadzaj z powrotem `DATABASE_URL`.
- Mapowania Doctrine rejestrujemy per bounded context (`config/packages/doctrine.yaml`), od pierwszych encji.
- Styl kodu: standard Symfony (PSR-12). php-cs-fixer nie jest zainstalowany.
- Dokumentacja: https://symfony.com/doc/current/. API zmienia się między wersjami, więc sprawdzaj w `vendor/` i przez `bin/console debug:*` zamiast polegać na pamięci.

## Struktura

- `src/<Moduł>/<Warstwa>/`: kod aplikacji; moduły `Catalog`, `Inventory` i `Shared` (`Money`, `VatRate`, problem details, bezpieczeństwo API, `/health`)
- mapowania Doctrine: `src/<Moduł>/Infrastructure/Persistence/Doctrine/Mapping/*.orm.xml`, typy DBAL dla value objects z `#[AsDbalType]`
- `tests/Support/Contract/`: walidacja odpowiedzi względem kontraktu (kontrakt montowany w kontenerze dev jako `/contract`)
- `tests/Unit/` (bez kernela), `tests/Integration/` (`KernelTestCase` z bazą: repozytoria, zapytania, schemat), `tests/Functional/` (`WebTestCase`, HTTP): struktura katalogów odzwierciedla `src/`; `tests/Support/`: wspólne klasy testów (czyszczenie bazy, fixtures, repozytoria w pamięci)
- Obraz Docker backendu: `infra/docker/backend/` (Dockerfile, Caddyfile, PHP ini, entrypoint prod)
