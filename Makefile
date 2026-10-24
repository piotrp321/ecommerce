# Development commands. None of the targets removes volumes or data.

DOCKER_COMP = docker compose
PHP_CONT    = $(DOCKER_COMP) exec php
PHP         = $(PHP_CONT) php
COMPOSER    = $(PHP_CONT) composer
SYMFONY     = $(PHP) bin/console

.DEFAULT_GOAL = help
.PHONY: help build build-prod up down logs sh install composer console migrate db-test test stan check

## —— Help ———————————————————————————————————————————————————————————————————
help: ## List available targets
	@grep -E '(^[a-zA-Z0-9_-]+:.*?##.*$$)|(^##)' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}{printf "\033[32m%-12s\033[0m %s\n", $$1, $$2}' | sed -e 's/\[32m##/[33m/'

## —— Docker —————————————————————————————————————————————————————————————————
build: ## Build the dev images
	@$(DOCKER_COMP) build --pull

build-prod: ## Build the production image (dependencies installed during the build)
	@$(DOCKER_COMP) -f compose.yaml build --pull

up: ## Start the containers in detached mode
	@$(DOCKER_COMP) up --detach --wait

down: ## Stop and remove the containers (volumes are kept)
	@$(DOCKER_COMP) down --remove-orphans

logs: ## Follow the container logs
	@$(DOCKER_COMP) logs --tail=100 --follow

sh: ## Open a shell in the php container
	@$(PHP_CONT) sh

## —— Composer / Symfony ————————————————————————————————————————————————————
install: ## Install dependencies, including dev ones (dev only)
	@$(COMPOSER) install --prefer-dist --no-progress --no-interaction

composer: ## Run composer, pass the arguments with c="...", e.g. make composer c="require foo/bar"
	@$(COMPOSER) $(c)

console: ## Run bin/console, pass the arguments with c="...", e.g. make console c=about
	@$(SYMFONY) $(c)

## —— Database ——————————————————————————————————————————————————————————————
migrate: ## Run the database migrations (never executed automatically)
	@$(SYMFONY) doctrine:migrations:migrate --no-interaction --allow-no-migration

db-test: ## Create the test database if it does not exist
	@$(SYMFONY) doctrine:database:create --if-not-exists --env=test

## —— Quality ———————————————————————————————————————————————————————————————
test: ## Run the PHPUnit test suites
	@$(PHP_CONT) env APP_ENV=test php bin/phpunit

stan: ## Run PHPStan
	@$(SYMFONY) cache:warmup --env=dev --quiet
	@$(PHP) vendor/bin/phpstan analyse --memory-limit=1G --no-progress

check: ## Run all quality gates (required before every commit)
	@$(COMPOSER) validate --strict
	@$(SYMFONY) lint:container
	@$(SYMFONY) lint:yaml config --parse-tags
	@$(MAKE) --no-print-directory stan
	@$(MAKE) --no-print-directory test
