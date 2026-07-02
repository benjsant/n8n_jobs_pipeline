# 🚀 Installation : reprendre le projet sur une autre machine

Guide pour cloner et relancer **n8n_jobs_pipeline** from scratch sur un nouveau PC
(pour toi ou pour Claude Code en début de session).

> 🔐 **Déploiement sur VPS privé (WireGuard + SSH durci)** : voir le guide dédié
> [deploiement-vps.md](deploiement-vps.md). Le présent fichier couvre l'install
> locale / dev ; le guide VPS couvre le durcissement, le tunnel et l'exposition privée.

> Le dépôt GitHub contient **tout le code suivi** (workflows avec leurs `id`,
> profil `cv/*.json`, services, schéma SQL, scripts), **mais pas** : le `.env`
> (secrets) ni les volumes Docker (base Postgres + données n8n). Sur un nouveau
> PC on repart donc d'un `.env` neuf et d'une instance n8n vierge, c'est normal,
> tout se reconstruit.

---

## 1. Prérequis

- **Git**, **Docker** + **Docker Compose v2** (`docker compose version` répond).
- **OpenSSL** (génération de secrets ; présent sur Linux/macOS, via Git Bash sous Windows).
- **Node ≥ 18** (optionnel, seulement pour lancer les tests / `just cv-sync` sur l'hôte ;
  pas requis pour faire tourner la stack, tout est conteneurisé).
- ~2 Go de libre : l'image de rendu est basée sur Playwright (Chromium inclus).

## 2. Cloner

```bash
git clone https://github.com/benjsant/n8n_jobs_pipeline.git
cd n8n_jobs_pipeline
```

## 3. Créer le `.env`

```bash
cp .env.example .env
```

**a) Secrets locaux à générer** (aucun compte externe) :
```bash
openssl rand -hex 32     # → N8N_ENCRYPTION_KEY (⚠️ garder la MÊME clé si tu réutilises une instance n8n existante)
openssl rand -base64 24  # → POSTGRES_PASSWORD
openssl rand -base64 18  # → N8N_BASIC_AUTH_PASSWORD
```
Définis aussi `N8N_BASIC_AUTH_USER` (ex. `admin`).

**b) Clés externes**, à créer, par ordre d'utilité (le pipeline démarre sans,
mais ne fait rien d'« utile » tant qu'elles sont vides) :

| Variable | Où l'obtenir | Débloque |
|---|---|---|
| `DEEPSEEK_API_KEY` | platform.deepseek.com | **l'agent** (`02`), le rendu, le scoring LLM, `test_deepseek` réel |
| `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` | developer.adzuna.com (gratuit) | une source d'offres pour tester `01` |
| `SERPAPI_KEY` | serpapi.com | Google Jobs (source principale du modèle réel) |
| `FRANCE_TRAVAIL_CLIENT_ID` / `_SECRET` | francetravail.io | source France Travail |
| `DISCORD_WEBHOOK_ALERTS` / `_LOG` | Salon Discord → Intégrations → Webhooks | notifications + clic « Générer » |
| `WTTJ_RSS_URL` (option) | flux RSS d'une recherche WTTJ | source Welcome to the Jungle |
| Google OAuth (dans n8n) | nœud Google de n8n (Drive + Gmail) | brouillon Gmail + archivage Drive |

> JobSpy et le service de rendu ne demandent **aucune** clé.
> **Démarrage minimal utile** : `DEEPSEEK_API_KEY` + (Adzuna **ou** SerpApi) + un webhook Discord.

## 4. Lancer la stack (4 services)

```bash
docker compose config        # valide la syntaxe + l'interpolation du .env
docker compose up -d         # build jobspy + render (lourd au 1er run), démarre postgres + n8n
docker compose ps            # tous healthy ?
```

Services : **postgres** (source de vérité + persistance n8n), **n8n** (UI :5678),
**jobspy** (micro-service sources), **render** (CV Astro + lettre → PDF).
Le schéma SQL (`db/schema.sql` + `db/seed-profiles.sql`) s'applique **au premier
init** de la base vide.

UI n8n : http://localhost:5678, au **premier démarrage**, n8n 2.x fait créer un
**compte propriétaire** (owner) ; renseigne-le.

## 5. Importer les workflows

Les 4 workflows portent un **`id` racine stable** et leurs appels croisés
(`03→02`, `02→04`) sont déjà câblés. Import en une commande :

```bash
for f in 01-recherche-offres 02-agent-candidature 03-statut-offre 04-candidature-finalisation; do
  docker exec job-hunter-n8n n8n import:workflow --input=/workflows/$f.json
done
```

(ou via l'UI : **Workflows → Import from File**.) Vérifié sur **n8n 2.26.7**.

Ensuite, **dans l'UI** :
1. Associer la **credential Postgres** (« Postgres job-hunter ») à chaque nœud Postgres (ils portent `id: REMPLACER`).
2. Associer les **credentials Google** (Drive + Gmail OAuth2) dans le `04`.
3. Activer les workflows voulus (importés **inactifs**).

## 6. Profil candidat (CV)

Le profil réel est **déjà dans le dépôt** (`cv/*.json`, synchronisé depuis le
portfolio `benjsant/astro-portfolio`). Pour le resynchroniser après une mise à
jour du portfolio :
```bash
just cv-sync     # récupère src/data/cv.ts → régénère cv/*.json + cv-index.json
```

## 7. Vérifier

```bash
just test                    # suites hors stack (libs, scoring, sync, schéma, intégration DB)
docker compose ps            # 4 conteneurs running/healthy
git status                   # ne montre JAMAIS .env
```
- [ ] UI n8n se charge ; les 4 workflows sont importés.
- [ ] Service `render` répond (`docker exec job-hunter-render node -e "require('http').get('http://localhost:8000/health',r=>console.log(r.statusCode))"`).

---

## Transférer une instance existante (optionnel)

`git clone` ne ramène **pas** :
- **`.env`** → copie-le hors git (clé USB, gestionnaire de secrets). ⚠️ Si tu changes
  `N8N_ENCRYPTION_KEY`, les credentials chiffrées dans n8n deviennent illisibles :
  garde la **même** clé pour réutiliser une instance.
- **Les volumes Docker** (`postgres_data`, `n8n_data`) = workflows/exécutions/credentials
  saisis dans l'UI. Pour les conserver : ré-importer les JSON de `workflows/`
  (recommandé) + ressaisir les credentials, ou migrer les volumes Docker à la main.
- **`./output/`** (PDF générés) : régénéré à la volée, rien à transférer.

## Dépannage rapide

| Symptôme | Piste |
|---|---|
| `variable is not set` au `docker compose config` | une variable manque dans `.env` |
| Import workflow : `null value in column "id"` | normalement résolu (id racine présent) ; sinon, vérifier que le JSON a bien `"id"` |
| `render` : `Executable doesn't exist` (Chromium) | l'image et la lib Playwright doivent être à la **même** version (lib épinglée `1.49.0` = image `v1.49.0-jammy`) ; `docker compose build render` |
| Schéma DB absent | l'init ne s'applique qu'à une base **vide** ; sinon appliquer `db/schema.sql` à la main |
| n8n redémarre en boucle | vérifier `N8N_ENCRYPTION_KEY` (32 octets hex) + connexion Postgres |

---

## Pour Claude Code (début de session sur la nouvelle machine)

1. Lire [CLAUDE.md](https://github.com/benjsant/n8n_jobs_pipeline/blob/main/CLAUDE.md) (contexte + conventions).
2. Lire [docs/contexte-claude.md](contexte-claude.md) (mémoire portable : décisions, état).
3. Lire [docs/reste-a-faire.md](reste-a-faire.md) (état d'avancement + clés à fournir).
4. Lire [docs/reference.md](reference.md) (infos API exactes).
5. Ne jamais committer `.env` ni inventer d'info personnelle (le profil vient du portfolio).
