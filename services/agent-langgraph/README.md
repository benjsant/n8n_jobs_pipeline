# services/agent-langgraph — agent de candidature (LangGraph)

Extraction de l'agent du workflow n8n `02` vers un service Python **LangGraph**
(plan : `docs/plan-langgraph.md`). n8n reste l'orchestrateur (collecte, Discord,
rendu, livraison) ; ce service porte l'**intelligence** (scoring, accroche,
personnalisation CV).

## État : Phase 2 — graphe décomposé + tool `company_research` + auto-correction

```
START → analyze → research → accroche → judge ⇄ (retry) → validate → END
```

- **analyze** — LLM (temp 0.2) : le jugement. Score + sous-scores, matching/missing,
  `personnalisation_cv`, `conseils`, `objet_email`… tout le §6 **sauf** la lettre.
  Température basse = scoring stable et reproductible.
- **research** — tool `company_research` ([`agent/tools.py`](agent/tools.py)) :
  recherche web légère (DuckDuckGo HTML, sans clé) pour **grounder** l'accroche sur
  des infos entreprise réelles → renforce le garde-fou anti-invention. Tolérant :
  réseau coupé/bloqué → chaîne vide (l'accroche retombe sur l'offre, sans régression).
- **accroche** — LLM (temp 0.7) : le créatif. Choix du template + accroche (2-3 phrases),
  avec les extraits web injectés en grounding (utilisés **si** pertinents, jamais inventés).
- **validate** — déterministe : retire les tirets cadratin (marqueur IA), normalise le
  template, fusionne en objet §6 final. Aucun LLM → corps de lettre garanti hors LLM.

La **sortie JSON reste IDENTIQUE au §6** (parité avec le monolithe / le workflow `02`).
Chaque nœud est une fonction pure (state → patch de state), testable en isolation.

## Endpoints

| Méthode | Route | Entrée | Sortie |
|---|---|---|---|
| GET | `/health` | — | `{ status, prompt_loaded, cv_index_loaded }` |
| POST | `/agent/run` | `{ title, company, description, company_info?, location?, spontaneous? }` | objet §6 (`agent/schema.py`) |
| POST | `/interview/prep` | `{ title, company, description, company_info?, location? }` | dossier de prépa entretien (`InterviewPrep`) |
| GET | `/` | — | mini-interface web (Alpine.js) : URL offre -> confirmation -> génération |
| POST | `/offer/extract` | `{ url }` | `{ title, company, location, description }` (best-effort) |
| POST | `/offer/generate` | `{ title, company, location, description }` | génère CV + lettre (rendu) et les livre sur Discord |
| GET | `/offers` | `?status=&limit=` | offres en base + compteurs par statut (503 si Postgres absent) |
| POST | `/offers/status` | `{ hash, status }` | bascule le statut (`ignored`, `applied`, `selected`, `reviewed`) ; historique Airtable si configuré |
| POST | `/offers/reanalyze` | `{ hash }` | relance le scoring de l'agent, met à jour `score`/`score_reason` |
| POST | `/offers/delete` | `{ hash }` | supprime définitivement une offre |
| POST | `/offers/purge` | `{ days?, status? }` | supprime en masse (âge et/ou statut) |
| GET | `/applications` | — | candidatures suivies (suivi des réponses) |
| POST | `/applications/update` | `{ id, status?, notes?, remind? }` | avance une candidature ; sync Airtable |
| GET | `/companies` | `?limit=` | entreprises à contacter (avec moyen de contact LBA) |
| POST | `/companies/apply` | `{ name }` | candidature spontanée (CV + lettre) livrée sur Discord avec le contact |

## Mini-interface (URL -> CV + lettre -> Discord)

`http://localhost:8901` : colle l'URL d'une offre, l'app extrait les infos (fetch +
LLM), tu **confirmes/corriges** (mémo éditable), puis elle appelle l'agent, rend le
CV + la lettre (service `render`) et les **poste sur Discord** (2 pièces jointes,
relecture humaine avant envoi). Nécessite `RENDER_API_URL`, `DISCORD_WEBHOOK_ALERTS`
et le volume `./output` monté (cf. docker-compose).

## Préparation d'entretien (`/interview/prep`)

Graphe dédié `research → prepare → validate` (`agent/interview.py`) : recherche
web (`company_research`) → dossier LLM (résumé entreprise grounded, points de
match sur le **profil réel**, écarts à anticiper honnêtes, questions probables +
angles de réponse, questions à poser) → nettoyage déterministe (anti tiret
cadratin partout). Mêmes garde-fous anti-invention que l'accroche.

## Grounding entreprise (anti-invention)

Deux sources, injectées dans l'accroche **et** la prépa d'entretien :
- **Registre officiel** (`lookup_company_registry`, `tools.py`) : API publique
  `recherche-entreprises.api.gouv.fr` (DINUM, **sans clé**) → faits AUTORITATIFS
  (raison sociale, SIREN, effectif, NAF, création, siège), présentés comme
  **prioritaires**. Excellent sur les PME (ex. Ponera exact) ; sur les grands
  groupes la recherche par nom peut tomber sur la holding (le chemin LBA, avec
  SIRET exact, lève l'ambiguïté).
- **Web léger** (`search_company_web`, DuckDuckGo) : complément, jamais une vérité.

## Variables d'env

`DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL` (défaut `https://api.deepseek.com`),
`DEEPSEEK_MODEL` (défaut `deepseek-chat`). Contexte lu au démarrage :
`PROMPT_PATH` (défaut `/prompts/agent-system-prompt.md`),
`CV_INDEX_PATH` (défaut `/cv/cv-index.json`) — montés en lecture seule.

Accès Postgres pour `/offers` (optionnel, seulement pour le tri des offres) :
`POSTGRES_HOST` (défaut `postgres`), `POSTGRES_PORT` (`5432`), `POSTGRES_DB`,
`POSTGRES_USER`, `POSTGRES_PASSWORD` — ou `DATABASE_URL`. Absents/injoignables =
`/offers` renvoie 503, le reste du service fonctionne.

Historique Airtable (optionnel) : `AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID`,
`AIRTABLE_TABLE` (défaut `Candidatures`). Vides = fonctionnalité inactive.

## Dév (conteneur)

```bash
# build (--network=host si le DNS du builder coince)
docker build --network=host -t agent-langgraph services/agent-langgraph

# tests (sans clé : le LLM est mocké)
docker run --rm -v "$PWD/services/agent-langgraph":/app -w /app python:3.12-slim \
  sh -c 'pip install -q uv && uv pip install --system -q langgraph langchain-openai pydantic pytest && pytest -q'
```

## À venir (Phases suivantes)
- **Intégration** : ajouter le service au `docker-compose` et faire pointer le `02`
  vers `POST http://agent-langgraph:8001/agent/run` au lieu de DeepSeek direct ;
  mesurer v1 (monolithe) vs v2 (graphe) sur 5 lettres avant de tagger `v0.2.0`.
- Retry granulaire par nœud (backoff sur les nœuds LLM).
- Bascule `MemorySaver` → `PostgresSaver` (même Postgres que n8n).
- `interrupt` / streaming pour la démo (Phase 3).
