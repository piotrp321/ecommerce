#!/usr/bin/env bash
# Creates the Keycloak role and database in the running PostgreSQL (service "database"),
# idempotently: in development on every `make up`, in production (and in
# check-prod-stack.sh) after the database starts and before Keycloak
# (DOCKER_COMP="docker compose -f compose.yaml -f compose.prod.yaml"):
# - role "keycloak" (LOGIN) and database "keycloak" owned by it, created only when missing,
# - the role password is set again on every run from KEYCLOAK_DB_PASSWORD, read by psql
#   from the database container environment (\getenv), never passed on a command line,
# - CONNECT (and TEMPORARY) is revoked from PUBLIC on the Keycloak database, the application
#   database (POSTGRES_DB) and the maintenance database postgres: only keycloak (the owner)
#   and the superuser connect to the Keycloak database, and the keycloak role connects to
#   no other of them. The superuser (the application user, pg_isready) is not affected.
#   The test database (POSTGRES_DB_test) keeps CONNECT for PUBLIC: the backend test suite
#   connects there with roles it creates itself. The keycloak role reads no table there
#   and cannot create objects (no grants; PUBLIC has no CREATE on public since PostgreSQL 15).
# It never drops or resets anything and does not use docker-entrypoint-initdb.d, so it
# also works on an existing database volume.
# DOCKER_COMP selects the Compose command (default "docker compose"), e.g. with -p or -f.
set -euo pipefail

cd "$(dirname "$0")/../.."

read -r -a compose <<<"${DOCKER_COMP:-docker compose}"

"${compose[@]}" exec -T database sh -ec '
	[ -n "${KEYCLOAK_DB_PASSWORD:-}" ] || { echo "keycloak-db: KEYCLOAK_DB_PASSWORD is not set in the database container" >&2; exit 1; }
	exec psql -X -q -v ON_ERROR_STOP=1 --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"
' <<'SQL'
\getenv kc_password KEYCLOAK_DB_PASSWORD
\getenv app_db POSTGRES_DB
SELECT 'CREATE ROLE keycloak LOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'keycloak') \gexec
ALTER ROLE keycloak WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'kc_password';
SELECT 'CREATE DATABASE keycloak OWNER keycloak' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'keycloak') \gexec
SELECT format('REVOKE CONNECT, TEMPORARY ON DATABASE %I FROM PUBLIC', datname) FROM pg_database
WHERE datname IN ('keycloak', 'postgres', :'app_db') ORDER BY datname \gexec
SQL

echo "keycloak-db: role and database \"keycloak\" ready"
