#!/usr/bin/env bash
# Runs the store production image (standalone Next.js) with a read-only root
# filesystem (tmpfs only for the Next.js cache) and no capabilities, and checks
# its runtime behaviour. Port: CHECK_PROD_STORE_PORT (default 8082), 127.0.0.1 only.
# The image runs with login disabled (STORE_AUTH_MODE=disabled, STORE_ENVIRONMENT=test):
# there is no Keycloak or Redis here. The checks also prove that the same image does not
# start without an auth configuration, or with login disabled outside development/test.
set -euo pipefail

IMAGE="${IMAGES_PREFIX:-}ecommerce-store"
PORT="${CHECK_PROD_STORE_PORT:-8082}"
BASE="http://127.0.0.1:${PORT}"
NAME="ecommerce-store-prod-check-$$"

failures=0
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; failures=$((failures + 1)); }
header() { curl -s -D - -o /dev/null "$1" | tr -d '\r' | grep -i "^$2:" | cut -d' ' -f2- || true; }

trap 'docker rm -f "$NAME" "$NAME-noauth" "$NAME-disabled-prod" >/dev/null 2>&1 || true' EXIT

# Runs the image without a port and expects the process to exit with an error that names
# the reason: $1 container name, $2 expected log text, other arguments: docker run options.
expect_no_start() {
	local name="$1" reason="$2"
	shift 2
	docker run -d --name "$name" --read-only --cap-drop ALL --security-opt no-new-privileges \
		--tmpfs /app/apps/store/.next/cache:uid=1000,gid=1000 "$@" "$IMAGE" >/dev/null
	for _ in $(seq 1 30); do
		[ "$(docker inspect -f '{{.State.Running}}' "$name")" = "false" ] && break
		sleep 1
	done
	[ "$(docker inspect -f '{{.State.Running}}' "$name")" = "false" ] \
		&& [ "$(docker inspect -f '{{.State.ExitCode}}' "$name")" != "0" ] \
		&& docker logs "$name" 2>&1 | grep -qF "$reason"
}

echo "== Store image (${IMAGE}, ${BASE})"
docker run -d --name "$NAME" --read-only --cap-drop ALL --security-opt no-new-privileges \
	--tmpfs /app/apps/store/.next/cache:uid=1000,gid=1000 \
	-e STORE_AUTH_MODE=disabled -e STORE_ENVIRONMENT=test \
	-p "127.0.0.1:${PORT}:3000" "$IMAGE" >/dev/null

for _ in $(seq 1 40); do
	[ "$(docker inspect -f '{{.State.Health.Status}}' "$NAME")" = "healthy" ] && break
	sleep 1
done
[ "$(docker inspect -f '{{.State.Health.Status}}' "$NAME")" = "healthy" ] \
	&& pass "container healthy with a read-only filesystem and no capabilities (no backend running)" \
	|| fail "container did not become healthy"

uid="$(docker exec "$NAME" id -u 2>/dev/null || true)"
[ -n "$uid" ] && [ "$uid" != "0" ] && pass "runs as a non-root user (uid ${uid})" || fail "does not run as a non-root user (uid '${uid}')"

page="$(curl -s -w '\n%{http_code}' "$BASE/")"
[ "$(echo "$page" | tail -n1)" = "200" ] && echo "$page" | grep -q '<h1>Sklep</h1>' && echo "$page" | grep -q '<html lang="pl"' \
	&& pass "home page is server-rendered (HTTP 200, heading in the initial HTML)" || fail "home page not server-rendered"
[[ "$(header "$BASE/" Cache-Control)" == *no-store* ]] \
	&& pass "home page is rendered per request (Cache-Control: no-store)" || fail "home page Cache-Control"

[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/does-not-exist")" = "404" ] && pass "unknown routes return 404" || fail "unknown route status"

# Started without STORE_BACKEND_URL (and without a backend), the image serves the demo
# catalog, labelled as such; the same image switches to the API at runtime (ADR-0009).
grep -q 'Wersja demonstracyjna.' <<<"$page" && grep -q '<meta name="robots" content="noindex, nofollow"' <<<"$page" \
	&& pass "without STORE_BACKEND_URL: demo catalog with the demo notice and robots noindex, nofollow" || fail "demo labels missing without STORE_BACKEND_URL"
healthz="$(curl -s -w '\n%{http_code}' "$BASE/healthz")"
[ "$(tail -n1 <<<"$healthz")" = "200" ] && [ "$(head -n1 <<<"$healthz")" = "ok" ] && [[ "$(header "$BASE/healthz" Cache-Control)" == *no-store* ]] \
	&& pass "/healthz answers 200 ok, not cached (container HEALTHCHECK)" || fail "/healthz"

# Login disabled: no account link, auth routes are 404, and the catalog sets no cookie.
[ -z "$(header "$BASE/" Set-Cookie)" ] && [ -z "$(header "$BASE/produkty" Set-Cookie)" ] \
	&& pass "catalog pages set no cookie" || fail "catalog page sets a cookie"
! grep -qE 'href="/logowanie|>Zaloguj<|>Moje konto<' <<<"$page" \
	&& pass "login disabled: no login or account link in the header" || fail "login link shown with login disabled"
auth_statuses="$(for path in /logowanie /logowanie/blad /auth/callback /konto; do curl -s -o /dev/null -w '%{http_code} ' "$BASE$path"; done; curl -s -o /dev/null -w '%{http_code}' -X POST -d logout_token=x "$BASE/auth/backchannel-logout")"
[ "$auth_statuses" = "404 404 404 404 404" ] \
	&& pass "login disabled: /logowanie, /logowanie/blad, /auth/callback, /konto, back-channel logout answer 404" || fail "auth routes with login disabled: ${auth_statuses}"

asset="$(echo "$page" | grep -oE '/_next/static/[^"]+\.js' | head -n1)"
[ -n "$asset" ] && [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE$asset")" = "200" ] \
	&& [[ "$(header "$BASE$asset" Cache-Control)" == *immutable* ]] \
	&& pass "static assets are served with long-term caching" || fail "static asset caching"

[ "$(header "$BASE/" X-Content-Type-Options)" = "nosniff" ] && [ "$(header "$BASE/" X-Frame-Options)" = "DENY" ] \
	&& [ -n "$(header "$BASE/" Referrer-Policy)" ] && [ -z "$(header "$BASE/" X-Powered-By)" ] \
	&& pass "security headers set, X-Powered-By removed" || fail "security headers"

# Server source maps (.next/server) stay for readable production stack traces;
# browser source maps (.next/static, publicly served) must not be shipped.
docker exec "$NAME" sh -c 'test ! -e /app/apps/store/src && test ! -e /app/apps/store/next.config.ts && ! find /app/apps/store/.next/static -name "*.map" | grep -q .' \
	&& pass "image contains no sources and no public (browser) source maps" || fail "sources or browser source maps in the image"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE${asset}.map")" = "404" ] \
	&& pass "browser source maps are not served" || fail "browser source map served"
docker exec "$NAME" sh -c '! command -v npm && ! command -v corepack && ! command -v pnpm' >/dev/null \
	&& pass "no package managers in the image" || fail "package manager present"
docker exec "$NAME" sh -c 'test ! -e /app/node_modules/vitest && test ! -e /app/node_modules/typescript && test ! -e /app/node_modules/.pnpm/vitest@5.0.3' \
	&& pass "no dev dependencies in the standalone output" || fail "dev dependencies present"

# The default is STORE_AUTH_MODE=oidc: without its configuration the server must not start.
expect_no_start "$NAME-noauth" "missing STORE_PUBLIC_URL" \
	&& pass "without an auth configuration the server does not start (oidc is the default)" \
	|| fail "server started (or failed silently) without an auth configuration"
expect_no_start "$NAME-disabled-prod" "STORE_AUTH_MODE=disabled requires STORE_ENVIRONMENT=development or test" \
	-e STORE_AUTH_MODE=disabled -e STORE_ENVIRONMENT=production \
	&& pass "login cannot be disabled in production (STORE_ENVIRONMENT=production)" \
	|| fail "server started with STORE_AUTH_MODE=disabled in production"

echo
if [ "$failures" -eq 0 ]; then
	echo "check-prod-store: all checks passed"
else
	echo "check-prod-store: ${failures} check(s) failed"
	exit 1
fi
