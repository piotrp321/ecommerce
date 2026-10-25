# ADR-0001: Monorepo layout

- Status: accepted
- Date: 2026-10-24

## Context

The project started as a single Symfony application in the repository root (Milestone 1).
Next come a customer-facing store (Next.js) and an admin panel (React + Vite) that talk to the backend over a REST API.
All three are developed together, mostly by AI agents, so they need one repository with consistent commands, checks and instructions.

## Decision

1. **One repository with this layout:**

   | Path | Contents |
   |---|---|
   | `apps/backend` | Symfony 8, PHP 8.5, DDD + Hexagonal; the only source of business logic |
   | `apps/store` | Next.js + React + TypeScript |
   | `apps/admin` | React + Vite + TypeScript |
   | `packages/sdk` | typed API client generated from OpenAPI |
   | `infra/docker/<app>`, `infra/edge`, `infra/scripts` | images, reverse proxy, tooling scripts |
   | `docs` | specs, roadmap, ADRs |
   | root | Compose files, `Makefile`, pnpm workspace, `AGENTS.md` |

   Directories and packages are created only when their stage starts (no empty placeholders).

2. **Names are final:**
   - apps: `backend`, `store`, `admin`; package: `sdk`,
   - Compose services: `backend`, `store`, `admin`, `database`, `edge`,
   - images: `ecommerce-<app>`.

3. **Images are built from the repository root as context.**
   - Each Dockerfile has its own allowlist (`infra/docker/<app>/Dockerfile.dockerignore`, read by BuildKit), so an image only contains its own app.
   - Frontend images will need the root pnpm lockfile and `packages/`, which is why the context is the root.

4. **One root `Makefile`.**
   - Aggregate targets without a prefix: `bootstrap`, `up`, `down`, `check`, `build-prod`, `check-prod`.
   - Per-app targets with the app prefix: `backend-*`, later `store-*`, `admin-*`.
   - CI calls these targets instead of duplicating the build logic.

5. **Instructions for agents.**
   - The root `AGENTS.md` covers the whole repository; each app may add its own `AGENTS.md`.
   - `CLAUDE.md` files only import the neighbouring `AGENTS.md`.
   - `apps/backend/AGENTS.md` is also the path the `symfony/framework-bundle` recipe tracks, so future recipe updates show up as a normal diff in an existing file, with no need to edit `symfony.lock`.

6. **pnpm workspaces for the frontends, no Turborepo for now.**
   - With two apps and one generated package, `pnpm -r` / `--filter` covers ordering and affected-only runs.
   - Revisit when the number of packages or the build times make caching worthwhile.

7. **The migration is staged, one pull request per stage:**
   1. backend to `apps/backend`,
   2. pnpm workspace and `apps/admin`,
   3. `apps/store`,
   4. production topology with a central Caddy edge,
   5. OpenAPI, contract tests and later `packages/sdk`,
   6. CI optimisation, only if measurements justify it.

## Consequences

- **Container paths are unchanged.** `apps/backend` is mounted (dev) or copied (prod) to `/app`, so PHP, PHPStan, Deptrac and PHPUnit configuration did not change.
- **Local data is kept.** The dev Compose project name (`ecommerce`) and volume keys are unchanged.
- **Existing checkouts need one-time manual steps.** Ignored files (`.env.local`, `vendor/`, `var/`) must be moved by hand; the README describes how.
- **One file is outside the recipe's location.** `symfony/framework-bundle` also tracks `.editorconfig`, which now lives in the root because it applies to the whole repository. A future recipe update may propose recreating `apps/backend/.editorconfig`; review it then.
