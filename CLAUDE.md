# CLAUDE.md

Contexte projet pour Claude Code. Lis ce fichier en début de session.

## 👉 Par où commencer

1. Lis ce fichier en entier.
2. Lis `docs/contexte-claude.md` (mémoire portable : décisions, préférences,
   ce qui est en attente — remplace le `.claude/` non exportable).
3. Lis `docs/reference.md` (toutes les infos API exactes).
4. Lis `docs/reste-a-faire.md` (état d'avancement + clés à fournir).
5. Ouvre `TASKS.md` : c'est le plan de build ordonné. Exécute les tâches dans
   l'ordre, coche-les, et vérifie les critères d'acceptation de chacune.
6. Ne committe jamais `.env`. Ne demande jamais à inventer une info perso :
   demande à l'utilisateur.

> Première installation sur cette machine ? Suis `docs/installation.md`.

## Objectif

Assistant de recherche d'emploi **semi-automatique** pour un développeur junior
orienté IA / développement logiciel. Le système doit :

1. Collecter automatiquement des offres depuis plusieurs sources.
2. Dédupliquer les offres.
3. Les scorer selon le profil candidat (0 à 100).
4. Stocker le tout dans PostgreSQL (source de vérité).
5. Notifier l'utilisateur via Discord.
6. Générer un CV personnalisé à partir d'un CV maître Astro.
7. Générer une lettre de motivation personnalisée.
8. Préparer un brouillon Gmail prêt à être envoyé.
9. Archiver les documents générés (Google Drive).
10. Suivre les candidatures et les réponses.

**Validation humaine obligatoire avant tout envoi.**

## Philosophie (garde-fous non négociables)

Le système assiste le candidat. Il ne doit **jamais** :

- inventer une compétence, une expérience, une certification, une mission ;
- envoyer automatiquement une candidature ou un email ;
- modifier des données personnelles sans validation.

Une relecture humaine reste obligatoire avant chaque envoi.

## Stack

- **Infra** : VPS Linux, Docker Compose, WireGuard, accès n8n protégé.
- **Orchestration** : n8n (auto-hébergé, Docker).
- **Source de vérité** : **PostgreSQL** (le même conteneur sert aussi la
  persistance interne de n8n). Notion/Airtable ne sont PAS le stockage
  principal — au plus une interface de consultation ultérieure.
- **LLM de l'agent** : DeepSeek (API compatible OpenAI, base URL
  `https://api.deepseek.com`, modèle `deepseek-chat` par défaut).
- **Génération CV** : Astro (template HTML/CSS fixe) → export PDF.
- **Sources d'offres** : API France Travail, Adzuna, JobSpy
  (LinkedIn/Indeed/Glassdoor), RSS Welcome to the Jungle.
- **Notifications** : Discord (webhook, deux canaux).
- **Email** : Gmail (brouillon uniquement, jamais d'envoi auto).
- **Stockage documents** : Google Drive.
- **Dev assistant** : Claude Code.

## Architecture (pipeline)

```
Sources d'offres → Collecte → Déduplication → Scoring → PostgreSQL → Discord
→ Validation humaine → Agent candidature → CV personnalisé (Astro/PDF)
→ Lettre de motivation → Brouillon Gmail → Google Drive
```

## Source de vérité : PostgreSQL

PostgreSQL est la **seule** source de vérité. Tables principales (schéma complet
dans `docs/reference.md`) :

- **search_profiles** (multi-profils) : configs de recherche `name, keywords,
  location_insee, radius_km, contract_types, seniority, must_have, exclusions,
  score_threshold, active`. Le workflow `01` boucle sur les profils actifs.
- **offers** : `id, source, source_id, hash, title, company, location,
  contract_type, salary, description, url, score, score_reason, profile_id,
  status, created_at`. Statuts : `new, reviewed, selected, ignored, applied`.
- **companies** : `id, name, website, sector, description, ai_summary,
  last_updated`.
- **applications** : `id, offer_id, company_id, status, applied_at,
  response_at, notes`. Statuts : `draft, sent, interview, rejected, accepted`.
- **generated_documents** : `id, application_id, cv_path, letter_path,
  generated_at`.
- **profile** : profil candidat (JSON ou dossier `cv/`).

**Déduplication** : chaque offre reçoit un hash `SHA256(title + company +
location)`. Les doublons sont ignorés.

**Scoring** : score 0-100 selon technologies, adéquation profil, niveau junior,
télétravail, localisation, salaire, type de contrat.

## CV : DeepSeek produit des données, Astro fait le rendu

Le CV maître reste fixe. **DeepSeek ne modifie jamais l'Astro / le HTML / le
CSS** : il ne produit que des **données structurées** (réordonnancement,
masquage de sections, reformulation du résumé), à partir du seul profil
candidat — jamais d'invention. Exemple de sortie :

```json
{ "highlight_skills": [], "highlight_projects": [], "summary": "" }
```

Le moteur Astro transforme ensuite ces données + le profil en PDF.

Arbo `cv/` : `template.astro`, `profile.json`, `skills.json`, `projects.json`,
`experiences.json`, `education.json`.

## Lettres de motivation

Construites à partir d'un modèle validé + profil + offre + infos réelles de
l'entreprise. Templates dans `assets/letters/` :
`ia-junior.md`, `backend.md`, `frontend.md`, `alternance.md`,
`candidature-spontanee.md`. L'agent choisit le template le plus adapté.

## Discord (deux canaux)

- **jobs-alerts** : offres pertinentes uniquement (score, titre, entreprise,
  actions « Générer candidature » / « Ignorer »).
- **jobs-log** : logs techniques (« 200 offres récupérées », « 15 doublons
  supprimés », « 12 offres retenues »).

## Arborescence

```
n8n_jobs_pipeline/          # racine du projet
├── docker-compose.yml      # n8n + Postgres (+ micro-service JobSpy)
├── .env                    # secrets (JAMAIS commité)
├── .env.example            # template documenté
├── .gitignore
├── CLAUDE.md               # ce fichier
├── README.md
├── TASKS.md                # plan de build ordonné
├── db/                     # schéma SQL (init des tables PostgreSQL)
├── workflows/              # exports JSON des workflows n8n
│   └── 02-agent-candidature.json
├── prompts/
│   └── agent-system-prompt.md   # system prompt de l'agent (cœur du projet)
├── cv/                     # CV maître Astro + données structurées
│   ├── template.astro
│   └── *.json
├── assets/
│   └── letters/                 # modèles de lettres typés
└── docs/
    └── reference.md             # toutes les infos API + schéma SQL exacts
```

## Conventions

- **Secrets** : tout passe par `.env`. Jamais de clé en dur dans un workflow
  ou un fichier commité. Dans n8n, lire via `{{$env.NOM_VARIABLE}}`.
- **Workflows** : versionner les exports JSON dans `workflows/`. Nommer
  `NN-description.json` (ex. `01-recherche-offres.json`).
- **Le system prompt** est la source de vérité du comportement de l'agent.
  Toute évolution du comportement passe par `prompts/agent-system-prompt.md`,
  pas par du code dispersé.
- **Langue** : prose et docs en français, identifiants techniques en anglais.

## DeepSeek dans n8n

DeepSeek est compatible OpenAI. Deux options :
1. Nœud **OpenAI** de n8n avec une credential custom : base URL
   `https://api.deepseek.com`, clé = `DEEPSEEK_API_KEY`.
2. Nœud **HTTP Request** vers `https://api.deepseek.com/chat/completions`,
   header `Authorization: Bearer {{$env.DEEPSEEK_API_KEY}}`, body avec
   `messages: [{role:"system", content: <system prompt>}, {role:"user", ...}]`.

Le system prompt vient de `prompts/agent-system-prompt.md`.

## Démarrage

```bash
cp .env.example .env        # puis remplir les valeurs
openssl rand -hex 32        # pour N8N_ENCRYPTION_KEY
docker compose up -d
# n8n dispo sur http://localhost:5678
```

## Tâches typiques pour Claude Code

- Générer / modifier des workflows n8n (JSON).
- Ajuster le system prompt de l'agent.
- Ajouter une source d'offres.
- Faire évoluer le schéma PostgreSQL ou le rendu CV Astro.
- Débugger un nœud HTTP ou une expression n8n.

## Garde-fous

- Vérifier que `.env` est bien ignoré par git avant tout commit (dépôt public).
- PostgreSQL reste la source de vérité ; ne pas réintroduire Notion comme
  stockage principal.
- Le scraping de sites sans API officielle (ex. LinkedIn direct) est fragile et
  juridiquement gris : privilégier API/RSS officiels ou JobSpy.
- Toujours garder une étape de relecture humaine avant l'envoi d'une candidature.

## Vision long terme

- **V1** : collecte · dédup · scoring · Discord · CV personnalisé · lettre
  personnalisée · brouillon Gmail.
- **V2** : enrichissement entreprise · relances automatiques · dashboard
  Metabase.
- **V3** : historique intelligent · statistiques de réponse · priorisation
  automatique des entreprises · mémoire des candidatures.
