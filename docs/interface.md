# 🖥️ Mini-interface web : candidature depuis une URL

Interface graphique légère pour générer un **CV + une lettre** à partir de l'**URL
d'une offre**, à la demande, **sans déployer de serveur**. Tu la lances sur ton PC
quand tu veux candidater, tu la coupes après.

> Elle n'a besoin que de **2 services** (`agent-langgraph` + `render`) : ni n8n, ni
> Postgres, ni collecte automatique. Empreinte ~200 Mo RAM.

## Prérequis (n'importe quel poste)

- **Docker** + **Docker Compose**.
- Le dépôt cloné, et un `.env` rempli au minimum avec :
  - `DEEPSEEK_API_KEY` (l'agent),
  - `DISCORD_WEBHOOK_ALERTS` (livraison des documents ; optionnel, sinon
    téléchargement direct depuis la page).

```bash
git clone https://github.com/benjsant/n8n_jobs_pipeline
cd n8n_jobs_pipeline
cp .env.example .env      # puis remplir DEEPSEEK_API_KEY (+ DISCORD_WEBHOOK_ALERTS)
```

## Lancer

```bash
just ui            # démarre agent + render, attend, affiche l'URL
# ou, sans just :
docker compose up -d agent-langgraph render
```

Puis ouvre **http://localhost:8001**.

Pour couper :

```bash
just ui-stop       # ou : docker compose down
```

## Utiliser

1. **Colle l'URL** d'une offre → « Extraire ». L'app récupère la page et en extrait
   `titre / entreprise / lieu / description`.
2. **Vérifie et corrige** ces champs (mémo éditable), utile si l'extraction est
   incomplète (pages très dynamiques).
3. **Génère** : l'agent produit un CV (ATS, titre adapté à l'offre) et une lettre,
   sans invention et sans signe IA (tirets nettoyés).
4. **Récupère** : téléchargement direct des PDF depuis la page **et** livraison sur
   Discord (2 pièces jointes) si le webhook est configuré. Relecture humaine avant
   tout envoi.

La page affiche aussi l'**état des services** (agent / rendu / Discord) et
l'**historique** des candidatures générées (avec liens de téléchargement).

## Mini-interface vs stack complète

| Besoin | À lancer |
|---|---|
| **Candidature ponctuelle depuis une URL** | `just ui` (agent + render) |
| **Collecte automatique** (offres → alertes Discord, suivi) | `just up` (toute la stack : n8n, Postgres, sources…) |

## Endpoints (pour référence)

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/` | la page (Alpine.js) |
| GET | `/status` | état agent / render / Discord |
| POST | `/offer/extract` `{ url }` | extraction des champs de l'offre |
| POST | `/offer/generate` | génère CV + lettre, livre sur Discord |
| GET | `/history` | candidatures générées |
| GET | `/files/{app_id}/{cv.pdf\|lettre.pdf}` | télécharge un PDF |

## Notes

- Les PDF sont aussi dans `./output/app-<entreprise>/` (volume partagé).
- Discord = livraison/notification, **pas archivage** (les liens de pièces jointes
  expirent) : garde les PDF locaux si besoin.
- Aucun déploiement requis : c'est un usage **local à la demande**.
