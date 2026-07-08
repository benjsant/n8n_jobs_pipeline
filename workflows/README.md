# workflows/ — exports n8n

Exports JSON des workflows. **Tous sont des brouillons à vérifier à l'import**
dans une instance n8n lancée (versions de nœuds, credentials à associer). La
logique métier sous-jacente (normalisation, dédup, scoring, requêtes SQL) est,
elle, testée hors stack — voir `lib/` et `scripts/run-tests.sh`.

## Chaîne (pipeline V1)

```
01 Recherche d'offres (cron 8h)
   3 sources câblées : France Travail (API officielle, INSEE+rayon), JobSpy
   (LinkedIn/Indeed/Glassdoor) et La Bonne Alternance. Les normaliseurs
   Adzuna/SerpApi/JSearch/WTTJ restent dans lib/sources.mjs (réactivables).
   → merge → filtre exclusions + GÉO (écarte l'étranger non frontalier :
     Belgique hors Mouscron/Tournai/Mons… que JobSpy fait déborder)
   → score déterministe → hash exact (SHA256)
   → dédup SÉMANTIQUE intra-lot (service embeddings : quasi-doublons inter-
     sources, cosinus ≥ 0.80, même entreprise ; tolérant si le service est
     indisponible)
   La Bonne Alternance fan-out : offres → merge ; entreprises sans offre →
   upsert companies → Discord « candidature spontanée » (branche terminale)
   → INSERT offers (status new) : dédup hash (ON CONFLICT) + dédup sémantique
     INTER-RUNS (anti-join pgvector : écarte un quasi-doublon déjà en base si
     même entreprise canonique) ; embedding + company_canon persistés
   → scoring hybride : DeepSeek affine le top-N (score + score_reason)
   → Discord jobs-alerts (+ liens d'action, signés par WEBHOOK_SECRET si défini)
     + jobs-log

        │ l'utilisateur clique « ✅ Générer » dans Discord
        ▼
03 Statut offre (webhook offer-status?hash=&action=selected|ignored&token=…)
   vérifie WEBHOOK_SECRET (si défini) → UPDATE offers.status
   → si selected : charge l'offre → lance 02

        ▼
02 Agent candidature (Execute Workflow, ou formulaire pour test manuel)
   POST AGENT_API_URL/agent/run (service LangGraph : analyze → research →
   accroche → judge → validate, sortie §6) → parse
   → enrichissement entreprise (grounded, DeepSeek direct) → upsert companies
   → INSERT applications (draft)
   → Préparer rendu (lib/render-payloads.mjs) → POST render /cv + /letter
        (service render : CV Astro→PDF + lettre→PDF, écrits dans ./output)
   → INSERT generated_documents (cv_path, letter_path) → offers.status = applied
   → lance 04 avec les chemins PDF

        ▼
04 Finalisation (Execute Workflow) — livraison Discord
   lit CV+lettre depuis ./output → fusionne les 2 binaires sur 1 item
   → Discord jobs-alerts (2 pièces jointes PDF, relecture + envoi HUMAINS).
   La variante Google Drive + brouillon Gmail est dans l'historique git.

        │ plus tard, si l'entreprise te convoque en entretien
        ▼
06 Préparation entretien (webhook interview-prep?hash=<hash>&token=…)
   charge l'offre → POST agent /interview/prep (grounding officiel + web)
   → dossier (entreprise, atouts, à anticiper, questions probables + réponses,
     questions à poser) → Discord (embed). Le hash est celui de l'alerte d'origine
     (présent dans le lien « ✅ Générer »).

07 Digest hebdomadaire (cron dimanche 18h)
   stats de la semaine (offres collectées/triées/postulées) + totaux
   candidatures + top 5 « à relancer » → Discord jobs-alerts. Lecture seule.
```

## Workflows

| Fichier | Rôle | Déclencheur |
|---|---|---|
| `01-recherche-offres.json` | collecte multi-sources → Postgres → Discord | Schedule (cron 8h) |
| `02-agent-candidature.json` | agent LangGraph → `applications` (draft) → rendu PDF → lance 04 | Execute Workflow / Formulaire |
| `03-statut-offre.json` | actions Discord → statut + lance 02 | Webhook (`offer-status`) |
| `04-candidature-finalisation.json` | livraison Discord (CV + lettre en pièces jointes) | Execute Workflow |
| `05-candidature-spontanee.json` | entreprise LBA (sans offre) → `02` mode spontané | Webhook (`spontaneous-apply`) |
| `06-prepa-entretien.json` | offre → agent `/interview/prep` → dossier Discord | Webhook (`interview-prep?hash=`) |
| `07-digest-hebdo.json` | récap hebdo + candidatures à relancer → Discord | Schedule (cron dimanche 18h) |

> **Webhooks protégés** : si `WEBHOOK_SECRET` est renseigné dans `.env`, les
> workflows `03`/`05`/`06` rejettent tout appel sans `?token=<valeur>` (les liens
> générés par le `01` l'incluent automatiquement). Vide = comportement historique.

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
# tous sont montés dans le conteneur sous /workflows
for f in 01-recherche-offres 02-agent-candidature 03-statut-offre \
         04-candidature-finalisation 05-candidature-spontanee \
         06-prepa-entretien 07-digest-hebdo; do
  docker exec job-hunter-n8n n8n import:workflow --input=/workflows/$f.json
done
```

Restent à faire **dans l'UI n8n** après import :
1. Associer la **credential Postgres** (« Postgres job-hunter ») à chaque nœud
   Postgres (ils portent `id: REMPLACER`).
2. Renseigner `.env` (clés sources + `DISCORD_WEBHOOK_ALERTS/LOG`, `RENDER_API_URL`,
   `DEEPSEEK_API_KEY`, et `WEBHOOK_SECRET` recommandé) puis tester `01` en exécution
   manuelle. Les services `agent-langgraph` et `render` doivent tourner pour que
   le `02` génère les PDF.
3. Activer les workflows voulus (ils sont importés **inactifs** ; un réimport les
   repasse inactifs — réactiver `02`, sinon `03`/`05` échouent).

## lib/ (logique testée, source des nœuds Code)

- `offer-utils.mjs` : canonicalisation + `computeHash` (dédup SHA256), scoring
  déterministe piloté par le profil, filtre géo, dédup sémantique (cosinus).
- `sources.mjs` : normaliseurs FT / Adzuna / JobSpy / WTTJ / SerpApi / JSearch /
  LBA → schéma commun (seuls FT, JobSpy et LBA sont câblés dans le `01`).
- `llm-scoring.mjs` : scoring **hybride** — pré-filtre déterministe + affinage
  DeepSeek du top-N (`selectTopN`, `buildScoringMessages`, `parseScoringResponse`).
- `company-enrichment.mjs` : fiche entreprise **grounded** (résumé à partir du
  seul texte de l'offre, sans invention) → `companies.sector` / `ai_summary`.
- `render-payloads.mjs` : corps des requêtes vers le service render (`/cv`,
  `/letter`) + entrée du `04`.
- `build-nodes.mjs` : **génère** le jsCode des nœuds « Scorer + hashSource » et
  « Dédup sémantique » du `01` depuis `offer-utils.mjs` (`just build-nodes`) ;
  la CI vérifie la parité (`--check`).
- Tests : `node workflows/lib/*.test.mjs` (ou `just test`).

> Les autres nœuds Code recopient cette logique manuellement (n8n n'importe pas
> de fichier externe). Garder en parité — les tests verrouillent l'équivalence.
