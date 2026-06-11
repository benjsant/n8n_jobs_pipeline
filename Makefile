# Makefile — points d'entrée du projet n8n_jobs_pipeline.
# `make help` pour la liste. Les commandes Docker supposent un .env rempli.
.DEFAULT_GOAL := help
SHELL := /usr/bin/env bash

.PHONY: help up down logs ps schema test check install-hooks cv-install cv-build cv-pdf jobspy-build

help: ## Affiche cette aide
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

## --- Stack ---
up: ## Démarre la stack (n8n + Postgres + JobSpy)
	docker compose up -d

down: ## Arrête la stack
	docker compose down

logs: ## Suit les logs n8n
	docker compose logs -f n8n

ps: ## État des conteneurs
	docker compose ps

schema: ## (Ré)applique le schéma SQL métier à la base
	docker compose exec -T postgres psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" < db/schema.sql

## --- Qualité ---
test: ## Lance les suites de tests hors stack
	bash scripts/run-tests.sh

check: ## Vérifie l'absence de données perso/secrets dans l'index git
	bash scripts/check-no-personal-data.sh

install-hooks: ## Active le hook pre-commit versionné (.githooks)
	git config core.hooksPath .githooks
	@echo "Hook pre-commit activé (core.hooksPath=.githooks)."

## --- CV ---
cv-install: ## Installe les deps Astro du CV
	cd cv && npm install --no-audit --no-fund

cv-build: ## Construit le HTML du CV (CV_PERSONALIZATION=chemin.json optionnel)
	cd cv && CV_PERSONALIZATION="$(CV_PERSONALIZATION)" npm run build

cv-pdf: ## Génère le PDF du CV (conteneurisé, Chromium inclus)
	cd cv && docker build -t cv-render . \
	  && docker run --rm -v "$$PWD/dist:/app/dist" cv-render

letter-pdf: ## Génère le PDF d'une lettre (LETTER=chemin.json, conteneurisé)
	cd cv && docker build -t cv-render . \
	  && docker run --rm \
	    -e LETTER_DATA=/data.json \
	    -v "$$PWD/$(or $(LETTER),letter-data.sample.json):/data.json:ro" \
	    -v "$$PWD/dist:/app/dist" \
	    cv-render npm run letter

## --- Services ---
jobspy-build: ## Build l'image du micro-service JobSpy
	docker compose build jobspy
