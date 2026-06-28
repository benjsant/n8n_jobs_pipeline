"""Micro-service d'embeddings (fastembed) pour la déduplication SÉMANTIQUE des offres.

  POST /embed   { "texts": ["...", ...] }  -> { model, dim, embeddings: [[...], ...] }
  GET  /health                             -> { status, model, dim }

Modèle multilingue léger (ONNX/CPU, sans torch) :
`paraphrase-multilingual-MiniLM-L12-v2` (384 dims). Aucune clé, **hors-ligne** :
le modèle est embarqué dans l'image au build (cf. Dockerfile). Le `01` poste le
texte d'une offre (`embeddingText`), stocke le vecteur dans `offers.embedding`,
puis cherche le plus proche voisin (pgvector) pour repérer les quasi-doublons.
"""
from __future__ import annotations

import os

from fastapi import FastAPI
from fastembed import TextEmbedding
from pydantic import BaseModel

MODEL_NAME = os.environ.get("EMBED_MODEL", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
CACHE_DIR = os.environ.get("EMBED_CACHE", "/app/models")
DIM = 384

app = FastAPI(title="embeddings", version="0.1.0")

# Chargé une fois au démarrage (modèle déjà présent dans l'image -> pas de réseau).
_model = TextEmbedding(model_name=MODEL_NAME, cache_dir=CACHE_DIR)


class EmbedIn(BaseModel):
    texts: list[str]


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "model": MODEL_NAME, "dim": DIM}


@app.post("/embed")
def embed(body: EmbedIn) -> dict:
    vectors = [v.tolist() for v in _model.embed(body.texts)]
    return {"model": MODEL_NAME, "dim": DIM, "embeddings": vectors}
