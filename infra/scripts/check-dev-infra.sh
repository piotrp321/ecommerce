#!/usr/bin/env bash
# Runs the development topology (compose.yaml + compose.override.yaml) in its own Compose
# project and checks the identity and session infrastructure: Keycloak (realms, clients,
# discovery, PKCE, logins with the dev seed users, account console), the Keycloak
# database, Redis for the store sessions (ACL, eviction policy, persistence), port
# exposure and that the backend and the store work without Keycloak and Redis.
#
# Project: DEV_CHECK_PROJECT (default ecommerce-dev-check), always passed with -p, so it
# wins over COMPOSE_PROJECT_NAME from .env. Ports (all on 127.0.0.1): DEV_CHECK_HTTP_PORT
# (28080), DEV_CHECK_HTTPS_PORT (28443), DEV_CHECK_POSTGRES_PORT (25432),
# DEV_CHECK_ADMIN_PORT (25173), DEV_CHECK_STORE_PORT (23000), DEV_CHECK_KEYCLOAK_PORT
# (28180), DEV_CHECK_REDIS_PORT (26379). The containers are removed at the end; the
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
trap 'compose down --remove-orphans >/dev/null 2>&1 || true; rm -rf "$work"' EXIT

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
# internal_post <url>: form body from stdin (keeps secrets out of command lines)
internal_post() { compose exec -T backend curl -s --max-time 10 --data-binary @- "$1" || true; }
# Value of a container environment variable (never printed): container_env <service> <var>
container_env() { compose exec -T "$1" printenv "$2"; }
# Admin REST through kcadm, output compacted: kcadm_get <kcadm get arguments...>
kcadm_get() {
	compose exec -T keycloak bash -c '
		config=$(mktemp)
		trap "rm -f $config" EXIT
		/opt/keycloak/bin/kcadm.sh config credentials --config "$config" --server http://localhost:8080 --realm master \
			--user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null 2>&1
		/opt/keycloak/bin/kcadm.sh get "$@" --config "$config"
	' kcadm "$@" 2>/dev/null | compact || true
}
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
# Sets: LOGIN_CODE, LOGIN_VERIFIER, LOGIN_OTP_ASKED (1 when the OTP form was shown).
login() {
	local realm="$1" client="$2" redirect="$3" user="$4" password="$5" otp_secret="${6:-}"
	local jar="$work/cookies-$realm" challenge page action location
	rm -f "$jar"
	LOGIN_CODE="" LOGIN_OTP_ASKED=0
	LOGIN_VERIFIER="$(openssl rand -hex 32)"
	challenge="$(printf '%s' "$LOGIN_VERIFIER" | openssl dgst -sha256 -binary | openssl base64 -A | tr '+/' '-_' | tr -d '=')"
	page="$(curl -s -c "$jar" -b "$jar" "${KC}/realms/${realm}/protocol/openid-connect/auth?client_id=${client}&response_type=code&scope=openid&state=check&nonce=check&redirect_uri=$(urlenc "$redirect")&code_challenge=${challenge}&code_challenge_method=S256" || true)"
	action="$(form_action "$page")"
	[ -n "$action" ] || return 0
	curl -s -c "$jar" -b "$jar" -D "$work/headers" -o "$work/body" \
		--data-urlencode "username=${user}" --data-urlencode "password=${password}" "$action" || true
	location="$(location_of "$work/headers")"
	if [ -z "$location" ] && grep -q 'name="otp"' "$work/body"; then
		LOGIN_OTP_ASKED=1
		[ -n "$otp_secret" ] || return 0
		action="$(form_action "$(cat "$work/body")")"
		curl -s -c "$jar" -b "$jar" -D "$work/headers" -o "$work/body" --data-urlencode "otp=$(totp "$otp_secret")" "$action" || true
		location="$(location_of "$work/headers")"
	fi
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
# Code exchange at the internal token endpoint: exchange <realm> <client> <secret> <redirect> <code> [verifier]
exchange() {
	local body="grant_type=authorization_code&client_id=$2&client_secret=$(urlenc "$3")&redirect_uri=$(urlenc "$4")&code=$5"
	[ -z "${6:-}" ] || body+="&code_verifier=$6"
	printf '%s' "$body" | internal_post "${KC_INTERNAL}/realms/$1/protocol/openid-connect/token" | compact
}
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
# Connects as the keycloak role (password from the container environment): as_keycloak <database>
as_keycloak() {
	compose exec -T -e TARGET_DB="$1" database sh -c 'PGPASSWORD="$KEYCLOAK_DB_PASSWORD" psql -X -At -h 127.0.0.1 -U keycloak -d "$TARGET_DB" -c "SELECT 1"' 2>&1 || true
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
health() { docker inspect -f '{{.State.Health.Status}}' "$(compose ps -q "$1")" 2>/dev/null || true; }
backend_health() { curl -sk --max-time 10 "https://localhost:${HTTPS_PORT}/health" || true; }
store_home_ok() { curl -s --max-time 120 "http://localhost:${STORE_PORT}/" | grep -q '<h1>Sklep</h1>'; }

echo "== Development stack (project ${PROJECT}, Keycloak on ${KEYCLOAK_PORT}, Redis on ${REDIS_PORT})"
step "pnpm workspace installed into the project volumes" make_dev pnpm-install
step "make up: database, keycloak-db.sh, all services healthy" make_dev up
step "backend dependencies installed" make_dev backend-install
step "application migrations run" make_dev backend-migrate
app_before="$(app_fingerprint)"
[ -n "$app_before" ] && pass "application tables present: ${app_before}" || fail "application tables missing"
step "keycloak-db.sh runs again without errors (idempotent)" env DOCKER_COMP="$DOCKER_COMP" ./infra/scripts/keycloak-db.sh
step "keycloak-dev-seed runs (first run in this project creates or skips the users)" make_dev keycloak-dev-seed
make_dev keycloak-dev-seed >"$work/seed2.log" 2>&1 && [ "$(grep -c 'already exists (skipped)' "$work/seed2.log")" = "2" ] \
	&& pass "keycloak-dev-seed runs again: both users skipped (idempotent)" || { fail "second keycloak-dev-seed run"; cat "$work/seed2.log"; }
for svc in keycloak redis-session; do
	[ "$(health "$svc")" = "healthy" ] && pass "${svc} is healthy" || fail "${svc} health: $(health "$svc")"
done

echo "== Keycloak database"
has "$(as_keycloak keycloak)" "1" && pass "role keycloak connects to its database" || fail "role keycloak cannot connect to database keycloak"
app_db="$(container_env database POSTGRES_DB)"
has "$(as_keycloak "$app_db")" "permission denied for database" && pass "role keycloak cannot connect to the application database (${app_db})" \
	|| fail "role keycloak can connect to the application database"
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
	has "$jwks" '"alg":"RS256"' && has "$jwks" '"use":"sig"' && pass "${realm}: JWKS reachable inside the network (RS256 signing key)" || fail "${realm}: JWKS ${jwks:0:120}"
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
otp_action="$(kcadm_get authentication/required-actions/CONFIGURE_TOTP -r admin)"
expect_all "admin realm: Configure OTP is an enabled default required action" "$otp_action" '"enabled":true' '"defaultAction":true'
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
grant() { printf '%s' "$2" | internal_post "${KC_INTERNAL}/realms/$1/protocol/openid-connect/token" | compact; }
for spec in "store|store-bff|${store_secret}|${KEYCLOAK_DEV_CUSTOMER_EMAIL}|${KEYCLOAK_DEV_CUSTOMER_PASSWORD}" \
	"admin|admin-bff|${admin_secret}|${KEYCLOAK_DEV_ADMIN_USERNAME}|${KEYCLOAK_DEV_ADMIN_PASSWORD}"; do
	IFS='|' read -r realm client secret user password <<<"$spec"
	res="$(grant "$realm" "grant_type=password&client_id=${client}&client_secret=$(urlenc "$secret")&username=$(urlenc "$user")&password=$(urlenc "$password")")"
	has "$res" '"error":"unauthorized_client"' && pass "${client}: password grant (direct access) rejected (unauthorized_client)" || fail "${client}: password grant ${res:0:120}"
	res="$(grant "$realm" "grant_type=client_credentials&client_id=${client}&client_secret=$(urlenc "$secret")")"
	has "$res" '"error":"unauthorized_client"' && pass "${client}: token endpoint inside the network answers; client credentials grant rejected" || fail "${client}: client credentials ${res:0:120}"
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
grep -qE '"aud":("store-api"|\[[^]]*"store-api")' <<<"$claims" && pass "store: aud contains store-api" || fail "store: aud ${claims:0:200}"
exp="$(json_number exp "$claims")" iat="$(json_number iat "$claims")"
[ -n "$exp" ] && [ -n "$iat" ] && [ $((exp - iat)) -eq 300 ] && pass "store: access token lifetime 300 s" || fail "store: access token lifetime (exp '${exp}', iat '${iat}')"
challenge="$(printf '%s' "$(openssl rand -hex 32)" | openssl dgst -sha256 -binary | openssl base64 -A | tr '+/' '-_' | tr -d '=')"
code="$(sso_code store store-bff "$STORE_CALLBACK" "$challenge")"
res="$(exchange store store-bff "$store_secret" "$STORE_CALLBACK" "$code")"
[ -n "$code" ] && has "$res" '"error":"invalid_grant"' && pass "store: code exchange without code_verifier rejected (invalid_grant)" || fail "store: exchange without verifier ${res:0:120}"

login admin admin-bff "$ADMIN_CALLBACK" "$KEYCLOAK_DEV_ADMIN_USERNAME" "$KEYCLOAK_DEV_ADMIN_PASSWORD"
[ "$LOGIN_OTP_ASKED" = 1 ] && [ -z "$LOGIN_CODE" ] && pass "admin: password alone is not enough, the browser flow asks for OTP" || fail "admin: OTP not required (otp form ${LOGIN_OTP_ASKED})"
login admin admin-bff "$ADMIN_CALLBACK" "$KEYCLOAK_DEV_ADMIN_USERNAME" "$KEYCLOAK_DEV_ADMIN_PASSWORD" "$KEYCLOAK_DEV_ADMIN_TOTP_SECRET"
[ -n "$LOGIN_CODE" ] && pass "admin: dev admin logs in with password and the seeded TOTP" || fail "admin: login with TOTP"
tokens="$(exchange admin admin-bff "$admin_secret" "$ADMIN_CALLBACK" "$LOGIN_CODE" "$LOGIN_VERIFIER")"
claims="$(jwt_payload "$(json_string access_token "$tokens")")"
expect_all "admin: access token has the public issuer, azp admin-bff, resource_access.admin-api.roles [admin]" "$claims" \
	"\"iss\":\"${KC}/realms/admin\"" '"azp":"admin-bff"' '"typ":"Bearer"' '"resource_access":{"admin-api":{"roles":["admin"]}}' '"sub":"'
grep -qE '"aud":("admin-api"|\[[^]]*"admin-api")' <<<"$claims" && pass "admin: aud contains admin-api" || fail "admin: aud ${claims:0:200}"

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
	&& pass "redis: user store cannot FLUSHALL, CONFIG or KEYS" || fail "redis: store user has admin commands"

echo "== Exposure"
ports="$(compose ps --format '{{.Service}} {{.Ports}}')"
published="$(grep -oE '[][0-9a-f.:]+:[0-9]+->[0-9]+/(tcp|udp)' <<<"$ports" || true)"
[ -n "$published" ] && ! grep -vqE '^127\.0\.0\.1:' <<<"$published" && pass "all published ports bound to 127.0.0.1 only" || fail "ports: ${published}"
grep -q '^keycloak .*127.0.0.1:'"${KEYCLOAK_PORT}"'->8080/tcp' <<<"$ports" && ! grep -q -- '->9000' <<<"$ports" \
	&& ! compose port keycloak 9000 >/dev/null 2>&1 && pass "keycloak publishes only 8080 (management port 9000 unpublished)" || fail "keycloak ports"
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

echo "== Restart: containers removed and recreated (volumes kept)"
compose down --remove-orphans >/dev/null 2>&1 && pass "compose down (without -v)" || fail "compose down"
step "make up again on the existing volumes (keycloak-db.sh third run)" make_dev up
[ "$(redis_as store GET store:dev-check:persist)" = "$marker" ] && pass "redis: key written before down is still there (AOF)" || fail "redis: key lost after down/up"
make_dev keycloak-dev-seed >"$work/seed3.log" 2>&1 && [ "$(grep -c 'already exists (skipped)' "$work/seed3.log")" = "2" ] \
	&& pass "keycloak: realms and seed users persist (seed skips both users)" || fail "keycloak data after down/up"
public="$(curl -s --max-time 10 "${KC}/realms/store/.well-known/openid-configuration" | compact || true)"
[ "$(json_string issuer "$public")" = "${KC}/realms/store" ] && pass "keycloak: discovery works after the restart" || fail "keycloak discovery after the restart"
app_after="$(app_fingerprint)"
[ "$app_after" = "$app_before" ] && pass "application data untouched (tables and row counts identical)" || fail "application data changed: before '${app_before}', after '${app_after}'"
redis_as store DEL store:dev-check:persist >/dev/null

echo
if [ "$failures" -eq 0 ]; then
	echo "check-dev-infra: all checks passed"
else
	echo "check-dev-infra: ${failures} check(s) failed"
	exit 1
fi
