# Monorepo commands. Convention:
# - aggregate targets without a prefix (bootstrap, up, check, check-prod...),
# - per-application targets prefixed with the app name (backend-*, admin-*, store-*, edge-*),
# - the whole topology prefixed with stack- (stack-check-prod, stack-check-dev),
# - the identity provider (Keycloak) prefixed with keycloak-,
# - the API contract (docs/api/openapi.yaml) prefixed with contract-,
# - pnpm workspace targets prefixed with pnpm-.
# None of the targets removes volumes or data.

DOCKER_COMP = docker compose
BACKEND     = $(DOCKER_COMP) exec backend
PHP         = $(BACKEND) php
COMPOSER    = $(BACKEND) composer
SYMFONY     = $(PHP) bin/console
# One-off container with the workspace bind mount and the node_modules volumes;
# works whether or not the admin dev server is running.
PNPM        = $(DOCKER_COMP) run --rm --no-deps admin pnpm

.DEFAULT_GOAL = help
.PHONY: help bootstrap build up down logs install check build-prod check-prod \
	pnpm-install pnpm \
	backend-sh backend-install backend-composer backend-console backend-migrate backend-db-test \
	backend-test backend-stan backend-arch backend-check backend-build-prod \
	admin-lint admin-typecheck admin-test admin-build admin-check admin-build-prod admin-check-prod \
	store-lint store-typecheck store-test store-build store-check store-build-prod store-check-prod \
	edge-build-prod stack-check-prod stack-check-dev keycloak-dev-seed keycloak-build-prod contract-lint

## —— Help ———————————————————————————————————————————————————————————————————
help: ## List available targets
	@grep -E '(^[a-zA-Z0-9_-]+:.*?##.*$$)|(^##)' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}{printf "\033[32m%-20s\033[0m %s\n", $$1, $$2}' | sed -e 's/\[32m##/[33m/'

## —— Monorepo ———————————————————————————————————————————————————————————————
bootstrap: build pnpm-install up backend-install backend-migrate ## Set up the dev environment from a fresh clone

build: ## Build the dev images
	@$(DOCKER_COMP) build --pull

up: ## Start the dev containers (PostgreSQL, then the Keycloak database, then all services)
	@$(DOCKER_COMP) up --detach --wait database
	@DOCKER_COMP="$(DOCKER_COMP)" ./infra/scripts/keycloak-db.sh
	@$(DOCKER_COMP) up --detach --wait --remove-orphans

down: ## Stop and remove the dev containers (volumes are kept)
	@$(DOCKER_COMP) down --remove-orphans

logs: ## Follow the container logs
	@$(DOCKER_COMP) logs --tail=100 --follow

install: pnpm-install backend-install ## Install the dependencies of all applications (dev; backend needs `make up`)

check: contract-lint backend-check admin-check store-check ## Run all quality gates (required before every commit)

build-prod: backend-build-prod admin-build-prod store-build-prod edge-build-prod keycloak-build-prod ## Build all production images

check-prod: admin-check-prod store-check-prod stack-check-prod ## Check the prod images (admin 8081, store 8082) and the whole topology with the sign-in flow (edge 8080/8443)

## —— pnpm workspace (JavaScript apps) ———————————————————————————————————————
pnpm-install: ## Install the workspace dependencies into the container volumes (frozen lockfile)
	@$(PNPM) install --frozen-lockfile

pnpm: ## Run pnpm in the container, e.g. make pnpm c="--filter admin add zod"
	@$(PNPM) $(c)

## —— Backend (apps/backend, Symfony) ———————————————————————————————————————
backend-sh: ## Open a shell in the backend container
	@$(BACKEND) sh

backend-install: ## Install the backend dependencies, including dev ones (dev only)
	@$(COMPOSER) install --prefer-dist --no-progress --no-interaction

backend-composer: ## Run composer, e.g. make backend-composer c="require foo/bar"
	@$(COMPOSER) $(c)

backend-console: ## Run bin/console, e.g. make backend-console c=about
	@$(SYMFONY) $(c)

backend-migrate: ## Run the database migrations (never executed automatically)
	@$(SYMFONY) doctrine:migrations:migrate --no-interaction --allow-no-migration

backend-db-test: ## Prepare the test database (create if missing, run migrations); idempotent
	@$(SYMFONY) doctrine:database:create --if-not-exists --env=test
	@$(SYMFONY) doctrine:migrations:migrate --no-interaction --allow-no-migration --env=test

backend-test: backend-db-test ## Run PHPUnit (prepares the test database first)
	@$(PHP) bin/phpunit

backend-stan: ## Run PHPStan (level max)
	@$(SYMFONY) cache:warmup --env=dev --quiet
	@$(PHP) vendor/bin/phpstan analyse --memory-limit=1G --no-progress

backend-arch: ## Check the architecture rules (Deptrac, apps/backend/deptrac.yaml)
	@$(PHP) vendor/bin/deptrac analyse --no-progress
	@out="$$($(PHP) vendor/bin/deptrac debug:unassigned)"; echo "$$out"; \
		echo "$$out" | grep -q 'There are no unassigned tokens' \
		|| { echo "Classes above are outside App\\<Module>\\<Layer>\\ (see apps/backend/deptrac.yaml)."; exit 1; }

backend-check: ## Run the backend quality gates (validation, Deptrac, PHPStan, PHPUnit)
	@$(COMPOSER) validate --strict
	@$(SYMFONY) lint:container
	@$(SYMFONY) lint:yaml config --parse-tags
	@$(MAKE) --no-print-directory backend-arch
	@$(MAKE) --no-print-directory backend-stan
	@$(MAKE) --no-print-directory backend-test

backend-build-prod: ## Build the backend production image (dependencies installed during the build, no secrets)
	@docker build --pull --file infra/docker/backend/Dockerfile --target frankenphp_prod --tag $(IMAGES_PREFIX)ecommerce-backend .

## —— Admin (apps/admin, React + Vite) ——————————————————————————————————————
admin-lint: ## Run ESLint
	@$(PNPM) --filter admin lint

admin-typecheck: ## Run the TypeScript type check
	@$(PNPM) --filter admin typecheck

admin-test: ## Run Vitest
	@$(PNPM) --filter admin test

admin-build: ## Build the static files (Vite production build)
	@$(PNPM) --filter admin build

admin-check: admin-lint admin-typecheck admin-test admin-build ## Run all admin quality gates

admin-build-prod: ## Build the admin production image (static files served by unprivileged Caddy)
	@docker build --pull --file infra/docker/admin/Dockerfile --target admin_prod --tag $(IMAGES_PREFIX)ecommerce-admin .

admin-check-prod: admin-build-prod ## Run the admin prod image on 127.0.0.1:8081 and check it
	@./infra/scripts/check-prod-admin.sh

## —— Store (apps/store, Next.js) ———————————————————————————————————————————
# One-off container from the store image (its own node_modules and .next volumes).
STORE_PNPM  = $(DOCKER_COMP) run --rm --no-deps store pnpm

store-lint: ## Run ESLint
	@$(STORE_PNPM) --filter store lint

store-typecheck: ## Generate route types and run the TypeScript type check
	@$(STORE_PNPM) --filter store typecheck

store-test: ## Run Vitest
	@$(STORE_PNPM) --filter store test

store-build: ## Build the standalone Next.js server
	@$(STORE_PNPM) --filter store build

store-check: store-lint store-typecheck store-test store-build ## Run all store quality gates

store-build-prod: ## Build the store production image (standalone Next.js, unprivileged node user)
	@docker build --pull --file infra/docker/store/Dockerfile --target store_prod --tag $(IMAGES_PREFIX)ecommerce-store .

store-check-prod: store-build-prod ## Run the store prod image on 127.0.0.1:8082 and check it
	@./infra/scripts/check-prod-store.sh

## —— Keycloak (identity provider) ——————————————————————————————————————
keycloak-dev-seed: ## Create the dev-only test users (store customer, admin with TOTP); idempotent, needs `make up`
	@DOCKER_COMP="$(DOCKER_COMP)" ./infra/scripts/keycloak-dev-seed.sh

keycloak-build-prod: ## Build the Keycloak production image (optimized build, realms baked in, no secrets)
	@docker build --pull --file infra/docker/keycloak/Dockerfile --target keycloak_prod --tag $(IMAGES_PREFIX)ecommerce-keycloak .

## —— Edge, production topology and dev topology check ————————————————————————
edge-build-prod: ## Build the edge proxy image (Caddy, configuration baked in)
	@docker build --pull --file infra/edge/Dockerfile --target edge_prod --tag $(IMAGES_PREFIX)ecommerce-edge .

stack-check-prod: backend-build-prod admin-build-prod store-build-prod edge-build-prod keycloak-build-prod ## Run the whole prod topology in an ephemeral project (edge 8080/8443) and check it
	@./infra/scripts/check-prod-stack.sh

stack-check-dev: ## Run the dev topology in its own project (ecommerce-dev-check) and check Keycloak, Redis and exposure
	@./infra/scripts/check-dev-infra.sh

## —— API contract (docs/api/openapi.yaml) ————————————————————————————————————
contract-lint: ## Lint the OpenAPI contract (Redocly, recommended-strict, redocly.yaml)
	@$(DOCKER_COMP) run --rm --no-deps -e REDOCLY_TELEMETRY=off -e REDOCLY_SUPPRESS_UPDATE_NOTICE=true admin pnpm exec redocly lint main
