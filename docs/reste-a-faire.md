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

### Infos profil (Tâche 3) — bloc à me renvoyer
Nom · intitulé visé · localisation · compétences (langages / IA-ML / outils /
cloud, avec niveau) · expérience · projets · formation · secteurs visés / à
éviter · valeurs · fourchette de salaire (optionnel).
→ servira à la fois au system prompt (section 3) et aux fichiers `cv/*.json`.

## ⬜ Tâches restantes (par moi, dans l'ordre)

| # | Tâche | Bloqué par | État |
|---|---|---|---|
| 1 | Démarrer la stack n8n + valider l'UI | `DEEPSEEK_API_KEY` dans `.env` | ⬜ |
| 2 | Schéma PostgreSQL (`db/schema.sql`, 5 tables + dédup) | — | ✅ fait |
| 3 | Finaliser profil candidat (system prompt + `cv/*.json`) | tes infos profil | ⬜ en attente |
| 4 | Tester l'agent DeepSeek seul (script/curl) | clé DeepSeek + Tâche 3 | ⬜ |
| 5 | Workflow `01-recherche-offres` (sources + dédup + scoring + Postgres + jobs-log) + micro-service JobSpy | clés FT/Adzuna/Discord + Tâche 2 | ⬜ |
| 6 | Notif offres pertinentes (Discord jobs-alerts + statuts) | Tâche 5 | ⬜ |
| 7 | Importer + fiabiliser `02-agent-candidature` (→ `applications`) | Tâches 4, 6 | ⬜ |
| 8 | Génération CV Astro→PDF + lettre (templates) | Tâche 7 | ⬜ |
| 9 | Brouillon Gmail + archivage Drive (**garde-fou humain**) | Tâche 8 + OAuth Google | ⬜ |
| 10 | Orchestration de bout en bout + statuts Postgres | Tâches 5-9 | ⬜ |
| 11 | Documentation finale + vérif aucun secret commité | tout | ⬜ |

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
