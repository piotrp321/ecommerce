#!/usr/bin/env bash
# Runs the whole production topology (edge, backend, store, admin, PostgreSQL) in an
# isolated, ephemeral Compose project and checks configuration, routing, exposure,
# privileges, backend runtime behaviour and independent redeployment of each app.
# Generated secrets are never printed nor written to disk.
# Ports: CHECK_PROD_HTTP_PORT (default 8080), CHECK_PROD_HTTPS_PORT (default 8443).
set -euo pipefail

cd "$(dirname "$0")/../.."

BACKEND_IMAGE="${IMAGES_PREFIX:-}ecommerce-backend"
HTTP_PORT="${CHECK_PROD_HTTP_PORT:-8080}"
HTTPS_PORT="${CHECK_PROD_HTTPS_PORT:-8443}"
export PROD_HTTP_PORT="$HTTP_PORT" PROD_HTTPS_PORT="$HTTPS_PORT" PROD_HTTP3_PORT="$HTTPS_PORT"
# Test domains (resolved to 127.0.0.1 by curl --resolve) and a local CA instead of ACME.
export STORE_DOMAIN="store.localhost" ADMIN_DOMAIN="admin.localhost"
export EDGE_GLOBAL_OPTIONS="local_certs
skip_install_trust"

compose() {
	docker compose -f compose.yaml -f compose.prod.yaml -f infra/scripts/compose.prod-check.yaml "$@"
}

failures=0
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; failures=$((failures + 1)); }

# https GET through the edge: fetch <domain> <path> [curl options...]
fetch() {
	local domain="$1" path="$2"
	shift 2
	curl -sk --resolve "${domain}:${HTTPS_PORT}:127.0.0.1" "$@" "https://${domain}:${HTTPS_PORT}${path}" || true
}
status() { fetch "$1" "$2" -o /dev/null -w '%{http_code}'; }
header() { fetch "$1" "$2" -D - -o /dev/null | tr -d '\r' | grep -i "^$3:" | cut -d' ' -f2- || true; }
expect_health() {
	local expected="$1" label="$2" got
	got="$(status "$STORE_DOMAIN" /api/health)"
	[ "$got" = "$expected" ] && pass "$label (HTTP $got)" || fail "$label (expected $expected, got $got)"
}
container_ids() { compose ps -q edge backend store admin database | sort | tr '\n' ' '; }
cid() { compose ps -q "$1"; }
routes_ok() {
	fetch "$STORE_DOMAIN" / | grep -q '<h1>Sklep</h1>' \
		&& fetch "$ADMIN_DOMAIN" / | grep -q '<div id="root"></div>' \
		&& [ "$(status "$ADMIN_DOMAIN" /api/health)" = "200" ]
}

echo "== Configuration is required at runtime"
if env -u APP_SECRET -u POSTGRES_PASSWORD -u STORE_DOMAIN -u ADMIN_DOMAIN \
	docker compose -f compose.yaml -f compose.prod.yaml config -q 2>/dev/null; then
	fail "compose.prod.yaml accepts missing APP_SECRET/POSTGRES_PASSWORD/STORE_DOMAIN/ADMIN_DOMAIN"
else
	pass "compose.prod.yaml refuses to start without APP_SECRET/POSTGRES_PASSWORD/STORE_DOMAIN/ADMIN_DOMAIN"
fi
if docker run --rm "$BACKEND_IMAGE" >/dev/null 2>&1; then
	fail "backend image starts without APP_SECRET/DATABASE_PASSWORD"
else
	pass "backend image entrypoint refuses to start without APP_SECRET/DATABASE_PASSWORD"
fi

echo "== Ephemeral stack (project ecommerce-prod-check, edge on ${HTTP_PORT}/${HTTPS_PORT})"
APP_SECRET="$(openssl rand -hex 32)"
# Characters that would break a DSN: the app must handle them as-is.
POSTGRES_PASSWORD="$(openssl rand -hex 12)p@ss:w/rd#?%&=+\$!'\" ;"
export APP_SECRET POSTGRES_PASSWORD

trap 'compose down --remove-orphans >/dev/null 2>&1 || true' EXIT
# The store health check (/healthz) does not depend on the backend, so the store is
# healthy before the database schema exists.
compose up --detach --no-build --wait >/dev/null 2>&1 && pass "all containers healthy (database not migrated yet)" || fail "containers did not become healthy"
# The store renders the catalog from the backend (ADR-0009): its pages need the schema,
# so migrations run before any page is checked.
compose exec -T backend php bin/console doctrine:migrations:migrate --no-interaction --allow-no-migration >/dev/null 2>&1 \
	&& pass "migrations run on demand (bin/console doctrine:migrations:migrate)" || fail "migrations failed"

echo "== Routing (edge)"
fetch "$STORE_DOMAIN" / | grep -q '<h1>Sklep</h1>' && pass "https://${STORE_DOMAIN}/ -> store (server-rendered)" || fail "store not routed"
fetch "$ADMIN_DOMAIN" / | grep -q '<div id="root"></div>' && pass "https://${ADMIN_DOMAIN}/ -> admin" || fail "admin not routed"
fetch "$ADMIN_DOMAIN" /orders/42 | grep -q '<div id="root"></div>' && pass "admin client-side routes reach the SPA fallback" || fail "admin SPA fallback through the edge"
for domain in "$STORE_DOMAIN" "$ADMIN_DOMAIN"; do
	fetch "$domain" /api/health | grep -q '"status":"ok"' \
		&& pass "https://${domain}/api/health -> backend /health (prefix /api removed)" || fail "/api not routed to the backend on ${domain}"
done
[ "$(status "$STORE_DOMAIN" /health)" = "404" ] && pass "paths outside /api stay with the frontend (/health -> store 404)" || fail "/health without /api not handled by the store"
redirect="$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --resolve "${STORE_DOMAIN}:${HTTP_PORT}:127.0.0.1" "http://${STORE_DOMAIN}:${HTTP_PORT}/x?y=1" || true)"
[ "$redirect" = "308 https://${STORE_DOMAIN}/x?y=1" ] && pass "HTTP redirects to HTTPS on the public port (308)" || fail "HTTP redirect: ${redirect}"
unknown="$(curl -sk -o /dev/null -w '%{http_code}' --resolve "unknown.localhost:${HTTPS_PORT}:127.0.0.1" "https://unknown.localhost:${HTTPS_PORT}/" || true)"
[ "$unknown" = "000" ] && pass "unknown host names are not served (no certificate, no route)" || fail "unknown host served (HTTP ${unknown})"
[ -n "$(header "$STORE_DOMAIN" / Strict-Transport-Security)" ] && [ "$(header "$STORE_DOMAIN" / X-Content-Type-Options)" = "nosniff" ] \
	&& [ -z "$(header "$STORE_DOMAIN" / Server)" ] && [ -z "$(header "$STORE_DOMAIN" / Via)" ] && [ -z "$(header "$STORE_DOMAIN" / X-Powered-By)" ] \
	&& pass "edge sets HSTS and nosniff, hides Server, Via and X-Powered-By" || fail "edge response headers"

echo "== Store catalog from the backend API (empty catalog)"
home="$(fetch "$STORE_DOMAIN" / -w '\n%{http_code}')"
# Here-strings, not `echo | grep -q`: with pipefail an early grep exit could fail the pipe.
[ "$(tail -n1 <<<"$home")" = "200" ] && grep -q '<h1>Sklep</h1>' <<<"$home" \
	&& pass "home page renders an empty API catalog (HTTP 200, <h1>Sklep</h1>)" || fail "home page with an empty API catalog"
! grep -q 'Wersja demonstracyjna' <<<"$home" && ! grep -q 'name="robots"' <<<"$home" \
	&& pass "STORE_BACKEND_URL set at runtime: no demo notice, no robots noindex/nofollow" || fail "demo labels shown with the API catalog"
[ "$(status "$STORE_DOMAIN" /produkty)" = "200" ] && pass "product listing renders an empty API catalog (HTTP 200)" || fail "product listing with an empty API catalog"
for path in /produkt/nie-ma-takiego /kategoria/nie-ma-takiej /does-not-exist; do
	page="$(fetch "$STORE_DOMAIN" "$path" -w '\n%{http_code}')"
	[ "$(tail -n1 <<<"$page")" = "404" ] && ! grep -q 'Wersja demonstracyjna' <<<"$page" && ! grep -q 'nofollow' <<<"$page" \
		&& pass "${path} -> 404 without demo labels" || fail "${path} not a 404 without demo labels"
done

echo "== Exposure and privileges"
published="$(compose ps --format '{{.Service}} {{.Ports}}' | grep -- '->' | cut -d' ' -f1 | sort -u | tr '\n' ' ')"
[ "$published" = "edge " ] && pass "only the edge publishes ports (backend, store, admin, database are internal)" || fail "published services: ${published}"
for svc in edge backend store admin; do
	uid="$(compose exec -T "$svc" id -u 2>/dev/null || true)"
	[ -n "$uid" ] && [ "$uid" != "0" ] && pass "${svc} runs as a non-root user (uid ${uid})" || fail "${svc} uid '${uid}'"
done
for svc in edge store admin; do
	capeff="$(compose exec -T "$svc" sh -c "grep CapEff /proc/1/status" 2>/dev/null | awk '{print $2}')"
	[ "$capeff" = "0000000000000000" ] && pass "${svc} has no effective capabilities" || fail "${svc} CapEff ${capeff}"
done

echo "== Backend behind the edge"
expect_health 200 "health check with special-character database password"
compose exec -T backend sh -c 'touch /app/src/.write-test' >/dev/null 2>&1 \
	&& fail "application code is writable" || pass "application code is read-only"
compose stop database >/dev/null 2>&1
expect_health 503 "database stopped"
compose start database >/dev/null 2>&1
for _ in $(seq 1 20); do
	[ "$(status "$STORE_DOMAIN" /api/health)" = "200" ] && break
	sleep 1
done
expect_health 200 "database recovered"
if compose logs 2>&1 | grep -qF "$POSTGRES_PASSWORD"; then
	fail "database password found in logs"
else
	pass "database password absent from logs"
fi

echo "== Store without the backend"
# Last health check run of a container: "<start> <exit code>".
last_health() { docker inspect -f '{{range .State.Health.Log}}{{.Start}} {{.ExitCode}}{{"\n"}}{{end}}' "$1" | grep . | tail -n1 || true; }
store_id="$(cid store)"
compose stop backend >/dev/null 2>&1
before="$(last_health "$store_id")"
# Wait for at least one health check run with the backend stopped (default interval 30 s).
for _ in $(seq 1 45); do
	[ "$(last_health "$store_id")" != "$before" ] && break
	sleep 1
done
after="$(last_health "$store_id")"
[ "$after" != "$before" ] && [ "${after##* }" = "0" ] && [ "$(docker inspect -f '{{.State.Health.Status}}' "$store_id")" = "healthy" ] \
	&& pass "store stays healthy with the backend stopped (health check run since: exit 0)" || fail "store health without the backend (before '${before}', after '${after}')"
[ "$(status "$STORE_DOMAIN" /healthz)" = "200" ] && pass "/healthz answers 200 with the backend stopped" || fail "/healthz with the backend stopped"
page="$(fetch "$STORE_DOMAIN" / -w '\n%{http_code}')"
[ "$(tail -n1 <<<"$page")" = "500" ] && ! grep -q 'Wersja demonstracyjna' <<<"$page" \
	&& pass "pages answer HTTP 500 with the backend stopped (error page, no demo data)" || fail "home page with the backend stopped"
compose start backend >/dev/null 2>&1
for _ in $(seq 1 60); do
	routes_ok && break
	sleep 1
done
routes_ok && pass "backend restarted: store pages work again" || fail "store pages after the backend restart"

echo "== Independent redeployment"
for svc in store admin backend edge; do
	before="$(container_ids)"
	old="$(cid "$svc")"
	compose up --detach --no-build --no-deps --force-recreate --wait "$svc" >/dev/null 2>&1
	new="$(cid "$svc")"
	others_unchanged="$(echo "$before" | tr ' ' '\n' | grep -v "^${old}$" | grep -v '^$' | sort)"
	now_others="$(container_ids | tr ' ' '\n' | grep -v "^${new}$" | grep -v '^$' | sort)"
	ok=1
	[ -n "$new" ] && [ "$new" != "$old" ] || ok=0
	[ "$others_unchanged" = "$now_others" ] || ok=0
	for _ in $(seq 1 30); do routes_ok && break; sleep 1; done
	routes_ok || ok=0
	[ "$ok" = 1 ] && pass "${svc} redeployed alone: other containers untouched, all routes work" || fail "independent redeployment of ${svc}"
done

echo
if [ "$failures" -eq 0 ]; then
	echo "check-prod-stack: all checks passed"
else
	echo "check-prod-stack: ${failures} check(s) failed"
	exit 1
fi
