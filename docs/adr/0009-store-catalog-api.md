# ADR-0009: Store catalog from the backend API

- Status: accepted
- Date: 2026-10-25

## Context

The store renders its catalog from demo data behind the `CatalogSource` interface ([ADR-0006](0006-store-catalog-ui.md)). The backend has served the public catalog API since Milestone 2 ([ADR-0005](0005-catalog-inventory-and-admin-api-access.md), `docs/api/openapi.yaml`: `listCategories`, `getCategory`, `listProducts`, `getProduct`). Constraints:

- The contract and the backend do not change. `packages/sdk` with generated types comes later, so `src/catalog/types.ts` stays the store's only copy of the data shapes.
- One production image must serve every environment: `next build` runs without a backend, and the backend address is a runtime server-side variable ([ADR-0003](0003-store-nextjs.md)), never `NEXT_PUBLIC_*`.
- The store, the backend and the edge are deployed independently ([ADR-0004](0004-edge-proxy-and-production-topology.md)).
- Demo data must stay labelled. A real catalog must not be labelled as a demo or hidden from search engines.

## Decision

1. **Server-to-server connection.**
   - The store server calls the backend directly inside the Compose network (`http://backend:80`), without the edge and therefore without the `/api` prefix: Symfony routes have no prefix.
   - The browser never calls the backend for the catalog. The backend address never reaches the HTML or the browser bundle.
   - `src/catalog/http/http-source.ts` implements `CatalogSource` (`isDemo: false`):
     - requests use `cache: 'no-store'`, so data is from the moment of the request; React's `cache()` in `src/catalog/index.ts` dedupes calls within one render;
     - a 5 s timeout per request and `redirect: 'error'`;
     - responses are mapped field by field onto the store types (unknown fields dropped, types checked, `image: null`);
     - slugs are URL-encoded, and a slug outside the contract's `Slug` pattern resolves to "not found" without a request.

2. **Source selection at runtime.**
   - `src/catalog/index.ts` stays the only place that decides, through the pure function `createCatalogSource(env)`:
     - `STORE_BACKEND_URL` set to an http(s) URL selects the backend API;
     - unset or empty (also whitespace only) selects the demo data (`STORE_DEMO_DELAY_MS` still applies);
     - an invalid URL is an error, never a silent fallback to the demo data.
   - The source is created on first use, from the environment of the running server.
   - The root layout calls `connection()`, and its metadata comes from `generateMetadata`. Every page, the 404 page included, therefore renders per request: `next build` never calls the backend, and the demo labels and `robots` follow the runtime environment of the same image.

3. **Compose.**
   - The `store` service in `compose.override.yaml` and `compose.prod.yaml` gets `STORE_BACKEND_URL: ${STORE_BACKEND_URL-http://backend:80}`. The default without a colon means: unset selects the API, and an explicit empty value (`STORE_BACKEND_URL=` in `.env` or in the environment) selects the demo.
   - There is no `depends_on`, because the store is deployed independently.

4. **Demo labels follow the source.** These elements are shown only for the demo source: the notice in the layout, `robots: noindex, nofollow`, the demo wording in the footer, the "Kolekcja demonstracyjna" badge on the home page and "demonstracyjna wersja sklepu" on the product page. With the API the product page still says that ordering is not available yet (the cart comes in a later milestone).

5. **Home page.** The editorial picks in `src/content/home.ts` are demo slugs and are used with the demo source only. With the API the home page features the first active products by name (`listProducts`, `sort: 'name'`, page 1, 8 items). There is no merchandising flag.

6. **Backend failures.**
   - 5xx, other unexpected statuses, network errors, timeouts, malformed JSON and data outside the contract throw. The page answers HTTP 500 with the error page (`error.tsx`, or `global-error.tsx` when the root layout fails).
   - The store never shows an empty catalog or demo data instead.
   - Error messages name only the method and the path. The cause stays in the server log.
   - 404 of a single category or product means "not found" (HTTP 404 page).

7. **Liveness: `GET /healthz`.**
   - `src/app/healthz/route.ts` is a Route Handler. It renders no layout and does not touch `CatalogSource`, the backend or the database.
   - It answers 200 `ok` with `Cache-Control: no-store` and contains no environment data.
   - The `HEALTHCHECK` of the dev and prod images (`infra/docker/store/Dockerfile`) uses it. An unavailable or unmigrated backend therefore does not make the store container unhealthy: neither during `make bootstrap` (containers start before Composer and migrations) nor during an independent deployment.
   - The path is not `/health`, which stays with the store as a 404 in the edge routing check, and not under `/api/*`, which the edge sends to the backend.
   - Page rendering errors are detected by the tests and by `infra/scripts/check-prod-*.sh`, not by the health check.

8. **Checks.**
   - `check-prod-store.sh` runs the image without a backend and expects the demo labels and `/healthz`.
   - `check-prod-stack.sh` runs migrations before any page check. With the backend and an empty catalog it expects:
     - no demo labels and no `robots` meta;
     - the home page with `<h1>Sklep</h1>`, the listing, and 404 pages;
     - a store that stays healthy, with `/healthz` 200 and pages answering 500, while the backend is stopped.

## Consequences

- **Every page is dynamic.** The `/_not-found` page included, every page needs the backend for its root layout (the category tree). A backend outage makes every page answer 500, while the container stays healthy.
- **No product photos with the API.** The contract has no images, so products show the "Brak zdjęcia" placeholder. Proposal for the contract (not changed here): product and category images. The editorial photos of the home page (Unsplash) stay.
- **No contract validation in the store yet.** The field-by-field mapping is interim, until `packages/sdk` provides types generated from the contract (roadmap stage 5).
- **`/healthz` is public** through the edge on the store domain. It reveals nothing but liveness.
- **Unit tests use the demo source** (`STORE_BACKEND_URL` is cleared in `vitest.config.ts`), because the dev container sets the variable for `next dev`.
