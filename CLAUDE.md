# CLAUDE.md

Contexte projet pour Claude Code. Lis ce fichier en début de session.

## 👉 Par où commencer

1. Lis ce fichier en entier.
2. Lis `docs/reference.md` (toutes les infos API exactes).
3. Ouvre `TASKS.md` : c'est le plan de build ordonné. Exécute les tâches dans
   l'ordre, coche-les, et vérifie les critères d'acceptation de chacune.
4. Ne committe jamais `.env`. Ne demande jamais à inventer une info perso :
   demande à l'utilisateur.

## Objectif

Automatiser la recherche d'emploi pour un développeur IA :
1. Trouver des offres par mots-clés sur plusieurs sources.
2. Suivre les candidatures dans Notion.
3. Générer des lettres de motivation et adaptations de CV personnalisées par
   entreprise, via un agent LLM (DeepSeek) piloté par un system prompt complet.

## Stack

- **Orchestration** : n8n (auto-hébergé, Docker).
- **Base de données n8n** : PostgreSQL (conteneur).
- **LLM de l'agent** : DeepSeek (API compatible OpenAI, base URL
  `https://api.deepseek.com`, modèle `deepseek-chat` par défaut).
- **Suivi candidatures** : Notion (nœud natif n8n + API).
- **Sources d'offres** : API France Travail, JobSpy (LinkedIn/Indeed/Glassdoor),
  RSS Welcome to the Jungle, Wellfound pour les jobs IA/startup.
- **Notifications** : Discord (webhook).
- **Dev assistant** : Claude Code.

## Arborescence

```
n8n_jobs_pipeline/          # racine du projet
├── docker-compose.yml      # n8n + Postgres
├── .env                    # secrets (JAMAIS commité)
├── .env.example            # template documenté
├── .gitignore
├── CLAUDE.md               # ce fichier
├── README.md
├── TASKS.md                # plan de build ordonné
├── workflows/              # exports JSON des workflows n8n
│   └── 02-agent-candidature.json
├── prompts/
│   └── agent-system-prompt.md   # system prompt de l'agent (cœur du projet)
├── assets/                 # CV + modèles de lettre (sources pour l'agent)
│   ├── cv/
│   └── lettres/
└── docs/
    └── reference.md             # toutes les infos API exactes
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
- Débugger un nœud HTTP ou une expression n8n.

## Garde-fous

- Vérifier que `.env` est bien ignoré par git avant tout commit.
- Le scraping de sites sans API officielle (ex. LinkedIn direct) est fragile et
  juridiquement gris : privilégier API/RSS officiels ou JobSpy.
- Toujours garder une étape de relecture humaine avant l'envoi d'une candidature.
