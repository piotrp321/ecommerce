# ADR-0004: Edge proxy and production topology

- Status: accepted
- Date: 2026-10-25

## Context

Stage 4 of the monorepo migration ([ADR-0001](0001-monorepo-layout.md)) puts the backend, the store and the admin behind a single public entry point. Requirements:

- a central Caddy edge with HTTPS, routing by domain and path;
- PostgreSQL reachable only inside the network;
- independent build and deployment of each app;
- unprivileged containers, no secrets in images;
- the existing production checks kept;
- no assumption that all apps share one host.

## Decision

1. **Edge image** (`infra/edge`, `ecommerce-edge`). Caddy with the configuration baked in and validated at build time, so the edge is versioned and deployed like the applications.
   - `STORE_DOMAIN`: `/api/*` → backend, everything else → store.
   - `ADMIN_DOMAIN`: `/api/*` → backend, everything else → admin.
   - `STORE_DOMAIN` answers 404 for the internal-only paths `/api/admin/*` (the admin API belongs to `ADMIN_DOMAIN`) and `/auth/backchannel-logout` (Keycloak calls it inside the network).
   - `AUTH_DOMAIN`: Keycloak, limited to what a browser needs: `/realms/store/*`, `/realms/admin/*` and `/resources/*`. Within these realms the server-to-server endpoints (`protocol/openid-connect/token`, `userinfo`, `revoke`, `token/introspect`, `ext/*`, `auth/device`, `clients-registrations/*`) answer 404, so are ambiguous spellings of any path (empty or dot segments, matrix parameters, encoded separators). Discovery and JWKS (`certs`) stay public. Everything else answers 404: the admin console (`/admin/*`), the `master` realm, `/health`, `/metrics`, `/`. The applications exchange codes and fetch discovery and keys inside the network (`http://keycloak:8080`), so blocking the public token endpoint does not affect the login. The edge adds only transport headers there and keeps Keycloak's own CSP; the request body limit is 64 KB.
   - `/api` is removed before the backend (`handle_path`), matching the OpenAPI contract (`servers: /api`) and the Vite dev proxy. New backend endpoints need no edge change. `Authorization` headers pass unchanged.
   - Automatic HTTPS certificates; plain HTTP only redirects (308) to HTTPS on the public port and serves ACME challenges. Unknown host names get no certificate and no route.
   - HSTS, `nosniff`, no `Server`/`Via` headers, and a 10 MB request body limit.
   - The edge does not duplicate the apps' own headers: it adds transport-level ones only.

2. **Unprivileged edge.**
   - It runs as uid 1000 on 8080/8443, published as 80/443.
   - The Caddy binary's `cap_net_bind_service` file capability is removed (as in the admin image).
   - The container runs with `cap_drop: ALL`, `no-new-privileges` (which would block file capabilities anyway) and a read-only root filesystem; certificates live on the `edge_data`/`edge_config` volumes.
   - Because the internal HTTPS port is 8443, automatic redirects are disabled and an explicit `http://` block redirects to `https://{host}{uri}`.

3. **Production Compose topology** (`compose.prod.yaml`, project `ecommerce-prod`).
   - Only `edge` publishes ports.
   - The backend serves plain HTTP on `:80` inside the network (`SERVER_NAME=:80`).
   - Store and admin run their production images read-only with all capabilities dropped and `no-new-privileges`; the store gets a tmpfs for its Next.js cache.
   - `STORE_DOMAIN`, `ADMIN_DOMAIN` and `AUTH_DOMAIN` are required next to the secrets.
   - Keycloak (`keycloak_prod`: `kc.sh build`, `start --optimized --import-realm`, realms in the image) and the store session Redis (`redis-session`) run in the same project: non-root, read-only root filesystem with tmpfs, `cap_drop: ALL`, `no-new-privileges`, no published ports. Keycloak's public URL is `https://${AUTH_DOMAIN}` (`KC_PROXY_HEADERS=xforwarded`, plain HTTP behind the edge, dynamic back-channel on `keycloak:8080`); its admin console has a non-public hostname and is administered with `kcadm.sh` inside the container. Its database and role in the shared PostgreSQL are created by `infra/scripts/keycloak-db.sh` between the database and the other services. Redis is on a separate internal network `sessions`, shared with the store only.
   - `admin` and `store` base definitions moved to `compose.yaml`; the merged development configuration is byte-for-byte unchanged.

4. **Independent deployment.**
   - Each app (and the edge) is a separate image (`make <app>-build-prod`), deployed with `docker compose ... up -d --no-deps <service>`.
   - Caddy resolves upstream names per connection, so redeploying an app does not require an edge restart.
   - Moving an app to another host only changes its upstream address in the Caddyfile.

5. **Checks.**
   - `check-prod-stack.sh` (replacing `check-prod-backend.sh`) runs the whole topology in an ephemeral project, with test domains (`store.localhost`, `admin.localhost`) and Caddy's local CA.
   - It keeps every backend check (now through the edge) and adds:
     - routing by domain and path, prefix removal, the frontend fallback, the HTTP redirect and unknown hosts;
     - edge headers;
     - "only the edge is exposed";
     - non-root users and zero effective capabilities;
     - redeployment of store, admin, backend, edge, Keycloak and Redis one at a time, with the other containers untouched and all routes working;
     - the browser login through the edge (`auth.localhost`): authorization code with PKCE for `store-bff`, the code exchanged inside the network, the public token endpoint answering 404, and 404 for every blocked `AUTH_DOMAIN` path.
   - A deliberately broken route (no prefix removal) was verified to fail the check.
   - The image-level checks of admin and store stay.

## Consequences

- **Production needs DNS records** for the three domains pointing to the edge host, with ports 80/443 open for ACME. Changing `AUTH_DOMAIN` changes the token issuer. `EDGE_GLOBAL_OPTIONS` can set an ACME e-mail or a different CA.
- **Open: trusted proxies in Symfony.** The backend sees the edge as the client and `http` as the scheme. `framework.trusted_proxies` / `X-Forwarded-*` handling must be configured in `apps/backend/config` once the backend relies on the client IP or scheme (e.g. rate limiting, absolute URLs, secure cookies). It was not changed here to avoid touching backend configuration while the Catalog module is developed in parallel.
- **Open: the backend container is not read-only yet.** It writes to `var/`; making it read-only needs tmpfs/volume decisions for logs and cache.
- **Open: a single host for now.** High availability (several edge or app instances) is out of scope.
