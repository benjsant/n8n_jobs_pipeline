# workflows/ — exports n8n

Exports JSON des workflows. **Tous sont des brouillons à vérifier à l'import**
dans une instance n8n lancée (versions de nœuds, credentials à associer). La
logique métier sous-jacente (normalisation, dédup, scoring, requêtes SQL) est,
elle, testée hors stack — voir `lib/` et `scripts/run-tests.sh`.

## Chaîne (pipeline V1)

```
01 Recherche d'offres (cron 8h)
   4 sources (FT, Adzuna, JobSpy, WTTJ) → merge → score → hash
   → INSERT offers (status new, dédup) → Discord jobs-alerts (+ liens) + jobs-log

        │ l'utilisateur clique « ✅ Générer » dans Discord
        ▼
03 Statut offre (webhook offer-status?hash=&action=selected|ignored)
   UPDATE offers.status → si selected : charge l'offre → lance 02

        ▼
02 Agent candidature (Execute Workflow, ou formulaire pour test manuel)
   system prompt + offre → DeepSeek → parse
   → upsert companies → INSERT applications (draft) → offers.status = applied

        ▼  (rendu des documents : étape conteneurisée hors n8n)
   cv-render : CV (Astro→PDF) + lettre (letter.mjs→PDF) → chemins

        ▼
04 Finalisation (Execute Workflow)
   lit CV+lettre → Google Drive (Candidatures/<entreprise>/)
   → Gmail BROUILLON (jamais d'envoi auto) → relecture humaine
```

## Workflows

| Fichier | Rôle | Déclencheur |
|---|---|---|
| `01-recherche-offres.json` | collecte multi-sources → Postgres → Discord | Schedule (cron) |
| `02-agent-candidature.json` | agent DeepSeek → `applications` (draft) | Execute Workflow / Formulaire |
| `03-statut-offre.json` | actions Discord → statut + lance 02 | Webhook |
| `04-candidature-finalisation.json` | Drive + brouillon Gmail | Execute Workflow |

## Ordre d'import conseillé

1. Créer la **credential Postgres** (« Postgres job-hunter ») et les
   **credentials Google** (Drive + Gmail OAuth2) dans n8n.
2. Importer `02`, puis `04` (ils sont appelés par les autres).
3. Importer `03`, et relier le nœud « Lancer agent (02) » à l'id réel de `02`.
4. Importer `01`.
5. Dans chaque nœud Postgres, remplacer la credential `REMPLACER` par la vraie.
6. Renseigner `.env` (clés sources + `DISCORD_WEBHOOK_ALERTS/LOG`) puis tester
   `01` en exécution manuelle.

## lib/ (logique testée, source des nœuds Code)

- `offer-utils.mjs` : `computeHash` (dédup SHA256) + `scoreOffer` (0-100).
- `sources.mjs` : normaliseurs FT / Adzuna / JobSpy / WTTJ → schéma commun.
- Tests : `node workflows/lib/*.test.mjs` (ou `make test`).

> Les nœuds Code des workflows recopient cette logique (n8n n'importe pas de
> fichier externe). Garder en parité — un test vérifie l'équivalence du scoring.
