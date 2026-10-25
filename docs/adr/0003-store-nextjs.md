# ADR-0003: Store app (Next.js)

- Status: accepted
- Date: 2026-10-25

## Context

Stage 3 of the monorepo migration adds the customer-facing store.
It needs SEO, server-side rendering and Server Components, and has to follow the same rules as the admin ([ADR-0002](0002-frontend-workspace-and-admin.md)):

- one pnpm lockfile;
- pinned versions;
- development locally and in Docker;
- an independent, unprivileged production image without secrets.

## Decision

1. **Next.js 16 (App Router, Turbopack), React 19, TypeScript 6.0.**
   - **16.4.2 instead of the newest release older than two weeks (16.4.0).** 16.4.0 is affected by critical advisories (GHSA-2464-fhr4-w9xw, GHSA-673q-mjm6-r5xr) and a high one (GHSA-p3m5-59mp-jv5r); 16.4.1 fixed them and 16.4.2 adds stability fixes. Security fixes take priority over the age rule.
   - `pnpm audit` reports no known vulnerabilities in the workspace.

2. **Server-first rendering.**
   - Server Components by default; the home page renders on every request (`force-dynamic`).
   - Data fetching happens on the server when it makes sense, and calls from the browser are allowed where a feature needs them.
   - The backend address will be a runtime server-side variable, added with the first endpoint (none is needed yet).

3. **Lint.**
   - Same base as the admin (ESLint 10, `typescript-eslint` strict type-checked, React hooks) plus `@next/eslint-plugin-next` (Core Web Vitals).
   - `eslint-config-next` is not used, because its React/import/jsx-a11y plugins do not support ESLint 10 yet. Accessibility linting is therefore postponed; revisit when the plugins support ESLint 10.

4. **Agent instructions.**
   - Next.js 16 writes a managed block into `AGENTS.md` on `next dev`.
   - It is disabled (`agentRules: false`), and its useful advice (read the version-matched docs in `node_modules/next/dist/docs`) is part of the project's own `apps/store/AGENTS.md`.

5. **Development.**
   - Docker: the `store` service runs `next dev` on the bind-mounted repository, with its own `.next` volume. Every frontend service mounts all workspace `node_modules` volumes, so `make pnpm-install` (run in any frontend container) never writes Linux binaries to the host.
   - Local: `pnpm dev:store`.
   - HMR works in both modes. `STORE_DEV_POLLING=1` is the fallback for bind mounts.

6. **Production image** (`infra/docker/store`):
   - built with a frozen-lockfile install and `output: 'standalone'`, traced from the workspace root;
   - the runtime contains only `server.js`, the traced dependencies and the static assets, run as `node` (uid 1000);
   - npm, corepack and yarn are removed;
   - it runs with all capabilities dropped and a read-only root filesystem, with a tmpfs for `.next/cache`;
   - telemetry is disabled;
   - server source maps are kept for readable production errors, and browser source maps are not published;
   - TLS and domains stay with the edge (stage 4); until then the store is not part of `compose.prod.yaml` and `make store-check-prod` verifies the image on its own.

## Consequences

- **The store image is about 400 MB** (Node.js runtime and `sharp` for image optimisation). A smaller base image can be evaluated later, when size matters.
- **No CSP header yet.** A strict Content-Security-Policy with Next.js needs per-request nonces; it is postponed until the store has real content and third-party integrations.
- **Each new workspace package with its own `node_modules`** needs a volume mounted in every frontend service.
