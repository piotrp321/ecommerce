# ADR-0005: Catalog and Inventory modules, API addresses and interim admin access

- Status: accepted
- Date: 2026-10-25

## Context

Milestone 2 brings the first business endpoints: products and categories for the store,
and their management for administrators.
The specification ([01-placing-order.md](../specs/01-placing-order.md)) defines prices (R11–R14, section 3.4)
and availability as stock minus reservations (R7), with reservations coming in Milestone 4.
Administrative operations change data, so they must not be reachable without authorisation,
but there are no user accounts or login yet.

## Decision

1. **Two modules from the start.**
   - `Catalog` owns products (SKU, slug, name, description, unit net price, VAT rate, active flag, optional category) and the category tree.
   - `Inventory` owns stock (`StockItem`: quantity on hand per product). Milestone 4 adds reservations there,
     so the atomic reservation (R18–R20) touches one module.
   - `Shared\Domain` holds `Money` (integer grosze, PLN only), `VatRate` (23/8/5/0) and `LinePrice` (section 3.4),
     because Ordering needs the same rules in Milestone 4.

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
   - `StockLevel` already exposes `onHand`, `reserved` and `available`; `reserved` is 0 until Milestone 4.

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
     (Vite and Next.js dev servers now, the central Caddy edge from stage 4) strips `/api`;
     Symfony routes have no prefix.
   - The contract is [`docs/api/openapi.yaml`](../api/openapi.yaml): `servers: [{url: /api}]` plus prefix-less paths,
     so the documented public address is the server URL plus the path.
   - `Location` headers are relative references (`products/{id}`), correct both behind the proxy and directly.
   - `/catalog/...` is public and read-only; `/admin/...` is administrative. A test fails if any
     non-GET route is added outside `/admin/`.
   - Public responses disclose availability only as `inStock`; quantities (`onHand`, `reserved`,
     `available`) and product counts are in the administrative API only.

6. **Interim admin access: one bearer token.**
   - Firewall `admin_api` (`^/admin/`, stateless) with Symfony's `access_token` authenticator; `access_control` requires `ROLE_ADMIN`.
   - The token comes only from the `ADMIN_API_TOKEN` secret (runtime environment variable, `.env.local`
     or Symfony secrets). Nothing is committed: `.env` keeps it empty, tests generate a random token per run.
   - At least 32 characters (`openssl rand -hex 32` gives 64). A missing, empty or shorter value denies every request.
   - Compared in constant time on SHA-256 hashes (`hash_equals`), so neither content nor length leaks through timing.
   - Errors: 401 with `WWW-Authenticate: Bearer` (RFC 6750), 403 for an authenticated caller without the role,
     both as `application/problem+json`.
   - **Only for tests and server-side calls.** The token must never be placed in React or any browser code,
     nor in public variables (`VITE_*`, `NEXT_PUBLIC_*`).

## Consequences

- **Before the admin panel uses the API**, the token is replaced by admin accounts with login,
  HttpOnly session cookies and CSRF protection for state-changing requests (as foreseen in ADR-0002).
  Controllers do not depend on the authentication method, so only the firewall configuration changes.
- One token means one shared identity: no per-person audit trail and rotation means redeploying the secret.
  Acceptable only while the admin API has no browser clients.
- In production the admin API is disabled until `ADMIN_API_TOKEN` is provided to the backend container.
- `docs/api/openapi.yaml` is maintained by hand for now; contract tests and `packages/sdk` follow in stage 5.
- Milestone 4 adds reservations in Inventory and changes only the `reserved` part of `StockLevels`;
  Catalog and the API already carry `reserved` and `available`.
