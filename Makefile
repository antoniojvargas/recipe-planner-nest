# Atajos para el día a día. `make` sin argumentos muestra la ayuda.
COMPOSE ?= docker compose
COMPOSE_TEST = $(COMPOSE) -f docker-compose.test.yml

.DEFAULT_GOAL := help
.PHONY: help up down logs seed migrate test test-frontend test-e2e test-integration lint format

help: ## Muestra esta ayuda
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

up: ## Levanta la pila de desarrollo (necesita .env) y espera a que esté lista
	@test -f .env || { echo "Falta .env: ejecuta 'cp .env.example .env' y ajusta los secretos"; exit 1; }
	$(COMPOSE) up --build --detach --wait

down: ## Para la pila y elimina los contenedores (conserva los volúmenes de datos)
	$(COMPOSE) down --remove-orphans

logs: ## Sigue los logs de todos los servicios
	$(COMPOSE) logs --follow --tail=100

seed: ## Carga datos de ejemplo en la pila en marcha (dos usuarios, un hogar, recetas)
	$(COMPOSE) exec backend npm run seed -w backend

migrate: ## Rellena la zona horaria de los hogares creados antes de existir el campo
	$(COMPOSE) exec backend npm run migrate -w backend

test: ## Tests unitarios de la API
	npm run test -w backend

test-frontend: ## Tests unitarios del frontend
	npm run test -w frontend --if-present

test-e2e: ## Tests end-to-end (API y Playwright cuando exista)
	npm run test:e2e -w backend --if-present
	npm run test -w e2e --if-present

test-integration: ## Tests de integración con Testcontainers (necesita Docker)
	npm run test:integration -w backend

lint: ## ESLint y Prettier en todos los workspaces
	npm run lint
	npm run format:check

format: ## Formatea el repositorio con Prettier
	npm run format
