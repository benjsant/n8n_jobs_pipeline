# 📋 Reste à faire — n8n_jobs_pipeline

> Fiche de suivi. Mise à jour : 2026-06-10.
> Plan détaillé et critères d'acceptation : voir [TASKS.md](../TASKS.md).
> **Source de vérité = PostgreSQL** (Notion rétrogradé en option de consultation).

## ✅ Déjà fait

- Structure du repo assainie (racine + `workflows/`, `prompts/`, `docs/`, `assets/`).
- `docker-compose.yml` (n8n + Postgres) validé (`docker compose config` OK).
- `.env` créé (gitignoré) avec secrets locaux générés (clé de chiffrement,
  mots de passe Postgres + UI).
- Notifications : **Discord** (webhook) — deux canaux prévus (jobs-alerts, jobs-log).
- Sources d'offres câblées côté config + doc : **France Travail, Adzuna,
  JobSpy, Welcome to the Jungle (RSS)**.
- Profil agent (section 3) : préférences pré-remplies (junior, CDI/alternance/CDD, flexible).
- Workflow `02-agent-candidature.json` présent (à fiabiliser).
- **Vision V2 fusionnée** : Postgres source de vérité, CV Astro (données vs
  rendu), lettres typées, scoring 0-100, dédup SHA256, Gmail brouillon, Drive.
- **Schéma PostgreSQL** (`db/schema.sql`, 5 tables) écrit, validé (idempotent +
  dédup), et monté en init dans `docker-compose.yml` (Tâche 2).
- **Profil candidat réel** importé du portfolio (`github.com/benjsant/astro-portfolio`,
  `src/data/cv.ts`) dans `cv/*.json` + section 3 du system prompt (Benjamin
  Santrisse). Aucune invention : ni téléphone, ni salaire, ni niveau de
  compétence non fourni. `cv-index.json` régénéré.
- **Script de test DeepSeek** (`scripts/test_deepseek.py`) : valide le schéma de
  sortie ; mode `--mock` vérifié sans clé (appel réel dès `DEEPSEEK_API_KEY`).
- **Micro-service JobSpy** (`services/jobspy/`, FastAPI + Dockerfile + tests OK)
  câblé dans `docker-compose.yml`.
- **Rendu CV Astro** (`cv/`) : projet initialisé, **rendu HTML vérifié** (perso
  appliquée), export **PDF conteneurisé** (`cv/Dockerfile`, Chromium inclus).
- **Logique dédup+scoring** (`workflows/lib/offer-utils.mjs`, 7 tests OK) et
  **workflow `01-recherche-offres.json`** (brouillon Adzuna, scoring inline en
  parité avec le module) — à vérifier à l'import n8n.
- **Outillage** : `Makefile` (points d'entrée), `scripts/run-tests.sh` (suites
  hors stack), et **garde-fou anti-fuite** (`scripts/check-no-personal-data.sh`
  + hook `.githooks/pre-commit`, à activer via `make install-hooks`) qui bloque
  un commit de `.env` ou d'un profil ayant perdu son marqueur DUMMY.
- **Normaliseurs par source** (`workflows/lib/sources.mjs`, 7 tests OK) : FT,
  Adzuna, JobSpy, WTTJ → schéma commun.
- **Workflow `01` multi-sources** (4 sources → merge → score → hash → Postgres →
  alerts + **jobs-log**) et **squelette `04`** (Drive + brouillon Gmail, Tâche 9)
  — à vérifier à l'import n8n.
- **Deux canaux Discord** : `DISCORD_WEBHOOK_ALERTS` / `DISCORD_WEBHOOK_LOG`
  (+ alias rétro-compat `DISCORD_WEBHOOK_URL`) câblés dans `.env*` et compose.
- **Rendu lettre** (`cv/letter.mjs`, 5 tests OK) : met en page le texte de
  l'agent → PDF conteneurisé (`make letter-pdf`), alimente `letter_path`.
- **Statuts depuis Discord** : workflow `03-statut-offre` (webhook
  `offer-status?hash=&action=selected|ignored` → UPDATE `offers.status`) + liens
  d'action ajoutés dans l'alerte du workflow `01`.
- **Couche candidature SQL** (`db/queries.sql`) + **test d'intégration**
  (`db/queries.test.sh`) : parcours `new→selected→applied` validé contre le
  schéma réel (upsert entreprise, candidature draft, documents, jointures).
- **Workflow `02` refondu** : double déclencheur (formulaire + orchestration),
  écrit `companies`/`applications` (draft) puis passe l'offre en `applied`.
- **Orchestration** : `03` (action `selected`) → charge l'offre → lance `02`
  (Execute Workflow) ; chaîne complète documentée dans `workflows/README.md`.
- **Scoring hybride** (`workflows/lib/llm-scoring.mjs`, 7 tests) : pré-filtre
  déterministe + affinage DeepSeek du top-N (`score` + `score_reason`) ; intégré
  au workflow `01` ; colonne `score_reason` ajoutée au schéma.
- **Enrichissement entreprise** (`workflows/lib/company-enrichment.mjs`, 6 tests)
  **grounded** (résumé à partir du seul texte de l'offre, sans invention) →
  `companies.sector`/`ai_summary` ; intégré au workflow `02`.
- **Personnalisation CV structurée** (gap §6 fermé) : le system prompt produit
  `personnalisation_cv` (highlight_skills/projects/experiences, hidden_sections,
  summary) ; le validateur `test_deepseek.py` **vérifie** que les valeurs
  existent dans `cv/*.json` (anti-invention). `cv/cv-index.json` (généré, `make
  cv-index`) liste les valeurs sélectionnables, injectées au prompt par le `02`
  (`cv/` monté en lecture seule dans n8n).
- **Idées du deck** capitalisées dans `docs/idees-inspiration.md`.
- **Maillon rendu → 04 branché** : micro-service de rendu HTTP (`cv/server.mjs`,
  conteneur `render`, `RENDER_API_URL`) ; le `02` appelle `/cv` + `/letter`
  (payloads `lib/render-payloads.mjs`, 6 tests), enregistre `generated_documents`
  et lance le `04` ; PDF dans `./output` (volume partagé n8n ↔ render).
- **Multi-profils** (d'après l'export Airtable/Make réel) : table
  `search_profiles` + `offers.profile_id` (test d'intégration vert) ; workflow
  `01` piloté par les profils actifs (boucle) ; scoring par `must_have`/
  `exclusions` du profil ; sous-scores fusionnés dans §6 ; source **Google Jobs
  (SerpApi)** ajoutée ; profil étendu (soft skills, certifs, langues, salaire).
  Specs d'origine archivées dans `docs/specs/`.

## 🔑 À me fournir (toi)

### Clés / comptes à créer et coller dans `.env`
| Variable | Où l'obtenir | Requis pour |
|---|---|---|
| `DEEPSEEK_API_KEY` | platform.deepseek.com → API keys | démarrer l'agent (Tâches 3, 4, 7) |
| `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` | developer.adzuna.com (app gratuite) | source Adzuna (Tâche 5) |
| `FRANCE_TRAVAIL_CLIENT_ID` / `_SECRET` | francetravail.io (application) | source France Travail (Tâche 5) |
| `DISCORD_WEBHOOK_URL` | Salon → Intégrations → Webhooks | notifications (Tâches 5, 6) |
| `WTTJ_RSS_URL` (optionnel) | URL du flux RSS d'une recherche WTTJ | source WTTJ (Tâche 5) |
| Google (Gmail + Drive) | OAuth via le nœud Google de n8n | brouillon + archivage (Tâche 9) |
| `NOTION_*` (optionnel, plus tard) | notion.so/profile/integrations | consultation seule, hors V1 |

> JobSpy ne demande aucune clé (lib Python via micro-service).
> Notion n'est plus requis pour V1 : ne le configurer que si tu veux une vue
> de consultation par-dessus Postgres.

### Infos profil (Tâche 3) — ✅ reçues (portfolio)
Profil importé depuis `github.com/benjsant/astro-portfolio` (`src/data/cv.ts`).
**Optionnel / non fourni par le portfolio** (à me donner si tu veux les ajouter,
sinon laissés vides — pas d'invention) : *soft skills / savoir-être*, *points
forts*, *réalisations notables* (champ profil), *fourchette de salaire*,
*secteurs visés / à éviter*, *niveaux de compétence* (notions→expert).

## ⬜ Tâches restantes (par moi, dans l'ordre)

| # | Tâche | Bloqué par | État |
|---|---|---|---|
| 1 | Démarrer la stack n8n + valider l'UI | `DEEPSEEK_API_KEY` dans `.env` | ⬜ |
| 2 | Schéma PostgreSQL (`db/schema.sql`, 5 tables + dédup) | — | ✅ fait |
| 3 | Finaliser profil candidat (system prompt + `cv/*.json`) | tes infos profil | ✅ profil réel importé du portfolio (reste optionnel : soft skills, salaire) |
| 4 | Tester l'agent DeepSeek seul (script/curl) | clé DeepSeek | 🟡 script prêt (`--mock` OK), appel réel en attente de la clé |
| 5 | Workflow `01-recherche-offres` (sources + dédup + scoring + Postgres + jobs-log) + micro-service JobSpy | clés FT/Adzuna/Discord | 🟡 4 sources + merge + jobs-log câblés (normaliseurs testés) ; à vérifier à l'import n8n |
| 6 | Notif offres pertinentes (Discord jobs-alerts + statuts) | Tâche 5 | 🟡 alerts + log + workflow `03` (statuts `selected/ignored` via liens) ; à vérifier à l'import |
| 7 | Importer + fiabiliser `02-agent-candidature` (→ `applications`) | Tâches 4, 6 | 🟡 refondu (écrit `applications`/`companies`, SQL testée) ; à vérifier à l'import |
| 8 | Génération CV Astro→PDF + lettre (templates) | Tâche 7 | 🟡 CV (HTML vérifié, PDF conteneurisé) + lettre (5 tests) + perso CV structurée (§6) + **service de rendu HTTP** (`cv/server.mjs`, conteneur `render`) appelé par le `02` ; à vérifier à l'import |
| 9 | Brouillon Gmail + archivage Drive (**garde-fou humain**) | Tâche 8 + OAuth Google | 🟡 squelette `04` (lit les PDF depuis `./output`) + doc OAuth ; à vérifier à l'import |
| 10 | Orchestration de bout en bout + statuts Postgres | Tâches 5-9 | 🟡 chaîne complète câblée `03→02→(rendu)→04` ; reste la vérif dans n8n lancé |
| 11 | Documentation finale + vérif aucun secret commité | tout | ⬜ |

> 🟡 = avancé avec données/artefacts vérifiables hors stack ; reste la
> vérification dans n8n lancé et/ou le remplacement des données DUMMY.

## 🆕 Idées / évolutions notées (hors V1)

- **V2** : enrichissement entreprise (`companies.ai_summary`), relances auto
  (candidatures sans `response_at`), dashboard Metabase.
- **V3** : historique intelligent, stats de réponse, priorisation des
  entreprises, mémoire des candidatures.
- Notion/Airtable comme interface de consultation en lecture seule au-dessus de
  Postgres (optionnel).
- Sources écartées pour l'instant : Jooble, Remotive (réactivables si besoin).

## ⚠️ Garde-fous à ne jamais oublier

- `.env` jamais commité (vérifié, ignoré par git ; dépôt public).
- PostgreSQL reste la source de vérité — ne pas réintroduire Notion comme stockage.
- Aucune candidature envoyée sans **relecture humaine** ; Gmail reste en brouillon.
- CV : DeepSeek produit des données, Astro fait le rendu — jamais d'invention.
- Privilégier API/RSS officiels au scraping direct.
