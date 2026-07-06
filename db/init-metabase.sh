#!/bin/sh
# Crée la base applicative de Metabase (séparée de la base métier n8n) au PREMIER
# init du volume Postgres. Idempotent. Metabase y stocke ses dashboards/questions ;
# la base métier reste la source de vérité, consultée par Metabase en source de
# données (configurée dans son UI au premier lancement).
set -e
DB="${METABASE_DB:-metabase}"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" -d "$POSTGRES_DB" -tc \
  "SELECT 1 FROM pg_database WHERE datname = '$DB'" | grep -q 1 \
  || psql --username "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE DATABASE $DB"
