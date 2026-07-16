"""Micro-service d'embeddings (fastembed) pour la déduplication SÉMANTIQUE des offres.

  POST /embed   { "texts": ["...", ...] }  -> { model, dim, embeddings: [[...], ...] }
  GET  /health                             -> { status, model, dim, loaded }

Modèle multilingue léger (ONNX/CPU, sans torch) :
`paraphrase-multilingual-MiniLM-L12-v2` (384 dims). Aucune clé, **hors-ligne** :
le modèle est embarqué dans l'image au build (cf. Dockerfile). Le `01` poste le
texte d'une offre (`embeddingText`), stocke le vecteur dans `offers.embedding`,
puis cherche le plus proche voisin (pgvector) pour repérer les quasi-doublons.

CHARGEMENT PARESSEUX (audit 2026-07) : le modèle pèse ~400 Mo en RAM pour
quelques secondes d'usage par jour (la dédup du 01 à 8h). Il n'est donc chargé
qu'au premier /embed, puis DÉCHARGÉ après EMBED_IDLE_TTL secondes d'inactivité
(défaut 15 min ; 0 = résident en permanence, comportement d'avant). Coût : ~5 s
de latence au premier /embed après déchargement, invisible pour un cron.
"""
from __future__ import annotations

import gc
import os
import threading
import time

from fastapi import FastAPI
from fastembed import TextEmbedding
from pydantic import BaseModel

MODEL_NAME = os.environ.get("EMBED_MODEL", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
CACHE_DIR = os.environ.get("EMBED_CACHE", "/app/models")
DIM = 384
IDLE_TTL = float(os.environ.get("EMBED_IDLE_TTL", "900"))  # secondes ; 0 = jamais déchargé

app = FastAPI(title="embeddings", version="0.2.0")

_lock = threading.Lock()
_model: TextEmbedding | None = None
_last_use = 0.0


def _get_model() -> TextEmbedding:
    """Charge le modèle au premier usage (depuis l'image, pas de réseau)."""
    global _model, _last_use
    with _lock:
        if _model is None:
            _model = TextEmbedding(model_name=MODEL_NAME, cache_dir=CACHE_DIR)
        _last_use = time.monotonic()
        return _model


def _unload_if_idle() -> bool:
    """Décharge le modèle si inutilisé depuis IDLE_TTL. Renvoie True si déchargé."""
    global _model
    with _lock:
        if _model is not None and IDLE_TTL > 0 and time.monotonic() - _last_use > IDLE_TTL:
            _model = None
            gc.collect()
            return True
    return False


def _reaper() -> None:  # pragma: no cover - boucle infinie, testée via _unload_if_idle
    while True:
        time.sleep(60)
        _unload_if_idle()


threading.Thread(target=_reaper, daemon=True).start()


class EmbedIn(BaseModel):
    texts: list[str]


@app.get("/health")
def health() -> dict:
    # Ne charge PAS le modèle : le healthcheck Docker (30 s) maintiendrait
    # sinon le modèle résident en permanence, annulant le déchargement.
    return {"status": "ok", "model": MODEL_NAME, "dim": DIM, "loaded": _model is not None}


@app.post("/embed")
def embed(body: EmbedIn) -> dict:
    vectors = [v.tolist() for v in _get_model().embed(body.texts)]
    return {"model": MODEL_NAME, "dim": DIM, "embeddings": vectors}
