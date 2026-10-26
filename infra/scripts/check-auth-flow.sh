#!/usr/bin/env bash
# End-to-end login of the store (BFF, confidential client store-bff) against the dev
# Keycloak, with curl and a cookie jar, like a browser without JavaScript:
#   anonymous /konto -> /logowanie -> Keycloak login form -> /auth/callback -> /konto
#   (profile from GET /me of the backend) -> logout (Server Action) -> Keycloak end_session,
#   and the old session cookie no longer works.
# Needs the dev stack with Keycloak (realm store), redis-session, the backend with GET /me
# and the store in STORE_AUTH_MODE=oidc.
#
# Environment:
#   STORE_URL            public URL of the store (default http://localhost:${STORE_PORT:-3000})
#   CHECK_AUTH_USER      default customer@example.test (dev realm user)
#   CHECK_AUTH_PASSWORD  password of that user (required; from the dev realm seed)
set -euo pipefail

STORE_URL="${STORE_URL:-http://localhost:${STORE_PORT:-3000}}"
STORE_URL="${STORE_URL%/}"
AUTH_USER="${CHECK_AUTH_USER:-customer@example.test}"
AUTH_PASSWORD="${CHECK_AUTH_PASSWORD:?set CHECK_AUTH_PASSWORD to the password of ${AUTH_USER} in the dev realm}"
case "$STORE_URL" in
https://*) PREFIX='__Host-' ;;
*) PREFIX='' ;;
esac
SESSION_COOKIE="${PREFIX}store_session"
LOGIN_COOKIE="${PREFIX}store_login"

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

# GET/POST with the cookie jar, no redirects followed. Prints "<status> <location>"; the body goes to $WORK/body.
request() {
	curl -s -b "$JAR" -c "$JAR" -o "$WORK/body" -D "$WORK/headers" -w '%{http_code} %{redirect_url}' "$@"
}
location_of() { cut -d' ' -f2- <<<"$1"; }
status_of() { cut -d' ' -f1 <<<"$1"; }
# Value of a cookie in the jar (Netscape format; HttpOnly cookies are prefixed with #HttpOnly_).
cookie() { awk -v name="$1" '$6 == name { value = $7 } END { print value }' "$JAR"; }
cookie_line() { awk -v name="$1" '$6 == name' "$JAR"; }
# Cookies of the store only: the jar also holds Keycloak's (cookies are not scoped by port,
# so on localhost KEYCLOAK_IDENTITY, a JWT, is there too), all with a path under /realms/.
store_cookie_lines() { awk -F'\t' 'NF >= 7 && $3 !~ /^\/realms\// { print }' "$JAR"; }
# A JWT (header.payload.signature, base64url of '{"') anywhere in the input.
has_jwt() { grep -qE 'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.' "$@"; }
html_unescape() { sed -e 's/&amp;/\&/g' -e 's/&#x2F;/\//g' -e 's/&quot;/"/g'; }

echo "== Login flow (${STORE_URL}, user ${AUTH_USER})"

# 1. A protected page sends an anonymous visitor to the login and back.
result="$(request "$STORE_URL/konto")"
[[ "$(status_of "$result")" =~ ^30[37]$ ]] && [[ "$(location_of "$result")" == *"/logowanie?powrot=%2Fkonto" ]] \
	&& pass "anonymous /konto redirects to /logowanie?powrot=%2Fkonto" || fail "anonymous /konto: ${result}"
[ -z "$(cookie "$SESSION_COOKIE")" ] && pass "anonymous visit sets no session cookie" || fail "session cookie before login"

# 2. /logowanie starts the authorization code flow with PKCE S256.
result="$(request "$STORE_URL/logowanie?powrot=%2Fkonto")"
authorize="$(location_of "$result")"
[ "$(status_of "$result")" = "303" ] && [[ "$authorize" == *"/realms/store/protocol/openid-connect/auth?"* ]] \
	&& [[ "$authorize" == *"code_challenge_method=S256"* ]] && [[ "$authorize" == *"client_id=store-bff"* ]] \
	&& [[ "$authorize" == *"state="* ]] && [[ "$authorize" == *"nonce="* ]] \
	&& pass "/logowanie redirects (303) to Keycloak with state, nonce and PKCE S256" || die "/logowanie: ${result}"
[[ "$(cookie_line "$LOGIN_COOKIE")" == "#HttpOnly_"* ]] && pass "login cookie ${LOGIN_COOKIE} is HttpOnly" || fail "login cookie ${LOGIN_COOKIE}"

# 3. The Keycloak login form.
result="$(request "$authorize")"
[ "$(status_of "$result")" = "200" ] || die "Keycloak login page: ${result}"
form_action="$(tr '\n' ' ' <"$WORK/body" | grep -oE '<form[^>]*id="kc-form-login"[^>]*>' | grep -oE 'action="[^"]+"' | head -n1 | cut -d'"' -f2 | html_unescape)"
[ -n "$form_action" ] && pass "Keycloak login form found" || die "no kc-form-login in the Keycloak page"

# 4. Credentials; Keycloak redirects to the callback with code, state and iss (RFC 9207).
result="$(request --data-urlencode "username=${AUTH_USER}" --data-urlencode "password=${AUTH_PASSWORD}" --data-urlencode 'credentialId=' "$form_action")"
callback="$(location_of "$result")"
[[ "$(status_of "$result")" =~ ^30[23]$ ]] && [[ "$callback" == "$STORE_URL/auth/callback?"* ]] && [[ "$callback" == *"iss="* ]] && [[ "$callback" == *"code="* ]] \
	&& pass "Keycloak redirects to /auth/callback with code and iss" || die "login at Keycloak: ${result}"

# 5. The callback creates the session and returns to /konto.
result="$(request "$callback")"
[ "$(status_of "$result")" = "303" ] && [ "$(location_of "$result")" = "$STORE_URL/konto" ] \
	&& pass "callback redirects (303) to /konto" || die "callback: ${result}"
session="$(cookie "$SESSION_COOKIE")"
[[ "$session" =~ ^[A-Za-z0-9_-]{43}$ ]] && [[ "$(cookie_line "$SESSION_COOKIE")" == "#HttpOnly_"* ]] \
	&& pass "session cookie ${SESSION_COOKIE} is an opaque HttpOnly id" || fail "session cookie: '$(cookie_line "$SESSION_COOKIE")'"
grep -i '^set-cookie:' "$WORK/headers" | grep -qi 'samesite=lax' && pass "session cookie is SameSite=Lax" || fail "session cookie SameSite"
[ -z "$(cookie "$LOGIN_COOKIE")" ] && pass "login cookie removed after the callback" || fail "login cookie left after the callback"
! has_jwt <(store_cookie_lines) "$WORK/headers" && pass "no token in the store's cookies or in its callback response headers" || fail "token found in the store's cookies or headers"

# 6. The account page shows the profile from GET /me of the backend.
result="$(request "$STORE_URL/konto")"
[ "$(status_of "$result")" = "200" ] && grep -qF "$AUTH_USER" "$WORK/body" \
	&& pass "/konto shows the account of ${AUTH_USER}" || die "/konto after login: ${result}"
! has_jwt "$WORK/body" && pass "no token in the HTML" || fail "token in the HTML of /konto"
cp "$WORK/body" "$WORK/account.html"

# 7. Logout is a Server Action: a form post with its action id (progressive enhancement).
action_field="$(grep -oE 'name="\$ACTION_ID_[0-9a-f]+"' "$WORK/account.html" | head -n1 | cut -d'"' -f2)"
[ -n "$action_field" ] && pass "logout form found" || die "no logout form on /konto"

for origin in null 'not a url'; do
	rejected="$(request -H "Origin: ${origin}" -F "${action_field}=" "$STORE_URL/konto")"
	[ "$(status_of "$rejected")" = "403" ] && pass "logout with Origin '${origin}' is rejected with 403" || fail "Origin '${origin}' logout: ${rejected}"
done
result="$(request -H 'Origin: https://evil.example' -F "${action_field}=" "$STORE_URL/konto")"
after="$(request "$STORE_URL/konto")"
[ "$(status_of "$result")" = "403" ] && [ "$(status_of "$after")" = "200" ] \
	&& pass "logout from a foreign Origin is rejected, the session stays" || fail "foreign Origin logout: ${result} / ${after}"

result="$(request -H "Origin: ${STORE_URL}" -F "${action_field}=" "$STORE_URL/konto")"
end_session="$(location_of "$result")"
[[ "$(status_of "$result")" =~ ^30[37]$ ]] && [[ "$end_session" == *"/realms/store/protocol/openid-connect/logout?"* ]] && [[ "$end_session" == *"id_token_hint="* ]] \
	&& pass "logout redirects to Keycloak end_session with id_token_hint" || fail "logout: ${result}"
[ -z "$(cookie "$SESSION_COOKIE")" ] && pass "session cookie removed by the logout" || fail "session cookie left after logout"

# 8. Keycloak ends its session and returns to the store.
if [ -n "$end_session" ]; then
	result="$(request "$end_session")"
	[[ "$(status_of "$result")" =~ ^30[23]$ ]] && [[ "$(location_of "$result")" == "$STORE_URL/"* ]] \
		&& pass "Keycloak end_session returns to the store" || fail "end_session: ${result}"
fi

# 9. The old session id is dead in the store (a copied cookie does not work).
result="$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' -H "Cookie: ${SESSION_COOKIE}=${session}" "$STORE_URL/konto")"
[[ "$(status_of "$result")" =~ ^30[37]$ ]] && [[ "$(location_of "$result")" == *"/logowanie?powrot=%2Fkonto" ]] \
	&& pass "the old session cookie no longer opens /konto" || fail "old session cookie after logout: ${result}"

echo
if [ "$failures" -eq 0 ]; then
	echo "check-auth-flow: all checks passed"
else
	echo "check-auth-flow: ${failures} check(s) failed"
	exit 1
fi
