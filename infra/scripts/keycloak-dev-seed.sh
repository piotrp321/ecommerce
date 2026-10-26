#!/usr/bin/env bash
# Development only: creates the test users in the running dev Keycloak, idempotently
# (Keycloak partial import with ifResourceExists=SKIP: an existing user is left as is).
# - realm "store": customer KEYCLOAK_DEV_CUSTOMER_EMAIL (e-mail verified),
# - realm "admin": KEYCLOAK_DEV_ADMIN_USERNAME with the client role admin-api/admin, a
#   password and a TOTP credential with a known secret, so automated tests can log in
#   through the browser flow that requires OTP (README: "Keycloak: użytkownicy testowi").
# Values come from the environment, with development defaults; they are passed to the
# container environment (never on a command line) and must not contain " or \.
# Refuses to run unless Keycloak serves a localhost hostname (the dev configuration).
# DOCKER_COMP selects the Compose command (default "docker compose"), e.g. with -p.
set -euo pipefail

cd "$(dirname "$0")/../.."

read -r -a compose <<<"${DOCKER_COMP:-docker compose}"

export KEYCLOAK_DEV_CUSTOMER_EMAIL="${KEYCLOAK_DEV_CUSTOMER_EMAIL:-customer@example.test}"
export KEYCLOAK_DEV_CUSTOMER_PASSWORD="${KEYCLOAK_DEV_CUSTOMER_PASSWORD:-dev-only-Customer-2026}"
export KEYCLOAK_DEV_ADMIN_USERNAME="${KEYCLOAK_DEV_ADMIN_USERNAME:-admin}"
export KEYCLOAK_DEV_ADMIN_EMAIL="${KEYCLOAK_DEV_ADMIN_EMAIL:-admin@example.test}"
export KEYCLOAK_DEV_ADMIN_PASSWORD="${KEYCLOAK_DEV_ADMIN_PASSWORD:-dev-only-Admin-password-2026}"
# Raw TOTP secret as Keycloak stores it; authenticator apps and oathtool use its Base32 form.
export KEYCLOAK_DEV_ADMIN_TOTP_SECRET="${KEYCLOAK_DEV_ADMIN_TOTP_SECRET:-dev-only-admin-totp-secret-000}"

vars=(KEYCLOAK_DEV_CUSTOMER_EMAIL KEYCLOAK_DEV_CUSTOMER_PASSWORD KEYCLOAK_DEV_ADMIN_USERNAME
	KEYCLOAK_DEV_ADMIN_EMAIL KEYCLOAK_DEV_ADMIN_PASSWORD KEYCLOAK_DEV_ADMIN_TOTP_SECRET)
env_args=()
for var in "${vars[@]}"; do
	case "${!var}" in
	*'"'* | *'\'* | '') echo "keycloak-dev-seed: ${var} must be non-empty, without \" or \\" >&2; exit 1 ;;
	esac
	env_args+=(-e "$var")
done

"${compose[@]}" exec -T "${env_args[@]}" keycloak bash -s <<'SEED'
set -euo pipefail
case "${KC_HOSTNAME:-}" in
http://localhost:*) ;;
*) echo "keycloak-dev-seed: refusing to seed a Keycloak that is not the dev one (KC_HOSTNAME=${KC_HOSTNAME:-unset})" >&2; exit 1 ;;
esac
config=$(mktemp)
trap 'rm -f "$config"' EXIT
kcadm() { /opt/keycloak/bin/kcadm.sh "$@" --config "$config"; }
kcadm config credentials --server http://localhost:8080 --realm master \
	--user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" 2>/dev/null

# partial_import <realm> <label> <json>: prints whether the user was added or skipped.
partial_import() {
	local result
	result=$(printf '%s' "$3" | kcadm create partialImport -r "$1" -f - -o | tr -d ' \n')
	case "$result" in
	*'"added":1'*) echo "keycloak-dev-seed: $2 created" ;;
	*'"skipped":1'*) echo "keycloak-dev-seed: $2 already exists (skipped)" ;;
	*) echo "keycloak-dev-seed: unexpected result for $2: $result" >&2; return 1 ;;
	esac
}

partial_import store "store user ${KEYCLOAK_DEV_CUSTOMER_EMAIL}" "{
  \"ifResourceExists\": \"SKIP\",
  \"users\": [{
    \"username\": \"${KEYCLOAK_DEV_CUSTOMER_EMAIL}\",
    \"email\": \"${KEYCLOAK_DEV_CUSTOMER_EMAIL}\",
    \"emailVerified\": true,
    \"enabled\": true,
    \"firstName\": \"Test\",
    \"lastName\": \"Customer\",
    \"requiredActions\": [],
    \"credentials\": [{\"type\": \"password\", \"value\": \"${KEYCLOAK_DEV_CUSTOMER_PASSWORD}\", \"temporary\": false}]
  }]
}"

partial_import admin "admin user ${KEYCLOAK_DEV_ADMIN_USERNAME} (role admin-api/admin, TOTP)" "{
  \"ifResourceExists\": \"SKIP\",
  \"users\": [{
    \"username\": \"${KEYCLOAK_DEV_ADMIN_USERNAME}\",
    \"email\": \"${KEYCLOAK_DEV_ADMIN_EMAIL}\",
    \"emailVerified\": true,
    \"enabled\": true,
    \"firstName\": \"Dev\",
    \"lastName\": \"Admin\",
    \"requiredActions\": [],
    \"clientRoles\": {\"admin-api\": [\"admin\"]},
    \"credentials\": [
      {\"type\": \"password\", \"value\": \"${KEYCLOAK_DEV_ADMIN_PASSWORD}\", \"temporary\": false},
      {
        \"type\": \"otp\",
        \"userLabel\": \"dev seed\",
        \"secretData\": \"{\\\"value\\\":\\\"${KEYCLOAK_DEV_ADMIN_TOTP_SECRET}\\\"}\",
        \"credentialData\": \"{\\\"subType\\\":\\\"totp\\\",\\\"digits\\\":6,\\\"counter\\\":0,\\\"period\\\":30,\\\"algorithm\\\":\\\"HmacSHA1\\\"}\"
      }
    ]
  }]
}"
SEED
