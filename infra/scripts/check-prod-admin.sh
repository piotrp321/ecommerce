#!/usr/bin/env bash
# Runs the admin production image (static files, unprivileged Caddy) with a
# read-only filesystem and no capabilities, and checks its runtime behaviour.
# Port: CHECK_PROD_ADMIN_PORT (default 8081), bound to 127.0.0.1 only.
set -euo pipefail

IMAGE="${IMAGES_PREFIX:-}ecommerce-admin"
PORT="${CHECK_PROD_ADMIN_PORT:-8081}"
BASE="http://127.0.0.1:${PORT}"
NAME="ecommerce-admin-prod-check-$$"

failures=0
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; failures=$((failures + 1)); }
header() { curl -s -D - -o /dev/null "$1" | tr -d '\r' | grep -i "^$2:" | cut -d' ' -f2- || true; }

trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT

echo "== Admin image (${IMAGE}, ${BASE})"
docker run -d --name "$NAME" --read-only --cap-drop ALL --security-opt no-new-privileges \
	-p "127.0.0.1:${PORT}:8080" "$IMAGE" >/dev/null

for _ in $(seq 1 30); do
	[ "$(docker inspect -f '{{.State.Health.Status}}' "$NAME")" = "healthy" ] && break
	sleep 1
done
[ "$(docker inspect -f '{{.State.Health.Status}}' "$NAME")" = "healthy" ] \
	&& pass "container healthy with a read-only filesystem and no capabilities" \
	|| fail "container did not become healthy"

uid="$(docker exec "$NAME" id -u 2>/dev/null || true)"
[ -n "$uid" ] && [ "$uid" != "0" ] && pass "runs as a non-root user (uid ${uid})" || fail "does not run as a non-root user (uid '${uid}')"

index="$(curl -s -w '\n%{http_code}' "$BASE/")"
[ "$(echo "$index" | tail -n1)" = "200" ] && echo "$index" | grep -q '<div id="root"></div>' \
	&& pass "serves index.html (HTTP 200)" || fail "index.html not served"
[ "$(header "$BASE/" Cache-Control)" = "no-cache" ] && pass "index.html is revalidated (Cache-Control: no-cache)" || fail "index.html Cache-Control"

[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/some/client/route")" = "200" ] \
	&& curl -s "$BASE/some/client/route" | grep -q '<div id="root"></div>' \
	&& pass "client-side routes fall back to index.html" || fail "SPA fallback"

asset="$(echo "$index" | grep -o '/assets/[^"]*\.js' | head -n1)"
[ -n "$asset" ] && [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE$asset")" = "200" ] \
	&& [[ "$(header "$BASE$asset" Cache-Control)" == *immutable* ]] \
	&& [[ "$(header "$BASE$asset" Content-Type)" == *javascript* ]] \
	&& pass "hashed assets are served with long-term caching and a JavaScript Content-Type" || fail "asset caching or Content-Type"

[ "$(header "$BASE/" X-Content-Type-Options)" = "nosniff" ] && [ "$(header "$BASE/" X-Frame-Options)" = "DENY" ] \
	&& [ -z "$(header "$BASE/" Server)" ] && pass "security headers set, Server header removed" || fail "security headers"

docker exec "$NAME" wget -q -T 2 -O /dev/null http://127.0.0.1:2019/config/ >/dev/null 2>&1 \
	&& fail "Caddy admin API is reachable" || pass "Caddy admin API disabled"

contents="$(docker exec "$NAME" find /srv -type f)"
if echo "$contents" | grep -qE '\.(map|ts|tsx)$|node_modules|package\.json'; then
	fail "image contains source files, source maps or dependencies"
else
	pass "image contains only the built static files"
fi
docker exec "$NAME" sh -c 'test ! -e /workspace && test ! -e /usr/local/bin/node' \
	&& pass "no Node.js runtime or workspace in the image" || fail "Node.js runtime or workspace present"

echo
if [ "$failures" -eq 0 ]; then
	echo "check-prod-admin: all checks passed"
else
	echo "check-prod-admin: ${failures} check(s) failed"
	exit 1
fi
