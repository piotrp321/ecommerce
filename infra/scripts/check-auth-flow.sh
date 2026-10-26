#!/usr/bin/env bash
# End-to-end login of the store (BFF, confidential client store-bff) against a running
# stack, with curl and a cookie jar, like a browser without JavaScript:
#   anonymous /konto -> /logowanie -> Keycloak login form -> /auth/callback -> /konto
#   (profile from GET /me of the backend) -> logout rejected for a foreign Origin ->
#   logout (Server Action) -> Keycloak end_session -> the old session cookie no longer works;
#   optionally back-channel logout: a second login, its Keycloak sessions ended through the
#   Keycloak admin CLI -> the store cookie no longer works.
# It starts nothing: the dev stack (`make up`, `make keycloak-dev-seed`) or the prod topology
# of infra/scripts/check-prod-stack.sh (which calls it through the edge) must be running.
# The cookie variant follows STORE_URL: https -> __Host-store_session (Secure), http://localhost
# -> store_session.
#
# Environment:
#   STORE_URL                     public URL of the store (required), e.g. http://localhost:3000
#                                 or https://store.localhost
#   CHECK_AUTH_USER               default customer@example.test
#   CHECK_AUTH_PASSWORD           password of that user (required; never printed nor put on a
#                                 command line)
#   CHECK_AUTH_CONNECT_TO         optional, space-separated curl --connect-to values (e.g. the
#                                 test domains of the prod check to 127.0.0.1:<edge port>)
#   CHECK_AUTH_INSECURE=1         optional, accept the edge's local CA (curl -k)
#   CHECK_AUTH_KEYCLOAK_COMPOSE   optional Compose command of the stack (e.g. "docker compose"
#                                 in the dev project): enables the back-channel logout step,
#                                 which runs kcadm in the keycloak container as its bootstrap
#                                 admin (credentials from the container environment)
set -euo pipefail

cd "$(dirname "$0")/../.."

STORE_URL="${STORE_URL:?set STORE_URL to the public URL of the store, e.g. http://localhost:3000}"
STORE_URL="${STORE_URL%/}"
AUTH_USER="${CHECK_AUTH_USER:-customer@example.test}"
AUTH_PASSWORD="${CHECK_AUTH_PASSWORD:?set CHECK_AUTH_PASSWORD to the password of ${AUTH_USER}}"
case "$STORE_URL" in
https://*) SECURE=1 PREFIX='__Host-' ;;
http://localhost:* | http://localhost | http://127.0.0.1:*) SECURE=0 PREFIX='' ;;
*) echo "check-auth-flow: STORE_URL must be https:// or http://localhost" >&2; exit 1 ;;
esac
SESSION_COOKIE="${PREFIX}store_session"
LOGIN_COOKIE="${PREFIX}store_login"

CURL_OPTS=(-s --max-time 20)
[ "${CHECK_AUTH_INSECURE:-0}" = "1" ] && CURL_OPTS+=(-k)
for target in ${CHECK_AUTH_CONNECT_TO:-}; do CURL_OPTS+=(--connect-to "$target"); done

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
JAR="$WORK/cookies.txt"
: >"$JAR"

failures=0
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; failures=$((failures + 1)); }
die() {
	echo "FAIL  $1"
	echo "check-auth-flow: stopped"
	exit 1
}

# GET/POST with the cookie jar, no redirects followed. Prints "<status> <location>"; the body
# goes to $WORK/body, the response headers to $WORK/headers.
request() {
	curl "${CURL_OPTS[@]}" -b "$JAR" -c "$JAR" -o "$WORK/body" -D "$WORK/headers" -w '%{http_code} %{redirect_url}' "$@" || true
}
location_of() { cut -d' ' -f2- <<<"$1"; }
status_of() { cut -d' ' -f1 <<<"$1"; }
# Value of a cookie in the jar (Netscape format; HttpOnly cookies are prefixed with #HttpOnly_).
cookie() { awk -F'\t' -v name="$1" '$6 == name { value = $7 } END { print value }' "$JAR"; }
cookie_line() { awk -F'\t' -v name="$1" '$6 == name' "$JAR"; }
# Cookies of the store only: the jar also holds Keycloak's (on localhost cookies are not
# scoped by port, so KEYCLOAK_IDENTITY, a JWT, is there too), all with a path under /realms/.
store_cookie_lines() { awk -F'\t' 'NF >= 7 && $3 !~ /^\/realms\// { print }' "$JAR"; }
# A JWT (header.payload.signature, base64url of '{"') anywhere in the input.
has_jwt() { grep -qE 'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.' "$@"; }
set_cookie_of() { tr -d '\r' <"$WORK/headers" | grep -i "^set-cookie: $1=" | head -n1 || true; }
html_unescape() { sed -e 's/&amp;/\&/g' -e 's/&#x2F;/\//g' -e 's/&quot;/"/g'; }
urlenc() { local LC_ALL=C s="$1" out="" c i; for ((i = 0; i < ${#s}; i++)); do c="${s:i:1}"; case "$c" in [a-zA-Z0-9.~_-]) out+="$c" ;; *) out+="$(printf '%%%02X' "'$c")" ;; esac; done; printf '%s' "$out"; }

# The whole login, from /logowanie to the session cookie; "$1" is a label for the messages.
login() {
	local label="$1" result authorize form_action callback
	result="$(request "$STORE_URL/logowanie?powrot=%2Fkonto")"
	authorize="$(location_of "$result")"
	[ "$(status_of "$result")" = "303" ] && [[ "$authorize" == *"/realms/store/protocol/openid-connect/auth?"* ]] \
		&& [[ "$authorize" == *"code_challenge_method=S256"* ]] && [[ "$authorize" == *"client_id=store-bff"* ]] \
		&& [[ "$authorize" == *"state="* ]] && [[ "$authorize" == *"nonce="* ]] \
		&& pass "${label}: /logowanie redirects (303) to Keycloak with state, nonce and PKCE S256" || die "${label}: /logowanie: ${result}"
	[[ "$(cookie_line "$LOGIN_COOKIE")" == "#HttpOnly_"* ]] && pass "${label}: login cookie ${LOGIN_COOKIE} is HttpOnly" || fail "${label}: login cookie ${LOGIN_COOKIE}"

	result="$(request "$authorize")"
	[ "$(status_of "$result")" = "200" ] || die "${label}: Keycloak login page: ${result}"
	form_action="$(tr '\n' ' ' <"$WORK/body" | grep -oE '<form[^>]*id="kc-form-login"[^>]*>' | grep -oE 'action="[^"]+"' | head -n1 | cut -d'"' -f2 | html_unescape || true)"
	[ -n "$form_action" ] || die "${label}: no kc-form-login in the Keycloak page"

	# Credentials through stdin, never on a command line.
	result="$(printf 'username=%s&password=%s&credentialId=' "$(urlenc "$AUTH_USER")" "$(urlenc "$AUTH_PASSWORD")" | request --data-binary @- "$form_action")"
	callback="$(location_of "$result")"
	[[ "$(status_of "$result")" =~ ^30[23]$ ]] && [[ "$callback" == "$STORE_URL/auth/callback?"* ]] && [[ "$callback" == *"iss="* ]] && [[ "$callback" == *"code="* ]] \
		&& pass "${label}: Keycloak redirects to /auth/callback with code and iss" || die "${label}: login at Keycloak: $(status_of "$result") ${callback%%\?*}"

	result="$(request "$callback")"
	[ "$(status_of "$result")" = "303" ] && [ "$(location_of "$result")" = "$STORE_URL/konto" ] \
		&& pass "${label}: callback redirects (303) to /konto" || die "${label}: callback: ${result}"
}

echo "== Login flow (${STORE_URL}, user ${AUTH_USER})"

# 1. A protected page sends an anonymous visitor to the login and back.
result="$(request "$STORE_URL/konto")"
[[ "$(status_of "$result")" =~ ^30[37]$ ]] && [[ "$(location_of "$result")" == *"/logowanie?powrot=%2Fkonto" ]] \
	&& pass "anonymous /konto redirects to /logowanie?powrot=%2Fkonto" || fail "anonymous /konto: ${result}"
[ -z "$(cookie "$SESSION_COOKIE")" ] && pass "anonymous visit sets no session cookie" || fail "session cookie before login"

# 2.-5. Login.
login "login"

# The session cookie: an opaque id; its attributes as set by the callback.
session="$(cookie "$SESSION_COOKIE")"
set_cookie="$(set_cookie_of "$SESSION_COOKIE")"
[[ "$session" =~ ^[A-Za-z0-9_-]{43}$ ]] && [[ "$(cookie_line "$SESSION_COOKIE")" == "#HttpOnly_"* ]] \
	&& pass "session cookie ${SESSION_COOKIE} is an opaque HttpOnly id" || fail "session cookie: '$(cookie_line "$SESSION_COOKIE" | cut -f1-6)'"
attrs_ok=1
for attr in 'Path=/' 'HttpOnly' 'SameSite=Lax'; do grep -qiF "; ${attr}" <<<"$set_cookie" || attrs_ok=0; done
grep -qi '; Domain=' <<<"$set_cookie" && attrs_ok=0
if [ "$SECURE" = "1" ]; then grep -qiE '; Secure(;|$)' <<<"$set_cookie" || attrs_ok=0; else grep -qiE '; Secure(;|$)' <<<"$set_cookie" && attrs_ok=0; fi
[ "$attrs_ok" = "1" ] \
	&& pass "Set-Cookie ${SESSION_COOKIE}: Path=/, HttpOnly, SameSite=Lax, no Domain, $([ "$SECURE" = 1 ] && echo Secure || echo 'no Secure (http://localhost)')" \
	|| fail "Set-Cookie attributes of ${SESSION_COOKIE}"
[ -z "$(cookie "$LOGIN_COOKIE")" ] && pass "login cookie removed after the callback" || fail "login cookie left after the callback"
! has_jwt <(store_cookie_lines) "$WORK/headers" && pass "no token in the store's cookies or in its callback response headers" || fail "token found in the store's cookies or headers"

# 6. The account page shows the profile from GET /me of the backend.
result="$(request "$STORE_URL/konto")"
[ "$(status_of "$result")" = "200" ] && grep -qF "$AUTH_USER" "$WORK/body" \
	&& pass "/konto shows the account of ${AUTH_USER} (GET /me)" || die "/konto after login: ${result}"
! has_jwt "$WORK/body" "$WORK/headers" && pass "no token in the HTML or the headers of /konto" || fail "token in /konto"
cp "$WORK/body" "$WORK/account.html"

# 7. Logout is a Server Action: a form post with its action id (progressive enhancement).
action_field="$(grep -oE 'name="\$ACTION_ID_[0-9a-f]+"' "$WORK/account.html" | head -n1 | cut -d'"' -f2 || true)"
[ -n "$action_field" ] && pass "logout form found" || die "no logout form on /konto"

for origin in https://evil.example null 'not a url'; do
	rejected="$(request -H "Origin: ${origin}" -F "${action_field}=" "$STORE_URL/konto")"
	[ "$(status_of "$rejected")" = "403" ] && pass "logout with Origin '${origin}' is rejected with 403" || fail "Origin '${origin}' logout: ${rejected}"
done
after="$(request "$STORE_URL/konto")"
[ "$(status_of "$after")" = "200" ] && pass "the session survives the rejected logouts" || fail "/konto after rejected logouts: ${after}"

result="$(request -H "Origin: ${STORE_URL}" -F "${action_field}=" "$STORE_URL/konto")"
end_session="$(location_of "$result")"
[[ "$(status_of "$result")" =~ ^30[37]$ ]] && [[ "$end_session" == *"/realms/store/protocol/openid-connect/logout?"* ]] && [[ "$end_session" == *"id_token_hint="* ]] \
	&& pass "logout redirects to Keycloak end_session with id_token_hint" || fail "logout: $(status_of "$result") ${end_session%%\?*}"
[ -z "$(cookie "$SESSION_COOKIE")" ] && pass "session cookie removed by the logout" || fail "session cookie left after logout"

# 8. Keycloak ends its session and returns to the store.
if [ -n "$end_session" ]; then
	result="$(request "$end_session")"
	[[ "$(status_of "$result")" =~ ^30[23]$ ]] && [[ "$(location_of "$result")" == "$STORE_URL/"* ]] \
		&& pass "Keycloak end_session returns to the store" || fail "end_session: $(status_of "$result") $(location_of "$result" | cut -d'?' -f1)"
fi

# 9. The old session id is dead in the store (a copied cookie does not work).
old_cookie_rejected() {
	local result
	result="$(curl "${CURL_OPTS[@]}" -o /dev/null -w '%{http_code} %{redirect_url}' -H "Cookie: ${SESSION_COOKIE}=$1" "$STORE_URL/konto" || true)"
	[[ "$(status_of "$result")" =~ ^30[37]$ ]] && [[ "$(location_of "$result")" == *"/logowanie?powrot=%2Fkonto" ]]
}
old_cookie_rejected "$session" && pass "the old session cookie no longer opens /konto" || fail "old session cookie after logout still works"

# 10. Back-channel logout: Keycloak ends the user's sessions and notifies the store.
if [ -n "${CHECK_AUTH_KEYCLOAK_COMPOSE:-}" ]; then
	read -r -a kc_compose <<<"$CHECK_AUTH_KEYCLOAK_COMPOSE"
	echo "== Back-channel logout (Keycloak admin logout of ${AUTH_USER})"
	: >"$JAR"
	login "second login"
	second="$(cookie "$SESSION_COOKIE")"
	[ "$(status_of "$(request "$STORE_URL/konto")")" = "200" ] && pass "second session opens /konto" || fail "second session /konto"
	# kcadm as the bootstrap admin of the container (password through KC_CLI_PASSWORD, from the
	# container environment; config in a temporary file of the container).
	kc_out="$(CHECK_AUTH_USER_EMAIL="$AUTH_USER" "${kc_compose[@]}" exec -T -e CHECK_AUTH_USER_EMAIL keycloak bash -s 2>&1 <<'KCADM' || true
set -euo pipefail
config="$(mktemp)"
trap 'rm -f "$config"' EXIT
kcadm() { /opt/keycloak/bin/kcadm.sh "$@" --config "$config"; }
KC_CLI_PASSWORD="$KC_BOOTSTRAP_ADMIN_PASSWORD" /opt/keycloak/bin/kcadm.sh config credentials --config "$config" \
	--server http://localhost:8080 --realm master --user "$KC_BOOTSTRAP_ADMIN_USERNAME" >/dev/null
id="$(kcadm get users -r store -q "email=${CHECK_AUTH_USER_EMAIL}" -q exact=true --fields id --format csv --noquotes | head -n1)"
[ -n "$id" ] || { echo "no user"; exit 1; }
kcadm create "users/${id}/logout" -r store >/dev/null
echo "logged-out"
KCADM
)"
	[[ "$kc_out" == *logged-out* ]] && pass "Keycloak admin logout of ${AUTH_USER} (kcadm in the keycloak container)" || fail "Keycloak admin logout failed"
	revoked=0
	for _ in $(seq 1 10); do
		old_cookie_rejected "$second" && { revoked=1; break; }
		sleep 1
	done
	[ "$revoked" = "1" ] && pass "back-channel logout: the store cookie of the second session no longer opens /konto" \
		|| fail "back-channel logout: the second session still opens /konto"
else
	echo "SKIP  back-channel logout (set CHECK_AUTH_KEYCLOAK_COMPOSE to the stack's Compose command)"
fi

echo
if [ "$failures" -eq 0 ]; then
	echo "check-auth-flow: all checks passed"
else
	echo "check-auth-flow: ${failures} check(s) failed"
	exit 1
fi
