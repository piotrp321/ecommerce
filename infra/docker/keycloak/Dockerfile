#syntax=docker/dockerfile:1
# Keycloak (identity provider) image. Build context: repository root, restricted by
# Dockerfile.dockerignore to the realm definitions in infra/keycloak/realms.

# Dev image (development-only simplification): `start-dev` (HTTP, no build step,
# no caches tuned for production) with the realms imported once at startup
# (`--import-realm` skips realms that already exist in the database).
FROM quay.io/keycloak/keycloak:26.8.0 AS keycloak_dev

# Realm files use Keycloak placeholders (${ENV_VAR}) for secrets and URLs, resolved
# from the container environment during the import; no secret is stored in the image.
COPY --link infra/keycloak/realms/ /opt/keycloak/data/import/

ENV KC_HEALTH_ENABLED=true

EXPOSE 8080

# Readiness on the management port 9000 (never published). The image has no curl,
# so the request goes through bash /dev/tcp.
HEALTHCHECK --interval=10s --timeout=5s --start-period=180s --start-interval=5s --retries=6 \
	CMD ["bash", "-c", "exec 3<>/dev/tcp/127.0.0.1/9000 && printf 'GET /health/ready HTTP/1.1\\r\\nHost: localhost\\r\\nConnection: close\\r\\n\\r\\n' >&3 && head -n1 <&3 | grep -q ' 200 '"]

CMD ["start-dev", "--import-realm"]

# Production build: the build-time options (PostgreSQL, health endpoints on the management
# port 9000) are compiled in once, so the server starts with `start --optimized` and never
# re-augments at runtime (it runs on a read-only root filesystem).
FROM quay.io/keycloak/keycloak:26.8.0 AS keycloak_builder

ENV KC_DB=postgres \
	KC_HEALTH_ENABLED=true

RUN /opt/keycloak/bin/kc.sh build

# Production image: the built server and the realm definitions, user keycloak (uid 1000)
# of the base image. Hostname, proxy headers, database and secrets come from the runtime
# environment (compose.prod.yaml); the realm placeholders are resolved during the import.
FROM quay.io/keycloak/keycloak:26.8.0 AS keycloak_prod

COPY --link --from=keycloak_builder /opt/keycloak/ /opt/keycloak/
COPY --link infra/keycloak/realms/ /opt/keycloak/data/import/

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=5s --start-period=180s --start-interval=5s --retries=6 \
	CMD ["bash", "-c", "exec 3<>/dev/tcp/127.0.0.1/9000 && printf 'GET /health/ready HTTP/1.1\\r\\nHost: localhost\\r\\nConnection: close\\r\\n\\r\\n' >&3 && head -n1 <&3 | grep -q ' 200 '"]

# Realms are imported once (existing realms are skipped).
CMD ["start", "--optimized", "--import-realm"]
