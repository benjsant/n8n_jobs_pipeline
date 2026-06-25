# services/agent-langgraph — agent de candidature (LangGraph)

Extraction de l'agent du workflow n8n `02` vers un service Python **LangGraph**
(plan : `docs/plan-langgraph.md`). n8n reste l'orchestrateur (collecte, Discord,
rendu, livraison) ; ce service porte l'**intelligence** (scoring, accroche,
personnalisation CV).

## État : Phase 1 — strangler (1 nœud)

Le graphe ne contient pour l'instant qu'**un nœud** `agent` qui **réplique** l'appel
DeepSeek monolithique actuel du `02` : même entrée (offre + system prompt + index
CV), **même sortie JSON §6**. Objectif : prouver la **parité** avec le monolithe
avant de décomposer en `scoring_adequation` / `accroche` / `conseils` /
`cv_personalization` + tool `company_research`.

## Endpoints

| Méthode | Route | Entrée | Sortie |
|---|---|---|---|
| GET | `/health` | — | `{ status, prompt_loaded, cv_index_loaded }` |
| POST | `/agent/run` | `{ title, company, description, company_info?, location?, spontaneous? }` | objet §6 (`agent/schema.py`) |

## Variables d'env

`DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL` (défaut `https://api.deepseek.com`),
`DEEPSEEK_MODEL` (défaut `deepseek-chat`). Contexte lu au démarrage :
`PROMPT_PATH` (défaut `/prompts/agent-system-prompt.md`),
`CV_INDEX_PATH` (défaut `/cv/cv-index.json`) — montés en lecture seule.

## Dév (conteneur)

```bash
# build (--network=host si le DNS du builder coince)
docker build --network=host -t agent-langgraph services/agent-langgraph

# tests (sans clé : le LLM est mocké)
docker run --rm -v "$PWD/services/agent-langgraph":/app -w /app python:3.12-slim \
  sh -c 'pip install -q uv && uv pip install --system -q langgraph langchain-openai pydantic pytest && pytest -q'
```

## À venir (Phases suivantes)
- Décomposition en sous-nœuds testables + retry granulaire.
- Tool **`company_research`** (recherche web légère) → grounding de l'accroche.
- Bascule `MemorySaver` → `PostgresSaver` ; intégration au `docker-compose` ; le
  `02` appelle `POST http://agent-langgraph:8001/agent/run` au lieu de DeepSeek.
