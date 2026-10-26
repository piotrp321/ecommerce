#!/usr/bin/env bash
# Runs the whole production topology (edge, backend, store, admin, Keycloak, Redis for the
# store sessions, PostgreSQL) in an isolated, ephemeral Compose project and checks
# configuration, routing, exposure, privileges, backend runtime behaviour, the browser
# login through the edge (authorization code with PKCE for store-bff) and independent
# redeployment of each service.
# Generated secrets are never printed nor written to disk.
# Ports: CHECK_PROD_HTTP_PORT (default 8080), CHECK_PROD_HTTPS_PORT (default 8443).
set -euo pipefail

cd "$(dirname "$0")/../.."

BACKEND_IMAGE="${IMAGES_PREFIX:-}ecommerce-backend"
KEYCLOAK_IMAGE="${IMAGES_PREFIX:-}ecommerce-keycloak"
HTTP_PORT="${CHECK_PROD_HTTP_PORT:-8080}"
HTTPS_PORT="${CHECK_PROD_HTTPS_PORT:-8443}"
export PROD_HTTP_PORT="$HTTP_PORT" PROD_HTTPS_PORT="$HTTPS_PORT" PROD_HTTP3_PORT="$HTTPS_PORT"
# Test domains (resolved to 127.0.0.1 by curl --resolve/--connect-to) and a local CA
# instead of ACME.
export STORE_DOMAIN="store.localhost" ADMIN_DOMAIN="admin.localhost" AUTH_DOMAIN="auth.localhost"
# Backend resource servers (ADR-0005): the public issuers of the check's Keycloak
# (AUTH_DOMAIN) and its discovery inside the network.
export OIDC_STORE_ISSUER="https://${AUTH_DOMAIN}/realms/store" OIDC_STORE_DISCOVERY_URL="http://keycloak:8080/realms/store/" \
	OIDC_STORE_AUDIENCE="store-api" OIDC_STORE_CLIENTS="store-bff" \
	OIDC_ADMIN_ISSUER="https://${AUTH_DOMAIN}/realms/admin" OIDC_ADMIN_DISCOVERY_URL="http://keycloak:8080/realms/admin/" \
	OIDC_ADMIN_AUDIENCE="admin-api" OIDC_ADMIN_CLIENTS="admin-bff"
export EDGE_GLOBAL_OPTIONS="local_certs
skip_install_trust"

# One-time secrets of the check (never real production values, never printed).
APP_SECRET="$(openssl rand -hex 32)"
# Characters that would break a DSN: the app must handle them as-is.
POSTGRES_PASSWORD="$(openssl rand -hex 12)p@ss:w/rd#?%&=+\$!'\" ;"
KEYCLOAK_DB_PASSWORD="$(openssl rand -hex 16)"
KEYCLOAK_ADMIN_USERNAME="check-admin"
KEYCLOAK_ADMIN_PASSWORD="$(openssl rand -hex 16)"
STORE_OIDC_CLIENT_SECRET="$(openssl rand -hex 24)"
ADMIN_OIDC_CLIENT_SECRET="$(openssl rand -hex 24)"
REDIS_SESSION_PASSWORD="$(openssl rand -hex 16)"
REDIS_OPS_PASSWORD="$(openssl rand -hex 16)"
STORE_SESSION_ENC_KEYS="check:$(openssl rand -base64 32)"
export APP_SECRET POSTGRES_PASSWORD KEYCLOAK_DB_PASSWORD KEYCLOAK_ADMIN_USERNAME KEYCLOAK_ADMIN_PASSWORD \
	STORE_OIDC_CLIENT_SECRET ADMIN_OIDC_CLIENT_SECRET REDIS_SESSION_PASSWORD REDIS_OPS_PASSWORD STORE_SESSION_ENC_KEYS
# Required by compose.prod.yaml next to APP_SECRET, POSTGRES_PASSWORD, STORE_DOMAIN and ADMIN_DOMAIN
# (each checked alone: Compose must refuse to start without it).
REQUIRED_VARS=(AUTH_DOMAIN KEYCLOAK_DB_PASSWORD KEYCLOAK_ADMIN_USERNAME KEYCLOAK_ADMIN_PASSWORD
	STORE_OIDC_CLIENT_SECRET ADMIN_OIDC_CLIENT_SECRET REDIS_SESSION_PASSWORD REDIS_OPS_PASSWORD STORE_SESSION_ENC_KEYS
	OIDC_STORE_ISSUER OIDC_STORE_DISCOVERY_URL OIDC_STORE_AUDIENCE OIDC_STORE_CLIENTS
	OIDC_ADMIN_ISSUER OIDC_ADMIN_DISCOVERY_URL OIDC_ADMIN_AUDIENCE OIDC_ADMIN_CLIENTS)

COMPOSE_FILES=(-f compose.yaml -f compose.prod.yaml -f infra/scripts/compose.prod-check.yaml)
compose() { docker compose "${COMPOSE_FILES[@]}" "$@"; }
prod_config_ok() { docker compose -f compose.yaml -f compose.prod.yaml config -q 2>/dev/null; }

failures=0
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; failures=$((failures + 1)); }

# https GET through the edge: fetch <domain> <path> [curl options...]
fetch() {
	local domain="$1" path="$2"
	shift 2
	curl -sk --resolve "${domain}:${HTTPS_PORT}:127.0.0.1" "$@" "https://${domain}:${HTTPS_PORT}${path}" || true
}
# HTTP status: status <domain> <path> [curl options...], e.g. -H for request headers.
status() {
	local domain="$1" path="$2"
	shift 2
	fetch "$domain" "$path" "$@" -o /dev/null -w '%{http_code}'
}
header() { fetch "$1" "$2" -D - -o /dev/null | tr -d '\r' | grep -i "^$3:" | cut -d' ' -f2- || true; }
expect_health() {
	local expected="$1" label="$2" got
	got="$(status "$STORE_DOMAIN" /api/health)"
	[ "$got" = "$expected" ] && pass "$label (HTTP $got)" || fail "$label (expected $expected, got $got)"
}
container_ids() { compose ps -q edge backend store admin database keycloak redis-session | sort | tr '\n' ' '; }
cid() { compose ps -q "$1"; }
# fetch never fails (curl errors end in `|| true`), so an early `grep -q` exit cannot fail
# these pipes under pipefail.
store_home_ok() { fetch "$STORE_DOMAIN" / | grep -q '<h1>Sklep</h1>'; }
routes_ok() {
	store_home_ok \
		&& fetch "$ADMIN_DOMAIN" / | grep -q '<div id="root"></div>' \
		&& [ "$(status "$ADMIN_DOMAIN" /api/health)" = "200" ]
}
# Status codes of the routes checked by routes_ok, for failure messages (no secrets).
routes_status() {
	echo "store / $(status "$STORE_DOMAIN" /), admin / $(status "$ADMIN_DOMAIN" /), /api/health $(status "$ADMIN_DOMAIN" /api/health)"
}

echo "== Configuration is required at runtime"
if env -u APP_SECRET -u POSTGRES_PASSWORD -u STORE_DOMAIN -u ADMIN_DOMAIN \
	docker compose -f compose.yaml -f compose.prod.yaml config -q 2>/dev/null; then
	fail "compose.prod.yaml accepts missing APP_SECRET/POSTGRES_PASSWORD/STORE_DOMAIN/ADMIN_DOMAIN"
else
	pass "compose.prod.yaml refuses to start without APP_SECRET/POSTGRES_PASSWORD/STORE_DOMAIN/ADMIN_DOMAIN"
fi
prod_config_ok && pass "compose.prod.yaml accepts the complete configuration" || fail "compose.prod.yaml refuses the complete configuration"
for var in "${REQUIRED_VARS[@]}"; do
	if env -u "$var" docker compose -f compose.yaml -f compose.prod.yaml config -q 2>/dev/null; then
		fail "compose.prod.yaml accepts a missing ${var}"
	else
		pass "compose.prod.yaml refuses to start without ${var}"
	fi
done
services="$(docker compose -f compose.yaml -f compose.prod.yaml config --services 2>/dev/null | sort | tr '\n' ' ')"
[ "$services" = "admin backend database edge keycloak redis-session store " ] \
	&& pass "default profile: exactly the services of the topology (no optional services)" || fail "services of the default profile: ${services}"
if docker run --rm "$BACKEND_IMAGE" >/dev/null 2>&1; then
	fail "backend image starts without APP_SECRET/DATABASE_PASSWORD"
else
	pass "backend image entrypoint refuses to start without APP_SECRET/DATABASE_PASSWORD"
fi
kc_image_env="$(docker image inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$KEYCLOAK_IMAGE" 2>/dev/null || true)"
[ -n "$kc_image_env" ] && ! grep -qiE 'PASSWORD|SECRET|^KC_HOSTNAME' <<<"$kc_image_env" \
	&& pass "keycloak image carries no secrets and no hostname (runtime configuration only)" || fail "keycloak image environment"

echo "== Ephemeral stack (project ecommerce-prod-check, edge on ${HTTP_PORT}/${HTTPS_PORT})"

# An empty STORE_BACKEND_URL (shell or .env) selects the demo data; the check pins the API.
store_url="$(STORE_BACKEND_URL= compose config --format json 2>/dev/null | tr -d ' \n' | grep -o '"STORE_BACKEND_URL":"[^"]*"' | head -n1 || true)"
[ "$store_url" = '"STORE_BACKEND_URL":"http://backend:80"' ] \
	&& pass "store runs in API mode even with STORE_BACKEND_URL= in the environment or .env" || fail "store backend URL of the check: ${store_url:-missing}"

work="$(mktemp -d)"
cleanup() {
	compose down --remove-orphans >/dev/null 2>&1 || true
	rm -rf "$work"
}
trap cleanup EXIT
# Start order as in production: the database, its Keycloak role and database
# (keycloak-db.sh), then everything else.
compose up --detach --no-build --wait database >/dev/null 2>&1 && pass "database healthy" || fail "database did not become healthy"
keycloak_db() { DOCKER_COMP="docker compose ${COMPOSE_FILES[*]}" ./infra/scripts/keycloak-db.sh >/dev/null 2>&1; }
keycloak_db && pass "keycloak-db.sh: Keycloak role and database ready" || fail "keycloak-db.sh failed"
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
# Keycloak and Redis: read from /proc (no assumptions about the tools in the images).
for svc in keycloak redis-session; do
	proc="$(compose exec -T "$svc" cat /proc/1/status 2>/dev/null || true)"
	uid="$(awk '/^Uid:/ {print $2}' <<<"$proc")"
	capeff="$(awk '/^CapEff:/ {print $2}' <<<"$proc")"
	[ -n "$uid" ] && [ "$uid" != "0" ] && [ "$capeff" = "0000000000000000" ] \
		&& pass "${svc} runs as a non-root user (uid ${uid}) without effective capabilities" || fail "${svc} uid '${uid}', CapEff '${capeff}'"
	[ "$(docker inspect -f '{{.HostConfig.ReadonlyRootfs}} {{.HostConfig.CapDrop}} {{.HostConfig.SecurityOpt}}' "$(cid "$svc")")" = "true [ALL] [no-new-privileges:true]" ] \
		&& pass "${svc}: read-only root filesystem, cap_drop ALL, no-new-privileges" || fail "${svc} container hardening"
	[ -z "$(docker inspect -f '{{range $p, $b := .NetworkSettings.Ports}}{{range $b}}{{$p}} {{end}}{{end}}' "$(cid "$svc")")" ] \
		&& pass "${svc} publishes no port (Keycloak management port 9000 included)" || fail "${svc} publishes ports"
done
# Redis for the store sessions is on the network "sessions" only, which only the store shares.
networks_of() { docker inspect -f '{{range $name, $n := .NetworkSettings.Networks}}{{$name}} {{end}}' "$(cid "$1")" | tr ' ' '\n' | sed 's/^ecommerce-prod-check_//' | grep . | sort | tr '\n' ' '; }
[ "$(networks_of redis-session)" = "sessions " ] && [ "$(networks_of store)" = "default sessions " ] \
	&& pass "network sessions: redis-session only there, the store on default and sessions" || fail "networks: redis-session '$(networks_of redis-session)', store '$(networks_of store)'"
shared=""
for svc in edge backend admin keycloak database; do
	grep -q sessions <<<"$(networks_of "$svc")" && shared+=" ${svc}"
done
[ -z "$shared" ] && pass "edge, backend, admin, keycloak and database are not on the network sessions" || fail "on the network sessions:${shared}"

echo "== Redis for the store sessions"
redis_cli() { compose exec -T "$@" 2>&1 || true; }
grep -q NOAUTH <<<"$(redis_cli redis-session redis-cli PING)" && pass "redis: commands without authentication are refused (NOAUTH)" || fail "redis: unauthenticated PING"
STORE_REDIS_URL="$(compose exec -T store printenv STORE_REDIS_URL 2>/dev/null || true)"
export STORE_REDIS_URL
redis_store() { redis_cli -e STORE_REDIS_URL redis-session sh -c 'exec redis-cli --no-auth-warning -u "$STORE_REDIS_URL" "$@"' redis "$@"; }
[ "$(redis_store PING)" = "PONG" ] && pass "store: STORE_REDIS_URL authenticates to redis-session as user store" || fail "store: STORE_REDIS_URL does not authenticate"
[ "$(redis_store EVAL "redis.call('HSET', KEYS[1], 'n', 1); redis.call('HINCRBY', KEYS[1], 'n', 1); return redis.call('EXISTS', KEYS[1]) + redis.call('HGET', KEYS[1], 'n')" 1 store:check:eval)" = "3" ] \
	&& pass "redis: user store runs Lua scripts with HSET, HINCRBY, EXISTS and HGET on store:* keys" || fail "redis: Lua script of user store"
redis_store DEL store:check:eval >/dev/null
grep -q NOPERM <<<"$(redis_store SET other:key 1)" && grep -q NOPERM <<<"$(redis_store FLUSHALL)" \
	&& pass "redis: user store cannot use keys outside store:* nor FLUSHALL" || fail "redis: ACL of user store"
unset STORE_REDIS_URL

echo "== Identity provider through the edge (https://${AUTH_DOMAIN})"
AUTH="https://${AUTH_DOMAIN}"
STORE_CALLBACK="https://${STORE_DOMAIN}/auth/callback"
# Browser requests: Keycloak generates URLs on the public port 443 (KC_HOSTNAME), which
# curl sends to the edge's HTTPS port with the Host header unchanged.
auth_curl() { curl -sk --max-time 20 --connect-to "${AUTH_DOMAIN}:443:127.0.0.1:${HTTPS_PORT}" "$@" || true; }
# "<status> <body size>" of a GET through the edge; the edge answers its own 404 with an empty body.
auth_probe() { auth_curl --path-as-is -o /dev/null -w '%{http_code} %{size_download}' "${AUTH}$1"; }
# Inside the network (the backend image has curl). internal_post <url> [client id] [client secret]:
# form body from stdin, a confidential client authenticated with HTTP Basic; the curl
# configuration goes through stdin, so no secret appears on a command line.
internal_post() {
	local body auth=""
	body="$(cat)"
	[ -z "${2:-}" ] || auth="$(printf 'user = "%s:%s"' "$2" "$3")"
	printf 'url = "%s"\n%s\ndata-binary = "%s"\nmax-time = 20\nsilent\n' "$1" "$auth" "$body" \
		| compose exec -T backend curl -K - || true
}
# kcadm in the keycloak container as the bootstrap admin (password through KC_CLI_PASSWORD,
# not on the command line; config in the container tmpfs); stdin is passed on.
kcadm() {
	compose exec -T keycloak bash -c '
		config=$(mktemp)
		trap "rm -f $config" EXIT
		KC_CLI_PASSWORD="$KC_BOOTSTRAP_ADMIN_PASSWORD" /opt/keycloak/bin/kcadm.sh config credentials --config "$config" \
			--server http://localhost:8080 --realm master --user "$KC_BOOTSTRAP_ADMIN_USERNAME" >/dev/null 2>&1
		/opt/keycloak/bin/kcadm.sh "$@" --config "$config"
	' kcadm "$@" 2>/dev/null || true
}
compact() { tr -d ' \n\r'; }
urlenc() { local LC_ALL=C s="$1" out="" c i; for ((i = 0; i < ${#s}; i++)); do c="${s:i:1}"; case "$c" in [a-zA-Z0-9.~_-]) out+="$c" ;; *) out+="$(printf '%%%02X' "'$c")" ;; esac; done; printf '%s' "$out"; }
b64url_decode() { local s; s="$(tr '_-' '/+' <<<"$1")"; while [ $((${#s} % 4)) -ne 0 ]; do s+="="; done; openssl base64 -d -A <<<"$s" 2>/dev/null || true; }
json_string() { grep -o "\"$1\":\"[^\"]*\"" <<<"$2" | head -n1 | cut -d'"' -f4 || true; }
form_action() { grep -o 'action="[^"]*"' <<<"$1" | head -n1 | sed -e 's/^action="//' -e 's/"$//' -e 's/&amp;/\&/g' || true; }
location_of() { tr -d '\r' <"$1" | grep -i '^location:' | head -n1 | cut -d' ' -f2- || true; }
auth_ok() { [ "$(json_string issuer "$(auth_curl "${AUTH}/realms/store/.well-known/openid-configuration" | compact)")" = "${AUTH}/realms/store" ]; }

for realm in store admin; do
	discovery="$(auth_curl "${AUTH}/realms/${realm}/.well-known/openid-configuration" | compact)"
	[ "$(json_string issuer "$discovery")" = "${AUTH}/realms/${realm}" ] \
		&& pass "${realm}: discovery through the edge, issuer ${AUTH}/realms/${realm}" || fail "${realm}: issuer through the edge '$(json_string issuer "$discovery")'"
	[ "$(auth_curl -o /dev/null -w '%{http_code}' "${AUTH}/realms/${realm}/protocol/openid-connect/certs")" = "200" ] \
		&& pass "${realm}: JWKS public (certs 200)" || fail "${realm}: JWKS through the edge"
done
internal="$(compose exec -T backend curl -s --max-time 20 http://keycloak:8080/realms/store/.well-known/openid-configuration 2>/dev/null | compact || true)"
[ "$(json_string issuer "$internal")" = "${AUTH}/realms/store" ] \
	&& [ "$(json_string token_endpoint "$internal")" = "http://keycloak:8080/realms/store/protocol/openid-connect/token" ] \
	&& pass "discovery inside the network: public issuer, token endpoint on http://keycloak:8080" || fail "internal discovery (token endpoint '$(json_string token_endpoint "$internal")')"
# Everything outside the browser endpoints of the realms store and admin, the server-to-server
# endpoints and ambiguous spellings of them: the edge's own 404 (empty body).
blocked=""
for path in / /admin /admin/ /admin/master/console/ /admin/realms/store /realms/master/.well-known/openid-configuration \
	/realms/master/protocol/openid-connect/auth /metrics /health /health/ready /q/health \
	/realms/store/protocol/openid-connect/token /realms/admin/protocol/openid-connect/token \
	/realms/store/protocol/openid-connect/userinfo /realms/admin/protocol/openid-connect/userinfo \
	/realms/store/protocol/openid-connect/revoke /realms/store/protocol/openid-connect/token/introspect \
	/realms/store/protocol/openid-connect/ext/ciba/auth /realms/store/protocol/openid-connect/auth/device \
	/realms/store/clients-registrations/default /realms/admin/clients-registrations/openid-connect \
	/realms/store/protocol/openid-connect/TOKEN /realms/store//protocol/openid-connect/token \
	'/realms/store/protocol/openid-connect/token;x=1' /realms/store/protocol/openid-connect/%74oken \
	/realms/store/protocol/openid-connect%2Ftoken /realms/store/login-actions/../protocol/openid-connect/token \
	/realms/store/./protocol/openid-connect/token /realms/store/protocol/openid-connect/token/ /realms/store/x/%2e%2e/protocol/openid-connect/token; do
	got="$(auth_probe "$path")"
	[ "$got" = "404 0" ] || blocked+=" ${path}=${got}"
done
[ -z "$blocked" ] && pass "edge 404 for the admin console, master realm, health, metrics, server-to-server endpoints and their variants" \
	|| fail "reachable through ${AUTH_DOMAIN}:${blocked}"
for path in /api/admin/catalog/products /api/admin /auth/backchannel-logout; do
	got="$(fetch "$STORE_DOMAIN" "$path" -o /dev/null -w '%{http_code} %{size_download}')"
	[ "$got" = "404 0" ] && pass "https://${STORE_DOMAIN}${path} -> edge 404 (internal only)" || fail "https://${STORE_DOMAIN}${path}: ${got}"
done
redirect="$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --resolve "${AUTH_DOMAIN}:${HTTP_PORT}:127.0.0.1" "http://${AUTH_DOMAIN}:${HTTP_PORT}/realms/store/x" || true)"
[ "$redirect" = "308 https://${AUTH_DOMAIN}/realms/store/x" ] && pass "http://${AUTH_DOMAIN} redirects to HTTPS (308)" || fail "HTTP redirect of ${AUTH_DOMAIN}: ${redirect}"
[ -n "$(auth_curl -D - -o /dev/null "${AUTH}/realms/store/.well-known/openid-configuration" | tr -d '\r' | grep -i '^strict-transport-security:')" ] \
	&& pass "edge sets HSTS on ${AUTH_DOMAIN}" || fail "HSTS on ${AUTH_DOMAIN}"

echo "== Login through the edge (store-bff, authorization code with PKCE S256)"
# A customer created for this check (password in the JSON on stdin, never on a command line).
customer="check-customer@example.test"
customer_password="Ck-$(openssl rand -hex 12)"
kcadm create partialImport -r store -f - >/dev/null <<JSON
{"ifResourceExists": "OVERWRITE", "users": [{"username": "${customer}", "email": "${customer}", "emailVerified": true,
  "enabled": true, "firstName": "Check", "lastName": "Customer", "requiredActions": [],
  "credentials": [{"type": "password", "value": "${customer_password}", "temporary": false}]}]}
JSON
verifier="$(openssl rand -hex 32)"
challenge="$(printf '%s' "$verifier" | openssl dgst -sha256 -binary | openssl base64 -A | tr '+/' '-_' | tr -d '=')"
jar="$work/cookies"
page="$(auth_curl -c "$jar" -b "$jar" "${AUTH}/realms/store/protocol/openid-connect/auth?client_id=store-bff&response_type=code&scope=openid&state=check&nonce=check&redirect_uri=$(urlenc "$STORE_CALLBACK")&code_challenge=${challenge}&code_challenge_method=S256")"
action="$(form_action "$page")"
case "$action" in
"${AUTH}/realms/store/login-actions/authenticate?"*) pass "authorization request through the edge shows the login form on ${AUTH_DOMAIN}" ;;
*) fail "login form through the edge (form action '${action%%\?*}')" ;;
esac
printf 'username=%s&password=%s' "$(urlenc "$customer")" "$(urlenc "$customer_password")" \
	| auth_curl -c "$jar" -b "$jar" -D "$work/headers" -o /dev/null --data-binary @- "$action"
location="$(location_of "$work/headers")"
code="$(sed -n 's/.*[?&]code=\([^&]*\).*/\1/p' <<<"$location")"
case "$location" in
"${STORE_CALLBACK}?"*) [ -n "$code" ] && pass "login redirects to ${STORE_CALLBACK} with an authorization code" || fail "redirect without a code" ;;
*) fail "login redirect '${location%%\?*}'" ;;
esac
token_body="grant_type=authorization_code&redirect_uri=$(urlenc "$STORE_CALLBACK")&code=${code}&code_verifier=${verifier}"
# The public token endpoint refuses the exchange before Keycloak sees it (the code stays valid).
public="$(printf 'url = "%s"\nuser = "store-bff:%s"\ndata-binary = "%s"\nwrite-out = "%%{http_code} %%{size_download}"\noutput = "/dev/null"\n' \
	"${AUTH}/realms/store/protocol/openid-connect/token" "$STORE_OIDC_CLIENT_SECRET" "$token_body" | auth_curl -K -)"
[ "$public" = "404 0" ] && pass "code exchange through the public token endpoint -> edge 404" || fail "public token endpoint answered '${public}'"
tokens="$(printf '%s' "$token_body" | internal_post http://keycloak:8080/realms/store/protocol/openid-connect/token store-bff "$STORE_OIDC_CLIENT_SECRET" | compact)"
STORE_ACCESS_TOKEN="$(json_string access_token "$tokens")"
claims="$(b64url_decode "$(cut -d. -f2 <<<"$STORE_ACCESS_TOKEN")" | compact)"
[ "$(json_string iss "$claims")" = "${AUTH}/realms/store" ] && [ "$(json_string azp "$claims")" = "store-bff" ] \
	&& [ "$(json_string typ "$claims")" = "Bearer" ] && grep -qE '"aud":("store-api"|\[[^]]*"store-api")' <<<"$claims" \
	&& pass "code exchanged inside the network: access token iss ${AUTH}/realms/store, azp store-bff, aud store-api" \
	|| fail "access token from the internal exchange (error '$(json_string error "$tokens")', iss '$(json_string iss "$claims")')"
[ "$(json_string userinfo_endpoint "$(auth_curl "${AUTH}/realms/store/.well-known/openid-configuration" | compact)")" = "${AUTH}/realms/store/protocol/openid-connect/userinfo" ] \
	&& [ "$(auth_curl -o /dev/null -w '%{http_code}' -H "Authorization: Bearer ${STORE_ACCESS_TOKEN}" "${AUTH}/realms/store/protocol/openid-connect/userinfo")" = "404" ] \
	&& pass "public userinfo endpoint -> 404 even with a valid token" || fail "public userinfo with a valid token"

echo "== Admin realm: no password grant through admin-cli (OTP cannot be bypassed)"
admin_user_password="Ca-$(openssl rand -hex 12)"
kcadm create partialImport -r admin -f - >/dev/null <<JSON
{"ifResourceExists": "OVERWRITE", "users": [{"username": "check-no-otp", "email": "check-no-otp@example.test",
  "emailVerified": true, "enabled": true, "firstName": "Check", "lastName": "NoOtp", "requiredActions": [],
  "credentials": [{"type": "password", "value": "${admin_user_password}", "temporary": false}]}]}
JSON
res="$(printf 'grant_type=password&client_id=admin-cli&username=check-no-otp&password=%s' "$(urlenc "$admin_user_password")" \
	| internal_post http://keycloak:8080/realms/admin/protocol/openid-connect/token | compact)"
[ "$(json_string error "$res")" = "unauthorized_client" ] && [ -z "$(json_string access_token "$res")" ] \
	&& pass "admin realm: password grant of admin-cli for a user without OTP rejected (unauthorized_client)" \
	|| fail "admin realm: admin-cli password grant (error '$(json_string error "$res")')"

echo "== Backend behind the edge"
expect_health 200 "health check with special-character database password"
# Protected APIs: 401 without a token and with a rejected one (the identity provider of
# the check is unreachable), never 500 (e.g. a missing OIDC_* variable).
for target in "$STORE_DOMAIN /api/me" "$ADMIN_DOMAIN /api/admin/me"; do
	read -r domain path <<<"$target"
	got="$(status "$domain" "$path")"
	[ "$got" = "401" ] && pass "${domain}${path} without a token -> 401" || fail "${domain}${path} without a token: HTTP ${got}"
	got="$(status "$domain" "$path" -H 'Authorization: Bearer not.a.token')"
	[ "$got" = "401" ] && pass "${domain}${path} with a rejected token -> 401" || fail "${domain}${path} with a rejected token: HTTP ${got}"
done
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
# The check database lives on a tmpfs (compose.prod-check.yaml), which Docker empties when
# the container stops: the restarted PostgreSQL is a fresh, empty cluster. The store renders
# the catalog from the backend (ADR-0009), so the schema is recreated before its pages are
# checked again.
compose exec -T backend php bin/console doctrine:migrations:migrate --no-interaction --allow-no-migration >/dev/null 2>&1 \
	&& pass "schema recreated after the database restart (tmpfs storage)" || fail "migrations after the database restart failed"
for _ in $(seq 1 20); do
	store_home_ok && break
	sleep 1
done
store_home_ok && pass "store home page works again after the database restart (<h1>Sklep</h1>)" \
	|| fail "store home page after the database restart (HTTP $(status "$STORE_DOMAIN" /))"
# The fresh cluster has no Keycloak role and database either: recreate them, as after the
# first start, and restart Keycloak, which imports the realms again.
keycloak_db && pass "keycloak-db.sh after the database restart" || fail "keycloak-db.sh after the database restart"
compose restart keycloak >/dev/null 2>&1
compose up --detach --no-build --no-deps --wait keycloak >/dev/null 2>&1 && auth_ok \
	&& pass "keycloak restarted on the recreated database: discovery through the edge works" || fail "keycloak after the database restart"
leaked=""
logs="$(compose logs 2>&1 || true)"
for var in POSTGRES_PASSWORD APP_SECRET KEYCLOAK_DB_PASSWORD KEYCLOAK_ADMIN_PASSWORD STORE_OIDC_CLIENT_SECRET \
	ADMIN_OIDC_CLIENT_SECRET REDIS_SESSION_PASSWORD REDIS_OPS_PASSWORD STORE_SESSION_ENC_KEYS customer_password admin_user_password; do
	grep -qF -- "${!var}" <<<"$logs" && leaked+=" ${var}"
done
for value in "${STORE_SESSION_ENC_KEYS#*:}" "$STORE_ACCESS_TOKEN"; do
	[ -n "$value" ] && grep -qF -- "$value" <<<"$logs" && leaked+=" (session key or access token)"
done
[ -z "$leaked" ] && pass "secrets, test passwords and tokens absent from the logs of all containers" || fail "found in logs:${leaked}"

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
routes_ok && pass "backend restarted: store pages work again" || fail "store pages after the backend restart ($(routes_status))"

echo "== Independent redeployment"
# Redis answers the store's credentials (the session data itself lives on a tmpfs here).
redis_ok() {
	local url
	url="$(compose exec -T store printenv STORE_REDIS_URL 2>/dev/null || true)"
	[ "$(STORE_REDIS_URL="$url" compose exec -T -e STORE_REDIS_URL redis-session sh -c 'exec redis-cli --no-auth-warning -u "$STORE_REDIS_URL" PING' 2>&1 || true)" = "PONG" ]
}
for svc in store admin backend edge keycloak redis-session; do
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
	auth_ok || ok=0
	redis_ok || ok=0
	[ "$ok" = 1 ] && pass "${svc} redeployed alone: other containers untouched; routes, login discovery and Redis work" \
		|| fail "independent redeployment of ${svc} ($(routes_status), discovery $(auth_ok && echo ok || echo failed), redis $(redis_ok && echo ok || echo failed))"
done

echo
if [ "$failures" -eq 0 ]; then
	echo "check-prod-stack: all checks passed"
else
	echo "check-prod-stack: ${failures} check(s) failed"
	exit 1
fi
