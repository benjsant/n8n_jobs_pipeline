# workflows/ — exports n8n

Exports JSON des workflows. **Tous sont des brouillons à vérifier à l'import**
dans une instance n8n lancée (versions de nœuds, credentials à associer). La
logique métier sous-jacente (normalisation, dédup, scoring, requêtes SQL) est,
elle, testée hors stack — voir `lib/` et `scripts/run-tests.sh`.

## Chaîne (pipeline V1)

```
01 Recherche d'offres (cron 8h)
   7 sources (FT, Adzuna, JobSpy, Google Jobs/SerpApi, WTTJ, JSearch/RapidAPI,
   La Bonne Alternance) → merge → score déterministe → hash exact (SHA256)
   → dédup SÉMANTIQUE (service embeddings : écarte les quasi-doublons inter-
     sources d'un même lot, cosinus ≥ 0.80, même entreprise ; tolérant si le
     service est indisponible)
   La Bonne Alternance fan-out : offres → merge ; entreprises sans offre →
   upsert companies → Discord « candidature spontanée » (branche terminale)
   → INSERT offers (status new, dédup) → scoring hybride : DeepSeek affine le
     top-N (score + score_reason) → Discord jobs-alerts (+ liens) + jobs-log

        │ l'utilisateur clique « ✅ Générer » dans Discord
        ▼
03 Statut offre (webhook offer-status?hash=&action=selected|ignored)
   UPDATE offers.status → si selected : charge l'offre → lance 02

        ▼
02 Agent candidature (Execute Workflow, ou formulaire pour test manuel)
   system prompt + offre → DeepSeek → parse
   → enrichissement entreprise (grounded) → upsert companies (sector/ai_summary)
   → INSERT applications (draft)
   → Préparer rendu (lib/render-payloads.mjs) → POST render /cv + /letter
        (service render : CV Astro→PDF + lettre→PDF, écrits dans ./output)
   → INSERT generated_documents (cv_path, letter_path) → offers.status = applied
   → lance 04 avec les chemins PDF

        ▼
04 Finalisation (Execute Workflow)
   lit CV+lettre depuis ./output → fusionne les 2 binaires sur 1 item
   → Google Drive (dossier <entreprise> : cv.pdf + lettre.pdf)
   → Gmail BROUILLON (2 pièces jointes, jamais d'envoi auto) → relecture humaine

        │ plus tard, si l'entreprise te convoque en entretien
        ▼
06 Préparation entretien (webhook interview-prep?hash=<hash>)
   charge l'offre → POST agent /interview/prep (grounding officiel + web)
   → dossier (entreprise, atouts, à anticiper, questions probables + réponses,
     questions à poser) → Discord (embed). Le hash est celui de l'alerte d'origine
     (présent dans le lien « ✅ Générer »).
```

## Workflows

| Fichier | Rôle | Déclencheur |
|---|---|---|
| `01-recherche-offres.json` | collecte multi-sources → Postgres → Discord | Schedule (cron) |
| `02-agent-candidature.json` | agent DeepSeek → `applications` (draft) → rendu PDF → lance 04 | Execute Workflow / Formulaire |
| `03-statut-offre.json` | actions Discord → statut + lance 02 | Webhook |
| `04-candidature-finalisation.json` | Drive + brouillon Gmail | Execute Workflow |
| `05-candidature-spontanee.json` | entreprise LBA (sans offre) → `02` mode spontané | Webhook |
| `06-prepa-entretien.json` | offre → agent `/interview/prep` → dossier Discord | Webhook (`interview-prep?hash=`) |

> **Candidature spontanée** : l'alerte Discord « candidature spontanée » du `01`
> (entreprises LBA à contacter) porte un lien `…/webhook/spontaneous-apply?company=<nom>`.
> Le `05` charge l'entreprise → lance le `02` en **mode spontané** (`spontaneous=true`,
> `offer_id` NULL) : le `02` force le template `candidature-spontanee`, écrit une
> `applications` avec `kind=spontaneous`, génère CV+lettre et lance le `04`.

> Le **rendu** (CV Astro + lettre → PDF) est un micro-service HTTP (`cv/server.mjs`,
> conteneur `render`, `RENDER_API_URL`). Le `02` l'appelle ; les PDF sortent dans
> `./output` (volume partagé), lus par le `04`.

## Import

Chaque workflow porte un **`id` racine stable** (`wf01rechercheoff`, …) et les
appels croisés (`03 → 02`, `02 → 04`) pointent déjà sur ces ids — **aucun
rebranchement manuel** des `executeWorkflow`. Import vérifié sur **n8n 2.26.7** :

```bash
# les 4 sont montés dans le conteneur sous /workflows
for f in 01-recherche-offres 02-agent-candidature 03-statut-offre 04-candidature-finalisation; do
  docker exec job-hunter-n8n n8n import:workflow --input=/workflows/$f.json
done
```

Restent à faire **dans l'UI n8n** après import :
1. Associer la **credential Postgres** (« Postgres job-hunter ») à chaque nœud
   Postgres (ils portent `id: REMPLACER`).
2. Associer les **credentials Google** (Drive + Gmail OAuth2) dans le `04`.
3. Renseigner `.env` (clés sources + `DISCORD_WEBHOOK_ALERTS/LOG`, `RENDER_API_URL`,
   `DEEPSEEK_API_KEY`) puis tester `01` en exécution manuelle. Le service `render`
   doit tourner (`docker compose up -d render`) pour que le `02` génère les PDF.
4. Activer les workflows voulus (ils sont importés **inactifs**).

## lib/ (logique testée, source des nœuds Code)

- `offer-utils.mjs` : `computeHash` (dédup SHA256) + `scoreOffer` (0-100, déterministe).
- `sources.mjs` : normaliseurs FT / Adzuna / JobSpy / WTTJ → schéma commun.
- `llm-scoring.mjs` : scoring **hybride** — pré-filtre déterministe + affinage
  DeepSeek du top-N (`selectTopN`, `buildScoringMessages`, `parseScoringResponse`).
- `company-enrichment.mjs` : fiche entreprise **grounded** (résumé à partir du
  seul texte de l'offre, sans invention) → `companies.sector` / `ai_summary`.
- Tests : `node workflows/lib/*.test.mjs` (ou `just test`).

> Les nœuds Code des workflows recopient cette logique (n8n n'importe pas de
> fichier externe). Garder en parité — un test vérifie l'équivalence du scoring.
