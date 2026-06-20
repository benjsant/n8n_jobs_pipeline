#!/usr/bin/env bash
# Garde-fou anti-fuite (dépôt public).
#
# Refuse un commit qui :
#   1. inclut un .env (secrets) ;
#   2. inclut, dans un fichier de profil candidat (cv/*.json ou la section profil
#      du system prompt), un motif RÉELLEMENT sensible : téléphone, IBAN, numéro
#      de sécurité sociale (NIR), adresse postale.
#
# Choix assumé : le profil candidat réel (nom, email recruteur, liens publics,
# projets) EST committé volontairement — ces infos sont déjà publiques via le
# portfolio. Le garde-fou ne bloque donc plus sur « données réelles », mais sur
# les données qu'on ne veut jamais voir partir : coordonnées privées & secrets.
#
# Utilisable seul (vérifie l'index) ou comme hook pre-commit.
set -euo pipefail

# Fichiers de profil surveillés pour les motifs sensibles.
PROFILE_RE='^(cv/(profile|skills|projects|experiences|education|certifications|languages)\.json|prompts/agent-system-prompt\.md)$'

# Motifs dangereux (téléphone FR/intl, IBAN FR, NIR, adresse postale).
TEL_RE='(\+33|0[1-9])([ .-]?[0-9]){8,9}'
IBAN_RE='FR[0-9]{2}[0-9A-Z ]{20,}'
NIR_RE='\b[12][0-9]{2}(0[1-9]|1[0-2])[0-9]{6,}\b'
ADDR_RE='[0-9]{1,3}( bis| ter)?,? (rue|avenue|av\.|bd|boulevard|impasse|allée|chemin|place) '

errors=0
staged() { git diff --cached --name-only --diff-filter=ACM; }
staged_blob() { git show ":$1" 2>/dev/null || true; }

while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in
    .env|*/.env)
      echo "✗ $f : un .env ne doit jamais être committé."
      errors=$((errors + 1))
      continue
      ;;
  esac
  if [[ "$f" =~ $PROFILE_RE ]]; then
    blob="$(staged_blob "$f")"
    # Le faux numéro de démonstration (que des 0) ne compte pas.
    hit="$(printf '%s' "$blob" | grep -hoE "$TEL_RE" | grep -vE '^\+?[0 .+-]+$' || true)"
    [ -n "$hit" ] && { echo "✗ $f : téléphone détecté → $hit"; errors=$((errors + 1)); }
    printf '%s' "$blob" | grep -qE "$IBAN_RE" && { echo "✗ $f : IBAN détecté."; errors=$((errors + 1)); }
    printf '%s' "$blob" | grep -qE "$NIR_RE" && { echo "✗ $f : numéro type NIR détecté."; errors=$((errors + 1)); }
    printf '%s' "$blob" | grep -qiE "$ADDR_RE" && { echo "✗ $f : adresse postale détectée."; errors=$((errors + 1)); }
  fi
done < <(staged)

if [ "$errors" -gt 0 ]; then
  echo
  echo "⛔ Commit bloqué ($errors problème(s))."
  echo "   Dépôt public : retire ces coordonnées privées, ou si c'est"
  echo "   volontaire, contourne avec : git commit --no-verify"
  exit 1
fi

echo "✓ Aucune coordonnée privée / secret détecté dans l'index."
