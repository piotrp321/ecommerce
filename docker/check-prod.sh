#!/usr/bin/env bash
# Runs the production image in an isolated, ephemeral Compose project and checks
# its runtime behaviour. Generated secrets are never printed nor written to disk.
# Ports: CHECK_PROD_HTTP_PORT (default 8080), CHECK_PROD_HTTPS_PORT (default 8443).
set -euo pipefail

cd "$(dirname "$0")/.."

IMAGE="${IMAGES_PREFIX:-}ecommerce-php"
HTTPS_PORT="${CHECK_PROD_HTTPS_PORT:-8443}"
export PROD_HTTP_PORT="${CHECK_PROD_HTTP_PORT:-8080}"
export PROD_HTTPS_PORT="$HTTPS_PORT" PROD_HTTP3_PORT="$HTTPS_PORT"

compose() {
	docker compose -f compose.yaml -f compose.prod.yaml -f compose.prod-check.yaml "$@"
}

failures=0
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; failures=$((failures + 1)); }
expect_health() {
	local expected="$1" label="$2" status
	status="$(curl -sk -o /dev/null -w '%{http_code}' "https://localhost:${HTTPS_PORT}/health" || true)"
	[ "$status" = "$expected" ] && pass "$label (HTTP $status)" || fail "$label (expected $expected, got $status)"
}

echo "== Configuration is required at runtime"
if env -u APP_SECRET -u POSTGRES_PASSWORD docker compose -f compose.yaml -f compose.prod.yaml config -q 2>/dev/null; then
	fail "compose.prod.yaml accepts missing APP_SECRET/POSTGRES_PASSWORD"
else
	pass "compose.prod.yaml refuses to start without APP_SECRET/POSTGRES_PASSWORD"
fi
if docker run --rm "$IMAGE" >/dev/null 2>&1; then
	fail "image starts without APP_SECRET/DATABASE_PASSWORD"
else
	pass "image entrypoint refuses to start without APP_SECRET/DATABASE_PASSWORD"
fi

echo "== Ephemeral stack (project ecommerce-prod-check, https://localhost:${HTTPS_PORT})"
APP_SECRET="$(openssl rand -hex 32)"
# Characters that would break a DSN: the app must handle them as-is.
POSTGRES_PASSWORD="$(openssl rand -hex 12)p@ss:w/rd#?%&=+\$!'\" ;"
export APP_SECRET POSTGRES_PASSWORD

trap 'compose down --remove-orphans >/dev/null 2>&1 || true' EXIT
compose up --detach --no-build --wait >/dev/null 2>&1 && pass "containers healthy" || fail "containers did not become healthy"

expect_health 200 "health check with special-character database password"

compose exec -T php php bin/console doctrine:migrations:migrate --no-interaction --allow-no-migration >/dev/null 2>&1 \
	&& pass "migrations run on demand (bin/console doctrine:migrations:migrate)" || fail "migrations failed"

[ "$(compose exec -T php id -u)" = "1000" ] && pass "php runs as uid 1000" || fail "php does not run as uid 1000"
compose exec -T php sh -c 'touch /app/src/.write-test' >/dev/null 2>&1 \
	&& fail "application code is writable" || pass "application code is read-only"

compose stop database >/dev/null 2>&1
expect_health 503 "database stopped"
compose start database >/dev/null 2>&1
for _ in $(seq 1 20); do
	[ "$(curl -sk -o /dev/null -w '%{http_code}' "https://localhost:${HTTPS_PORT}/health" || true)" = "200" ] && break
	sleep 1
done
expect_health 200 "database recovered"

if compose logs php 2>&1 | grep -qF "$POSTGRES_PASSWORD"; then
	fail "database password found in logs"
else
	pass "database password absent from logs"
fi

echo
if [ "$failures" -eq 0 ]; then
	echo "check-prod: all checks passed"
else
	echo "check-prod: ${failures} check(s) failed"
	exit 1
fi
