#!/usr/bin/env bash
# Creates the Keycloak role and database in the running dev PostgreSQL (service
# "database"), idempotently, on every `make up`:
# - role "keycloak" (LOGIN) and database "keycloak" owned by it, created only when missing,
# - the role password is set again on every run from KEYCLOAK_DB_PASSWORD, read by psql
#   from the database container environment (\getenv), never passed on a command line,
# - CONNECT is revoked from PUBLIC on the Keycloak and the application database, so the
#   keycloak role cannot connect to the application data, and only keycloak (the owner)
#   and the superuser connect to its own database.
# It never drops or resets anything and does not use docker-entrypoint-initdb.d, so it
# also works on an existing database volume.
# DOCKER_COMP selects the Compose command (default "docker compose"), e.g. with -p.
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
REVOKE CONNECT, TEMPORARY ON DATABASE keycloak FROM PUBLIC;
REVOKE CONNECT, TEMPORARY ON DATABASE :"app_db" FROM PUBLIC;
SQL

echo "keycloak-db: role and database \"keycloak\" ready"
