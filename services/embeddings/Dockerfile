# Micro-service d'embeddings (FastAPI + fastembed) — dédup sémantique des offres.
# Builder avec --network=host si le DNS du builder est capricieux.
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Embarque le modèle dans l'image (téléchargé au build) -> aucun accès réseau au
# runtime. Le cache_dir doit être IDENTIQUE à celui lu par app.py (EMBED_CACHE).
ENV EMBED_CACHE=/app/models
RUN python -c "from fastembed import TextEmbedding; TextEmbedding(model_name='sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2', cache_dir='/app/models')"

EXPOSE 8002
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8002"]
