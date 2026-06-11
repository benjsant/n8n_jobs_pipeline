#!/usr/bin/env bash
# Garde-fou anti-fuite de données personnelles (dépôt public).
#
# Refuse un commit qui :
#   1. inclut .env (secrets) ;
#   2. inclut un fichier de profil (cv/*.json hors *.example/*.sample, ou la
#      section profil du system prompt) qui ne porte PLUS le marqueur DUMMY
#      — signe probable de vraies données personnelles.
#
# Idée : tes vraies infos ne doivent jamais partir sur le dépôt public. Tant que
# les fichiers contiennent le marqueur DUMMY, c'est qu'ils sont fictifs : OK.
# Une fois remplis pour de vrai, garde-les hors-git (ou commit conscient avec
# `git commit --no-verify`).
#
# Utilisable seul (vérifie l'index) ou comme hook pre-commit.
set -euo pipefail

DUMMY_RE='(_dummy|DONNÉES FICTIVES|\(dummy\)|\(fictif\))'
errors=0

staged() { git diff --cached --name-only --diff-filter=ACM; }

# Contenu mis en cache (ce qui sera réellement committé), pas le fichier disque.
staged_blob() { git show ":$1" 2>/dev/null || true; }

while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in
    .env|*/.env)
      echo "✗ $f : un .env ne doit jamais être committé."
      errors=$((errors + 1))
      ;;
    cv/profile.json|cv/skills.json|cv/projects.json|cv/experiences.json|cv/education.json)
      # Fichiers de profil candidat uniquement (pas package.json, configs, samples).
      if ! staged_blob "$f" | grep -qE "$DUMMY_RE"; then
        echo "✗ $f : plus de marqueur DUMMY → données personnelles probables."
        errors=$((errors + 1))
      fi
      ;;
    prompts/agent-system-prompt.md)
      if ! staged_blob "$f" | grep -qE "$DUMMY_RE"; then
        echo "✗ $f : la section profil ne porte plus de marqueur DUMMY."
        errors=$((errors + 1))
      fi
      ;;
  esac
done < <(staged)

if [ "$errors" -gt 0 ]; then
  echo
  echo "⛔ Commit bloqué ($errors problème(s))."
  echo "   Dépôt public : garde tes vraies infos hors-git, ou si c'est"
  echo "   volontaire, contourne avec : git commit --no-verify"
  exit 1
fi

echo "✓ Aucune donnée personnelle/secret détecté dans l'index."
