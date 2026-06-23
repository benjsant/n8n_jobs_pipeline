# Justfile — points d'entrée du projet n8n_jobs_pipeline (remplace le Makefile).
# Lister les recettes : `just` ou `just --list`. Lancer : `just <recette>`.
#
# Stack FULL DOCKER : les tâches Node/Python tournent dans un conteneur jetable
# (aucun node/python requis sur l'hôte). Les commandes `docker compose`
# supposent un .env rempli — il est chargé automatiquement ci-dessous.

set dotenv-load := true          # charge .env (POSTGRES_USER, POSTGRES_DB, …)

# Liste les recettes (recette par défaut).
default:
    @just --list

# ─────────────────────────── Stack ───────────────────────────
# Démarre la stack (n8n + Postgres + JobSpy + render)
up:
    docker compose up -d

# Arrête la stack
down:
    docker compose down

# Suit les logs n8n
logs:
    docker compose logs -f n8n

# État des conteneurs
ps:
    docker compose ps

# (Ré)applique le schéma SQL métier à la base
schema:
    docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < db/schema.sql

# (Ré)applique les profils de recherche (Valenciennes/Lille)
seed:
    docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < db/seed-profiles.sql

# ────────────────────────── Qualité ──────────────────────────
# Suites de tests JS (logique offres, sources, scoring, rendu…) en conteneur Node
test:
    docker run --rm -v "$PWD":/app -w /app node:20-alpine \
      sh -c 'for f in workflows/lib/*.test.mjs cv/*.test.mjs cv/scripts/*.test.mjs; do echo "── $f"; node "$f" || exit 1; done'

# Test du schéma de sortie de l'agent DeepSeek (mock, sans clé) en conteneur Python
test-py:
    docker run --rm -v "$PWD":/app -w /app python:3.12-alpine \
      python scripts/test_deepseek.py --mock

# Test d'intégration de la couche candidature (Postgres jetable)
test-db:
    bash db/queries.test.sh

# Vérifie l'absence de données perso/secrets dans l'index git
check:
    bash scripts/check-no-personal-data.sh

# Active le hook pre-commit versionné (.githooks)
install-hooks:
    git config core.hooksPath .githooks
    @echo "Hook pre-commit activé (core.hooksPath=.githooks)."

# ──────────────────────────── CV ─────────────────────────────
# Installe les deps Astro du CV (dans cv/node_modules, via conteneur Node)
cv-install:
    docker run --rm -v "$PWD/cv":/app -w /app node:20-alpine \
      npm install --no-audit --no-fund

# Régénère cv/cv-index.json (valeurs sélectionnables par l'agent) depuis cv/*.json
cv-index:
    docker run --rm -v "$PWD":/app -w /app node:20-alpine \
      node cv/scripts/build-index.mjs

# Synchronise cv/*.json depuis le portfolio (src/data/cv.ts) puis régénère l'index
cv-sync:
    docker run --rm -v "$PWD":/app -w /app node:20-alpine \
      node cv/scripts/sync-from-portfolio.mjs

# Construit le HTML du CV (perso optionnelle : CV_PERSONALIZATION=chemin.json)
cv-build perso="":
    docker run --rm -v "$PWD/cv":/app -w /app -e CV_PERSONALIZATION="{{perso}}" \
      node:20-alpine npm run build

# Génère le PDF du CV (image cv-render, Chromium inclus)
cv-pdf:
    docker build --network=host -t cv-render cv
    docker run --rm -v "$PWD/cv/dist":/app/dist cv-render

# Génère le PDF d'une lettre (data : LETTER=chemin.json, défaut l'échantillon)
letter-pdf letter="letter-data.sample.json":
    docker build --network=host -t cv-render cv
    docker run --rm -e LETTER_DATA=/data.json \
      -v "$PWD/cv/{{letter}}":/data.json:ro -v "$PWD/cv/dist":/app/dist \
      cv-render npm run letter

# ────────────────────────── Services ─────────────────────────
# Build l'image du micro-service JobSpy
jobspy-build:
    docker compose build jobspy
