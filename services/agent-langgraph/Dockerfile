# Agent de candidature — service LangGraph (FastAPI).
FROM python:3.12-slim

WORKDIR /app

# uv pour l'install (cohérent avec le reste de l'écosystème). Builder avec
# --network=host si le DNS du builder est capricieux.
RUN pip install --no-cache-dir uv \
 && uv pip install --system --no-cache \
      "fastapi>=0.115,<1" "uvicorn[standard]>=0.34,<1" \
      "langgraph>=0.2,<0.3" "langchain-openai>=0.2,<0.4" "pydantic>=2,<3"

COPY . .

EXPOSE 8001
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8001"]
