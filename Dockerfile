#syntax=docker/dockerfile:1

# Versions
FROM dunglas/frankenphp:1.13-php8.5-trixie AS frankenphp_upstream
FROM composer:2 AS composer_upstream

# Base image shared by the prod and dev stages.
# The container only runs the web server: it never installs dependencies
# nor runs database migrations on start (use `make install` / `make migrate`).
FROM frankenphp_upstream AS frankenphp_base

WORKDIR /app

# hadolint ignore=DL3008
RUN apt-get update && apt-get install -y --no-install-recommends \
	curl \
	&& rm -rf /var/lib/apt/lists/*

RUN set -eux; \
	install-php-extensions \
		apcu \
		intl \
		pdo_pgsql \
		zip \
	;

# https://getcomposer.org/doc/03-cli.md#composer-allow-superuser
ENV COMPOSER_ALLOW_SUPERUSER=1

COPY --link --from=composer_upstream /usr/bin/composer /usr/local/bin/composer
COPY --link docker/frankenphp/conf.d/10-app.ini $PHP_INI_DIR/app.conf.d/
COPY --link docker/frankenphp/Caddyfile /etc/frankenphp/Caddyfile

ENV PHP_INI_SCAN_DIR=":$PHP_INI_DIR/app.conf.d"

HEALTHCHECK --start-period=60s CMD curl -f http://localhost:2019/metrics || exit 1

CMD ["frankenphp", "run", "--config", "/etc/frankenphp/Caddyfile"]

# Dev image (development-only simplification):
# the code and vendor/ come from a bind mount of the host checkout,
# and dependencies (including dev ones) are installed explicitly with `make install`.
FROM frankenphp_base AS frankenphp_dev

ENV APP_ENV=dev

RUN mv "$PHP_INI_DIR/php.ini-development" "$PHP_INI_DIR/php.ini"

COPY --link docker/frankenphp/conf.d/20-app.dev.ini $PHP_INI_DIR/app.conf.d/

# Prod image: production dependencies are installed while building the image.
FROM frankenphp_base AS frankenphp_prod

ENV APP_ENV=prod

# Non-secret defaults, override at runtime when needed.
# DATABASE_PASSWORD (and APP_SECRET) must be provided at runtime.
ENV DEFAULT_URI=http://localhost \
	DATABASE_HOST=database \
	DATABASE_PORT=5432 \
	DATABASE_NAME=app \
	DATABASE_USER=app \
	DATABASE_SERVER_VERSION=18

RUN mv "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini"

COPY --link docker/frankenphp/conf.d/20-app.prod.ini $PHP_INI_DIR/app.conf.d/
COPY --link --chmod=755 docker/frankenphp/docker-entrypoint.prod.sh /usr/local/bin/docker-entrypoint

# Validates the runtime configuration (APP_SECRET, DATABASE_PASSWORD) before starting.
ENTRYPOINT ["docker-entrypoint"]
# Setting ENTRYPOINT resets the inherited CMD, so it has to be declared again.
CMD ["frankenphp", "run", "--config", "/etc/frankenphp/Caddyfile"]

# Prevent the reinstallation of vendors at every change in the source code
COPY --link composer.* symfony.* ./
RUN set -eux; \
	composer install --no-cache --prefer-dist --no-dev --no-autoloader --no-scripts --no-progress

# Copy sources
COPY --link . ./

RUN set -eux; \
	mkdir -p var/cache var/log; \
	composer dump-autoload --classmap-authoritative --no-dev; \
	# Only APP_ENV is compiled: .env defaults and secrets are not part of the image.
	composer dump-env prod --empty; \
	# Cache warmup resolves DATABASE_PASSWORD but never connects: a placeholder scoped
	# to this command is enough and is not stored in the image environment.
	DATABASE_PASSWORD=build-time-placeholder composer run-script --no-dev post-install-cmd; \
	chmod +x bin/console; \
	sync;

# Run as an unprivileged user. Only var/ and Caddy's data/config directories are
# writable; the application code stays owned by root. The capability lets the
# server bind ports 80/443 without root.
RUN set -eux; \
	groupadd --system --gid 1000 app; \
	useradd --system --uid 1000 --gid app --no-create-home --shell /usr/sbin/nologin app; \
	setcap CAP_NET_BIND_SERVICE=+eip /usr/local/bin/frankenphp; \
	chown -R app:app /app/var /data/caddy /config/caddy

USER app
