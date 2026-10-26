# ADR-0002: Frontend workspace and the admin app

- Status: accepted
- Date: 2026-10-25

## Context

Stage 2 of the monorepo migration ([ADR-0001](0001-monorepo-layout.md)) adds the first frontend, the admin panel.
Requirements:

- one lockfile;
- pinned, compatible Node.js, pnpm and tool versions;
- development both directly on macOS (IDE, debugging, HMR) and fully in Docker Compose, without installing anything on the host;
- no native-module conflicts between macOS and Linux.

## Decision

1. **pnpm workspaces** (`apps/*`, `packages/*`), one `pnpm-lock.yaml`.
   - pnpm 12.12.1 is pinned through `packageManager` and provided by corepack.
   - Node 24.21.0 LTS is pinned in `.node-version` and enforced with `engineStrict`.
   - Dependency versions in `package.json` are exact (`saveExact`).
   - No Turborepo (see ADR-0001).

2. **Admin stack:**
   - React 19, Vite 8, Vitest with Testing Library (jsdom), ESLint with `typescript-eslint` strict type-checked rules.
   - **TypeScript 6.0, not 7:** `typescript-eslint` 8.x supports TypeScript < 6.1. Revisit when it supports TypeScript 7.

3. **Two development modes, never sharing `node_modules`:**
   - **Docker:** the repository is bind-mounted into the `admin` container, but `node_modules` (root and app) live in named Docker volumes with Linux binaries. The pnpm store sits on the same volume, so packages are hard-linked, not copied. `make pnpm-install` installs them explicitly (containers never install on start).
   - **Local:** `pnpm install` on the host creates its own `node_modules` with macOS binaries.
   - Both modes use the same lockfile. HMR works in both: Docker Desktop delivers file events on the bind mount, and `ADMIN_DEV_POLLING=1` is the fallback.

4. **Same-origin API.**
   - The admin calls the backend under `/api`. In development the Vite server proxies `/api` to the backend and strips the prefix; in production the central edge does (stage 4).
   - Browser-visible configuration (`VITE_*`) never holds secrets or API addresses.
   - Authentication is OIDC (Keycloak) with the session kept in a BFF; the browser never holds tokens. The backend is stateless and authorisation is always enforced by the backend ([architecture](../architecture.md)).

5. **Production image** (`infra/docker/admin`):
   - built from the repository root with an allowlist, with a frozen-lockfile install and the Vite build;
   - the result is static files served by Caddy on Alpine, as uid 1000 on port 8080;
   - the Caddy binary's `cap_net_bind_service` file capability is removed, so the container runs with all capabilities dropped and a read-only filesystem;
   - no TLS, domains or `/api` proxy in this image, to avoid duplicating the edge configuration;
   - until stage 4 the admin is not part of `compose.prod.yaml`; `make admin-check-prod` verifies the image on its own.

## Consequences

- **Local mode needs Node 24.21 on macOS** (e.g. via fnm/mise reading `.node-version`) and `corepack enable pnpm`. Docker mode needs nothing on the host.
- **Two `node_modules` copies** (host and volume) take disk space but cannot break each other.
- **Volumes per package:** each new workspace package with its own `node_modules` needs a volume entry in `compose.override.yaml` (`apps/store` in stage 3).
- **The `/api` prefix stripping is provisional.** It will be confirmed together with the edge routing in stage 4 and the OpenAPI contract in stage 5.
