#!/usr/bin/env bash
# Runs the development topology (compose.yaml + compose.override.yaml) in its own Compose
# project and checks the identity and session infrastructure: Keycloak (realms, clients,
# discovery, PKCE, logins with the dev seed users, account console), the Keycloak
# database, Redis for the store sessions (ACL, eviction policy, persistence), port
# exposure and that the backend and the store work without Keycloak and Redis. It also
# asserts that the default `make up` does not start the optional services (RabbitMQ,
# Elasticsearch; profiles messaging and search).
# With DEV_CHECK_OPTIONAL=1 (make stack-check-dev-optional) the optional services are
# started as well (make rabbitmq-up, make elasticsearch-up) and checked: health,
# authentication, ports on 127.0.0.1, data surviving down/up (a durable queue with a
# persistent message, an Elasticsearch document); make down must remove them too.
#
# Project: DEV_CHECK_PROJECT (default ecommerce-dev-check), always passed with -p, so it
# wins over COMPOSE_PROJECT_NAME from .env. Ports (all on 127.0.0.1): DEV_CHECK_HTTP_PORT
# (28080), DEV_CHECK_HTTPS_PORT (28443), DEV_CHECK_POSTGRES_PORT (25432),
# DEV_CHECK_ADMIN_PORT (25173), DEV_CHECK_STORE_PORT (23000), DEV_CHECK_KEYCLOAK_PORT
# (28180), DEV_CHECK_REDIS_PORT (26379), DEV_CHECK_RABBITMQ_PORT (28672),
# DEV_CHECK_RABBITMQ_MANAGEMENT_PORT (28673), DEV_CHECK_ELASTICSEARCH_PORT (28920). The containers are removed at the end; the
# volumes are kept (never `down -v`), so a fresh run needs a new project name.
# Development secrets are read from the containers when needed and never printed.
set -euo pipefail

cd "$(dirname "$0")/../.."

PROJECT="${DEV_CHECK_PROJECT:-ecommerce-dev-check}"
export HTTP_PORT="${DEV_CHECK_HTTP_PORT:-28080}"
export HTTPS_PORT="${DEV_CHECK_HTTPS_PORT:-28443}"
export HTTP3_PORT="$HTTPS_PORT"
export POSTGRES_PORT="${DEV_CHECK_POSTGRES_PORT:-25432}"
export ADMIN_PORT="${DEV_CHECK_ADMIN_PORT:-25173}"
export STORE_PORT="${DEV_CHECK_STORE_PORT:-23000}"
export KEYCLOAK_PORT="${DEV_CHECK_KEYCLOAK_PORT:-28180}"
export REDIS_PORT="${DEV_CHECK_REDIS_PORT:-26379}"
export RABBITMQ_PORT="${DEV_CHECK_RABBITMQ_PORT:-28672}"
export RABBITMQ_MANAGEMENT_PORT="${DEV_CHECK_RABBITMQ_MANAGEMENT_PORT:-28673}"
export ELASTICSEARCH_PORT="${DEV_CHECK_ELASTICSEARCH_PORT:-28920}"
OPTIONAL="${DEV_CHECK_OPTIONAL:-0}"
export STORE_PUBLIC_URL="http://localhost:${STORE_PORT}"
export ADMIN_PUBLIC_URL="http://localhost:${ADMIN_PORT}"
# The store pages render the catalog from the backend API (an empty value in .env would
# select the demo data).
export STORE_BACKEND_URL="http://backend:80"
export DOCKER_COMP="docker compose -p ${PROJECT}"

# Dev seed users (same defaults as infra/scripts/keycloak-dev-seed.sh).
export KEYCLOAK_DEV_CUSTOMER_EMAIL="${KEYCLOAK_DEV_CUSTOMER_EMAIL:-customer@example.test}"
export KEYCLOAK_DEV_CUSTOMER_PASSWORD="${KEYCLOAK_DEV_CUSTOMER_PASSWORD:-dev-only-Customer-2026}"
export KEYCLOAK_DEV_ADMIN_USERNAME="${KEYCLOAK_DEV_ADMIN_USERNAME:-admin}"
export KEYCLOAK_DEV_ADMIN_PASSWORD="${KEYCLOAK_DEV_ADMIN_PASSWORD:-dev-only-Admin-password-2026}"
export KEYCLOAK_DEV_ADMIN_TOTP_SECRET="${KEYCLOAK_DEV_ADMIN_TOTP_SECRET:-dev-only-admin-totp-secret-000}"

KC="http://localhost:${KEYCLOAK_PORT}"
KC_INTERNAL="http://keycloak:8080"
STORE_CALLBACK="${STORE_PUBLIC_URL}/auth/callback"
ADMIN_CALLBACK="${ADMIN_PUBLIC_URL}/auth/callback"

compose() { docker compose -p "$PROJECT" "$@"; }
make_dev() { make --no-print-directory DOCKER_COMP="$DOCKER_COMP" "$@"; }

work="$(mktemp -d)"
# On failure the logs of Keycloak and Redis are shown before the containers are removed.
cleanup() {
	local status=$?
	if [ "$status" -ne 0 ]; then
		echo "== Logs (keycloak, redis-session, rabbitmq, elasticsearch) of the failed check"
		compose --profile '*' logs --no-color --tail=100 keycloak redis-session rabbitmq elasticsearch 2>&1 || true
	fi
	compose --profile '*' down --remove-orphans >/dev/null 2>&1 || true
	rm -rf "$work"
}
trap cleanup EXIT

failures=0
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; failures=$((failures + 1)); }
# check <label> <command...>: PASS when the command succeeds.
check() {
	local label="$1"
	shift
	if "$@"; then pass "$label"; else fail "$label"; fi
}
# Runs a step quietly; on failure shows the end of its output and stops the check.
step() {
	local label="$1"
	shift
	if "$@" >"$work/step.log" 2>&1; then
		pass "$label"
	else
		fail "$label"
		tail -n 40 "$work/step.log"
		exit 1
	fi
}
compact() { tr -d ' \n\r'; }
has() { grep -qF -- "$2" <<<"$1"; }

# --- Helpers: Keycloak -----------------------------------------------------------------
# Inside the network (backend container has curl): internal_get <url>
internal_get() { compose exec -T backend curl -s --max-time 10 "$1" || true; }
# internal_post <url> <client id> <client secret>: form body from stdin, client authenticated
# with HTTP Basic (client_secret_basic). The curl configuration goes through stdin, so no
# secret appears on a command line.
internal_post() {
	local body
	body="$(cat)"
	printf 'url = "%s"\nuser = "%s:%s"\ndata-binary = "%s"\nmax-time = 10\nsilent\n' "$1" "$2" "$3" "$body" \
		| compose exec -T backend curl -K - || true
}
# Value of a container environment variable (never printed): container_env <service> <var>
container_env() { compose exec -T "$1" printenv "$2"; }
# kcadm in the keycloak container, logged in as the bootstrap admin (password through
# KC_CLI_PASSWORD, not on the command line); stdin is passed on: kcadm <kcadm arguments...>
kcadm() {
	compose exec -T keycloak bash -c '
		config=$(mktemp)
		trap "rm -f $config" EXIT
		KC_CLI_PASSWORD="$KC_BOOTSTRAP_ADMIN_PASSWORD" /opt/keycloak/bin/kcadm.sh config credentials --config "$config" \
			--server http://localhost:8080 --realm master --user "$KC_BOOTSTRAP_ADMIN_USERNAME" >/dev/null 2>&1
		/opt/keycloak/bin/kcadm.sh "$@" --config "$config"
	' kcadm "$@" 2>/dev/null || true
}
# Admin REST read, output compacted: kcadm_get <kcadm get arguments...>
kcadm_get() { kcadm get "$@" </dev/null | compact; }
urlencode() { local LC_ALL=C s="$1" out="" c i; for ((i = 0; i < ${#s}; i++)); do c="${s:i:1}"; case "$c" in [a-zA-Z0-9.~_-]) out+="$c" ;; *) out+="$(printf '%%%02X' "'$c")" ;; esac; done; printf '%s' "$out"; }
b64url_decode() { local s; s="$(tr '_-' '/+' <<<"$1")"; while [ $((${#s} % 4)) -ne 0 ]; do s+="="; done; openssl base64 -d -A <<<"$s" 2>/dev/null || true; }
jwt_payload() { b64url_decode "$(cut -d. -f2 <<<"$1")" | compact; }
json_string() { grep -o "\"$1\":\"[^\"]*\"" <<<"$2" | head -n1 | cut -d'"' -f4 || true; }
json_number() { grep -o "\"$1\":[0-9]*" <<<"$2" | head -n1 | cut -d: -f2 || true; }
# RFC 6238 TOTP (HMAC-SHA1, 6 digits, 30 s) of a raw secret, as Keycloak computes it.
totp() {
	local counter_hex hmac offset
	counter_hex="$(printf '%016x' $(($(date +%s) / 30)))"
	hmac="$(printf "$(sed 's/../\\x&/g' <<<"$counter_hex")" | openssl dgst -sha1 -hmac "$1" | awk '{print $NF}')"
	offset=$((16#${hmac:39:1}))
	printf '%06d' $(((16#${hmac:offset*2:8} & 0x7fffffff) % 1000000))
}
form_action() { grep -o 'action="[^"]*"' <<<"$1" | head -n1 | sed -e 's/^action="//' -e 's/"$//' -e 's/&amp;/\&/g' || true; }
location_of() { tr -d '\r' <"$1" | grep -i '^location:' | head -n1 | cut -d' ' -f2- || true; }
code_from() { sed -n 's/.*[?&]code=\([^&]*\).*/\1/p' <<<"$1"; }

# Browser login with PKCE S256 (authorization code flow through the public URL).
# login <realm> <client> <redirect_uri> <username> <password> [totp secret]
# Sets: LOGIN_CODE, LOGIN_VERIFIER, LOGIN_OTP_ASKED (1 when the OTP form was shown),
# LOGIN_LOCATION (last redirect). Form bodies go through stdin (no password on a command line).
login() {
	local realm="$1" client="$2" redirect="$3" user="$4" password="$5" otp_secret="${6:-}"
	local jar="$work/cookies-$realm" challenge page action location
	rm -f "$jar"
	LOGIN_CODE="" LOGIN_OTP_ASKED=0 LOGIN_LOCATION=""
	LOGIN_VERIFIER="$(openssl rand -hex 32)"
	challenge="$(printf '%s' "$LOGIN_VERIFIER" | openssl dgst -sha256 -binary | openssl base64 -A | tr '+/' '-_' | tr -d '=')"
	page="$(curl -s -c "$jar" -b "$jar" "${KC}/realms/${realm}/protocol/openid-connect/auth?client_id=${client}&response_type=code&scope=openid&state=check&nonce=check&redirect_uri=$(urlenc "$redirect")&code_challenge=${challenge}&code_challenge_method=S256" || true)"
	action="$(form_action "$page")"
	[ -n "$action" ] || return 0
	printf 'username=%s&password=%s' "$(urlenc "$user")" "$(urlenc "$password")" \
		| curl -s -c "$jar" -b "$jar" -D "$work/headers" -o "$work/body" --data-binary @- "$action" || true
	location="$(location_of "$work/headers")"
	if [ -z "$location" ] && grep -q 'name="otp"' "$work/body"; then
		LOGIN_OTP_ASKED=1
		[ -n "$otp_secret" ] || return 0
		action="$(form_action "$(cat "$work/body")")"
		printf 'otp=%s' "$(totp "$otp_secret")" \
			| curl -s -c "$jar" -b "$jar" -D "$work/headers" -o "$work/body" --data-binary @- "$action" || true
		location="$(location_of "$work/headers")"
	fi
	LOGIN_LOCATION="$location"
	LOGIN_CODE="$(code_from "$location")"
}
urlenc() { urlencode "$1"; }
# Second authorization request in the same browser session (SSO cookie): code without a form.
sso_code() {
	local realm="$1" client="$2" redirect="$3" challenge="$4"
	curl -s -c "$work/cookies-$realm" -b "$work/cookies-$realm" -D "$work/headers" -o /dev/null \
		"${KC}/realms/${realm}/protocol/openid-connect/auth?client_id=${client}&response_type=code&scope=openid&state=check&redirect_uri=$(urlenc "$redirect")&code_challenge=${challenge}&code_challenge_method=S256" || true
	code_from "$(location_of "$work/headers")"
}
# Code exchange at the internal token endpoint (client_secret_basic):
# exchange <realm> <client> <secret> <redirect> <code> [verifier]
exchange() {
	local body="grant_type=authorization_code&redirect_uri=$(urlenc "$4")&code=$5"
	[ -z "${6:-}" ] || body+="&code_verifier=$6"
	printf '%s' "$body" | internal_post "${KC_INTERNAL}/realms/$1/protocol/openid-connect/token" "$2" "$3" | compact
}
# Error code of a JSON error response (no other field is ever printed): error_of <json>
error_of() { json_string error "$1"; }
# Error code of an authorization request: auth_error <realm> <client> <redirect> <extra query>
auth_error() {
	curl -s -D "$work/headers" -o /dev/null "${KC}/realms/$1/protocol/openid-connect/auth?client_id=$2&response_type=code&scope=openid&state=check&redirect_uri=$(urlenc "$3")$4" || true
	sed -n 's/.*[?&]error=\([^&]*\).*/\1/p' <<<"$(location_of "$work/headers")"
}

# --- Helpers: data ---------------------------------------------------------------------
# Tables of the application database with exact row counts (fingerprint of the app data).
app_fingerprint() {
	compose exec -T database sh -c 'exec psql -X -At --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' <<'SQL' | tr '\n' ' '
SELECT table_name || '=' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text
FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1;
SQL
}
# The fingerprint without the identity tables, which the backend fills on the first
# request of a token (GET /me, /admin/me below): without_identities <fingerprint>
without_identities() { sed -E 's/(backoffice_admin_user|customers_customer)=[0-9]+ ?//g' <<<"$1"; }
# Rows of an identity table for one token subject: identity_rows <table> <sub>
identity_rows() {
	printf "SELECT count(*) FROM %s WHERE subject = :'sub';\n" "$1" \
		| compose exec -T -e SUB="$2" database sh -c 'exec psql -X -At --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" -v sub="$SUB"' 2>/dev/null || true
}
# Connects as the keycloak role (password from the container environment): as_keycloak <database>
# as_keycloak <database> [sql] (default SELECT 1)
as_keycloak() {
	compose exec -T -e TARGET_DB="$1" -e SQL="${2:-SELECT 1}" database sh -c 'PGPASSWORD="$KEYCLOAK_DB_PASSWORD" psql -X -At -h 127.0.0.1 -U keycloak -d "$TARGET_DB" -c "$SQL"' 2>&1 || true
}
# redis-cli in the redis-session container: redis_as <user|none> <command...>
redis_as() {
	local user="$1"
	shift
	case "$user" in
	none) compose exec -T redis-session redis-cli "$@" 2>&1 || true ;;
	store) compose exec -T redis-session sh -c 'REDISCLI_AUTH="$REDIS_SESSION_PASSWORD" exec redis-cli --no-auth-warning --user store "$@"' redis "$@" 2>&1 || true ;;
	ops) compose exec -T redis-session sh -c 'REDISCLI_AUTH="$REDIS_OPS_PASSWORD" exec redis-cli --no-auth-warning --user ops "$@"' redis "$@" 2>&1 || true ;;
	esac
}
# Published host bindings of a service's container, "<port>/<proto>=<host ip>:<host port> ..."
# (from docker inspect, independent of the Compose version and its ps/port output).
published_bindings() {
	docker inspect -f '{{range $p, $b := .NetworkSettings.Ports}}{{range $b}}{{$p}}={{.HostIp}}:{{.HostPort}} {{end}}{{end}}' "$(compose ps -q "$1")" 2>/dev/null || true
}
# keycloak_ports_ok <bindings> <port>: exactly one binding, 8080/tcp on 127.0.0.1:<port>.
keycloak_ports_ok() { [ "$(tr -s ' ' <<<"$1" | sed 's/ $//')" = "8080/tcp=127.0.0.1:$2" ]; }
health() { docker inspect -f '{{.State.Health.Status}}' "$(compose ps -q "$1")" 2>/dev/null || true; }
backend_health() { curl -sk --max-time 10 "https://localhost:${HTTPS_PORT}/health" || true; }
# Backend API through its Caddy with a bearer token (through the curl configuration on
# stdin, never on a command line): backend_api <path> <access token>; body, then the status.
backend_api() {
	printf 'header = "Authorization: Bearer %s"\nheader = "Accept: application/json"\n' "$2" \
		| curl -sk --max-time 10 -K - -w '\n%{http_code}' "https://localhost:${HTTPS_PORT}$1" || true
}
store_home_ok() { curl -s --max-time 120 "http://localhost:${STORE_PORT}/" | grep -q '<h1>Sklep</h1>'; }

# --- Helpers: optional services ----------------------------------------------------------
# HTTP request with Basic authentication (no user: no credentials); the curl configuration
# goes through stdin, so no password appears on a command line. Prints the body, then the
# status code on the last line: http_basic <base url> <user> <password> <method> <path> [json body]
http_basic() {
	local body="${6:-}"
	{
		printf 'url = "%s%s"\nrequest = "%s"\nheader = "content-type: application/json"\nmax-time = 10\nsilent\nwrite-out = "\\n%%{http_code}"\n' "$1" "$5" "$4"
		[ -z "$2" ] || printf 'user = "%s:%s"\n' "$2" "$3"
		[ -z "$body" ] || printf 'data = "%s"\n' "${body//\"/\\\"}"
		true
	} | curl -K - || true
}
status_of() { tail -n1 <<<"$1"; }
rabbitmq_api() { http_basic "http://localhost:${RABBITMQ_MANAGEMENT_PORT}" "$@"; }
elasticsearch_api() { http_basic "http://localhost:${ELASTICSEARCH_PORT}" "$@"; }
sorted_words() { tr ' ' '\n' <<<"$1" | grep . | sort | tr '\n' ' '; }
# Number of messages in the durable queue dev-check (broker view, not the delayed statistics).
rabbitmq_queue_messages() {
	compose exec -T rabbitmq rabbitmqctl -q list_queues name messages durable 2>&1 | tr -s '[:space:]' ' ' | grep -o 'dev-check [0-9]* true' | cut -d' ' -f2 || true
}

echo "== Development stack (project ${PROJECT}, Keycloak on ${KEYCLOAK_PORT}, Redis on ${REDIS_PORT}$([ "$OPTIONAL" = 1 ] && echo ", RabbitMQ on ${RABBITMQ_PORT}/${RABBITMQ_MANAGEMENT_PORT}, Elasticsearch on ${ELASTICSEARCH_PORT}"))"
# Realms are imported once: with volumes of an earlier run, Keycloak keeps the realms of that
# import (changes in infra/keycloak/realms/*.json are not checked) and the database keeps its
# data. Nothing is removed; a fresh check needs a new DEV_CHECK_PROJECT.
existing="$(docker volume ls -q --filter "label=com.docker.compose.project=${PROJECT}" | tr '\n' ' ')"
if [ -n "$existing" ]; then
	echo "WARN  project ${PROJECT} already has volumes (${existing% }): realms come from an earlier import,"
	echo "WARN  so changes in infra/keycloak/realms/*.json are not checked. Use a new DEV_CHECK_PROJECT for a fresh run."
fi
# Images from the working tree (cached layers), so the realm files checked are the current ones.
step "dev images built from the working tree" compose build
step "pnpm workspace installed into the project volumes" make_dev pnpm-install
step "make up: database, keycloak-db.sh, all services healthy" make_dev up
step "backend dependencies installed" make_dev backend-install
step "application migrations run" make_dev backend-migrate
step "application test database prepared (make backend-db-test)" make_dev backend-db-test
app_before="$(app_fingerprint)"
[ -n "$app_before" ] && pass "application tables present: ${app_before}" || fail "application tables missing"
# Second run: also covers databases created after the first one (the test database).
step "keycloak-db.sh runs again without errors (idempotent)" env DOCKER_COMP="$DOCKER_COMP" ./infra/scripts/keycloak-db.sh
step "keycloak-dev-seed runs (first run in this project creates or skips the users)" make_dev keycloak-dev-seed
make_dev keycloak-dev-seed >"$work/seed2.log" 2>&1 && [ "$(grep -c 'already exists (skipped)' "$work/seed2.log")" = "2" ] \
	&& pass "keycloak-dev-seed runs again: both users skipped (idempotent)" || { fail "second keycloak-dev-seed run"; cat "$work/seed2.log"; }
[ -z "$(compose --profile '*' ps -aq rabbitmq elasticsearch)" ] \
	&& pass "make up does not start rabbitmq or elasticsearch (optional profiles)" || fail "rabbitmq or elasticsearch started by the default make up"
for svc in keycloak redis-session; do
	[ "$(health "$svc")" = "healthy" ] && pass "${svc} is healthy" || fail "${svc} health: $(health "$svc")"
done

echo "== Keycloak database"
has "$(as_keycloak keycloak)" "1" && pass "role keycloak connects to its database" || fail "role keycloak cannot connect to database keycloak"
app_db="$(container_env database POSTGRES_DB)"
has "$(as_keycloak "$app_db")" "permission denied for database" && has "$(as_keycloak postgres)" "permission denied for database" \
	&& pass "role keycloak cannot connect to the application database (${app_db}) or postgres" || fail "role keycloak connects to ${app_db} or postgres"
# The test database keeps CONNECT for PUBLIC (the backend tests connect with their own roles),
# but the keycloak role reads and creates nothing there.
has "$(as_keycloak "${app_db}_test" 'SELECT count(*) FROM doctrine_migration_versions')" "permission denied for table" \
	&& has "$(as_keycloak "${app_db}_test" 'CREATE TABLE public.keycloak_probe (id int)')" "permission denied for schema public" \
	&& pass "role keycloak cannot read tables or create objects in the test database (${app_db}_test)" || fail "role keycloak has access to ${app_db}_test data"
has "$(compose exec -T database sh -c 'pg_isready -d "$POSTGRES_DB" -U "$POSTGRES_USER"' 2>&1 || true)" "accepting connections" \
	&& pass "database health check (pg_isready) unaffected" || fail "pg_isready after the CONNECT revocation"
super="$(compose exec -T database sh -c 'psql -X -At --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" -c "SELECT rolsuper OR rolcreatedb OR rolcreaterole FROM pg_roles WHERE rolname = '"'"'keycloak'"'"'"' || true)"
[ "$super" = "f" ] && pass "role keycloak has no superuser, createdb or createrole privileges" || fail "role keycloak privileges: ${super}"

echo "== Discovery (issuer public, back-channel internal)"
for realm in store admin; do
	public="$(curl -s --max-time 10 "${KC}/realms/${realm}/.well-known/openid-configuration" | compact || true)"
	[ "$(json_string issuer "$public")" = "${KC}/realms/${realm}" ] && pass "${realm}: discovery from the host, issuer ${KC}/realms/${realm}" \
		|| fail "${realm}: issuer from the host '$(json_string issuer "$public")'"
	internal="$(internal_get "${KC_INTERNAL}/realms/${realm}/.well-known/openid-configuration" | compact)"
	jwks_uri="$(json_string jwks_uri "$internal")"
	token_endpoint="$(json_string token_endpoint "$internal")"
	[ "$(json_string issuer "$internal")" = "${KC}/realms/${realm}" ] && [ "$jwks_uri" = "${KC_INTERNAL}/realms/${realm}/protocol/openid-connect/certs" ] \
		&& [ "$token_endpoint" = "${KC_INTERNAL}/realms/${realm}/protocol/openid-connect/token" ] \
		&& pass "${realm}: discovery inside the network: public issuer, jwks_uri and token_endpoint on ${KC_INTERNAL}" \
		|| fail "${realm}: internal discovery (issuer '$(json_string issuer "$internal")', jwks '${jwks_uri}', token '${token_endpoint}')"
	jwks="$(internal_get "$jwks_uri" | compact)"
	has "$jwks" '"alg":"RS256"' && has "$jwks" '"use":"sig"' && pass "${realm}: JWKS reachable inside the network (RS256 signing key)" || fail "${realm}: JWKS without an RS256 signing key"
	[ "$(curl -s -o /dev/null -w '%{http_code}' "${KC}/realms/${realm}/account" || true)" = "404" ] \
		&& pass "${realm}: account console disabled (/realms/${realm}/account -> 404)" || fail "${realm}: account console reachable"
done

echo "== Realm and client configuration (kcadm)"
store_realm="$(kcadm_get realms/store)"
admin_realm="$(kcadm_get realms/admin)"
expect_all() {
	local label="$1" json="$2" missing=""
	shift 2
	for want in "$@"; do has "$json" "$want" || missing+=" ${want}"; done
	[ -z "$missing" ] && pass "$label" || fail "${label}; missing:${missing}"
}
expect_all "store realm: registration, e-mail login and verification, brute force (temporary lockout), password policy" "$store_realm" \
	'"registrationAllowed":true' '"registrationEmailAsUsername":true' '"loginWithEmailAllowed":true' '"verifyEmail":true' \
	'"bruteForceProtected":true' '"permanentLockout":false' '"passwordPolicy":"length(12)andnotUsername(undefined)andnotEmail(undefined)"'
expect_all "store realm: access token 5 min, SSO idle 30 min / max 12 h, refresh token rotation (max reuse 0)" "$store_realm" \
	'"accessTokenLifespan":300' '"ssoSessionIdleTimeout":1800' '"ssoSessionMaxLifespan":43200' '"revokeRefreshToken":true' '"refreshTokenMaxReuse":0'
expect_all "admin realm: no registration, no forgot password, password length(14), SSO idle 15 min / max 8 h, refresh token rotation" "$admin_realm" \
	'"registrationAllowed":false' '"resetPasswordAllowed":false' '"passwordPolicy":"length(14)"' \
	'"ssoSessionIdleTimeout":900' '"ssoSessionMaxLifespan":28800' '"revokeRefreshToken":true' '"refreshTokenMaxReuse":0'
expect_all "admin realm: brute force protection with temporary lockout" "$admin_realm" \
	'"bruteForceProtected":true' '"permanentLockout":false' '"failureFactor":5' '"maxFailureWaitSeconds":900'
otp_action="$(kcadm_get authentication/required-actions/CONFIGURE_TOTP -r admin)"
expect_all "admin realm: Configure OTP is an enabled default required action" "$otp_action" '"enabled":true' '"defaultAction":true'
# OTP Form REQUIRED in the browser flow (not the conditional OTP of the default flow).
has "$admin_realm" '"browserFlow":"adminbrowser"' \
	&& grep -oE '[{][^{}]*"providerId":"auth-otp-form"[^{}]*[}]' <<<"$(kcadm_get 'authentication/flows/admin%20browser/executions' -r admin)" | grep -q '"requirement":"REQUIRED"' \
	&& pass "admin realm: browser flow 'admin browser' with OTP Form REQUIRED" || fail "admin realm: browser flow without a required OTP Form"
has "$(kcadm_get authentication/required-actions/delete_credential -r admin)" '"enabled":false' \
	&& pass "admin realm: delete credential action disabled" || fail "admin realm: delete credential action enabled"
for realm in store admin; do
	clients="$(kcadm_get clients -r "$realm" --fields clientId,enabled)"
	has "$clients" '{"clientId":"account","enabled":false}' && ! has "$clients" '"account-console"' \
		&& pass "${realm}: account client disabled, no account-console client" || fail "${realm}: account clients ${clients}"
done
store_bff="$(kcadm_get clients -r store -q clientId=store-bff)"
expect_all "store-bff: confidential, standard flow only, PKCE S256, exact redirect and post-logout URIs, no web origins" "$store_bff" \
	'"publicClient":false' '"standardFlowEnabled":true' '"implicitFlowEnabled":false' '"directAccessGrantsEnabled":false' \
	'"serviceAccountsEnabled":false' '"pkce.code.challenge.method":"S256"' "\"redirectUris\":[\"${STORE_CALLBACK}\"]" \
	"\"post.logout.redirect.uris\":\"${STORE_PUBLIC_URL}/\"" '"webOrigins":[]' '"oauth2.device.authorization.grant.enabled":"false"'
expect_all "store-bff: back-channel logout to the store (session required), front-channel logout off, audience store-api" "$store_bff" \
	'"backchannel.logout.url":"http://store:3000/auth/backchannel-logout"' '"backchannel.logout.session.required":"true"' \
	'"frontchannelLogout":false' '"included.client.audience":"store-api"'
admin_bff="$(kcadm_get clients -r admin -q clientId=admin-bff)"
expect_all "admin-bff: confidential, standard flow only, PKCE S256, redirect from ADMIN_PUBLIC_URL, audience admin-api" "$admin_bff" \
	'"publicClient":false' '"standardFlowEnabled":true' '"implicitFlowEnabled":false' '"directAccessGrantsEnabled":false' \
	'"serviceAccountsEnabled":false' '"pkce.code.challenge.method":"S256"' "\"redirectUris\":[\"${ADMIN_CALLBACK}\"]" \
	'"webOrigins":[]' '"included.client.audience":"admin-api"'
for pair in store:store-api admin:admin-api; do
	api="$(kcadm_get clients -r "${pair%%:*}" -q clientId="${pair#*:}")"
	expect_all "${pair#*:}: audience only (no flows, no service account)" "$api" \
		'"standardFlowEnabled":false' '"implicitFlowEnabled":false' '"directAccessGrantsEnabled":false' '"serviceAccountsEnabled":false'
done
api_id="$(json_string id "$(kcadm_get clients -r admin -q clientId=admin-api --fields id)")"
has "$(kcadm_get "clients/${api_id}/roles" -r admin --fields name)" '{"name":"admin"}' && pass "admin-api has the client role admin" || fail "admin-api role admin missing"

echo "== Grants and PKCE (store-bff, admin-bff)"
store_secret="$(container_env keycloak STORE_OIDC_CLIENT_SECRET)"
admin_secret="$(container_env keycloak ADMIN_OIDC_CLIENT_SECRET)"
# grant <realm> <client> <secret> <form body>
grant() { printf '%s' "$4" | internal_post "${KC_INTERNAL}/realms/$1/protocol/openid-connect/token" "$2" "$3" | compact; }
for spec in "store|store-bff|${store_secret}|${KEYCLOAK_DEV_CUSTOMER_EMAIL}|${KEYCLOAK_DEV_CUSTOMER_PASSWORD}" \
	"admin|admin-bff|${admin_secret}|${KEYCLOAK_DEV_ADMIN_USERNAME}|${KEYCLOAK_DEV_ADMIN_PASSWORD}"; do
	IFS='|' read -r realm client secret user password <<<"$spec"
	res="$(grant "$realm" "$client" "$secret" "grant_type=password&username=$(urlenc "$user")&password=$(urlenc "$password")")"
	[ "$(error_of "$res")" = "unauthorized_client" ] && pass "${client}: password grant (direct access) rejected (unauthorized_client)" || fail "${client}: password grant (error '$(error_of "$res")')"
	res="$(grant "$realm" "$client" "$secret" "grant_type=client_credentials")"
	[ "$(error_of "$res")" = "unauthorized_client" ] \
		&& pass "${client}: token endpoint inside the network authenticates the client (client_secret_basic); client credentials grant rejected" \
		|| fail "${client}: client credentials (error '$(error_of "$res")')"
done
for spec in "store|store-bff|${STORE_CALLBACK}" "admin|admin-bff|${ADMIN_CALLBACK}"; do
	IFS='|' read -r realm client redirect <<<"$spec"
	[ "$(auth_error "$realm" "$client" "$redirect" "")" = "invalid_request" ] && pass "${client}: authorization request without PKCE rejected" || fail "${client}: authorization without PKCE accepted"
	[ "$(auth_error "$realm" "$client" "$redirect" "&code_challenge=abcdefghijklmnopqrstuvwxyzabcdefghijklmnopq&code_challenge_method=plain")" = "invalid_request" ] \
		&& pass "${client}: PKCE method plain rejected (S256 required)" || fail "${client}: PKCE plain accepted"
	other="$(curl -s -o /dev/null -w '%{http_code}' "${KC}/realms/${realm}/protocol/openid-connect/auth?client_id=${client}&response_type=code&scope=openid&redirect_uri=$(urlenc "${redirect}x")&code_challenge=abcdefghijklmnopqrstuvwxyzabcdefghijklmnopq&code_challenge_method=S256" || true)"
	[ "$other" = "400" ] && pass "${client}: other redirect URIs rejected (exact match)" || fail "${client}: redirect URI ${redirect}x answered ${other}"
done

echo "== Login and tokens (dev seed users)"
login store store-bff "$STORE_CALLBACK" "$KEYCLOAK_DEV_CUSTOMER_EMAIL" "$KEYCLOAK_DEV_CUSTOMER_PASSWORD"
[ -n "$LOGIN_CODE" ] && pass "store: customer logs in (authorization code with PKCE S256)" || fail "store: customer login"
tokens="$(exchange store store-bff "$store_secret" "$STORE_CALLBACK" "$LOGIN_CODE" "$LOGIN_VERIFIER")"
claims="$(jwt_payload "$(json_string access_token "$tokens")")"
expect_all "store: access token from the internal token endpoint has the public issuer, aud store-api, azp store-bff, typ, e-mail claims" "$claims" \
	"\"iss\":\"${KC}/realms/store\"" '"azp":"store-bff"' '"typ":"Bearer"' '"email_verified":true' "\"email\":\"${KEYCLOAK_DEV_CUSTOMER_EMAIL}\"" '"sub":"'
grep -qE '"aud":("store-api"|\[[^]]*"store-api")' <<<"$claims" && pass "store: aud contains store-api" || fail "store: aud without store-api (token error '$(error_of "$tokens")')"
# The backend accepts the real token (discovery and JWKS inside the network, ADR-0005).
customer_sub="$(json_string sub "$claims")"
me="$(backend_api /me "$(json_string access_token "$tokens")")"
[ "$(tail -n1 <<<"$me")" = "200" ] && has "$me" "\"email\":\"${KEYCLOAK_DEV_CUSTOMER_EMAIL}\"" \
	&& pass "backend: GET /me with the customer's access token -> 200" || fail "backend: GET /me with the customer's access token -> HTTP $(tail -n1 <<<"$me")"
exp="$(json_number exp "$claims")" iat="$(json_number iat "$claims")"
[ -n "$exp" ] && [ -n "$iat" ] && [ $((exp - iat)) -eq 300 ] && pass "store: access token lifetime 300 s" || fail "store: access token lifetime (exp '${exp}', iat '${iat}')"
challenge="$(printf '%s' "$(openssl rand -hex 32)" | openssl dgst -sha256 -binary | openssl base64 -A | tr '+/' '-_' | tr -d '=')"
code="$(sso_code store store-bff "$STORE_CALLBACK" "$challenge")"
res="$(exchange store store-bff "$store_secret" "$STORE_CALLBACK" "$code")"
[ -n "$code" ] && [ "$(error_of "$res")" = "invalid_grant" ] && pass "store: code exchange without code_verifier rejected (invalid_grant)" || fail "store: exchange without verifier (error '$(error_of "$res")')"

login admin admin-bff "$ADMIN_CALLBACK" "$KEYCLOAK_DEV_ADMIN_USERNAME" "$KEYCLOAK_DEV_ADMIN_PASSWORD"
[ "$LOGIN_OTP_ASKED" = 1 ] && [ -z "$LOGIN_CODE" ] && pass "admin: password alone is not enough, the browser flow asks for OTP" || fail "admin: OTP not required (otp form ${LOGIN_OTP_ASKED})"
login admin admin-bff "$ADMIN_CALLBACK" "$KEYCLOAK_DEV_ADMIN_USERNAME" "$KEYCLOAK_DEV_ADMIN_PASSWORD" "$KEYCLOAK_DEV_ADMIN_TOTP_SECRET"
[ -n "$LOGIN_CODE" ] && pass "admin: dev admin logs in with password and the seeded TOTP" || fail "admin: login with TOTP"
tokens="$(exchange admin admin-bff "$admin_secret" "$ADMIN_CALLBACK" "$LOGIN_CODE" "$LOGIN_VERIFIER")"
claims="$(jwt_payload "$(json_string access_token "$tokens")")"
expect_all "admin: access token has the public issuer, azp admin-bff, resource_access.admin-api.roles [admin]" "$claims" \
	"\"iss\":\"${KC}/realms/admin\"" '"azp":"admin-bff"' '"typ":"Bearer"' '"resource_access":{"admin-api":{"roles":["admin"]}}' '"sub":"'
grep -qE '"aud":("admin-api"|\[[^]]*"admin-api")' <<<"$claims" && pass "admin: aud contains admin-api" || fail "admin: aud without admin-api (token error '$(error_of "$tokens")')"
admin_sub="$(json_string sub "$claims")"
me="$(backend_api /admin/me "$(json_string access_token "$tokens")")"
[ "$(tail -n1 <<<"$me")" = "200" ] && has "$me" '"roles":["ROLE_ADMIN"]' \
	&& pass "backend: GET /admin/me with the admin's access token -> 200 (ROLE_ADMIN)" || fail "backend: GET /admin/me with the admin's access token -> HTTP $(tail -n1 <<<"$me")"
# The logged-in admin asks to delete the OTP credential (application initiated action);
# the confirmation is accepted if Keycloak shows it. The credential must stay.
admin_id="$(json_string id "$(kcadm_get users -r admin -q "username=${KEYCLOAK_DEV_ADMIN_USERNAME}" --fields id)")"
otp_id="$(grep -o '"id":"[0-9a-f-]*","type":"otp"' <<<"$(kcadm_get "users/${admin_id}/credentials" -r admin)" | cut -d'"' -f4 || true)"
curl -s -c "$work/cookies-admin" -b "$work/cookies-admin" -D "$work/headers" -o "$work/body" \
	"${KC}/realms/admin/protocol/openid-connect/auth?client_id=admin-bff&response_type=code&scope=openid&redirect_uri=$(urlenc "$ADMIN_CALLBACK")&code_challenge=${challenge}&code_challenge_method=S256&kc_action=delete_credential:${otp_id}" || true
for _ in 1 2 3; do
	location="$(location_of "$work/headers")"
	case "$location" in "${KC}"/*) curl -s -c "$work/cookies-admin" -b "$work/cookies-admin" -D "$work/headers" -o "$work/body" "$location" || true ;; *) break ;; esac
done
if grep -q 'name="accept"' "$work/body"; then
	printf 'accept=accept' | curl -s -c "$work/cookies-admin" -b "$work/cookies-admin" -D "$work/headers" -o "$work/body" --data-binary @- "$(form_action "$(cat "$work/body")")" || true
fi
[ -n "$otp_id" ] && has "$(kcadm_get "users/${admin_id}/credentials" -r admin)" "\"id\":\"${otp_id}\"" \
	&& pass "admin: kc_action=delete_credential does not remove the OTP credential" || fail "admin: OTP credential removed by delete_credential (id '${otp_id}')"
# A user created through the admin REST API without OTP and with "requiredActions": [] must
# configure OTP at the first login (OTP Form REQUIRED), not get a code.
no_otp_password="Np-$(openssl rand -hex 12)"
kcadm create partialImport -r admin -f - >/dev/null <<JSON
{"ifResourceExists": "OVERWRITE", "users": [{"username": "dev-check-no-otp", "email": "dev-check-no-otp@example.test",
  "emailVerified": true, "enabled": true, "firstName": "Check", "lastName": "NoOtp", "requiredActions": [],
  "credentials": [{"type": "password", "value": "${no_otp_password}", "temporary": false}]}]}
JSON
login admin admin-bff "$ADMIN_CALLBACK" dev-check-no-otp "$no_otp_password"
has "$LOGIN_LOCATION" "execution=CONFIGURE_TOTP" && [ -z "$LOGIN_CODE" ] \
	&& pass "admin: user without OTP (requiredActions []) must configure OTP at login, no code issued" \
	|| fail "admin: user without OTP got '${LOGIN_LOCATION%%\?*}' (code issued: $([ -n "$LOGIN_CODE" ] && echo yes || echo no))"

echo "== Redis (store sessions)"
has "$(redis_as none PING)" "NOAUTH" && pass "redis: commands without authentication are refused (NOAUTH)" || fail "redis: unauthenticated PING"
has "$(compose exec -T redis-session redis-cli --no-auth-warning --user default --pass nopass PING 2>&1 || true)" "WRONGPASS" \
	&& pass "redis: user default is disabled" || fail "redis: user default enabled"
[ "$(redis_as ops CONFIG GET maxmemory-policy | tail -n1)" = "noeviction" ] && pass "redis: maxmemory-policy noeviction (ops)" || fail "redis: maxmemory-policy"
[ "$(redis_as ops CONFIG GET appendonly | tail -n1)" = "yes" ] && [ "$(redis_as ops CONFIG GET maxmemory | tail -n1)" = "268435456" ] \
	&& pass "redis: AOF on, maxmemory 256 MB" || fail "redis: appendonly/maxmemory"
marker="persist-$(openssl rand -hex 8)"
[ "$(redis_as store SET store:dev-check:persist "$marker")" = "OK" ] && [ "$(redis_as store GET store:dev-check:persist)" = "$marker" ] \
	&& pass "redis: user store writes and reads store:* keys" || fail "redis: store user on store:*"
has "$(redis_as store SET other:key 1)" "NOPERM" && has "$(redis_as store GET other:key)" "NOPERM" \
	&& pass "redis: user store cannot use keys outside store:*" || fail "redis: store user outside store:*"
has "$(redis_as store FLUSHALL)" "NOPERM" && has "$(redis_as store CONFIG GET maxmemory)" "NOPERM" && has "$(redis_as store KEYS '*')" "NOPERM" \
	&& has "$(redis_as store CLIENT LIST)" "NOPERM" && has "$(redis_as store ACL WHOAMI)" "NOPERM" \
	&& pass "redis: user store cannot FLUSHALL, CONFIG, KEYS, CLIENT LIST or ACL" || fail "redis: store user has admin commands"
multi="$(printf 'MULTI\nSET store:dev-check:tx 1\nPEXPIRE store:dev-check:tx 60000\nEXEC\n' | compose exec -T redis-session sh -c 'REDISCLI_AUTH="$REDIS_SESSION_PASSWORD" exec redis-cli --no-auth-warning --user store' 2>&1 || true)"
has "$multi" "QUEUED" && ! has "$multi" "ERR" && ! has "$multi" "NOPERM" && pass "redis: user store runs MULTI/EXEC" || fail "redis: MULTI/EXEC for store"
[ "$(redis_as store EVAL "return redis.call('GET', KEYS[1])" 1 store:dev-check:tx)" = "1" ] && pass "redis: user store runs Lua scripts (EVAL) on store:* keys" || fail "redis: EVAL for store"
# The commands the store session Lua scripts call (ACL checked inside EVAL as well).
[ "$(redis_as store EVAL "redis.call('HSET', KEYS[1], 'n', 1); redis.call('HINCRBY', KEYS[1], 'n', 1); return redis.call('EXISTS', KEYS[1]) + redis.call('HGET', KEYS[1], 'n')" 1 store:dev-check:eval)" = "3" ] \
	&& pass "redis: user store runs Lua scripts with HSET, HINCRBY, EXISTS and HGET on store:* keys" || fail "redis: Lua script with HSET/HINCRBY/EXISTS/HGET for store"
redis_as store DEL store:dev-check:eval >/dev/null
[ "$(redis_as store CLIENT SETINFO LIB-NAME dev-check)" = "OK" ] && pass "redis: user store may CLIENT SETINFO (node-redis handshake)" || fail "redis: CLIENT SETINFO for store"
redis_as store DEL store:dev-check:tx >/dev/null

echo "== Store configuration (STORE_AUTH_MODE=oidc, values never printed)"
missing=""
for var in STORE_ENVIRONMENT STORE_AUTH_MODE STORE_PUBLIC_URL STORE_OIDC_ISSUER STORE_OIDC_INTERNAL_URL \
	STORE_OIDC_CLIENT_ID STORE_OIDC_CLIENT_SECRET STORE_REDIS_URL STORE_SESSION_ENC_KEYS STORE_BACKEND_URL; do
	[ -n "$(container_env store "$var" 2>/dev/null || true)" ] || missing+=" ${var}"
done
[ -z "$missing" ] && pass "store: all auth and session variables set and non-empty" || fail "store: empty or missing:${missing}"
[ "$(container_env store STORE_OIDC_ISSUER)" = "${KC}/realms/store" ] && [ "$(container_env store STORE_OIDC_INTERNAL_URL)" = "${KC_INTERNAL}/realms/store" ] \
	&& [ "$(container_env store STORE_PUBLIC_URL)" = "$STORE_PUBLIC_URL" ] && [ "$(container_env store STORE_OIDC_CLIENT_ID)" = "store-bff" ] \
	&& [ "$(container_env store STORE_AUTH_MODE)" = "oidc" ] && [ "$(container_env store STORE_ENVIRONMENT)" = "development" ] \
	&& pass "store: issuer equals the token iss, internal URL ${KC_INTERNAL}/realms/store, public URL, client id, oidc mode" || fail "store: OIDC URLs or mode"
[ "$(container_env store STORE_OIDC_CLIENT_SECRET)" = "$store_secret" ] && pass "store: client secret equals the store-bff secret imported into Keycloak" || fail "store: client secret differs from Keycloak"
keys_ok=1
IFS=',' read -r -a enc_keys <<<"$(container_env store STORE_SESSION_ENC_KEYS)"
for entry in "${enc_keys[@]}"; do
	[ -n "${entry%%:*}" ] && [ "${entry%%:*}" != "$entry" ] && [ "$(openssl base64 -d -A <<<"${entry#*:}" 2>/dev/null | wc -c | tr -d ' ')" = "32" ] || keys_ok=0
done
[ "${#enc_keys[@]}" -ge 1 ] && [ "$keys_ok" = 1 ] && pass "store: STORE_SESSION_ENC_KEYS is kid:base64 of 32 bytes (${#enc_keys[@]} key(s))" || fail "store: STORE_SESSION_ENC_KEYS format"
# The store's Redis URL authenticates as user store (same password as the Redis ACL).
STORE_REDIS_URL="$(container_env store STORE_REDIS_URL)"
export STORE_REDIS_URL
[ "$(compose exec -T -e STORE_REDIS_URL redis-session sh -c 'exec redis-cli --no-auth-warning -u "$STORE_REDIS_URL" PING' 2>&1 || true)" = "PONG" ] \
	&& pass "store: STORE_REDIS_URL authenticates to redis-session as user store" || fail "store: STORE_REDIS_URL does not authenticate"
unset STORE_REDIS_URL

echo "== Exposure"
ports="$(compose ps --format '{{.Service}} {{.Ports}}')"
published="$(grep -oE '[][0-9a-f.:]+:[0-9]+->[0-9]+/(tcp|udp)' <<<"$ports" || true)"
[ -n "$published" ] && ! grep -vqE '^127\.0\.0\.1:' <<<"$published" && pass "all published ports bound to 127.0.0.1 only" || fail "ports: ${published}"
kc_bindings="$(published_bindings keycloak)"
keycloak_ports_ok "$kc_bindings" "$KEYCLOAK_PORT" && pass "keycloak publishes only 8080 on 127.0.0.1:${KEYCLOAK_PORT} (management port 9000 unpublished)" \
	|| fail "keycloak ports: published '${kc_bindings% }', expected exactly '8080/tcp=127.0.0.1:${KEYCLOAK_PORT}'"
grep -q '^redis-session .*127.0.0.1:'"${REDIS_PORT}"'->6379/tcp' <<<"$ports" && pass "redis-session published on 127.0.0.1:${REDIS_PORT} only" || fail "redis-session ports"

echo "== Applications without Keycloak and Redis"
config="$(compose config --format json | compact)"
! has "$config" '"keycloak":{"condition"' && ! has "$config" '"redis-session":{"condition"' \
	&& pass "no service depends_on keycloak or redis-session" || fail "a service depends on keycloak or redis-session"
store_home_ok && pass "store home page renders (warm-up)" || fail "store home page before stopping Keycloak and Redis"
compose stop keycloak redis-session >/dev/null 2>&1
has "$(backend_health)" '"status":"ok"' && pass "backend /health 200 with Keycloak and Redis stopped" || fail "backend /health with Keycloak and Redis stopped: $(backend_health)"
store_home_ok && pass "store catalog page renders with Keycloak and Redis stopped" || fail "store page with Keycloak and Redis stopped"
[ "$(health backend)" = "healthy" ] && [ "$(health store)" = "healthy" ] && pass "backend and store containers stay healthy" || fail "backend/store health"

echo "== Optional services: no dependencies on them"
config="$(compose --profile '*' config --format json | compact)"
! has "$config" '"rabbitmq":{"condition"' && ! has "$config" '"elasticsearch":{"condition"' \
	&& pass "no service depends_on rabbitmq or elasticsearch" || fail "a service depends on rabbitmq or elasticsearch"

if [ "$OPTIONAL" = 1 ]; then
	echo "== Optional services (profiles messaging and search)"
	step "make rabbitmq-up: RabbitMQ healthy" make_dev rabbitmq-up
	step "make elasticsearch-up: Elasticsearch healthy" make_dev elasticsearch-up
	for svc in rabbitmq elasticsearch; do
		[ "$(health "$svc")" = "healthy" ] && pass "${svc} is healthy" || fail "${svc} health: $(health "$svc")"
	done
	# Without credentials the containers refuse to start (one-off containers, no ports, no data).
	compose run --rm --no-deps -e RABBITMQ_DEFAULT_PASS= rabbitmq >"$work/refuse.log" 2>&1 \
		&& fail "rabbitmq starts without RABBITMQ_DEFAULT_PASS" || { has "$(cat "$work/refuse.log")" "RABBITMQ_DEFAULT_PASS must be set" && pass "rabbitmq: refuses to start without RABBITMQ_DEFAULT_PASS"; } || fail "rabbitmq: unexpected failure without the password"
	compose run --rm --no-deps -e ELASTIC_PASSWORD= elasticsearch >"$work/refuse.log" 2>&1 \
		&& fail "elasticsearch starts without ELASTIC_PASSWORD" || { has "$(cat "$work/refuse.log")" "ELASTIC_PASSWORD must be set" && pass "elasticsearch: refuses to start without ELASTIC_PASSWORD"; } || fail "elasticsearch: unexpected failure without the password"
	rmq_user="$(container_env rabbitmq RABBITMQ_DEFAULT_USER)"
	rmq_pass="$(container_env rabbitmq RABBITMQ_DEFAULT_PASS)"
	es_pass="$(container_env elasticsearch ELASTIC_PASSWORD)"

	echo "-- RabbitMQ"
	res="$(rabbitmq_api "$rmq_user" "$rmq_pass" GET /api/overview)"
	[ "$(status_of "$res")" = "200" ] && pass "rabbitmq: management API accepts the configured user" || fail "rabbitmq: management API with the configured user -> $(status_of "$res")"
	res="$(rabbitmq_api "$rmq_user" "wrong-${rmq_pass}" GET /api/overview)"
	[ "$(status_of "$res")" = "401" ] && pass "rabbitmq: wrong password rejected (401)" || fail "rabbitmq: wrong password -> $(status_of "$res")"
	res="$(rabbitmq_api guest guest GET /api/overview)"
	[ "$(status_of "$res")" = "401" ] && pass "rabbitmq: guest/guest from outside the container rejected (401)" || fail "rabbitmq: guest/guest -> $(status_of "$res")"
	users="$(compose exec -T rabbitmq rabbitmqctl -q list_users 2>&1 || true)"
	has "$users" "$rmq_user" && ! grep -qw guest <<<"$users" \
		&& pass "rabbitmq: the configured user exists, the built-in guest user does not" || fail "rabbitmq users"
	compose exec -T rabbitmq sh -c 'rabbitmqctl -q authenticate_user "$RABBITMQ_DEFAULT_USER" "wrong-$RABBITMQ_DEFAULT_PASS"' >/dev/null 2>&1 \
		&& fail "rabbitmq: the broker accepts a wrong password" || pass "rabbitmq: the broker rejects a wrong password"
	compose exec -T rabbitmq sh -c 'rabbitmqctl -q authenticate_user "$RABBITMQ_DEFAULT_USER" "$RABBITMQ_DEFAULT_PASS"' >/dev/null 2>&1 \
		&& pass "rabbitmq: the broker accepts the configured password" || fail "rabbitmq: the broker rejects the configured password"
	res="$(rabbitmq_api "$rmq_user" "$rmq_pass" PUT /api/queues/%2F/dev-check '{"durable":true,"auto_delete":false}')"
	[ "$(status_of "$res")" = "201" ] && pass "rabbitmq: durable queue dev-check declared" || fail "rabbitmq: declaring the queue -> $(status_of "$res")"
	res="$(rabbitmq_api "$rmq_user" "$rmq_pass" POST /api/exchanges/%2F/amq.default/publish '{"properties":{"delivery_mode":2},"routing_key":"dev-check","payload":"persist-me","payload_encoding":"string"}')"
	has "$res" '"routed":true' && pass "rabbitmq: persistent message published and routed to dev-check" || fail "rabbitmq: publishing -> $res"
	[ "$(rabbitmq_queue_messages)" = "1" ] && pass "rabbitmq: queue dev-check holds 1 message" || fail "rabbitmq: queue contents before the restart: '$(rabbitmq_queue_messages)'"

	echo "-- Elasticsearch"
	res="$(elasticsearch_api "" "" GET /)"
	[ "$(status_of "$res")" = "401" ] && pass "elasticsearch: request without credentials rejected (401)" || fail "elasticsearch: no credentials -> $(status_of "$res")"
	res="$(elasticsearch_api elastic "wrong-${es_pass}" GET /)"
	[ "$(status_of "$res")" = "401" ] && pass "elasticsearch: wrong password rejected (401)" || fail "elasticsearch: wrong password -> $(status_of "$res")"
	res="$(elasticsearch_api elastic "$es_pass" GET /_cluster/health)"
	[ "$(status_of "$res")" = "200" ] && grep -qE '"status":"(green|yellow)"' <<<"$res" \
		&& pass "elasticsearch: user elastic authenticates, cluster green or yellow" || fail "elasticsearch: cluster health -> $(status_of "$res")"
	has "$(compact <<<"$(elasticsearch_api elastic "$es_pass" GET /)")" '"number":"9.' && pass "elasticsearch: version 9.x" || fail "elasticsearch: version"
	es_marker="doc-$(openssl rand -hex 8)"
	res="$(elasticsearch_api elastic "$es_pass" PUT "/dev-check/_doc/1?refresh=true" "{\"marker\":\"${es_marker}\"}")"
	grep -qE '"result":"(created|updated)"' <<<"$res" && pass "elasticsearch: document indexed in dev-check" || fail "elasticsearch: indexing -> $res"

	echo "-- Exposure"
	ports="$(compose ps --format '{{.Service}} {{.Ports}}')"
	published="$(grep -oE '[][0-9a-f.:]+:[0-9]+->[0-9]+/(tcp|udp)' <<<"$ports" || true)"
	[ -n "$published" ] && ! grep -vqE '^127\.0\.0\.1:' <<<"$published" && pass "all published ports (with the optional services) bound to 127.0.0.1 only" || fail "ports: ${published}"
	[ "$(sorted_words "$(published_bindings rabbitmq)")" = "$(sorted_words "5672/tcp=127.0.0.1:${RABBITMQ_PORT} 15672/tcp=127.0.0.1:${RABBITMQ_MANAGEMENT_PORT}")" ] \
		&& pass "rabbitmq publishes only 5672 and 15672, on 127.0.0.1" || fail "rabbitmq ports: '$(published_bindings rabbitmq)'"
	[ "$(sorted_words "$(published_bindings elasticsearch)")" = "$(sorted_words "9200/tcp=127.0.0.1:${ELASTICSEARCH_PORT}")" ] \
		&& pass "elasticsearch publishes only 9200, on 127.0.0.1" || fail "elasticsearch ports: '$(published_bindings elasticsearch)'"
fi

echo "== Restart: containers removed and recreated (volumes kept)"
make_dev down >/dev/null 2>&1 && pass "make down (without -v)" || fail "make down"
[ -z "$(compose --profile '*' ps -aq)" ] && pass "make down removed all containers, including the optional services" || fail "containers left after make down"
step "make up again on the existing volumes (keycloak-db.sh third run)" make_dev up
[ "$(redis_as store GET store:dev-check:persist)" = "$marker" ] && pass "redis: key written before down is still there (AOF)" || fail "redis: key lost after down/up"
make_dev keycloak-dev-seed >"$work/seed3.log" 2>&1 && [ "$(grep -c 'already exists (skipped)' "$work/seed3.log")" = "2" ] \
	&& pass "keycloak: realms and seed users persist (seed skips both users)" || fail "keycloak data after down/up"
public="$(curl -s --max-time 10 "${KC}/realms/store/.well-known/openid-configuration" | compact || true)"
[ "$(json_string issuer "$public")" = "${KC}/realms/store" ] && pass "keycloak: discovery works after the restart" || fail "keycloak discovery after the restart"
app_after="$(app_fingerprint)"
[ "$(without_identities "$app_after")" = "$(without_identities "$app_before")" ] \
	&& pass "application data untouched apart from the identity tables (tables and row counts identical)" || fail "application data changed: before '${app_before}', after '${app_after}'"
# GET /me and /admin/me registered the seed users just in time, once each.
[ "$(identity_rows customers_customer "$customer_sub")" = "1" ] && pass "backend: one customer registered for the seed customer (just in time)" \
	|| fail "backend: customers for the seed customer: '$(identity_rows customers_customer "$customer_sub")'"
[ "$(identity_rows backoffice_admin_user "$admin_sub")" = "1" ] && pass "backend: one administrator registered for the seed admin (just in time)" \
	|| fail "backend: administrators for the seed admin: '$(identity_rows backoffice_admin_user "$admin_sub")'"
redis_as store DEL store:dev-check:persist >/dev/null

if [ "$OPTIONAL" = 1 ]; then
	echo "== Optional services after down/up (volumes kept)"
	[ -z "$(compose --profile '*' ps -q rabbitmq elasticsearch)" ] && pass "make up does not bring the optional services back" || fail "optional services started by make up after the restart"
	step "make rabbitmq-up again on the existing volume" make_dev rabbitmq-up
	step "make elasticsearch-up again on the existing volume" make_dev elasticsearch-up
	[ "$(rabbitmq_queue_messages)" = "1" ] && pass "rabbitmq: durable queue and its persistent message survived down/up" || fail "rabbitmq: queue lost after down/up ('$(rabbitmq_queue_messages)')"
	res="$(elasticsearch_api elastic "$es_pass" GET /dev-check/_doc/1)"
	has "$(compact <<<"$res")" "\"marker\":\"${es_marker}\"" && pass "elasticsearch: document survived down/up" || fail "elasticsearch: document lost after down/up"
	rabbitmq_api "$rmq_user" "$rmq_pass" DELETE /api/queues/%2F/dev-check >/dev/null
	elasticsearch_api elastic "$es_pass" DELETE /dev-check >/dev/null
fi

echo
if [ "$failures" -eq 0 ]; then
	echo "check-dev-infra: all checks passed"
else
	echo "check-dev-infra: ${failures} check(s) failed"
	exit 1
fi
