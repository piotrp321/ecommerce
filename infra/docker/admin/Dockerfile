#syntax=docker/dockerfile:1
# Admin (React + Vite) image. Build context: repository root, restricted by
# Dockerfile.dockerignore to the pnpm workspace files, apps/admin and infra/docker/admin.

FROM node:24.21.0-trixie-slim AS node_base

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

WORKDIR /workspace

# pnpm in the version pinned by packageManager in package.json, cached in the image.
COPY --link package.json ./
RUN set -eux; \
	corepack enable pnpm; \
	corepack install

# Dev image (development-only simplification):
# the repository is bind-mounted into /workspace; node_modules live in Docker
# volumes (Linux binaries, never shared with a macOS host install) and are
# installed explicitly with `make pnpm-install`.
FROM node_base AS admin_dev

# Keep the pnpm store on the node_modules volume, so packages are hard-linked
# instead of copied between the store and node_modules.
ENV npm_config_store_dir=/workspace/node_modules/.pnpm-store

EXPOSE 5173

HEALTHCHECK --start-period=30s CMD node -e "fetch('http://127.0.0.1:5173/').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

CMD ["pnpm", "--filter", "admin", "dev"]

# Build stage: production dependencies and the static build.
FROM node_base AS admin_build

COPY --link pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --link apps/admin/package.json apps/admin/
RUN pnpm install --frozen-lockfile --filter admin

COPY --link apps/admin/ apps/admin/
RUN pnpm --filter admin build

# The upstream Caddy binary carries cap_net_bind_service (for ports 80/443).
# The admin listens on 8080, so the capability is removed: the container can run
# with all capabilities dropped. COPY would otherwise keep the capability.
FROM caddy:2.11-alpine AS caddy_binary

RUN set -eux; \
	apk add --no-cache libcap-setcap; \
	setcap -r /usr/bin/caddy

# Prod image: static files served by an unprivileged Caddy. Routing, TLS and the
# /api proxy belong to the central edge proxy (stage 4), not to this image.
FROM alpine:3.23 AS admin_prod

# mailcap provides /etc/mime.types for correct Content-Type headers (e.g. fonts).
RUN set -eux; \
	apk add --no-cache mailcap; \
	addgroup -S -g 1000 app; \
	adduser -S -D -H -u 1000 -G app -s /sbin/nologin app

COPY --link --from=caddy_binary /usr/bin/caddy /usr/bin/caddy
COPY --link infra/docker/admin/Caddyfile /etc/caddy/Caddyfile
COPY --link --from=admin_build /workspace/apps/admin/dist /srv

RUN caddy validate --config /etc/caddy/Caddyfile

USER app

EXPOSE 8080

HEALTHCHECK --start-period=10s CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
