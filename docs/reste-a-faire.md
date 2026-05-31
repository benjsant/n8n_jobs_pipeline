# 📋 Reste à faire — n8n_jobs_pipeline

> Fiche de suivi. Mise à jour : 2026-05-31.
> Plan détaillé et critères d'acceptation : voir [TASKS.md](../TASKS.md).

## ✅ Déjà fait

- Structure du repo assainie (racine + `workflows/`, `prompts/`, `docs/`, `assets/`).
- `docker-compose.yml` (n8n + Postgres) validé (`docker compose config` OK).
- `.env` créé (gitignoré) avec secrets locaux générés (clé de chiffrement,
  mots de passe Postgres + UI).
- Notifications : **Discord** (webhook) — Telegram retiré.
- Sources d'offres câblées côté config + doc : **France Travail, Adzuna,
  JobSpy, Welcome to the Jungle (RSS)**.
- Profil agent (section 3) : préférences pré-remplies (junior, CDI/alternance/CDD, flexible).
- Workflow `02-agent-candidature.json` présent (à fiabiliser).

## 🔑 À me fournir (toi)

### Clés / comptes à créer et coller dans `.env`
| Variable | Où l'obtenir | Requis pour |
|---|---|---|
| `DEEPSEEK_API_KEY` | platform.deepseek.com → API keys | démarrer l'agent (Tâches 1, 3, 4) |
| `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` | developer.adzuna.com (app gratuite) | source Adzuna (Tâche 6) |
| `NOTION_API_KEY` | notion.so/profile/integrations | suivi Notion (Tâche 5) |
| `NOTION_DB_OFFRES` / `_ENTREPRISES` | ID (32 hex) dans l'URL des bases | suivi Notion (Tâche 5) |
| `FRANCE_TRAVAIL_CLIENT_ID` / `_SECRET` | francetravail.io (application) | source France Travail (Tâche 6) |
| `DISCORD_WEBHOOK_URL` | Salon → Intégrations → Webhooks | notifications (Tâche 6) |
| `WTTJ_RSS_URL` (optionnel) | URL du flux RSS d'une recherche WTTJ | source WTTJ (Tâche 6) |

> JobSpy ne demande aucune clé (lib Python via micro-service).

### Infos profil (Tâche 2) — bloc à me renvoyer pour finir la section 3
Nom · intitulé visé · localisation · compétences (langages / IA-ML / outils /
cloud, avec niveau) · expérience · formation · secteurs visés / à éviter ·
valeurs · fourchette de salaire (optionnel).

## ⬜ Tâches restantes (par moi, dans l'ordre)

| # | Tâche | Bloqué par | État |
|---|---|---|---|
| 1 | Démarrer la stack n8n + valider l'UI | `DEEPSEEK_API_KEY` dans `.env` | ⬜ |
| 2 | Finaliser le profil candidat (section 3) | tes infos profil | ⬜ en attente |
| 3 | Tester l'agent DeepSeek seul (script/curl) | clé DeepSeek + Tâche 2 | ⬜ |
| 4 | Importer + fiabiliser le workflow `02-agent-candidature` | Tâche 3 | ⬜ |
| 5 | Bases Notion + workflow `03-sync-notion` | clés Notion | ⬜ |
| 6 | Workflow `01-recherche-offres` (FT + Adzuna + JobSpy + WTTJ + dédup + Discord) + micro-service JobSpy | clés FT/Adzuna/Discord | ⬜ |
| 7 | Orchestration 01 → 03 → 02 (Notion Trigger sur « À postuler ») | Tâches 4-6 | ⬜ |
| 8 | (Optionnel) PDF lettre + brouillon email, **avec garde-fou humain** | Tâche 7 | ⬜ |
| 9 | Documentation finale + vérif aucun secret commité | tout | ⬜ |

## 🆕 Idées / évolutions notées

- Ajouter plus tard **CV + modèle de lettre** dans `assets/` (cv/, lettres/)
  pour que l'agent DeepSeek adapte le CV et s'appuie sur un modèle de lettre.
- Sources écartées pour l'instant : Jooble, Remotive (réactivables si besoin).

## ⚠️ Garde-fous à ne jamais oublier

- `.env` jamais commité (vérifié, ignoré par git).
- Aucune candidature envoyée sans **relecture humaine**.
- Privilégier API/RSS officiels au scraping direct.
