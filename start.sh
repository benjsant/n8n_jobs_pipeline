#!/usr/bin/env bash
#
# Launcher tout-en-un de n8n_jobs_pipeline.
#   ./start.sh              démarre la stack complète
#   ./start.sh --metabase   + les dashboards Metabase (lourd)
#   ./start.sh --ui         mode léger : mini-interface seule (agent + render)
#
# "Sans échec" : vérifie les prérequis, crée un .env si absent, ne s'arrête pas
# si un service tarde. Ctrl-C arrête proprement toute la stack.
set -uo pipefail
cd "$(dirname "$0")"

c_info='\033[1;36m'; c_ok='\033[1;32m'; c_err='\033[1;31m'; c_off='\033[0m'
info() { printf "${c_info}[job-hunter]${c_off} %s\n" "$1"; }
ok()   { printf "${c_ok}[job-hunter]${c_off} %s\n" "$1"; }
err()  { printf "${c_err}[job-hunter]${c_off} %s\n" "$1" >&2; }

# --- Options ---------------------------------------------------------------
WITH_MB=0; UI_ONLY=0
for a in "$@"; do
  case "$a" in
    --metabase) WITH_MB=1 ;;
    --ui) UI_ONLY=1 ;;
    -h|--help) grep '^#' "$0" | grep -v '^#!' | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) err "option inconnue : $a (voir --help)"; exit 2 ;;
  esac
done
PROFILE=(); [ "$WITH_MB" = 1 ] && PROFILE=(--profile metabase)

# --- Prérequis -------------------------------------------------------------
command -v docker >/dev/null 2>&1 || { err "Docker introuvable. Installe Docker."; exit 1; }
docker compose version >/dev/null 2>&1 || { err "Docker Compose v2 requis (docker compose)."; exit 1; }
docker info >/dev/null 2>&1 || { err "Le démon Docker ne répond pas. Démarre Docker et réessaie."; exit 1; }

# --- .env ------------------------------------------------------------------
if [ ! -f .env ]; then
  info ".env absent : je le crée depuis .env.example. Pense à le remplir (clés API)."
  cp .env.example .env
fi
# charge les ports depuis .env (avec défauts si absents)
set -a; . ./.env 2>/dev/null || true; set +a
N8N_PORT="${N8N_PORT:-8978}"; UI_PORT="${UI_PORT:-8901}"; METABASE_PORT="${METABASE_PORT:-8930}"

# --- Arrêt propre au Ctrl-C ------------------------------------------------
cleanup() {
  echo
  info "Arrêt de la stack…"
  if [ "$UI_ONLY" = 1 ]; then
    docker compose stop agent-langgraph render >/dev/null 2>&1
  else
    docker compose "${PROFILE[@]}" down >/dev/null 2>&1
  fi
  ok "Stack arrêtée. À bientôt."
  exit 0
}
trap cleanup INT TERM

# --- Démarrage -------------------------------------------------------------
if [ "$UI_ONLY" = 1 ]; then
  info "Mode léger : mini-interface seule (agent + render)…"
  docker compose up -d agent-langgraph render
else
  info "Démarrage de Postgres…"
  docker compose up -d postgres
  # attend que la base soit prête (pour créer la base Metabase au besoin)
  for _ in $(seq 1 30); do
    if docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-n8n}" >/dev/null 2>&1; then break; fi
    sleep 2
  done
  if [ "$WITH_MB" = 1 ]; then
    info "Vérification de la base applicative Metabase…"
    docker compose exec -T postgres sh -c \
      'psql -tc "SELECT 1 FROM pg_database WHERE datname='"'"'metabase'"'"'" -U "$POSTGRES_USER" -d "$POSTGRES_DB" | grep -q 1 \
       || psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE DATABASE metabase"' >/dev/null 2>&1 || true
  fi
  info "Démarrage des autres services…"
  docker compose "${PROFILE[@]}" up -d --remove-orphans
fi

# --- Attente de disponibilité (best-effort) --------------------------------
info "Attente de la mini-interface (jusqu'à ~60s)…"
for _ in $(seq 1 30); do
  if curl -sf "http://localhost:${UI_PORT}/health" >/dev/null 2>&1; then break; fi
  sleep 2
done

echo
ok "Services démarrés :"
[ "$UI_ONLY" = 1 ] || echo "   • n8n            : http://localhost:${N8N_PORT}"
echo "   • mini-interface : http://localhost:${UI_PORT}"
[ "$WITH_MB" = 1 ] && echo "   • Metabase       : http://localhost:${METABASE_PORT}  (1-2 min au 1er lancement)"
echo
info "Ctrl-C pour tout arrêter proprement. Logs en direct ci-dessous :"
echo "------------------------------------------------------------------------"

# Suit les logs en avant-plan ; le Ctrl-C est capté par le trap ci-dessus.
if [ "$UI_ONLY" = 1 ]; then
  docker compose logs -f agent-langgraph render
else
  docker compose "${PROFILE[@]}" logs -f
fi
# Si les logs se terminent seuls (ex. arrêt externe), on nettoie aussi.
cleanup
