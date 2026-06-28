# services/embeddings — embeddings pour la dédup sémantique

Micro-service FastAPI qui transforme un texte d'offre en vecteur, pour repérer
les **quasi-doublons inter-sources** que le hash exact (`SHA256` canonicalisé)
rate (titre reformulé, intitulé d'entreprise variable).

- Modèle : `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`
  (**multilingue**, ONNX/CPU via `fastembed`, **sans torch**), **384 dims**.
- Aucune clé, **hors-ligne** : le modèle est embarqué dans l'image au build.
- Les vecteurs sont stockés dans `offers.embedding vector(384)` (pgvector) ; le
  `01` cherche le plus proche voisin (`ORDER BY embedding <=> $1`) et applique
  `semanticDupDecision` (`workflows/lib/offer-utils.mjs`).

## Endpoints

| Méthode | Route | Entrée | Sortie |
|---|---|---|---|
| GET | `/health` | — | `{ status, model, dim }` |
| POST | `/embed` | `{ texts: ["…", …] }` | `{ model, dim, embeddings: [[…], …] }` |

## Variables d'env

`EMBED_MODEL` (défaut le modèle ci-dessus), `EMBED_CACHE` (défaut `/app/models`,
doit matcher le cache embarqué au build).

## Dév (conteneur)

```bash
# build (--network=host : télécharge le modèle pendant le build)
docker build --network=host -t embeddings services/embeddings

# test (modèle réel, hors-ligne) : paraphrase plus proche qu'offre sans rapport
docker run --rm embeddings sh -c 'pip install -q pytest && python -m pytest -q'
```

> ⚠️ Prérequis dédup : Postgres doit tourner sur l'image `pgvector/pgvector:pg16`
> (l'extension `vector` n'est pas dans `postgres:alpine`).
