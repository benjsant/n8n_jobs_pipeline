#!/usr/bin/env bash
# Lance les suites de tests vérifiables hors stack (sans clé ni n8n).
#   - logique offres (node)         : workflows/lib/offer-utils.test.mjs
#   - agent DeepSeek, schéma (python): scripts/test_deepseek.py --mock
#   - micro-service JobSpy (pytest) : services/jobspy/test_app.py  [si deps dispo]
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
fail=0

run() {
  echo "── $1"
  shift
  if "$@"; then echo "  ✓ OK"; else echo "  ✗ ÉCHEC"; fail=1; fi
  echo
}

run "Logique offres (dédup + scoring)" node workflows/lib/offer-utils.test.mjs
run "Normaliseurs de sources" node workflows/lib/sources.test.mjs
run "Scoring hybride (LLM)" node workflows/lib/llm-scoring.test.mjs
run "Enrichissement entreprise" node workflows/lib/company-enrichment.test.mjs
run "Payloads de rendu (CV/lettre)" node workflows/lib/render-payloads.test.mjs
run "Rendu lettre (HTML)" node cv/letter.test.mjs
run "Agent DeepSeek — schéma (mock)" python3 scripts/test_deepseek.py --mock

echo "── Couche candidature (intégration DB, conteneur jetable)"
if command -v docker >/dev/null 2>&1; then
  if bash db/queries.test.sh >/dev/null 2>&1; then echo "  ✓ OK"; else echo "  ✗ ÉCHEC"; fail=1; fi
else
  echo "  ⊘ ignoré (docker absent)"
fi
echo

echo "── Micro-service JobSpy"
if python3 -c "import fastapi, httpx" 2>/dev/null; then
  if (cd services/jobspy && python3 test_app.py); then echo "  ✓ OK"; else echo "  ✗ ÉCHEC"; fail=1; fi
else
  echo "  ⊘ ignoré (fastapi/httpx absents — testé en conteneur via le Dockerfile)"
fi
echo

if [ "$fail" -eq 0 ]; then echo "✅ Tous les tests disponibles passent."; else echo "❌ Au moins une suite a échoué."; fi
exit "$fail"
