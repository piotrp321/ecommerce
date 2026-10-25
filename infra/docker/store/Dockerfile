#syntax=docker/dockerfile:1
# Store (Next.js) image. Build context: repository root, restricted by
# Dockerfile.dockerignore to the pnpm workspace files, apps/store and infra/docker/store.

FROM node:24.21.0-trixie-slim AS node_base

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
	NEXT_TELEMETRY_DISABLED=1

WORKDIR /workspace

# pnpm in the version pinned by packageManager in package.json, cached in the image.
COPY --link package.json ./
RUN set -eux; \
	corepack enable pnpm; \
	corepack install

# Dev image (development-only simplification):
# the repository is bind-mounted into /workspace; node_modules and .next live in
# Docker volumes (Linux binaries and build cache, never shared with a macOS host)
# and dependencies are installed explicitly with `make pnpm-install`.
FROM node_base AS store_dev

# Keep the pnpm store on the node_modules volume, so packages are hard-linked.
ENV npm_config_store_dir=/workspace/node_modules/.pnpm-store

EXPOSE 3000

# Liveness of the Next.js process only (/healthz renders no page and never calls the
# backend), so an unavailable or unmigrated backend does not make the store unhealthy.
HEALTHCHECK --start-period=60s CMD node -e "fetch('http://127.0.0.1:3000/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

CMD ["pnpm", "--filter", "store", "dev", "--hostname", "0.0.0.0", "--port", "3000"]

# Build stage: frozen-lockfile install and the standalone Next.js build.
FROM node_base AS store_build

COPY --link pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --link apps/store/package.json apps/store/
RUN pnpm install --frozen-lockfile --filter store

COPY --link apps/store/ apps/store/
RUN pnpm --filter store build

# Prod image: the standalone server (server.js + traced dependencies) and static
# assets only, run by the unprivileged `node` user. No package manager, sources or
# dev dependencies. TLS and domains belong to the central edge proxy (stage 4).
FROM node:24.21.0-trixie-slim AS store_prod

ENV NODE_ENV=production \
	NEXT_TELEMETRY_DISABLED=1 \
	PORT=3000 \
	HOSTNAME=0.0.0.0

WORKDIR /app

# npm and corepack are not needed at runtime.
RUN set -eux; \
	rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
		/usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn-*; \
	rm -f /usr/local/bin/yarn /usr/local/bin/yarnpkg

COPY --link --from=store_build /workspace/apps/store/.next/standalone ./
COPY --link --from=store_build /workspace/apps/store/.next/static ./apps/store/.next/static

# Only the Next.js cache directory is writable (mount a tmpfs there with a read-only root filesystem).
RUN set -eux; \
	mkdir -p apps/store/.next/cache; \
	chown node:node apps/store/.next/cache

USER node

EXPOSE 3000

HEALTHCHECK --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

CMD ["node", "apps/store/server.js"]
