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

# Mini-interface SEULE (agent + render) : candidature depuis une URL, sans n8n.
# Démarre le minimum et affiche l'URL. Voir docs/interface.md.
ui:
    docker compose up -d agent-langgraph render
    @echo "Démarrage… (l'agent charge le contexte)"
    @for i in $(seq 1 20); do curl -sf http://localhost:8001/health >/dev/null 2>&1 && break || sleep 2; done
    @echo "✅ Interface prête : http://localhost:8001"

# Coupe uniquement les services de la mini-interface
ui-stop:
    docker compose stop agent-langgraph render

# Dashboards Metabase (opt-in, lourd). Crée la base metabase si besoin puis démarre.
metabase:
    docker compose exec -T postgres sh -c 'psql -tc "SELECT 1 FROM pg_database WHERE datname='"'"'metabase'"'"'" -U "$POSTGRES_USER" -d "$POSTGRES_DB" | grep -q 1 || psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE DATABASE metabase"'
    docker compose --profile metabase up -d metabase
    @echo "Metabase démarre (1-2 min au 1er lancement) : http://localhost:3000"

# Arrête Metabase
metabase-stop:
    docker compose --profile metabase stop metabase

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
# Régénère le jsCode des nœuds Code du 01 depuis offer-utils.mjs (source unique).
# À lancer après toute modif de offer-utils.mjs.
build-nodes:
    docker run --rm --user "$(id -u):$(id -g)" -v "$PWD":/app -w /app node:20-alpine node workflows/lib/build-nodes.mjs

# Suites de tests JS + garde-fou de parité nœuds n8n <-> offer-utils, en conteneur Node
test:
    docker run --rm -v "$PWD":/app -w /app node:20-alpine \
      sh -c 'node workflows/lib/build-nodes.mjs --check && for f in workflows/lib/*.test.mjs cv/*.test.mjs cv/scripts/*.test.mjs; do echo "── $f"; node "$f" || exit 1; done'

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
