# Monorepo commands. Convention:
# - aggregate targets without a prefix (bootstrap, up, check, check-prod...),
# - per-application targets prefixed with the app name (backend-*; later store-*, admin-*).
# None of the targets removes volumes or data.

DOCKER_COMP = docker compose
BACKEND     = $(DOCKER_COMP) exec backend
PHP         = $(BACKEND) php
COMPOSER    = $(BACKEND) composer
SYMFONY     = $(PHP) bin/console

.DEFAULT_GOAL = help
.PHONY: help bootstrap build up down logs install check build-prod check-prod \
	backend-sh backend-install backend-composer backend-console backend-migrate backend-db-test \
	backend-test backend-stan backend-arch backend-check backend-build-prod backend-check-prod

## —— Help ———————————————————————————————————————————————————————————————————
help: ## List available targets
	@grep -E '(^[a-zA-Z0-9_-]+:.*?##.*$$)|(^##)' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}{printf "\033[32m%-20s\033[0m %s\n", $$1, $$2}' | sed -e 's/\[32m##/[33m/'

## —— Monorepo ———————————————————————————————————————————————————————————————
bootstrap: build up install backend-migrate ## Set up the dev environment from a fresh clone

build: ## Build the dev images
	@$(DOCKER_COMP) build --pull

up: ## Start the dev containers in detached mode
	@$(DOCKER_COMP) up --detach --wait --remove-orphans

down: ## Stop and remove the dev containers (volumes are kept)
	@$(DOCKER_COMP) down --remove-orphans

logs: ## Follow the container logs
	@$(DOCKER_COMP) logs --tail=100 --follow

install: backend-install ## Install the dependencies of all applications (dev)

check: backend-check ## Run all quality gates (required before every commit)

build-prod: backend-build-prod ## Build all production images

check-prod: backend-check-prod ## Check all production images in an ephemeral project (ports 8080/8443)

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

backend-check-prod: backend-build-prod ## Run the backend prod image in an ephemeral project and check it
	@./infra/scripts/check-prod.sh
