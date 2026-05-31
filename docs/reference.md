# docs/reference.md — Référence technique

Toutes les infos factuelles dont Claude Code a besoin pour construire les
workflows sans deviner. Vérifie toujours la doc officielle si un endpoint a
changé.

---

## 1. DeepSeek (LLM de l'agent)

API compatible OpenAI.

- Base URL : `https://api.deepseek.com`
- Endpoint chat : `POST https://api.deepseek.com/chat/completions`
- Auth : header `Authorization: Bearer $DEEPSEEK_API_KEY`
- Modèles :
  - `deepseek-chat` — rapide, généraliste (rédaction des lettres).
  - `deepseek-reasoner` — raisonnement plus poussé (scoring d'adéquation).
- Sortie JSON forcée : ajouter `"response_format": {"type": "json_object"}`
  dans le body. ⚠️ Le system prompt DOIT mentionner « JSON » pour que ça marche.

Body type :
```json
{
  "model": "deepseek-chat",
  "messages": [
    {"role": "system", "content": "<contenu de prompts/agent-system-prompt.md>"},
    {"role": "user", "content": "<offre + infos entreprise>"}
  ],
  "response_format": {"type": "json_object"},
  "temperature": 0.7
}
```

La réponse utile est dans `choices[0].message.content` (string JSON à parser).

Test rapide en curl :
```bash
curl https://api.deepseek.com/chat/completions \
  -H "Authorization: Bearer $DEEPSEEK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"deepseek-chat","messages":[{"role":"user","content":"dis bonjour en json {\"msg\":...}"}],"response_format":{"type":"json_object"}}'
```

---

## 2. API France Travail (Offres d'emploi v2)

Source principale d'offres, gratuite, officielle.

- Inscription : https://francetravail.io → créer une application pour obtenir
  `client_id` et `client_secret`.
- **Auth OAuth2 (client credentials)** :
  - Token endpoint :
    `https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=/partenaire`
  - Méthode : `POST`, `grant_type=client_credentials`
  - Scope typique : `api_offresdemploiv2 o2dsoffre`
  - Renvoie un `access_token` (valable ~25 min, à mettre en cache).
- **Recherche d'offres** :
  - `GET https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search`
  - Header : `Authorization: Bearer <access_token>`
  - Paramètres utiles :
    - `motsCles` : mots-clés (ex. `développeur intelligence artificielle`)
    - `commune` : code INSEE (ex. `75056` Paris)
    - `distance` : rayon en km
    - `typeContrat` : `CDI`, `CDD`, etc.
    - `range` : pagination `0-149` (max 150 par requête, premier index ≤ 1000)
- **Référentiels** (codes métiers ROME, communes, etc.) :
  - `GET .../offresdemploi/v2/referentiel/{nom}`

Dans n8n : utiliser une credential **OAuth2** (grant client credentials) ou un
nœud HTTP qui récupère d'abord le token puis appelle search.

Champs intéressants par offre : `intitule`, `description`, `entreprise.nom`,
`lieuTravail`, `typeContrat`, `origineOffre.urlOrigine`, `id`.

---

## 3. JobSpy (source complémentaire multi-boards)

Librairie Python qui agrège LinkedIn, Indeed, Glassdoor, Google Jobs, etc.
Utile pour élargir au-delà de France Travail (notamment jobs IA/startup).

- Installation : `pip install python-jobspy`
- Usage minimal :
```python
from jobspy import scrape_jobs
jobs = scrape_jobs(
    site_name=["indeed", "linkedin", "glassdoor"],
    search_term="AI engineer",
    location="France",
    results_wanted=50,
    hours_old=72,
    country_indeed="France",
)
jobs.to_json("jobs.json", orient="records")
```

Intégration dans n8n : deux options.
1. Petit service Python (FastAPI) dans un conteneur séparé qui expose
   `/search?term=...` et renvoie du JSON ; n8n l'appelle en HTTP.
2. Nœud **Execute Command** qui lance un script Python (nécessite Python dans
   l'image n8n — préférer l'option 1, plus propre).

⚠️ LinkedIn via JobSpy peut être rate-limité / nécessiter des proxies. Indeed
et Glassdoor sont plus fiables sans proxy.

---

## 4. Notion (suivi des candidatures)

- Créer une intégration interne : https://www.notion.so/profile/integrations
  → récupérer le token (`NOTION_API_KEY`).
- **Partager chaque base avec l'intégration** (sinon l'API ne la voit pas) :
  ouvrir la base → menu `...` → Connections → ajouter l'intégration.
- Récupérer l'ID d'une base : c'est la partie de l'URL entre le `/` et le `?`
  (32 caractères hex).
- ⚠️ Notion a une nouvelle API non rétrocompatible (data sources). Si le nœud
  Notion de n8n renvoie des erreurs de relation/création, vérifier que le nœud
  est à jour, sinon passer par le nœud HTTP Request vers l'API Notion.

### Schéma proposé — Base « Offres »
| Propriété     | Type        | Notes                                   |
|---------------|-------------|-----------------------------------------|
| Poste         | Title       | intitulé de l'offre                     |
| Entreprise    | Relation    | → base Entreprises (ou Text au début)   |
| Lien          | URL         | url de l'offre                          |
| Source        | Select      | France Travail / JobSpy / WTTJ…         |
| Score         | Number      | score d'adéquation 0-100                |
| Statut        | Select      | À postuler / Postulée / Entretien / Refus / Offre |
| Date trouvée  | Date        |                                         |
| Lettre        | Text        | lettre générée par l'agent              |
| Note CV       | Text        | adaptation CV suggérée                  |
| ID source     | Text        | identifiant unique pour dédupliquer     |

### Schéma proposé — Base « Entreprises »
| Propriété   | Type     | Notes                              |
|-------------|----------|------------------------------------|
| Nom         | Title    |                                    |
| Site        | URL      |                                    |
| Secteur     | Select   |                                    |
| Stack       | Multi    | technos identifiées                |
| Notes       | Text     | infos scrapées / valeurs / actu    |

---

## 5. Telegram (notifications)

- Créer un bot via @BotFather → récupérer le `TELEGRAM_BOT_TOKEN`.
- Récupérer ton `chat_id` : envoyer un message au bot puis
  `GET https://api.telegram.org/bot<TOKEN>/getUpdates` et lire `chat.id`.
- Envoi : `POST https://api.telegram.org/bot<TOKEN>/sendMessage`
  body `{"chat_id": "<id>", "text": "...", "parse_mode": "HTML"}`.
- Dans n8n : nœud Telegram natif (credential = token) ou HTTP Request.

---

## 6. Variables d'environnement disponibles dans n8n

Toutes lisibles via `{{ $env.NOM }}` dans les expressions (grâce à
`N8N_BLOCK_ENV_ACCESS_IN_NODE=false` dans docker-compose) :

`DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL`, `NOTION_API_KEY`,
`NOTION_DB_OFFRES`, `NOTION_DB_ENTREPRISES`, `FRANCE_TRAVAIL_CLIENT_ID`,
`FRANCE_TRAVAIL_CLIENT_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

---

## 7. Liens utiles

- DeepSeek docs : https://platform.deepseek.com
- France Travail : https://francetravail.io
- JobSpy : https://github.com/cullenwatson/JobSpy
- Notion API : https://developers.notion.com
- n8n docs : https://docs.n8n.io
- Projet inspirant (architecture) : https://github.com/BjornMelin/ai-job-scraper
