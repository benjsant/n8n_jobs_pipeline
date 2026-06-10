# 🚀 Installation — reprendre le projet sur un autre PC

Guide pour cloner et relancer **n8n_jobs_pipeline** sur une nouvelle machine,
que ce soit pour toi ou pour Claude Code en début de session.

> Le dépôt GitHub contient tout le code suivi, **mais pas les secrets** : le
> fichier `.env` et le volume Docker (base Postgres + données n8n) ne sont
> **jamais** versionnés. Sur un nouveau PC, on repart donc d'un `.env` neuf et
> d'une instance n8n vierge. Voir « Transférer l'existant » plus bas si tu veux
> conserver tes workflows/credentials déjà saisis dans n8n.

---

## 1. Prérequis

- **Git**
- **Docker** + **Docker Compose v2** (`docker compose version` doit répondre)
- **OpenSSL** (présent par défaut sur Linux/macOS ; sous Windows via Git Bash)

## 2. Cloner le dépôt

```bash
git clone https://github.com/benjsant/n8n_jobs_pipeline.git
cd n8n_jobs_pipeline
```

## 3. Créer le `.env`

```bash
cp .env.example .env
```

Puis remplir `.env` :

**a) Secrets locaux à générer** (ne demandent aucun compte externe)
```bash
openssl rand -hex 32     # → colle dans N8N_ENCRYPTION_KEY
openssl rand -base64 24  # → POSTGRES_PASSWORD (enlève les / + =)
openssl rand -base64 18  # → N8N_BASIC_AUTH_PASSWORD
```
Définis aussi `N8N_BASIC_AUTH_USER` (login de l'UI n8n, ex. `admin`).

**b) Clés externes à récupérer** (voir le tableau « où l'obtenir » dans
[reste-a-faire.md](reste-a-faire.md) et les détails API dans [reference.md](reference.md)) :

| Variable | Nécessaire pour |
|---|---|
| `DEEPSEEK_API_KEY` | l'agent (démarrage minimal) |
| `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` | source Adzuna |
| `FRANCE_TRAVAIL_CLIENT_ID` / `_SECRET` | source France Travail |
| `DISCORD_WEBHOOK_URL` | notifications (jobs-alerts / jobs-log) |
| `WTTJ_RSS_URL` (optionnel) | source Welcome to the Jungle |
| Google OAuth (via nœud n8n) | brouillon Gmail + archivage Drive |
| `NOTION_*` (optionnel, hors V1) | consultation seule par-dessus Postgres |

> Source de vérité = **PostgreSQL** ; Notion n'est plus requis pour V1.
> Démarrage minimal possible avec **uniquement** `DEEPSEEK_API_KEY` + les
> secrets locaux. Le reste se branche au fil des Tâches 5 et 6.

## 4. Lancer la stack

```bash
docker compose config        # valide la syntaxe + l'interpolation du .env
docker compose up -d         # démarre n8n + Postgres
docker compose logs n8n -f   # suivre le démarrage (Ctrl+C pour quitter)
```

UI n8n : http://localhost:5678 (login = `N8N_BASIC_AUTH_USER` / `_PASSWORD`).

## 5. Importer les workflows

Dans n8n : **Workflows → Import from File** → choisir les fichiers de
`workflows/` (ex. `02-agent-candidature.json`).

Les fichiers de `prompts/` et `workflows/` sont montés dans le conteneur
(`/prompts`, `/workflows`) — l'agent lit son system prompt depuis
`/prompts/agent-system-prompt.md`.

## 6. Vérifier

- [ ] Les 2 conteneurs tournent : `docker compose ps` (state `running`/`healthy`).
- [ ] L'UI n8n se charge et demande le login basique.
- [ ] `git status` ne montre **jamais** `.env`.

---

## Transférer l'existant (optionnel)

Le `git clone` ne ramène **pas** :
- **`.env`** → copie-le manuellement (clé USB, gestionnaire de secrets…),
  jamais par git. ⚠️ Si tu changes `N8N_ENCRYPTION_KEY`, les credentials
  déjà chiffrées dans n8n deviennent illisibles : garde la **même** clé si tu
  veux réutiliser une instance existante.
- **Le volume Docker** (`postgres_data`, `n8n_data`) = tes workflows et
  exécutions enregistrés dans l'UI. Pour les conserver, soit ré-importer les
  JSON de `workflows/` (recommandé), soit migrer le volume Docker manuellement.

## Dépannage rapide

| Symptôme | Piste |
|---|---|
| `variable is not set` au `docker compose config` | une variable manque dans `.env` |
| n8n redémarre en boucle | vérifier `N8N_ENCRYPTION_KEY` (32 octets hex) et la connexion Postgres |
| L'agent ne lit pas le prompt | vérifier le montage `./prompts:/prompts` et le chemin `/prompts/agent-system-prompt.md` |
| Erreurs Notion (relations) | nœud Notion à jour, sinon passer en HTTP Request (voir reference.md §4) |

---

## Pour Claude Code (début de session sur la nouvelle machine)

1. Lire [CLAUDE.md](../CLAUDE.md) (contexte + conventions).
2. Lire [reference.md](reference.md) (infos API exactes).
3. Lire [reste-a-faire.md](reste-a-faire.md) (état d'avancement + clés à fournir).
4. Suivre [TASKS.md](../TASKS.md) dans l'ordre.
5. Ne jamais committer `.env` ni inventer d'info personnelle : demander à l'utilisateur.
