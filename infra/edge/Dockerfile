#syntax=docker/dockerfile:1
# Edge proxy image (Caddy). Build context: repository root, restricted by
# Dockerfile.dockerignore to infra/edge. The configuration is baked into the image,
# so the edge is versioned and deployed like the applications.

# The upstream Caddy binary carries cap_net_bind_service (for ports 80/443). The edge
# listens on 8080/8443 (published as 80/443), so the capability is removed: the
# container runs as a non-root user with all capabilities dropped and
# no-new-privileges. COPY would otherwise keep the capability.
FROM caddy:2.11-alpine AS caddy_binary

RUN set -eux; \
	apk add --no-cache libcap-setcap; \
	setcap -r /usr/bin/caddy

FROM alpine:3.23 AS edge_prod

# ca-certificates for ACME, mailcap for Content-Type of proxied responses without one.
RUN set -eux; \
	apk add --no-cache ca-certificates mailcap; \
	addgroup -S -g 1000 app; \
	adduser -S -D -H -u 1000 -G app -s /sbin/nologin app; \
	mkdir -p /data /config; \
	chown app:app /data /config

# Certificates and Caddy state (mount volumes here in production).
ENV XDG_DATA_HOME=/data \
	XDG_CONFIG_HOME=/config

COPY --link --from=caddy_binary /usr/bin/caddy /usr/bin/caddy
COPY --link infra/edge/Caddyfile /etc/caddy/Caddyfile

RUN STORE_DOMAIN=store.example.test ADMIN_DOMAIN=admin.example.test \
	caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

USER app

EXPOSE 8080 8443 8443/udp

# Caddy admin API listens on localhost inside the container only.
HEALTHCHECK --start-period=20s CMD wget -q -O /dev/null http://127.0.0.1:2019/config/ || exit 1

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
