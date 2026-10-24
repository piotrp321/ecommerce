#!/bin/sh
# Production entrypoint: refuses to start without runtime configuration.
# Secrets are never baked into the image; they must come from the environment.
# It does not install dependencies nor run database migrations.
set -eu

fail() {
	echo "Configuration error: $1" >&2
	exit 1
}

for var in APP_SECRET DATABASE_URL; do
	eval "value=\${$var:-}"
	[ -n "$value" ] || fail "$var must be set at runtime."
done

[ "${#APP_SECRET}" -ge 32 ] || fail "APP_SECRET must be at least 32 characters long."

case "$DATABASE_URL" in
	*'!ChangeMe!'*) fail "DATABASE_URL uses the development default password." ;;
esac

exec docker-php-entrypoint "$@"
