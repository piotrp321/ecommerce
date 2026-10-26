# ADR-0005: Catalog and Inventory modules, API addresses and API access

- Status: accepted
- Date: 2026-10-25

## Context

Milestone 2 brings the first business endpoints: products and categories for the store,
and their management for administrators.
The specification ([01-placing-order.md](../specs/01-placing-order.md)) defines prices (R11–R14, section 3.4)
and availability as stock minus reservations (R7), with reservations coming in Milestone 5.
Administrative operations change data, so they must not be reachable without authorisation.
Accounts, login and roles of customers and administrators live in an external identity provider (Keycloak).

## Decision

1. **Two modules from the start.**
   - `Catalog` owns products (SKU, slug, name, description, unit net price, VAT rate, active flag, optional category) and the category tree.
   - `Inventory` owns stock (`StockItem`: quantity on hand per product). Milestone 5 adds reservations there,
     so the atomic reservation (R18–R20) touches one module.
   - `Shared\Domain` holds `Money` (integer grosze, PLN only), `VatRate` (23/8/5/0) and `LinePrice` (section 3.4),
     because Ordering needs the same rules in Milestone 5.

2. **Modules talk through ports, one Deptrac rule.**
   - Catalog declares `ProductAvailability` (Application); Inventory declares `KnownProducts` (Application)
     and publishes the `StockLevels` query API.
   - Both adapters live in `Catalog\Infrastructure\Inventory`, a Deptrac layer of their own
     (`Catalog_InventoryAdapters`); it is the only code allowed to use `Inventory_Application`.
     Inventory does not depend on Catalog.
   - Domain and Application may not use framework components either (Deptrac layer `Framework`:
     validation, serialization, security, messaging, DI…); only small value libraries
     (`symfony/uid`, `psr/clock`) are allowed there.
   - Availability of a product list is looked up once per page (`StockLevels::forProducts()`), never per product.
   - `StockLevel` already exposes `onHand`, `reserved` and `available`; `reserved` is 0 until Milestone 5.

3. **Category tree: adjacency list (`parent_id`) with recursive queries, not a nested set.**
   - A category is a root or has one parent; a product belongs to at most one category.
     The tree has at most 10 levels (`CategoryPlacement::MAX_DEPTH`).
   - Reads: the whole tree is one plain query (the table is small) assembled in PHP;
     a subtree, the ancestors (breadcrumbs) and "products of a category including its subcategories"
     are `WITH RECURSIVE` queries over the `parent_id` index.
   - Moving a branch is a single `UPDATE` of `parent_id`. With a nested set (`lft/rgt`) it rewrites
     the boundaries of a large part of the table under a lock of the whole tree; nested sets pay off
     for very large, rarely changed trees with heavy subtree reads, which is not our case
     (hundreds of categories, moves are an expected admin operation).
   - Rules: no cycles (not its own parent, not under its own descendant) and the depth limit are checked
     by the `CategoryPlacement` domain service. The database enforces both as well: a trigger takes an
     advisory lock and rejects a cycle or a too deep branch, so concurrent changes that pass the
     application check one by one cannot break the tree together. This relies on READ COMMITTED
     (PostgreSQL's default): under REPEATABLE READ the trigger would not see changes committed after the
     transaction started, so it refuses other isolation levels. Its recursions detect cycles, so a tree
     broken from outside (e.g. a restore with triggers disabled) makes writes fail at once instead of
     looping while holding the lock. Tests with two database connections cover these guarantees.
   - Names (products and categories) are ordered by Polish rules through the ICU collation `pl-x-icu`;
     the database default orders by byte value.
   - Deleting a category with products or subcategories is refused (409); nothing is deleted or moved
     implicitly. Foreign keys (`parent_id`, `catalog_product.category_id`) back this up.

4. **Persistence.**
   - Doctrine XML mappings in each module's `Infrastructure`, custom DBAL types for value objects.
   - Products reference categories by id; the foreign key is declared through a schema listener so
     `doctrine:migrations:diff` stays clean. There is no foreign key between modules (`inventory_stock_item` → `catalog_product`).
   - Read models use DBAL queries; writes go through the aggregates and repositories.
   - Database CHECK constraints repeat the core invariants (price range, allowed VAT rates, non-negative stock).

5. **API addresses.**
   - Clients always call `/api/...` on their own origin. The proxy in front of the backend
     (the Vite dev server of the admin in development, the central Caddy edge in production) strips `/api`; the store calls the backend server-side only;
     Symfony routes have no prefix.
   - The contract is [`docs/api/openapi.yaml`](../api/openapi.yaml): `servers: [{url: /api}]` plus prefix-less paths,
     so the documented public address is the server URL plus the path.
   - `Location` headers are relative references (`products/{id}`), correct both behind the proxy and directly.
   - `/catalog/...` is public and read-only; `/admin/...` is administrative. A test fails if any
     non-GET route is added outside `/admin/`.
   - Public responses disclose availability only as `inStock`; quantities (`onHand`, `reserved`,
     `available`) and product counts are in the administrative API only.

6. **API access: OpenID Connect access tokens.**
   - The identity provider is Keycloak with two realms: `store` (customers) and `admin` (administrators).
     The backend only validates access tokens, statelessly (no sessions, no cookies). Browsers never hold
     the tokens: the backends-for-frontends (clients `store-bff`, `admin-bff`) call the API with them.
   - Firewalls (`config/packages/security.yaml`):
     - `admin_api` (`^/admin/`): tokens of the `admin` realm, audience `admin-api`;
     - `public` (`^/(health$|catalog/)`): no authentication, so a token sent along is ignored
       (a stateless firewall cannot be lazy);
     - `store_api` (every other path, e.g. `/me`): tokens of the `store` realm, audience `store-api`.
   - `access_control`: `^/admin/` requires `ROLE_ADMIN`, the public paths are `PUBLIC_ACCESS`,
     every other path requires `ROLE_CUSTOMER` (deny by default).
   - Validation by Symfony's `oidc` token handler with OIDC discovery:
     - RS256 signature with the realm's published keys (`OIDC_*_DISCOVERY_URL`, the internal address of the realm),
     - exact `iss` (`OIDC_*_ISSUER`, the public address of the realm), `aud` (`OIDC_*_AUDIENCE`),
       `exp`, `nbf` and `iat` without leeway, and a `sub`.
     - The backend reads the discovery document at the internal address, and fetches the keys from the
       `jwks_uri` that the document announces. That URI must be reachable from the backend container,
       i.e. Keycloak must announce its backchannel endpoints at the address of the request
       (`KC_HOSTNAME_BACKCHANNEL_DYNAMIC=true`) and not at the public address of the tokens' `iss`.
       Keycloak's configuration is not part of the backend.
   - A decorator of each firewall's token handler (`AccessTokenPolicy`) also requires `typ: Bearer`
     (no ID, refresh or logout tokens) and an `azp` listed in `OIDC_*_CLIENTS`.
     It runs before the user provider, so a rejected token registers nobody.
   - Roles come from the token only:
     - `ROLE_ADMIN` only from the client role `admin` of the admin API client
       (`resource_access.admin-api.roles`); realm roles and roles of other clients are ignored;
     - every valid store token is a customer (`ROLE_CUSTOMER`).
   - Identities: the `Customers` module (`Customer`) and the `Backoffice` module (`AdminUser`) store the
     external identity (issuer + subject, `UNIQUE(issuer, subject)`) and a copy of the profile (e-mail).
     - Registered just in time by the user providers on the first request: a lookup, then
       `INSERT … ON CONFLICT (issuer, subject) DO NOTHING` and a second read, so concurrent first requests
       end with one row and no error. The profile is written only when it changed.
     - An `AdminUser` is registered only for a token with the administrator role. It stores no roles,
       only a local status: a blocked administrator gets 403 whatever the token says.
   - Discovery documents and keys are cached in the `cache.oidc` pool (filesystem in every environment;
     the tests empty it before each test) for the JWKS `Cache-Control: max-age` (1 hour without it,
     at most 30 days); failures are not cached.
     The pool has no stampede lock (`src/Kernel.php`): with Symfony Cache's default `LockRegistry`,
     concurrent requests outside the CLI wait for the one downloading the keys, and since a failure is
     not cached, with a hanging identity provider they would retry one after another (the n-th 401 after
     n timeouts). Without the lock every request makes its own bounded attempt.
     Discovery makes two sequential requests (the discovery document, then the JWKS); its HTTP client
     limits each to 1.5 s (1 s idle timeout), so an unreachable or slow identity provider means 401
     within 3 s, never 500 or a hanging request.
   - Errors (RFC 6750), as `application/problem+json` with a generic `detail` (the reason is only logged):
     401 with `WWW-Authenticate: Bearer` without a token or `Bearer error="invalid_token"` for a rejected one,
     403 with `Bearer error="insufficient_scope"` for a valid token without the required role.
   - Lifetime of the cached keys: the `max-age` of the JWKS response's `Cache-Control` header (at most
     30 days), 1 hour without one (Symfony's default). Keycloak sends `Cache-Control: no-cache` without
     `max-age` for its certs endpoint, so the backend keeps the keys for 1 hour.
   - Signing key rotation in Keycloak:
     1. add the new key with a lower priority than the active one: it is published in the JWKS but not used for signing yet,
     2. wait longer than the lifetime of the cached keys, so every backend has it,
     3. give the new key the highest priority: new tokens are signed with it,
     4. remove the old key only after the last token signed with it has expired (the access token lifespan).
   - Emergency withdrawal of a compromised key: a new `kid` does not refresh the cache, so a backend trusts
     the removed key until its cached keys expire. After removing the key in Keycloak, run
     `bin/console cache:pool:clear cache.oidc` on every backend instance; the next request downloads the
     current keys. Tokens signed with the removed key are then rejected (401).

## Consequences

- Every customer and administrator has their own identity (`Customer`, `AdminUser` ids), so actions can be
  attributed to a person. Role changes in Keycloak take effect with the next access token;
  a local block of an administrator takes effect with the next request.
- Controllers do not depend on the authentication method: they get the current user (`#[CurrentUser]`).
- The backend needs the identity provider only for its keys. While they are cached, valid tokens keep
  working during an outage of the provider; without cached keys the protected APIs answer 401.
  The public API does not depend on the provider at all.
- The production image has no defaults: the backend needs the `OIDC_STORE_*` and `OIDC_ADMIN_*` variables
  (issuer, discovery URL, audience, clients) at runtime; `compose.prod.yaml` refuses to start without any
  of them. `apps/backend/.env` holds the development values.
- Browser clients never hold the tokens: the admin panel and the store reach the API through their
  backends-for-frontends ([architecture](../architecture.md), ADR-0002).
- `docs/api/openapi.yaml` is maintained by hand for now; contract tests exist (ADR-0007); `packages/sdk` follows in stage 5.
- Milestone 5 adds reservations in Inventory and changes only the `reserved` part of `StockLevels`;
  Catalog and the API already carry `reserved` and `available`.
